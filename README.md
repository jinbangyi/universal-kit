# Universal Kit

A TypeScript monorepo for API usage observation and monitoring libraries.

## Overview

Universal Kit provides a comprehensive suite of tools for measuring and observing external API usage with:

- **Structured Logger** with metadata support for easy log attribution
- **HTTP Client Wrapper** with automatic API usage measurement
- **Decorator System** for easy integration with existing code
- **OpenTelemetry Support** for observability standards

## Packages

- `@universal-kit/core` - Core types and interfaces
- `@universal-kit/logger` - **Winston-based** structured logger with metadata and advanced features
- `@universal-kit/http-client` - HTTP client with automatic measurement
- `@universal-kit/decorators` - Decorators for API usage tracking
- `@universal-kit/otel` - OpenTelemetry protocol support

## Quick Start

```bash
# Install dependencies
pnpm install

# Build all packages
pnpm build

# Run the example
cd examples/basic-usage
pnpm install
pnpm dev
```

## Usage Examples

### Basic HTTP Client

```typescript
import { MeasuredHttpClient } from '@universal-kit/http-client';
import { Logger } from '@universal-kit/logger';

const logger = new Logger();
const client = new MeasuredHttpClient(
  { baseUrl: 'https://api.example.com' },
  logger
);

const result = await client.get('/users/1');
console.log('API call completed in', result.metrics.duration, 'ms');
```

### Using Decorators

```typescript
import { measureApiUsage } from '@universal-kit/decorators';

class ApiService {
  @measureApiUsage({
    logRequests: true,
    logResponses: true,
    includeArgs: true,
  })
  async getUser(userId: number) {
    // Your API call logic here
    return await httpClient.get(`/users/${userId}`);
  }
}
```

### Winston-based Logger with Advanced Features

```typescript
import { Logger } from '@universal-kit/logger';
import winston from 'winston';

// Create enhanced logger with Winston backend
const logger = new Logger({
  level: 'info',
  includeMetadata: true,
  customFields: { service: 'my-service', version: '1.0.0' },
});

// Add custom Winston transports
logger.addTransport(
  new winston.transports.File({
    filename: 'app.log',
    format: winston.format.json(),
  })
);

// Basic logging with structured metadata
logger.info('Processing request', 'api-service', 'getUser', {
  userId: 123,
  requestId: 'req-abc123',
});

// Advanced Winston features
const recentLogs = await logger.query({ limit: 10, order: 'desc' });
const childLogger = logger.child({ requestId: 'req-123' });
logger.setLevel('debug'); // Dynamic level changes
```

## Development

```bash
# Install dependencies
pnpm install

# Build all packages
pnpm build

# Run linting
pnpm lint

# Run tests
pnpm test

# Run tests in watch mode
pnpm test --watch

# Run tests with coverage
pnpm test --coverage

# Run tests for specific package
pnpm test --filter @universal-kit/logger

# Clean build artifacts
pnpm clean
```

## Testing

The repository uses **Jest** as the test framework with comprehensive test coverage:

- **Unit Tests**: Each package has its own test suite
- **Integration Tests**: Cross-package functionality testing
- **Mocking**: Proper mocking for external dependencies
- **Coverage Reports**: Detailed coverage metrics

### Test Structure

```
packages/
├── core/src/__tests__/
│   └── types.test.ts              # Type validation tests
├── logger/src/__tests__/
│   └── logger.test.ts             # Logger functionality tests
├── http-client/src/__tests__/
│   ├── setup.ts                   # Test setup and mocks
│   └── http-client.test.ts        # HTTP client tests
├── decorators/src/__tests__/
│   ├── setup.ts                   # Decorator test setup
│   └── decorators.test.ts         # Decorator functionality tests
└── otel/src/__tests__/
    ├── setup.ts                   # OpenTelemetry mocks
    └── otel-provider.test.ts      # Otel provider tests
```

### Running Tests

```bash
# Run all tests
pnpm test

# Run tests for specific package
pnpm test @universal-kit/logger

# Run tests in watch mode
pnpm test --watch

# Generate coverage report
pnpm test --coverage

# Run example integration tests
cd examples/basic-usage
pnpm test
```

## Features Implemented

- ✅ Monorepo structure with pnpm workspaces
- ✅ TypeScript with strict type checking
- ✅ **Winston-based structured logging** with metadata and advanced features
- ✅ HTTP client wrapper with automatic measurement
- ✅ Decorator system for API usage tracking
- ✅ OpenTelemetry protocol support
- ✅ Jest testing framework with comprehensive coverage
- ✅ Example usage demonstrating all features
- ✅ CI/CD ready with proper test configuration

## Winston Logger Features

The logger is built on top of **Winston** and provides:

- **Multiple Transports**: Console, file, and custom transports
- **Daily Rotating Files**: Automatic log rotation in production
- **Structured Metadata**: Rich context for log attribution
- **Log Querying**: Search and filter historical logs
- **Child Loggers**: Isolated logging contexts
- **Log Streaming**: Real-time log monitoring
- **Dynamic Configuration**: Runtime log level changes
- **Custom Formatting**: Flexible log output formats
- **Error Handling**: Comprehensive error logging with stack traces

## Architecture

The project follows a modular architecture where each package has a specific responsibility:

1. **Core**: Provides shared types and interfaces
2. **Logger**: Winston-based structured logging with rich metadata and advanced features
3. **HTTP Client**: Wraps fetch with automatic measurement and logging
4. **Decorators**: Provides annotation-based measurement
5. **OTel**: Integrates with OpenTelemetry standards

All packages work together to provide comprehensive API usage observability.
