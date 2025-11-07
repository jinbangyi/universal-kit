# @universal-kit/otel

OpenTelemetry SDK integration for enterprise observability in universal-kit. This package provides a complete OpenTelemetry setup with auto-instrumentation, multiple exporters, and comprehensive observability support for production applications.

## Installation

```bash
npm install @universal-kit/otel
```

## Features

- ✅ **Complete OTel SDK**: Full OpenTelemetry protocol support for logs, metrics, and traces
- ✅ **Auto-Instrumentation**: Node.js auto-instrumentation for common libraries and frameworks
- ✅ **Multiple Exporters**: OTLP, Prometheus, and custom exporters
- ✅ **Resource Management**: Standard OTel resource configuration and metadata
- ✅ **Semantic Conventions**: Standard OTel semantic conventions for consistency
- ✅ **Production Ready**: Configured for production environments with proper defaults
- ✅ **TypeScript Support**: Full TypeScript support with proper type definitions
- ✅ **Easy Setup**: Simple initialization with sensible defaults

## Usage

### Basic Setup

```typescript
import { OtelProvider } from '@universal-kit/otel';

// Initialize OpenTelemetry with default settings
const otel = new OtelProvider({
  serviceName: 'my-service',
  serviceVersion: '1.0.0',
  environment: 'production'
});

await otel.initialize();

// Your application now has full OpenTelemetry support
// Logs, metrics, and traces are automatically collected
```

### Advanced Configuration

```typescript
import { OtelProvider } from '@universal-kit/otel';

const otel = new OtelProvider({
  // Service identification
  serviceName: 'user-service',
  serviceVersion: '2.1.0',
  environment: 'production',
  serviceNamespace: 'backend',

  // Resource attributes
  resourceAttributes: {
    'deployment.environment': 'production',
    'service.instance.id': 'instance-123',
    'k8s.pod.name': 'user-service-abc-123',
    'k8s.namespace.name': 'backend'
  },

  // OTLP Exporter configuration
  otlp: {
    enabled: true,
    endpoint: 'https://otel-collector.example.com:4317',
    headers: {
      'x-api-key': 'your-api-key'
    },
    timeout: 5000
  },

  // Prometheus metrics configuration
  prometheus: {
    enabled: true,
    port: 9464,
    endpoint: '/metrics'
  },

  // Console exporter for development
  console: {
    enabled: process.env.NODE_ENV === 'development'
  }
});

await otel.initialize();
```

### Environment Variables Configuration

```bash
# Service configuration
OTEL_SERVICE_NAME=my-service
OTEL_SERVICE_VERSION=1.0.0
OTEL_RESOURCE_ATTRIBUTES=service.name=my-service,service.version=1.0.0,deployment.environment=production

# OTLP exporter
OTEL_EXPORTER_OTLP_ENDPOINT=https://otel-collector.example.com:4317
OTEL_EXPORTER_OTLP_HEADERS=x-api-key=your-api-key
OTEL_EXPORTER_OTLP_TIMEOUT=5000

# Prometheus exporter
OTEL_EXPORTER_PROMETHEUS_PORT=9464
OTEL_EXPORTER_PROMETHEUS_ENDPOINT=/metrics

# Console exporter (development)
OTEL_CONSOLE_EXPORTER_ENABLED=true
```

### Using with Other Universal Kit Packages

```typescript
import { OtelProvider } from '@universal-kit/otel';
import { Logger } from '@universal-kit/logger';
import { AxiosWrapper } from '@universal-kit/metrics-client';

// Initialize OpenTelemetry first
const otel = new OtelProvider({
  serviceName: 'my-service',
  serviceVersion: '1.0.0'
});
await otel.initialize();

// Logger will automatically include OTel metadata
const logger = new Logger({
  includeOpenTelemetryMetadata: true
});

// HTTP client will automatically create spans and metrics
const client = new AxiosWrapper({
  provider: 'external-api',
  baseURL: 'https://api.example.com'
});

// All operations are now correlated with traces and metrics
logger.info('Processing user request', { userId: 123 });
const response = await client.get(`/users/${userId}`);
```

### Custom Exporters and Instrumentations

```typescript
import { OtelProvider } from '@universal-kit/otel';
import { NodeSDK } from '@opentelemetry/sdk-node';
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';

const otel = new OtelProvider({
  serviceName: 'my-service',
  customInstrumentations: [
    // Add custom instrumentations
    ...getNodeAutoInstrumentations({
      // Disable specific instrumentations if needed
      '@opentelemetry/instrumentation-fs': {
        enabled: false
      }
    })
  ],
  customExporters: {
    // Add custom exporters
    tracing: [
      // Your custom trace exporter
    ],
    metrics: [
      // Your custom metrics exporter
    ]
  }
});

await otel.initialize();
```

### Manual Instrumentation

```typescript
import { trace, metrics, context } from '@opentelemetry/api';

// Manual tracing
const tracer = trace.getTracer('my-service');

const span = tracer.startSpan('manual-operation', {
  attributes: {
    'user.id': 123,
    'operation.type': 'data-processing'
  }
});

try {
  // Your operation here
  await processData();
  span.setStatus({ code: SpanStatusCode.OK });
} catch (error) {
  span.recordException(error);
  span.setStatus({ code: SpanStatusCode.ERROR });
} finally {
  span.end();
}

// Manual metrics
const meter = metrics.getMeter('my-service');
const counter = meter.createCounter('operations_total', {
  description: 'Total number of operations'
});

counter.add(1, {
  'operation.type': 'data-processing',
  'user.id': 123
});

// Context propagation
const ctx = trace.setSpan(context.active(), span);
await context.with(ctx, async () => {
  // Operations in this context inherit the span
});
```

### Configuration Options

```typescript
interface OtelConfig {
  // Service identification (required)
  serviceName: string;
  serviceVersion?: string;
  environment?: string;
  serviceNamespace?: string;

  // Resource attributes
  resourceAttributes?: Record<string, string>;

  // Exporter configurations
  otlp?: {
    enabled?: boolean;
    endpoint?: string;
    headers?: Record<string, string>;
    timeout?: number;
  };

  prometheus?: {
    enabled?: boolean;
    port?: number;
    endpoint?: string;
  };

  console?: {
    enabled?: boolean;
  };

  // Custom components
  customInstrumentations?: any[];
  customExporters?: {
    tracing?: any[];
    metrics?: any[];
    logs?: any[];
  };

  // Advanced options
  disableAutoInstrumentations?: string[];
  sampler?: any;
  textMapPropagator?: any;
}
```

## API Reference

### OtelProvider Class

#### Constructor

```typescript
new OtelConfig(config: OtelConfig)
```

#### Methods

- `initialize(): Promise<void>` - Initialize OpenTelemetry SDK
- `shutdown(): Promise<void>` - Shutdown OpenTelemetry SDK gracefully
- `getTracer(name: string): Tracer` - Get tracer for manual instrumentation
- `getMeter(name: string): Meter` - Get meter for manual metrics
- `getLogger(name: string): Logger` - Get logger for manual logging

### Exports

- `OtelProvider` - Main OpenTelemetry provider class
- `defaultOtelProvider` - Default provider instance

## Environment Variables

### Required

- `OTEL_SERVICE_NAME` - Name of the service (required if not provided in config)

### Optional

- `OTEL_SERVICE_VERSION` - Version of the service
- `OTEL_RESOURCE_ATTRIBUTES` - Additional resource attributes
- `OTEL_EXPORTER_OTLP_ENDPOINT` - OTLP collector endpoint
- `OTEL_EXPORTER_OTLP_HEADERS` - Headers for OTLP exporter
- `OTEL_EXPORTER_OTLP_TIMEOUT` - Timeout for OTLP exporter
- `OTEL_EXPORTER_PROMETHEUS_PORT` - Port for Prometheus exporter
- `OTEL_EXPORTER_PROMETHEUS_ENDPOINT` - Endpoint for Prometheus metrics
- `OTEL_CONSOLE_EXPORTER_ENABLED` - Enable console exporter (true/false)

## Examples

### Production Setup with Multiple Exporters

```typescript
import { OtelProvider } from '@universal-kit/otel';

// Production configuration with multiple exporters
const otel = new OtelProvider({
  serviceName: 'user-service',
  serviceVersion: process.env.SERVICE_VERSION || '1.0.0',
  environment: process.env.NODE_ENV || 'production',

  resourceAttributes: {
    'deployment.environment': process.env.NODE_ENV || 'production',
    'service.instance.id': process.env.HOSTNAME || 'unknown',
    'k8s.pod.name': process.env.POD_NAME,
    'k8s.namespace.name': process.env.POD_NAMESPACE
  },

  // OTLP for production telemetry
  otlp: {
    enabled: true,
    endpoint: process.env.OTEL_EXPORTER_OTLP_ENDPOINT || 'http://localhost:4317',
    headers: process.env.OTEL_EXPORTER_OTLP_HEADERS ?
      JSON.parse(process.env.OTEL_EXPORTER_OTLP_HEADERS) : undefined,
    timeout: 10000
  },

  // Prometheus for metrics scraping
  prometheus: {
    enabled: true,
    port: parseInt(process.env.METRICS_PORT) || 9464,
    endpoint: '/metrics'
  },

  // Console only in development
  console: {
    enabled: process.env.NODE_ENV === 'development'
  }
});

// Initialize and handle graceful shutdown
async function start() {
  try {
    await otel.initialize();
    console.log('OpenTelemetry initialized successfully');

    // Start your application
    startApplication();

  } catch (error) {
    console.error('Failed to initialize OpenTelemetry:', error);
    process.exit(1);
  }
}

process.on('SIGTERM', async () => {
  console.log('Shutting down OpenTelemetry...');
  await otel.shutdown();
  process.exit(0);
});

start();
```

### Development Setup

```typescript
import { OtelProvider } from '@universal-kit/otel';

// Development configuration
const otel = new OtelProvider({
  serviceName: 'dev-service',
  environment: 'development',

  // Only enable console exporter for development
  console: {
    enabled: true
  },

  // Disable auto-instrumentations that add noise in development
  disableAutoInstrumentations: [
    '@opentelemetry/instrumentation-fs',
    '@opentelemetry/instrumentation-net'
  ]
});

await otel.initialize();
```