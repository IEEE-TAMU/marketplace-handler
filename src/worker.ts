import { parseEmailForData, ExtractedEmailData } from './email-parser';

// Execution Environment as defined in the wranger.toml file
// See cloudflare docs for information on how to define this
interface Environment {
  API_BASE_URL: string;
  API_BEARER_TOKEN: string;
  ALLOWED_SENDERS?: string; // Comma-separated list of allowed email addresses
}

// Helper function to get allowed senders from environment
function getAllowedSenders(env: Environment): string[] {
  const defaultSenders = ['chnorton@tamu.edu']; // Fallback for compatibility

  if (!env.ALLOWED_SENDERS) {
    return defaultSenders;
  }

  return env.ALLOWED_SENDERS.split(',').map((sender) => sender.trim());
}

export default {
  async email(
    message: ForwardableEmailMessage,
    env: Environment,
    _ctx: ExecutionContext
  ) {
    const allowedSenders = getAllowedSenders(env);

    // reject emails not from allowed senders
    if (!allowedSenders.includes(message.from)) {
      console.warn(`Email from ${message.from} is not allowed.`);
      return;
    }

    try {
      // Parse the email and extract data
      const extractedData = await parseEmailForData(message.raw);

      // console.log('Extracted email data:', JSON.stringify(extractedData, null, 2));

      // Validate and send payment to API
      const validation = validatePaymentData(extractedData);
      if (validation.isValid) {
        console.log('Payment data validation passed, submitting payment');
        await submitPayment(extractedData, env);
      } else {
        console.warn('Missing or invalid payment data:', validation.errors);
        console.warn('Extracted data:', JSON.stringify(extractedData, null, 2));

        // TODO: Forward email for manual review
        // This would be implemented to forward the email to a human for review
      }
    } catch (error) {
      console.error('Error parsing email:', error);
    }
  },
};

// Define proper types for payment data
interface PaymentData {
  name: string;
  amount: number;
  tshirt_size: string;
  id: string;
  confirmation_code?: string;
}

interface ApiResponse {
  success?: boolean;
  error?: string;
  [key: string]: unknown;
}

// Helper function for retry logic
async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  maxRetries: number = 3,
  baseDelay: number = 1000
): Promise<T> {
  let lastError: Error;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
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
function isRetryableError(response: Response): boolean {
  // Retry on server errors (5xx) or rate limiting (429)
  return response.status >= 500 || response.status === 429;
}

// Helper function to validate payment data
function validatePaymentData(data: ExtractedEmailData): {
  isValid: boolean;
  errors: string[];
} {
  const errors: string[] = [];

  if (!data.orderId) errors.push('Missing order ID');
  if (!data.billingName) errors.push('Missing billing name');
  if (!data.tshirtSize) errors.push('Missing T-shirt size');
  if (!data.pricePerItem) errors.push('Missing price per item');

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

async function submitPayment(
  extractedData: ExtractedEmailData,
  env: Environment
): Promise<void> {
  try {
    // Validate the extracted data first
    const validation = validatePaymentData(extractedData);
    if (!validation.isValid) {
      console.error('Payment data validation failed:', validation.errors);
      return;
    }

    // Convert price string to number (remove $ and convert)
    const priceString = extractedData.pricePerItem!.replace('$', '');
    const amount = parseFloat(priceString);

    if (isNaN(amount)) {
      console.error(
        'Failed to parse price amount:',
        extractedData.pricePerItem
      );
      return;
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

    // Use retry logic for the API call
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

          // Throw error to trigger retry if retryable, otherwise fail immediately
          if (isRetryableError(response)) {
            throw new Error(
              `API request failed with retryable status ${response.status}: ${errorText}`
            );
          } else {
            throw new Error(
              `API request failed with non-retryable status ${response.status}: ${errorText}`
            );
          }
        }
      },
      3,
      1000
    ); // Retry up to 3 times with 1 second base delay
  } catch (error) {
    console.error('Error submitting payment:', error);
    console.error('Extracted data:', JSON.stringify(extractedData, null, 2));
  }
}
