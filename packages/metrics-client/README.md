# @universal-kit/metrics-client

OpenTelemetry-based metrics HTTP client wrapper with API provider monitoring and enhanced tracing for universal-kit. This package provides both a native fetch-based client and an Axios-compatible wrapper with comprehensive provider-level metrics and detailed request tracing.

## Installation

```bash
npm install @universal-kit/metrics-client axios
```

## Features

- ✅ **OpenTelemetry Integration**: Full OpenTelemetry metrics and tracing support
- ✅ **API Provider Monitoring**: Measure latency and success rates per provider
- ✅ **API Key Usage Tracking**: Track usage by provider, API key, path, and status
- ✅ **Enhanced Request Tracing**: Detailed request events and span tracking
- ✅ **Failed Request Analysis**: Comprehensive logging and tracing of failed requests
- ✅ **Axios Compatibility**: Drop-in replacement for existing Axios code
- ✅ **TypeScript Support**: Full TypeScript support with proper type definitions
- ✅ **Request/Response Size Tracking**: Automatic size measurement for monitoring
- ✅ **Configurable Logging**: Integration with universal-kit logger

## Usage

### MeasuredHttpClient (Fetch-based)

```typescript
import { MeasuredHttpClient } from '@universal-kit/metrics-client';

const client = new MeasuredHttpClient({
  baseUrl: 'https://api.example.com',
  timeout: 5000,
  headers: {
    Authorization: 'Bearer your-token',
  },
  // Provider monitoring configuration
  provider: 'my-api-provider',
  apiKey: 'your-api-key',
  apiKeyHeader: 'x-api-key', // Custom API key header
  traceFailedRequests: true,
  logRequestEvents: true,
});

// Make a measured request with provider tracking
try {
  const result = await client.get<User>('/users/1');
  console.log('Data:', result.data);
  console.log('Metrics:', result.metrics);

  // Get provider success rate
  const successRate = client.getProviderSuccessRate();
  console.log('Provider success rate:', successRate);
} catch (error) {
  console.error('Request failed:', error);
}
```

### MeasuredAxios (Axios-compatible)

```typescript
import { MeasuredAxios, AxiosWrapperConfig } from '@universal-kit/metrics-client';

const config: AxiosWrapperConfig = {
  provider: 'payment-provider',
  apiKey: 'pk_live_1234567890',
  apiKeyHeader: 'x-api-key',
  baseURL: 'https://api.example.com',
  timeout: 5000,
  headers: {
    'Content-Type': 'application/json',
  },
  traceFailedRequests: true,
  logRequestEvents: true,
};

const axiosClient = new MeasuredAxios(config);

// Use as drop-in replacement for Axios with provider monitoring
try {
  const response = await axiosClient.get<User>('/users/1');
  console.log('Data:', response.data);
  console.log('Metrics:', response._metrics); // Axios response with enhanced metrics

  // Access provider metrics
  const providerMetrics = axiosClient.getProviderMetricsManager();
  const requestTracer = axiosClient.getRequestTracer();
} catch (error) {
  console.error('Request failed:', error);
  console.error('Metrics:', error._metrics); // Error with detailed metrics
}

// Custom API key extraction from headers
const customAxios = new MeasuredAxios({
  provider: 'custom-api',
  getApiKey: (config) => {
    // Custom logic to extract API key from headers or config
    return config.headers?.['custom-auth-key'] || 'default-key';
  },
  apiKeyHeader: 'custom-auth-key',
});
```
```

### Advanced Axios Usage

```typescript
import { MeasuredAxios } from '@universal-kit/metrics-client';

const client = new MeasuredAxios();

// Configure base URL
client.setConfig({
  baseUrl: 'https://api.example.com',
  headers: { 'Content-Type': 'application/json' },
});

// Use all Axios methods
const getUsers = await client.get('/users');
const createUser = await client.post('/users', { name: 'John' });
const updateUser = await client.put('/users/1', { name: 'Jane' });
const patchUser = await client.patch('/users/1', { status: 'active' });
const deleteUser = await client.delete('/users/1');

// Custom request configuration
const config: MeasuredAxiosRequestConfig = {
  method: 'GET',
  url: '/custom',
  skipMetrics: true, // Skip metrics for this request
  headers: { 'X-Custom': 'value' },
};
const customResponse = await client.request(config);

// Access underlying Axios instance for advanced usage
const axiosInstance = client.getAxiosInstance();
axiosInstance.interceptors.request.use(config => {
  // Custom interceptor logic
  return config;
});
```

### API Provider Monitoring

```typescript
import {
  MeasuredHttpClient,
  PrometheusMetricsManager,
  createPrometheusMetrics,
  MultiMetricsConfig
} from '@universal-kit/metrics-client';

// Configure multi-metrics with Prometheus support
const metricsConfig: MultiMetricsConfig = {
  openTelemetry: { enabled: true },
  prometheus: {
    enabled: true,
    prefix: 'my_app_http',
    labels: { service: 'user-service' }
  }
};

const client = new MeasuredHttpClient(
  {
    baseUrl: 'https://api.example.com',
    enableMetrics: true
  },
  undefined,
  metricsConfig
);

// Make requests and collect metrics
await client.get('/users/1');
await client.get('/users/2');

// Get Prometheus metrics
const prometheusMetrics = client.getPrometheusMetrics();
console.log(prometheusMetrics);

// Create standalone Prometheus metrics
const prometheusManager = createPrometheusMetrics({
  enabled: true,
  prefix: 'custom_metrics',
  labels: { app: 'my-app' }
});

// Record custom metrics
prometheusManager.recordHttpRequest(
  'GET',
  'https://api.example.com/users',
  200,
  150, // duration in ms
  1024, // request size in bytes
  2048  // response size in bytes
);

// Get metrics for Prometheus server
const metrics = prometheusManager.getMetrics();
```

Available Prometheus metrics:
- `http_client_http_requests_total` - Total number of HTTP requests
- `http_client_http_request_duration_seconds` - Request duration histogram
- `http_client_http_request_size_bytes` - Request size histogram
- `http_client_http_response_size_bytes` - Response size histogram
- `http_client_active_connections` - Active connections gauge
- `http_client_errors_total` - Total number of errors

### Error Handling

```typescript
import { MeasuredAxios } from '@universal-kit/metrics-client';

const client = new MeasuredAxios();

try {
  const response = await client.get('/nonexistent');
} catch (error: any) {
  // Access metrics even on errors
  console.log('Error metrics:', error._metrics);

  // Handle different error types
  if (error.response) {
    // Server responded with error status
    console.log('Status:', error.response.status);
    console.log('Data:', error.response.data);
  } else if (error.request) {
    // Request was made but no response received
    console.log('Network error:', error.message);
  } else {
    // Something else happened
    console.log('Error:', error.message);
  }
}
```

### Configuration Options

Both `MeasuredHttpClient` and `MeasuredAxios` support the same configuration:

```typescript
interface HttpClientConfig {
  baseUrl?: string;
  timeout?: number;
  headers?: Record<string, string>;
  retryConfig?: {
    attempts: number;
    delay: number;
  };
  enableMetrics?: boolean;
}
```

### Measured Methods

For `MeasuredAxios`, you can use measured methods that return `ApiCallResult<T>`:

- `measuredGet<T>(url, config?)`
- `measuredPost<T>(url, data?, config?)`
- `measuredPut<T>(url, data?, config?)`
- `measuredPatch<T>(url, data?, config?)`
- `measuredDelete<T>(url, config?)`
- `measuredRequest<T>(config)`

These methods provide a consistent response format with `data`, `metrics`, and `success` properties.

## Features

- ✅ **Multi-Metrics Support**: OpenTelemetry and Prometheus metrics collection
- ✅ **Prometheus Integration**: Comprehensive Prometheus metrics with histograms, counters, and gauges
- ✅ **Automatic API Usage Measurement**: All HTTP requests are automatically measured and logged
- ✅ **Axios Compatibility**: Drop-in replacement for existing Axios code
- ✅ **TypeScript Support**: Full TypeScript support with proper type definitions
- ✅ **Request/Response Interceptors**: Full access to Axios interceptors
- ✅ **Metrics Access**: Access detailed metrics from responses and errors
- ✅ **Retry Logic**: Built-in retry logic for failed requests
- ✅ **Request ID Tracking**: Automatic request ID generation for tracing
- ✅ **Configurable Logging**: Integration with universal-kit logger
- ✅ **Request/Response Size Tracking**: Track HTTP request and response sizes
- ✅ **Active Connections Monitoring**: Real-time monitoring of active HTTP connections

## API Reference

### MeasuredAxios

#### Constructor

```typescript
new MeasuredAxios(config?: HttpClientConfig, logger?: Logger)
```

#### Methods

- `get<T>(url, config?)` - Axios-compatible GET request
- `post<T>(url, data?, config?)` - Axios-compatible POST request
- `put<T>(url, data?, config?)` - Axios-compatible PUT request
- `patch<T>(url, data?, config?)` - Axios-compatible PATCH request
- `delete<T>(url, config?)` - Axios-compatible DELETE request
- `request<T>(config)` - Axios-compatible custom request
- `measuredGet<T>(url, config?)` - Returns ApiCallResult<T>
- `measuredPost<T>(url, data?, config?)` - Returns ApiCallResult<T>
- `measuredPut<T>(url, data?, config?)` - Returns ApiCallResult<T>
- `measuredPatch<T>(url, data?, config?)` - Returns ApiCallResult<T>
- `measuredDelete<T>(url, config?)` - Returns ApiCallResult<T>
- `measuredRequest<T>(config)` - Returns ApiCallResult<T>

#### Properties

- `defaults` - Axios defaults
- `interceptors` - Axios interceptors

#### Utility Methods

- `getUri(config?)` - Get request URI
- `setConfig(config)` - Update configuration
- `getConfig()` - Get current configuration
- `getAxiosInstance()` - Get underlying Axios instance
- `createApiCallResult(response)` - Convert Axios response to ApiCallResult

### Types

```typescript
interface MeasuredAxiosRequestConfig extends AxiosRequestConfig {
  skipMetrics?: boolean;
}

interface MeasuredAxiosResponse<T = any> extends AxiosResponse<T> {
  _metrics?: ApiMetrics;
}

interface MeasuredAxiosError<T = any> extends AxiosError<T> {
  _metrics?: ApiMetrics;
}
```
