import { parseEmailForData, ExtractedEmailData } from './email-parser';

// Execution Environment as defined in the wranger.toml file
// See cloudflare docs for information on how to define this
interface Environment {
  API_BASE_URL: string;
  API_BEARER_TOKEN: string;
  ALLOWED_SENDERS?: string; // Comma-separated list of allowed email addresses
  ALERT_EMAIL?: string; // Where to forward emails needing manual review
}

const DEFAULT_ALERT_EMAIL = 'ieee@tamu.edu';

// Helper function to get allowed senders from environment
export function getAllowedSenders(env: Environment): string[] {
  const defaultSenders = ['ieee@tamu.edu']; // Fallback for compatibility

  if (!env.ALLOWED_SENDERS) {
    return defaultSenders;
  }

  return env.ALLOWED_SENDERS.split(',').map((sender) => sender.trim());
}

export function getAlertEmail(env: Environment): string {
  const configured = env.ALERT_EMAIL?.trim();
  return configured || DEFAULT_ALERT_EMAIL;
}

/**
 * Forward the original marketplace email to a human for manual review.
 * Uses message.forward() so the full original content is preserved.
 * The destination must be a verified destination address in Cloudflare
 * Email Routing (ieee@tamu.edu).
 */
export async function forwardForManualReview(
  message: ForwardableEmailMessage,
  env: Environment,
  reason: string,
  details?: string
): Promise<void> {
  const alertEmail = getAlertEmail(env);
  try {
    const headers = new Headers();
    headers.set('X-Handler-Failure', reason.slice(0, 200));
    if (details) {
      headers.set('X-Handler-Details', details.slice(0, 1000));
    }
    await message.forward(alertEmail, headers);
    console.log(
      `Forwarded failing email to ${alertEmail} for manual review. Reason: ${reason}`
    );
  } catch (forwardError) {
    console.error(
      `Failed to forward email to ${alertEmail} for manual review (reason: ${reason}):`,
      forwardError
    );
  }
}

export default {
  async email(
    message: ForwardableEmailMessage,
    env: Environment,
    _ctx: ExecutionContext
  ) {
    const allowedSenders = getAllowedSenders(env);

    // reject emails not from allowed senders (don't forward to avoid spam loops)
    if (!allowedSenders.includes(message.from)) {
      console.warn(`Email from ${message.from} is not allowed.`);
      return;
    }

    let extractedData: ExtractedEmailData;
    try {
      // Parse the email and extract data
      extractedData = await parseEmailForData(message.raw);
    } catch (error) {
      console.error('Error parsing email:', error);
      await forwardForManualReview(
        message,
        env,
        'email-parse-failed',
        error instanceof Error ? error.message : String(error)
      );
      return;
    }

    // console.log('Extracted email data:', JSON.stringify(extractedData, null, 2));

    // Validate and send payment to API
    const validation = validatePaymentData(extractedData);
    if (!validation.isValid) {
      console.warn('Missing or invalid payment data:', validation.errors);
      console.warn('Extracted data:', JSON.stringify(extractedData, null, 2));

      await forwardForManualReview(
        message,
        env,
        `validation-failed: ${validation.errors.join('; ')}`,
        JSON.stringify(extractedData)
      );
      return;
    }

    try {
      console.log('Payment data validation passed, submitting payment');
      await submitPayment(extractedData, env);
    } catch (error) {
      // submitPayment throws on validation/parse/API failure (including a
      // wrong confirmation_code rejected by the portal API). Forward so a
      // human sees it — logs alone expire.
      console.error('Error submitting payment:', error);
      console.error('Extracted data:', JSON.stringify(extractedData, null, 2));
      await forwardForManualReview(
        message,
        env,
        `api-submission-failed: ${error instanceof Error ? error.message : String(error)}`.slice(
          0,
          200
        ),
        JSON.stringify(extractedData)
      );
    }
  },
};

// Define proper types for payment data
interface PaymentData {
  name: string;
  amount: number;
  tshirt_size: string;
  id: string;
  confirmation_code: string;
}

interface ApiResponse {
  success?: boolean;
  error?: string;
  [key: string]: unknown;
}

// Thrown for failures that must NOT be retried (e.g. 4xx from the portal
// API such as "no matching entry for confirmation code").
export class NonRetryableError extends Error {}

// Helper function for retry logic - only retries retryable (5xx/429/network)
// errors. NonRetryableError is re-thrown immediately.
export async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  maxRetries: number = 3,
  baseDelay: number = 1000
): Promise<T> {
  let lastError: Error;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      if (error instanceof NonRetryableError) {
        throw error;
      }
      lastError = error as Error;

      if (attempt === maxRetries) {
        throw lastError;
      }

      const delay = baseDelay * Math.pow(2, attempt);
      console.log(
        `Attempt ${attempt + 1} failed, retrying in ${delay}ms:`,
        error
      );
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }

  throw lastError!;
}

// Helper function to check if an error is retryable
export function isRetryableError(response: Response): boolean {
  // Retry on server errors (5xx) or rate limiting (429)
  return response.status >= 500 || response.status === 429;
}

// Helper function to validate payment data
export function validatePaymentData(data: ExtractedEmailData): {
  isValid: boolean;
  errors: string[];
} {
  const errors: string[] = [];

  if (!data.orderId) errors.push('Missing order ID');
  if (!data.billingName) errors.push('Missing billing name');
  if (!data.tshirtSize) errors.push('Missing T-shirt size');
  if (!data.pricePerItem) errors.push('Missing price per item');
  if (!data.confirmationCode) errors.push('Missing confirmation code');

  // Validate price format
  if (data.pricePerItem && !data.pricePerItem.match(/^\$?\d+\.\d{2}$/)) {
    errors.push('Invalid price format');
  }

  // Validate T-shirt size
  if (
    data.tshirtSize &&
    !['XS', 'S', 'M', 'L', 'XL', 'XXL'].includes(data.tshirtSize)
  ) {
    errors.push('Invalid T-shirt size');
  }

  return { isValid: errors.length === 0, errors };
}

export async function submitPayment(
  extractedData: ExtractedEmailData,
  env: Environment
): Promise<void> {
  // Validate the extracted data first - throw so the caller can alert.
  const validation = validatePaymentData(extractedData);
  if (!validation.isValid) {
    throw new NonRetryableError(
      `Payment data validation failed: ${validation.errors.join('; ')}`
    );
  }

  // Convert price string to number (remove $ and convert)
  const priceString = extractedData.pricePerItem!.replace(/\$/g, '');
  const amount = parseFloat(priceString);

  if (isNaN(amount)) {
    throw new NonRetryableError(
      `Failed to parse price amount: ${extractedData.pricePerItem}`
    );
  }

  if (!extractedData.confirmationCode) {
    throw new NonRetryableError('Missing confirmation code');
  }

  // Prepare payment payload according to the API schema
  const paymentPayload: PaymentData = {
    name: extractedData.billingName!,
    amount: amount,
    tshirt_size: extractedData.tshirtSize!,
    id: extractedData.orderId!,
    confirmation_code: extractedData.confirmationCode,
  };

  console.log('Submitting payment:', JSON.stringify(paymentPayload, null, 2));

  // Use retry logic for the API call (only 5xx/429/network are retried)
  await retryWithBackoff(
    async () => {
      const response = await fetch(`${env.API_BASE_URL}/api/v1/payments`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${env.API_BEARER_TOKEN}`,
        },
        body: JSON.stringify(paymentPayload),
      });

      if (response.ok) {
        const result: ApiResponse = await response.json();
        console.log(
          'Payment submitted successfully:',
          JSON.stringify(result, null, 2)
        );
        return result;
      } else {
        const errorText = await response.text();
        console.error(
          `Payment submission failed with status ${response.status}:`,
          errorText
        );

        // Log additional details for debugging
        console.error(
          'Request payload:',
          JSON.stringify(paymentPayload, null, 2)
        );
        // Log response headers (compatible with Cloudflare Workers)
        const headers: Record<string, string> = {};
        response.headers.forEach((value, key) => {
          headers[key] = value;
        });
        console.error('Response headers:', JSON.stringify(headers, null, 2));

        // Throw retryable vs non-retryable so 4xx (e.g. wrong
        // confirmation_code / no matching portal entry) fails fast and
        // gets forwarded instead of retried 4x.
        if (isRetryableError(response)) {
          throw new Error(
            `API request failed with retryable status ${response.status}: ${errorText}`
          );
        } else {
          throw new NonRetryableError(
            `API request failed with non-retryable status ${response.status}: ${errorText}`
          );
        }
      }
    },
    3,
    1000
  ); // Retry up to 3 times with 1 second base delay
}
