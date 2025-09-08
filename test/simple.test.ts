import { parseEmailForData } from '../src/email-parser';

describe('Simple Email Parser Test', () => {
  test('should exist', () => {
    expect(parseEmailForData).toBeDefined();
  });

  test('should parse basic email structure', async () => {
    const simpleEmailText = `
MIME-Version: 1.0
Content-Type: text/plain; charset=UTF-8

Order 12345
Price per item: $10.00
T-Shirt Size: L
Confirmation Code: TEST123
Billing Name: Test Person
    `;

    // Convert string to ReadableStream
    const encoder = new TextEncoder();
    const data = encoder.encode(simpleEmailText);

    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(data);
        controller.close();
      },
    });

    const result = await parseEmailForData(stream);

    expect(result).toBeDefined();
    expect(result.orderId).toBe('12345');
    expect(result.pricePerItem).toBe('$10.00');
    expect(result.tshirtSize).toBe('L');
    expect(result.confirmationCode).toBe('TEST123');
    expect(result.billingName).toBe('Test Person');
  });
});
