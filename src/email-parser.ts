import { MailParser } from 'mailparser';

export interface ExtractedEmailData {
  billingName?: string;
  confirmationCode?: string;
  tshirtSize?: string;
  pricePerItem?: string;
  orderId?: string;
}

export async function parseEmailForData(
  rawEmail: ReadableStream<Uint8Array>
): Promise<ExtractedEmailData> {
  return new Promise((resolve, reject) => {
    // Create the parser
    const parser = new MailParser({
      skipTextToHtml: true,
      skipHtmlToText: true,
    });

    const extractedData: ExtractedEmailData = {};
    let textContent = '';

    // Set up event listeners
    parser.on('data', (data) => {
      if (data.type === 'text') {
        textContent = data.text;
      }
    });

    parser.on('error', (err) => {
      reject(err);
    });

    parser.on('end', () => {
      // Extract data from the text content

      // Extract Order ID - pattern: "Order [order_id]"
      const orderMatch = textContent.match(/Order\s+(\d+)/i);
      if (orderMatch) {
        extractedData.orderId = orderMatch[1];
      }

      // Extract Price per item - pattern: "Price per item: $X.XX"
      const priceMatch = textContent.match(
        /Price per item:\s*\$?(\d+\.\d{2})/i
      );
      if (priceMatch) {
        extractedData.pricePerItem = `$${priceMatch[1]}`;
      }

      // Extract T-Shirt Size - pattern: "T-Shirt Size: [size]"
      const tshirtMatch = textContent.match(/T-Shirt Size:\s*([A-Z]+)/i);
      if (tshirtMatch) {
        extractedData.tshirtSize = tshirtMatch[1];
      }

      // Extract Confirmation Code - pattern: "Confirmation Code: [code]"
      const confirmationMatch = textContent.match(
        /Confirmation Code:\s*([A-Z0-9]+)/i
      );
      if (confirmationMatch) {
        extractedData.confirmationCode = confirmationMatch[1];
      }

      // Extract Billing Name - pattern: "Billing Name: [name]"
      const billingMatch = textContent.match(/Billing Name:\s*([^\n\r]+)/i);
      if (billingMatch) {
        extractedData.billingName = billingMatch[1].trim();
      }

      resolve(extractedData);
    });

    // Create a WritableStream that feeds into the MailParser
    const writableStream = new WritableStream({
      write(chunk) {
        parser.write(Buffer.from(chunk));
      },
      close() {
        parser.end();
      },
      abort(reason) {
        parser.destroy(reason);
      },
    });

    // Use pipeTo to connect the ReadableStream to our WritableStream
    rawEmail.pipeTo(writableStream).catch(reject);
  });
}
