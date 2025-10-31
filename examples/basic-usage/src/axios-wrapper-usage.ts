/**
 * Comprehensive Examples for AxiosWrapper Usage
 *
 * This file demonstrates various ways to use the AxiosWrapper class for making
 * HTTP requests with automatic API usage measurement and monitoring.
 */

import { AxiosWrapper, AxiosWrapperRequestConfig } from '@universal-kit/metrics-client';

// ============================================================================
// BASIC SETUP EXAMPLES
// ============================================================================

/**
 * Example 1: Basic AxiosWrapper setup
 */
function createBasicAxiosWrapper(): AxiosWrapper {
  const wrapper = new AxiosWrapper({
    provider: 'example-api',
    apiKeyHeader: 'x-api-key',
    traceFailedRequests: true,
    logRequestEvents: true,
    retryConfig: {
      attempts: 3,
      delay: 1000,
    },
  });

  return wrapper;
}

/**
 * Example 2: AxiosWrapper with custom configuration
 */
function createConfiguredAxiosWrapper(): AxiosWrapper {
  const config = {
    provider: 'payment-service',
    apiKeyHeader: 'authorization',
    retryConfig: {
      attempts: 2,
      delay: 500,
    },
    traceFailedRequests: true,
    logRequestEvents: false, // Disable detailed logging
  };

  const wrapper = new AxiosWrapper(config);

  // Configure base URL and headers after creation
  const axiosInstance = wrapper.getAxiosInstance();
  axiosInstance.defaults.baseURL = 'https://api.example.com';
  axiosInstance.defaults.headers.common['Content-Type'] = 'application/json';

  return wrapper;
}

// ============================================================================
// BASIC HTTP REQUEST EXAMPLES
// ============================================================================

interface User {
  id: string;
  name: string;
  email: string;
  createdAt: string;
}

interface CreateUserRequest {
  name: string;
  email: string;
}

/**
 * Example 3: Making basic HTTP requests
 */
async function basicHttpRequests(): Promise<void> {
  const client = createBasicAxiosWrapper();

  try {
    // GET request
    console.log('=== GET Request ===');
    const usersResponse = await client.get<User[]>('/users');
    console.log('Users:', usersResponse.data);
    console.log('Metrics:', (usersResponse as any)._metrics);

    // POST request
    console.log('\n=== POST Request ===');
    const newUser: CreateUserRequest = {
      name: 'John Doe',
      email: 'john@example.com',
    };

    const createResponse = await client.post<User>('/users', newUser);
    console.log('Created user:', createResponse.data);
    console.log('Metrics:', (createResponse as any)._metrics);

    // PUT request
    console.log('\n=== PUT Request ===');
    const updatedUser = { ...newUser, name: 'John Smith' };
    const updateResponse = await client.put<User>(`/users/${createResponse.data.id}`, updatedUser);
    console.log('Updated user:', updateResponse.data);
    console.log('Metrics:', (updateResponse as any)._metrics);

    // DELETE request
    console.log('\n=== DELETE Request ===');
    await client.delete(`/users/${createResponse.data.id}`);
    console.log('User deleted successfully');

  } catch (error) {
    console.error('Request failed:', error);
    console.error('Metrics:', (error as any)._metrics);
  }
}

// ============================================================================
// ADVANCED CONFIGURATION EXAMPLES
// ============================================================================

/**
 * Example 4: Using custom API key extraction
 */
function createWrapperWithCustomApiKey(): AxiosWrapper {
  // This is an example of how you might configure custom API key extraction
  // In a real scenario, you might have a complex authentication system
  const wrapper = new AxiosWrapper({
    provider: 'custom-api',
    apiKeyHeader: 'x-custom-auth',
    // Custom API key extraction logic would be implemented here
    // getApiKey: (config) => extractApiKeyFromComplexConfig(config),
  });

  return wrapper;
}

/**
 * Example 5: Request with custom configuration
 */
async function requestWithCustomConfig(): Promise<void> {
  const client = createConfiguredAxiosWrapper();

  const config: AxiosWrapperRequestConfig = {
    timeout: 10000, // 10 seconds timeout
    headers: {
      'X-Custom-Header': 'custom-value',
    },
    params: {
      page: 1,
      limit: 10,
    },
  };

  try {
    const response = await client.get<User[]>('/users', config);
    console.log('Paginated users:', response.data);
    console.log('Custom metrics:', (response as any)._metrics);
  } catch (error) {
    console.error('Custom request failed:', error);
  }
}

// ============================================================================
// METRICS AND MONITORING EXAMPLES
// ============================================================================

/**
 * Example 6: Accessing metrics and monitoring data
 */
async function demonstrateMetricsAccess(): Promise<void> {
  const client = createBasicAxiosWrapper();

  try {
    // Make a request to generate metrics
    const response = await client.get('/status');

    // Access the metrics attached to the response
    const metrics = (response as any)._metrics;
    console.log('Request Metrics:', {
      requestId: metrics.requestId,
      provider: metrics.provider,
      method: metrics.method,
      url: metrics.url,
      statusCode: metrics.statusCode,
      duration: `${metrics.duration}ms`,
      requestSize: metrics.requestSize,
      responseSize: metrics.responseSize,
      timestamp: new Date(metrics.timestamp).toISOString(),
    });

    // Access the provider metrics manager for advanced usage
    const metricsManager = client.getProviderMetricsManager();
    console.log('Provider Metrics Manager:', metricsManager);

    // Access the request tracer for advanced usage
    const requestTracer = client.getRequestTracer();
    console.log('Request Tracer:', requestTracer);

  } catch (error) {
    const errorMetrics = (error as any)._metrics;
    console.log('Error Metrics:', {
      requestId: errorMetrics.requestId,
      provider: errorMetrics.provider,
      method: errorMetrics.method,
      url: errorMetrics.url,
      duration: `${errorMetrics.duration}ms`,
      error: errorMetrics.error?.message,
      timestamp: new Date(errorMetrics.timestamp).toISOString(),
    });
  }
}

// ============================================================================
// ERROR HANDLING EXAMPLES
// ============================================================================

/**
 * Example 7: Comprehensive error handling
 */
async function demonstrateErrorHandling(): Promise<void> {
  const client = createBasicAxiosWrapper();

  try {
    // Request that will likely fail (non-existent endpoint)
    const response = await client.get('/non-existent-endpoint');
    console.log('Unexpected success:', response.data);
  } catch (error) {
    // Access error metrics
    const errorMetrics = (error as any)._metrics;
    console.log('Error caught with metrics:', {
      requestId: errorMetrics.requestId,
      provider: errorMetrics.provider,
      method: errorMetrics.method,
      url: errorMetrics.url,
      duration: `${errorMetrics.duration}ms`,
      error: errorMetrics.error?.message,
      statusCode: errorMetrics.statusCode,
    });

    // Different types of errors
    if (error.response) {
      // Server responded with error status
      console.log('Server error status:', error.response.status);
      console.log('Server error data:', error.response.data);
    } else if (error.request) {
      // Request was made but no response received
      console.log('Network error - no response received');
    } else {
      // Something else happened
      console.log('Error message:', error.message);
    }
  }
}

// ============================================================================
// INTERCEPTORS EXAMPLES
// ============================================================================

/**
 * Example 8: Using Axios interceptors with metrics
 */
function setupInterceptors(): AxiosWrapper {
  const client = createConfiguredAxiosWrapper();
  const axiosInstance = client.getAxiosInstance();

  // Add a request interceptor that adds authentication
  axiosInstance.interceptors.request.use(
    config => {
      console.log('Request interceptor called:', {
        method: config.method?.toUpperCase(),
        url: config.url,
      });
      return config;
    },
    error => {
      console.error('Request interceptor error:', error);
      return Promise.reject(error);
    }
  );

  // Add a response interceptor that transforms data
  axiosInstance.interceptors.response.use(
    response => {
      console.log('Response interceptor called:', {
        status: response.status,
        url: response.config.url,
      });

      // Transform response data
      if (response.data && typeof response.data === 'object') {
        (response.data as any).processedAt = new Date().toISOString();
      }

      return response;
    },
    error => {
      console.error('Response interceptor error:', error);
      return Promise.reject(error);
    }
  );

  return client;
}

// ============================================================================
// REAL-WORLD SCENARIOS
// ============================================================================

/**
 * Example 9: File upload with progress tracking
 */
async function uploadFileWithProgress(): Promise<void> {
  const client = createConfiguredAxiosWrapper();

  // Simulate a file (in real scenario, this would be a File object)
  const fileData = new Blob(['sample file content'], { type: 'text/plain' });
  const formData = new FormData();
  formData.append('file', fileData, 'example.txt');

  const config: AxiosWrapperRequestConfig = {
    headers: {
      'Content-Type': 'multipart/form-data',
    },
    onUploadProgress: (progressEvent) => {
      const percentCompleted = Math.round(
        (progressEvent.loaded * 100) / (progressEvent.total || 1)
      );
      console.log(`Upload progress: ${percentCompleted}%`);
    },
  };

  try {
    const response = await client.post('/upload', formData, config);
    console.log('File uploaded successfully:', response.data);
    console.log('Upload metrics:', (response as any)._metrics);
  } catch (error) {
    console.error('File upload failed:', error);
  }
}

/**
 * Example 10: Parallel requests with concurrent metrics
 */
async function parallelRequests(): Promise<void> {
  const client = createBasicAxiosWrapper();

  try {
    // Make multiple requests in parallel
    const [
      usersResponse,
      postsResponse,
      commentsResponse,
    ] = await Promise.all([
      client.get('/users'),
      client.get('/posts'),
      client.get('/comments'),
    ]);

    console.log('Parallel requests completed:');
    console.log('- Users:', (usersResponse as any)._metrics.duration + 'ms');
    console.log('- Posts:', (postsResponse as any)._metrics.duration + 'ms');
    console.log('- Comments:', (commentsResponse as any)._metrics.duration + 'ms');

    // Total metrics for all requests
    const totalDuration = [
      (usersResponse as any)._metrics.duration,
      (postsResponse as any)._metrics.duration,
      (commentsResponse as any)._metrics.duration,
    ].reduce((sum, duration) => sum + duration, 0);

    console.log(`Total duration: ${totalDuration}ms`);

  } catch (error) {
    console.error('Parallel requests failed:', error);
  }
}

/**
 * Example 11: Request cancellation
 */
async function demonstrateRequestCancellation(): Promise<void> {
  const client = createBasicAxiosWrapper();
  const controller = new AbortController();

  const config: AxiosWrapperRequestConfig = {
    signal: controller.signal,
    timeout: 5000, // 5 second timeout
  };

  try {
    // Start a long-running request
    const requestPromise = client.get('/slow-endpoint', config);

    // Cancel the request after 2 seconds
    setTimeout(() => {
      controller.abort();
      console.log('Request cancelled');
    }, 2000);

    const response = await requestPromise;
    console.log('Request completed:', response.data);
  } catch (error) {
    if (error.message === 'canceled') {
      console.log('Request was successfully cancelled');
    } else {
      console.error('Request failed:', error);
    }
  }
}

// ============================================================================
// USAGE PATTERNS AND BEST PRACTICES
// ============================================================================

/**
 * Example 12: Reusable HTTP client class
 */
class ApiClient {
  private client: AxiosWrapper;

  constructor(baseURL: string, apiKey: string) {
    this.client = new AxiosWrapper({
      provider: 'api-client',
      apiKeyHeader: 'x-api-key',
    });

    // Configure the underlying Axios instance
    const axiosInstance = this.client.getAxiosInstance();
    axiosInstance.defaults.baseURL = baseURL;
    axiosInstance.defaults.headers.common['x-api-key'] = apiKey;
  }

  // User management methods
  async getUsers(): Promise<User[]> {
    const response = await this.client.get<User[]>('/users');
    return response.data;
  }

  async getUser(id: string): Promise<User> {
    const response = await this.client.get<User>(`/users/${id}`);
    return response.data;
  }

  async createUser(userData: CreateUserRequest): Promise<User> {
    const response = await this.client.post<User>('/users', userData);
    return response.data;
  }

  async updateUser(id: string, userData: Partial<CreateUserRequest>): Promise<User> {
    const response = await this.client.put<User>(`/users/${id}`, userData);
    return response.data;
  }

  async deleteUser(id: string): Promise<void> {
    await this.client.delete(`/users/${id}`);
  }

  // Method to get metrics for monitoring
  getMetrics() {
    return this.client.getProviderMetricsManager();
  }
}

/**
 * Example 13: Using the reusable API client
 */
async function useApiClient(): Promise<void> {
  const apiClient = new ApiClient('https://api.example.com', 'your-api-key');

  try {
    // Create a user
    const newUser = await apiClient.createUser({
      name: 'Jane Doe',
      email: 'jane@example.com',
    });
    console.log('Created user:', newUser);

    // Get all users
    const users = await apiClient.getUsers();
    console.log('All users:', users);

    // Get metrics
    const metrics = apiClient.getMetrics();
    console.log('API metrics:', metrics);

  } catch (error) {
    console.error('API client error:', error);
  }
}

// ============================================================================
// EXAMPLE RUNNER
// ============================================================================

/**
 * Run all examples (comment out examples you don't want to run)
 */
export async function runAllAxiosWrapperExamples(): Promise<void> {
  console.log('🚀 AxiosWrapper Examples\n');

  // Basic examples
  console.log('1. Basic setup examples...\n');
  // await basicHttpRequests();

  // Advanced examples
  console.log('2. Advanced configuration examples...\n');
  // await requestWithCustomConfig();

  // Metrics examples
  console.log('3. Metrics and monitoring examples...\n');
  // await demonstrateMetricsAccess();

  // Error handling examples
  console.log('4. Error handling examples...\n');
  // await demonstrateErrorHandling();

  // Real-world scenarios
  console.log('5. Real-world scenarios...\n');
  // await parallelRequests();
  // await useApiClient();

  console.log('✅ All examples completed!');
}

// Export individual examples for selective execution
export {
  createBasicAxiosWrapper,
  createConfiguredAxiosWrapper,
  createWrapperWithCustomApiKey,
  basicHttpRequests,
  requestWithCustomConfig,
  demonstrateMetricsAccess,
  demonstrateErrorHandling,
  setupInterceptors,
  uploadFileWithProgress,
  parallelRequests,
  demonstrateRequestCancellation,
  ApiClient,
  useApiClient,
};

// Export types for external use
export type { User, CreateUserRequest };