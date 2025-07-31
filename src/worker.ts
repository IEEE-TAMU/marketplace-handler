import { parseEmailForData } from './email-parser';

// Execution Environment as defined in the wranger.toml file
// See cloudflare docs for information on how to define this
interface Environment { }

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
      
    } catch (error) {
      console.error('Error parsing email:', error);
    }
  }
}