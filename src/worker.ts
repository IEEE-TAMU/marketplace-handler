// Execution Environment as defined in the wranger.toml file
// See cloudflare docs for information on how to define this
interface Environment { }

export default {
  async email(message: ForwardableEmailMessage, env: Environment, ctx: ExecutionContext) {
    console.log(`Received email for ${message.to}`);
    message.headers.forEach((value, key) => {
      console.log(`${key}: ${value}`);
    });
    // log the raw email body
    // await the raw readableStream
    const reader = message.raw.getReader();
    console.log("Raw email body:");
    let result = '';
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      result += new TextDecoder().decode(value);
    }
    console.log(result);
  }
}