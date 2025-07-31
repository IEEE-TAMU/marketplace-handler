import { parseEmailForData } from './email-parser';

// Execution Environment as defined in the wranger.toml file
// See cloudflare docs for information on how to define this
interface Environment {
  API_BASE_URL: string;
  API_BEARER_TOKEN: string;
}

const allowedSenders = [
  "chnorton@tamu.edu",
]

export default {
  async email(message: ForwardableEmailMessage, env: Environment, ctx: ExecutionContext) {
    console.log(`Received email for ${message.to}`);

    // reject emails not from allowed senders
    if (!allowedSenders.includes(message.from)) {
      console.warn(`Email from ${message.from} is not allowed.`);
      return;
    }
    
    try {
      // Parse the email and extract data
      const extractedData = await parseEmailForData(message.raw);
      
      console.log('Extracted email data:', JSON.stringify(extractedData, null, 2));
      
      // Send payment to API if we have the required data
      if (extractedData.orderId && extractedData.billingName && extractedData.tshirtSize && extractedData.pricePerItem) {
        await submitPayment(extractedData, env);
      } else {
        console.warn('Missing required payment data:', {
          hasOrderId: !!extractedData.orderId,
          hasBillingName: !!extractedData.billingName,
          hasTshirtSize: !!extractedData.tshirtSize,
          hasPricePerItem: !!extractedData.pricePerItem
        });
      }
      
    } catch (error) {
      console.error('Error parsing email:', error);
    }
  }
}

async function submitPayment(extractedData: any, env: Environment) {
  try {
    // Convert price string to number (remove $ and convert)
    const amount = parseFloat(extractedData.pricePerItem.replace('$', ''));
    
    // Prepare payment payload according to the API schema
    const paymentPayload = {
      name: extractedData.billingName,
      amount: amount,
      tshirt_size: extractedData.tshirtSize,
      order_id: extractedData.orderId,
      confirmation_code: extractedData.confirmationCode,
    };
    
    console.log('Submitting payment:', JSON.stringify(paymentPayload, null, 2));
    
    const response = await fetch(`${env.API_BASE_URL}/api/v1/payments`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${env.API_BEARER_TOKEN}`
      },
      body: JSON.stringify(paymentPayload)
    });
    
    if (response.ok) {
      const result = await response.json();
      console.log('Payment submitted successfully:', result);
    } else {
      const errorText = await response.text();
      console.error(`Payment submission failed with status ${response.status}:`, errorText);
    }
    
  } catch (error) {
    console.error('Error submitting payment:', error);
  }
}