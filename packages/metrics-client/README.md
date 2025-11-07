# @universal-kit/metrics-client

OpenTelemetry-based metrics HTTP client wrapper with API provider monitoring and enhanced tracing for universal-kit. This package provides both a Node fetch-based client and an Axios-compatible wrapper with comprehensive provider-level metrics and detailed request tracing.

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

### NodeFetchWrapper (Node Fetch-based)

```typescript
import { NodeFetchWrapper } from '@universal-kit/metrics-client';

const client = new NodeFetchWrapper({
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

### AxiosWrapper (Axios-compatible)

```typescript
import { AxiosWrapper, AxiosWrapperRequestConfig } from '@universal-kit/metrics-client';

const config: AxiosWrapperRequestConfig = {
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

const axiosClient = new AxiosWrapper(config);

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
const customAxios = new AxiosWrapper({
  provider: 'custom-api',
  getApiKey: (config) => {
    // Custom logic to extract API key from headers or config
    return config.headers?.['custom-auth-key'] || 'default-key';
  },
  apiKeyHeader: 'custom-auth-key',
});
```

### Advanced Axios Usage

```typescript
import { AxiosWrapper } from '@universal-kit/metrics-client';

const client = new AxiosWrapper();

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
const config: AxiosWrapperRequestConfig = {
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
  NodeFetchWrapper,
  AxiosWrapper,
  ProviderMetricsManager
} from '@universal-kit/metrics-client';

// Create client with provider monitoring
const client = new AxiosWrapper({
  provider: 'payment-api',
  apiKey: 'your-api-key',
  baseURL: 'https://api.example.com',
  enableMetrics: true
});

// Get provider metrics manager
const metricsManager = client.getProviderMetricsManager();

// Access provider-level analytics
const successRate = metricsManager.getProviderSuccessRate();
const requestCount = metricsManager.getProviderRequestCount();
const errorRate = metricsManager.getProviderErrorRate();

// Get detailed metrics by API key
const apiKeyMetrics = metricsManager.getApiKeyMetrics();

// Access request tracer for detailed request information
const tracer = client.getRequestTracer();

// Make requests and collect metrics
await client.get('/users/1');
await client.get('/users/2');

// Get updated metrics after requests
console.log('Updated success rate:', metricsManager.getProviderSuccessRate());
console.log('Total requests:', metricsManager.getProviderRequestCount());
```

Available provider-level metrics:
- Request count per provider
- Success rate calculation
- Error rate tracking
- API key-specific metrics
- Request/response timing
- Status code distribution
- Error tracking and analysis

### Error Handling

```typescript
import { AxiosWrapper } from '@universal-kit/metrics-client';

const client = new AxiosWrapper();

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

Both `NodeFetchWrapper` and `AxiosWrapper` support comprehensive configuration:

```typescript
interface BaseWrapperConfig {
  baseUrl?: string;
  timeout?: number;
  headers?: Record<string, string>;
  enableMetrics?: boolean;
  provider?: string;
  apiKey?: string;
  apiKeyHeader?: string;
  getApiKey?: (config: any) => string;
  traceFailedRequests?: boolean;
  logRequestEvents?: boolean;
}

interface AxiosWrapperRequestConfig extends BaseWrapperConfig {
  // All Axios config options supported
  baseURL?: string;
  method?: string;
  data?: any;
  params?: any;
  skipMetrics?: boolean;
}
```

## API Reference

### NodeFetchWrapper

#### Constructor

```typescript
new NodeFetchWrapper(config?: BaseWrapperConfig, logger?: Logger)
```

#### Methods

- `get<T>(url, config?)` - GET request
- `post<T>(url, data?, config?)` - POST request
- `put<T>(url, data?, config?)` - PUT request
- `patch<T>(url, data?, config?)` - PATCH request
- `delete<T>(url, config?)` - DELETE request
- `request<T>(config)` - Custom request

### AxiosWrapper

#### Constructor

```typescript
new AxiosWrapper(config?: BaseWrapperConfig, logger?: Logger)
```

#### Methods

- `get<T>(url, config?)` - Axios-compatible GET request
- `post<T>(url, data?, config?)` - Axios-compatible POST request
- `put<T>(url, data?, config?)` - Axios-compatible PUT request
- `patch<T>(url, data?, config?)` - Axios-compatible PATCH request
- `delete<T>(url, config?)` - Axios-compatible DELETE request
- `request<T>(config)` - Axios-compatible custom request

#### Properties

- `defaults` - Axios defaults
- `interceptors` - Axios interceptors

#### Utility Methods

- `setConfig(config)` - Update configuration
- `getConfig()` - Get current configuration
- `getAxiosInstance()` - Get underlying Axios instance
- `getProviderMetricsManager()` - Get provider metrics manager
- `getRequestTracer()` - Get request tracer

### ProviderMetricsManager

- `getProviderSuccessRate()` - Get success rate for provider
- `getProviderRequestCount()` - Get total request count
- `getProviderErrorRate()` - Get error rate for provider
- `getApiKeyMetrics()` - Get metrics by API key
- `resetMetrics()` - Reset all metrics

### RequestTracer

- `traceRequest(request, response)` - Trace a request
- `traceError(request, error)` - Trace an error
- `getActiveSpans()` - Get active request spans
- `getRequestTrace(requestId)` - Get trace by request ID

## Key Features

- ✅ **Provider-Level Monitoring**: Track usage per API provider with success rates and analytics
- ✅ **OpenTelemetry Integration**: Full OTel metrics and tracing support for enterprise observability
- ✅ **Request Tracing**: Detailed request lifecycle tracking with comprehensive error analysis
- ✅ **Axios Compatibility**: Drop-in replacement for existing Axios code with enhanced features
- ✅ **Node Fetch Support**: Native Node.js fetch wrapper for modern applications
- ✅ **API Key Tracking**: Monitor usage by API key, path, and status code
- ✅ **TypeScript Support**: Full TypeScript support with proper type definitions
- ✅ **Metrics Access**: Access detailed metrics from responses and errors
- ✅ **Configurable Logging**: Integration with universal-kit logger
- ✅ **Request/Response Size Tracking**: Track HTTP request and response sizes
- ✅ **Failed Request Analysis**: Comprehensive logging and tracing of failed requests

## Examples

### Production-ready Setup

```typescript
import { AxiosWrapper } from '@universal-kit/metrics-client';
import { Logger } from '@universal-kit/logger';

// Initialize logger
const logger = new Logger({
  level: 'info',
  service: 'my-service'
});

// Create HTTP client with provider monitoring
const httpClient = new AxiosWrapper({
  provider: 'payment-provider',
  apiKey: process.env.PAYMENT_API_KEY,
  apiKeyHeader: 'x-api-key',
  baseURL: 'https://api.payment-provider.com',
  timeout: 10000,
  traceFailedRequests: true,
  logRequestEvents: true,
  enableMetrics: true
}, logger);

// Use in your application
export { httpClient };
```
