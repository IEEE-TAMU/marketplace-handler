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

      const getLastMatch = (text: string, regex: RegExp) => {
        const matches = [...text.matchAll(regex)];
        if (matches.length === 0) return null;
        return matches[matches.length - 1][1].trim();
      };

      // Extract Order ID - pattern: "Order [order_id]"
      const orderId = getLastMatch(textContent, /Order\s+(\d+)/gi);
      if (orderId) {
        extractedData.orderId = orderId;
      }

      // Extract Price per item - pattern: "Price per item: $X.XX"
      const price = getLastMatch(
        textContent,
        /Price per item:\s*\$?(\d+\.\d{2})/gi
      );
      if (price) {
        extractedData.pricePerItem = `$${price}`;
      }

      // Extract T-Shirt Size - pattern: "T-Shirt Size: [size]"
      const tshirtSize = getLastMatch(
        textContent,
        /T-Shirt Size:\s*([A-Z]+)/gi
      );
      if (tshirtSize) {
        extractedData.tshirtSize = tshirtSize;
      }

      // Extract Confirmation Code - pattern: "Confirmation Code: [code]"
      const confirmationCode = getLastMatch(
        textContent,
        /Confirmation Code:\s*([A-Z0-9]+)/gi
      );
      if (confirmationCode) {
        extractedData.confirmationCode = confirmationCode;
      }

      // Extract Billing Name - pattern: "Billing Name: [name]"
      const billingName = getLastMatch(
        textContent,
        /Billing Name:\s*([^\n\r]+)/gi
      );
      if (billingName) {
        extractedData.billingName = billingName;
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
