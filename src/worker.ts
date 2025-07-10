// Execution Environment as defined in the wranger.toml file
// See cloudflare docs for information on how to define this
interface Environment { }

export default {
  async email(message: ForwardableEmailMessage, env: Environment, ctx: ExecutionContext) {
    console.log(`Received email for ${message.to}`);
  }
}