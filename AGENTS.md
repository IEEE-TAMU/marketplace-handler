# IEEE TAMU Marketplace Handler - Agent Guide

## Commands to Run

### Testing
- `nix-shell --run "npm test"` - Run all tests
- `nix-shell --run "npm run test:watch"` - Run tests in watch mode

### Building and Linting
- `nix-shell --run "npm run build"` - TypeScript compilation check (no emit)
- `nix-shell --run "npx eslint src/**/*.ts"` - Lint source files

### Development
- `nix-shell --run "npm run dev"` - Start development server
- `nix-shell --run "npm run deploy"` - Deploy to Cloudflare Workers

## Project Structure

This is a Cloudflare Worker that processes emails from the TAMU Flywire marketplace and forwards payment data to the IEEE TAMU member portal.

### Key Files
- `src/worker.ts` - Main worker entry point and email handler
- `src/email-parser.ts` - Email parsing logic using mailparser
- `test/` - Test files using Jest
- `wrangler.toml` - Cloudflare Worker configuration

### Environment Variables
- `API_BASE_URL` - Base URL for the member portal API
- `API_BEARER_TOKEN` - Bearer token for API authentication (secret)
- `ALLOWED_SENDERS` - Comma-separated list of allowed email senders (optional, defaults to chnorton@tamu.edu)

## Code Style and Patterns

- Use TypeScript with strict type checking
- Prefer explicit types over `any`
- Use proper error handling with try/catch blocks
- Log important events and errors for debugging
- Use environment variables for configuration
- Follow existing patterns for consistency

## Recent Improvements Made

1. **Security**: Moved hardcoded allowed senders to environment variables
2. **Type Safety**: Added proper TypeScript interfaces for all data structures
3. **Error Handling**: Added comprehensive error handling and logging
4. **Reliability**: Added retry logic with exponential backoff for API calls
5. **Validation**: Added proper data validation before API submission
6. **Testing**: Added Jest test framework with baseline tests

## Testing Approach

The project uses Jest for testing. Test files are located in the `test/` directory and use the `.test.ts` extension.

Test data includes:
- `test/2020/` - Contains 2020 format test email data
- `test/2025/` - Contains 2025 format test email data (current format)
