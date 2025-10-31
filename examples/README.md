# AxiosWrapper Examples

This directory contains comprehensive examples demonstrating how to use the `AxiosWrapper` class from `@universal-kit/metrics-client`.

## 📁 Files Overview

### 1. `axios-wrapper-getting-started.ts`
**Quick start guide** with simple, copy-paste ready examples for common use cases.

**Includes:**
- Basic setup
- GET/POST requests with metrics
- Custom configuration
- Skipping metrics for internal requests
- Accessing provider metrics

### 2. `axios-wrapper-usage.ts`
**Comprehensive examples** covering all features and use cases.

**Includes:**
- Basic and advanced setup
- All HTTP methods (GET, POST, PUT, PATCH, DELETE, etc.)
- Metrics and monitoring access
- Error handling patterns
- Interceptor usage
- File uploads with progress tracking
- Parallel requests
- Request cancellation
- Reusable API client class pattern

### 3. `axios-wrapper-practical-example.ts`
**Real-world example** of building a complete e-commerce API client.

**Includes:**
- Complete type definitions
- EcommerceApiClient class with product, order, and user management
- Search and filtering
- Batch operations
- Health checks
- Error handling with retry logic
- Monitoring and metrics collection

## 🚀 Quick Start

### Installation
```bash
npm install @universal-kit/metrics-client axios
```

### Basic Usage
```typescript
import { AxiosWrapper } from '@universal-kit/metrics-client';

// Create client with provider monitoring
const client = new AxiosWrapper({
  provider: 'my-api',
  apiKeyHeader: 'x-api-key',
});

// Make a request with automatic metrics
try {
  const response = await client.get('/users');
  console.log('Data:', response.data);
  console.log('Metrics:', (response as any)._metrics);
} catch (error) {
  console.error('Error:', error);
  console.error('Metrics:', (error as any)._metrics);
}
```

## 📊 Key Features Demonstrated

### 1. **Automatic Metrics Collection**
- Request duration tracking
- API key usage monitoring
- Provider success rate measurement
- Request/response size tracking

### 2. **Comprehensive Error Handling**
- Detailed error metrics
- Failed request logging
- Network error detection
- Validation error handling

### 3. **Advanced Configuration**
- Custom retry logic
- Request/response interceptors
- Timeout configuration
- Custom headers and parameters

### 4. **Monitoring Integration**
- OpenTelemetry metrics
- Request tracing
- Failed request analysis
- Performance monitoring

## 🎯 Use Cases Covered

### Basic Operations
- ✅ CRUD operations (Create, Read, Update, Delete)
- ✅ Request/response headers
- ✅ Query parameters
- ✅ Custom timeouts

### Advanced Patterns
- ✅ File uploads with progress tracking
- ✅ Parallel/batch requests
- ✅ Request cancellation
- ✅ Interceptor patterns
- ✅ Custom API client classes

### Real-World Scenarios
- ✅ E-commerce API client
- ✅ Pagination and filtering
- ✅ Search functionality
- ✅ Bulk operations
- ✅ Health checks

### Monitoring & Debugging
- ✅ Metrics extraction
- ✅ Failed request analysis
- ✅ Performance tracking
- ✅ Request tracing

## 🔧 Configuration Options

### Basic Configuration
```typescript
const client = new AxiosWrapper({
  provider: 'api-name',           // Your API provider name
  apiKeyHeader: 'x-api-key',      // Custom API key header
  retryConfig: {                  // Retry configuration
    attempts: 3,
    delay: 1000,
  },
  traceFailedRequests: true,      // Enable detailed error tracing
  logRequestEvents: true,          // Enable request logging
});
```

### Request Configuration
```typescript
const config: AxiosWrapperRequestConfig = {
  timeout: 5000,
  headers: {
    'X-Custom': 'value',
  },
  params: {
    page: 1,
    limit: 10,
  },
  skipMetrics: false,              // Skip metrics for this request
};
```

## 📈 Metrics Access

### Response Metrics
```typescript
const response = await client.get('/users');
const metrics = (response as any)._metrics;

console.log({
  requestId: metrics.requestId,
  provider: metrics.provider,
  method: metrics.method,
  url: metrics.url,
  statusCode: metrics.statusCode,
  duration: metrics.duration,
  requestSize: metrics.requestSize,
  responseSize: metrics.responseSize,
});
```

### Provider Metrics Manager
```typescript
const metricsManager = client.getProviderMetricsManager();
// Access detailed provider-level metrics
```

### Request Tracer
```typescript
const requestTracer = client.getRequestTracer();
// Access request tracing and logging functionality
```

## 🚦 Error Handling

### Comprehensive Error Pattern
```typescript
try {
  const response = await client.get('/endpoint');
  return response.data;
} catch (error) {
  // Access error metrics
  const errorMetrics = (error as any)._metrics;

  if (error.response) {
    // Server error (4xx, 5xx)
    console.log('Server error:', error.response.status);
  } else if (error.request) {
    // Network error
    console.log('Network error');
  } else {
    // Configuration error
    console.log('Error:', error.message);
  }

  // Use error metrics for debugging
  console.log('Error metrics:', errorMetrics);
}
```

## 📚 Best Practices

### 1. **Type Safety**
- Define proper TypeScript interfaces for your data
- Use generic types for API responses
- Leverage the built-in type safety features

### 2. **Error Handling**
- Always wrap requests in try-catch blocks
- Use error metrics for debugging
- Implement retry logic for transient failures

### 3. **Configuration**
- Use environment variables for sensitive data
- Implement proper timeout values
- Configure retry logic appropriately

### 4. **Monitoring**
- Leverage the automatic metrics collection
- Monitor failed requests for debugging
- Track performance trends over time

## 🧪 Testing Examples

### Running the Examples
```typescript
// Import the examples
import { runAllAxiosWrapperExamples } from './axios-wrapper-usage';

// Run all examples
await runAllAxiosWrapperExamples();

// Or run individual examples
import { basicHttpRequests } from './axios-wrapper-usage';
await basicHttpRequests();
```

### Mock Server for Testing
If you want to test the examples locally, you can use a mock server or tools like:
- [JSON Server](https://jsonplaceholder.typicode.com/)
- [Mocky](https://www.mocky.io/)
- Local mock server setup

## 🔗 Related Documentation

- [Axios Documentation](https://axios-http.com/docs/intro)
- [OpenTelemetry](https://opentelemetry.io/)
- [TypeScript Handbook](https://www.typescriptlang.org/docs/)

---

**Last Updated:** October 31, 2024
**Version:** @universal-kit/metrics-client v0.1.0