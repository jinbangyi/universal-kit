# Universal Kit

A TypeScript monorepo for API usage observation and monitoring libraries.

## Overview

Universal Kit provides a comprehensive suite of tools for measuring and observing external API usage with:

- **Structured Logger** with metadata support for easy log attribution
- **Metrics HTTP Client** with automatic API usage measurement and OpenTelemetry integration
- **Provider-Level Monitoring** for API usage analytics and success rate tracking
- **OpenTelemetry Support** for enterprise observability standards

## Packages

- `@universal-kit/logger` - **Winston-based** structured logger with metadata and advanced features (v0.1.2)
- `@universal-kit/metrics-client` - HTTP client with automatic measurement and provider monitoring (v0.1.2)
- `@universal-kit/otel` - OpenTelemetry SDK integration for enterprise observability (v0.1.2)

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

### Metrics HTTP Client with Provider Monitoring

```typescript
import { AxiosWrapper } from '@universal-kit/metrics-client';

// Create a metrics-enabled HTTP client with provider monitoring
const client = new AxiosWrapper({
  provider: 'my-api-provider',
  apiKey: 'your-api-key',
  apiKeyHeader: 'x-api-key',
  baseURL: 'https://api.example.com',
  timeout: 5000,
  traceFailedRequests: true,
  logRequestEvents: true,
});

try {
  const response = await client.get('/users/1');
  console.log('Data:', response.data);
  console.log('Metrics:', response._metrics);

  // Access provider-level metrics
  const metricsManager = client.getProviderMetricsManager();
  const successRate = metricsManager.getProviderSuccessRate();
  console.log('Provider success rate:', successRate);
} catch (error) {
  console.error('Request failed:', error);
  console.error('Error metrics:', error._metrics);
}
```

### Node Fetch-based HTTP Client

```typescript
import { NodeFetchWrapper } from '@universal-kit/metrics-client';

const client = new NodeFetchWrapper({
  baseUrl: 'https://api.example.com',
  provider: 'my-api',
  timeout: 5000,
});

const result = await client.get('/users/1');
console.log('Data:', result.data);
console.log('Metrics:', result.metrics);
```

### Winston-based Logger with Advanced Features

```typescript
import { Logger, trackFunction } from '@universal-kit/logger';

// Create enhanced logger with Winston backend
const logger = new Logger({
  level: 'info',
  includeMetadata: true,
  customFields: { service: 'my-service', version: '1.0.0' },
});

// Basic logging with structured metadata
logger.info('Processing request', {
  userId: 123,
  requestId: 'req-abc123',
  operation: 'getUser'
});

// Use trackFunction decorator for automatic function measurement
class UserService {
  @trackFunction({
    logArguments: true,
    logResult: true,
    logErrors: true
  })
  async getUser(userId: number) {
    // Your logic here
    return { id: userId, name: 'John Doe' };
  }
}

// Advanced Winston features
const recentLogs = await logger.query({ limit: 10, order: 'desc' });
const childLogger = logger.child({ requestId: 'req-123' });
logger.setLevel('debug'); // Dynamic level changes
```

### OpenTelemetry Integration

```typescript
import { OtelProvider } from '@universal-kit/otel';

// Initialize OpenTelemetry for enterprise observability
const otel = new OtelProvider({
  serviceName: 'my-service',
  serviceVersion: '1.0.0',
  environment: 'production'
});

await otel.initialize();

// Your application code now has full OpenTelemetry support
// Logs, metrics, and traces are automatically collected
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
- ✅ **Metrics HTTP Client** with automatic measurement and provider monitoring
- ✅ **OpenTelemetry Integration** for enterprise observability
- ✅ **Provider-level metrics** with success rate tracking and API usage analytics
- ✅ **Request tracing** with comprehensive error tracking and logging
- ✅ **Axios-compatible wrapper** for drop-in replacement
- ✅ **Function tracking decorator** for automatic measurement
- ✅ Jest testing framework with comprehensive coverage
- ✅ Example usage demonstrating all features
- ✅ CI/CD ready with proper test configuration

## Logger Features

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
- **Function Tracking**: Automatic measurement of decorated functions

## Metrics Client Features

The metrics client provides comprehensive HTTP monitoring:

- **Automatic API Usage Measurement**: All HTTP requests are automatically measured
- **Provider-Level Monitoring**: Track usage per API provider with success rates
- **OpenTelemetry Integration**: Full OTel metrics and tracing support
- **Request Tracing**: Detailed request lifecycle tracking with span management
- **Error Analytics**: Comprehensive logging and tracing of failed requests
- **Axios Compatibility**: Drop-in replacement for existing Axios code
- **Retry Logic**: Configurable retry mechanisms for failed requests
- **Request/Response Size Tracking**: Automatic size measurement for monitoring
- **Active Connections Monitoring**: Real-time monitoring of active HTTP connections

## OpenTelemetry Features

The OTel package provides enterprise observability:

- **Full OTel SDK**: Complete OpenTelemetry protocol support
- **Auto-Instrumentation**: Node.js auto-instrumentation for common libraries
- **Multiple Exporters**: OTLP, Prometheus, and custom exporters
- **Resource Management**: Standard OTel resource configuration
- **Semantic Conventions**: Standard OTel semantic conventions
- **Logs, Metrics, Traces**: Complete observability stack

## Architecture

The project follows a modular architecture where each package has a specific responsibility:

1. **Logger**: Winston-based structured logging with rich metadata and function tracking
2. **Metrics Client**: HTTP client wrapper with provider-level monitoring and tracing
3. **OTel**: Full OpenTelemetry SDK integration for enterprise observability

All packages work together to provide comprehensive API usage observability with enterprise-grade features.
