/**
 * AxiosWrapper - Quick Getting Started Guide
 *
 * This file provides simple, copy-paste ready examples for common use cases.
 */

import { AxiosWrapper, AxiosWrapperRequestConfig } from '@universal-kit/metrics-client';

// ============================================================================
// QUICK START EXAMPLES
// ============================================================================

// 1. Basic Setup
const client = new AxiosWrapper({
  provider: 'my-api',
  apiKeyHeader: 'x-api-key',
});

// 2. GET Request with Metrics
async function fetchUsers() {
  try {
    const response = await client.get('/users');
    console.log('Users:', response.data);
    console.log('Metrics:', (response as any)._metrics);
  } catch (error) {
    console.error('Error:', error);
    console.error('Metrics:', (error as any)._metrics);
  }
}

// 3. POST Request with Metrics
async function createUser(userData: any) {
  try {
    const response = await client.post('/users', userData);
    console.log('Created:', response.data);
    console.log('Metrics:', (response as any)._metrics);
  } catch (error) {
    console.error('Error:', error);
  }
}

// 4. Request with Custom Configuration
async function customRequest() {
  const config: AxiosWrapperRequestConfig = {
    timeout: 5000,
    headers: { 'X-Custom': 'value' },
    params: { page: 1, limit: 10 },
  };

  try {
    const response = await client.get('/users', config);
    return response.data;
  } catch (error) {
    console.error('Custom request failed:', error);
  }
}

// 5. Skip Metrics for Internal Requests
async function internalRequest() {
  const config: AxiosWrapperRequestConfig = {
    skipMetrics: true, // Don't track this request
  };

  try {
    const response = await client.get('/health', config);
    return response.data;
  } catch (error) {
    console.error('Health check failed:', error);
  }
}

// 6. Access Provider Metrics
function getProviderMetrics() {
  const metricsManager = client.getProviderMetricsManager();
  const tracer = client.getRequestTracer();

  console.log('Metrics Manager:', metricsManager);
  console.log('Request Tracer:', tracer);
}

// Export for easy import
export {
  client,
  fetchUsers,
  createUser,
  customRequest,
  internalRequest,
  getProviderMetrics,
};