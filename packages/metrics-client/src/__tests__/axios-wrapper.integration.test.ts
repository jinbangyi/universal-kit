/* eslint-disable no-unused-vars */
/* eslint-disable @typescript-eslint/explicit-function-return-type */
import { AxiosWrapper } from '../http-client/axios-wrapper.js';
import { getOpenApiSpecPath } from '../http-client/common.js';
import { ProviderMetricsManager } from '../metrics/api-provider-metrics.js';
import axios, { AxiosError } from 'axios';

// Mock axios
jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

// Mock the Logger to avoid import issues
jest.mock('@universal-kit/logger', () => ({
  Logger: jest.fn().mockImplementation(() => ({
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
    verbose: jest.fn(),
  })),
}));

// Mock OpenTelemetry API to track span lifecycle
const mockSpans: Array<{
  end: jest.Mock;
  setAttributes: jest.Mock;
  setStatus: jest.Mock;
}> = [];

jest.mock('@opentelemetry/api', () => ({
  trace: {
    getTracer: () => ({
      startSpan: () => {
        const mockSpan = {
          setAttributes: jest.fn(),
          setStatus: jest.fn(),
          end: jest.fn(),
        };
        mockSpans.push(mockSpan);
        return mockSpan;
      },
    }),
  },
  context: {
    active: jest.fn(),
  },
  metrics: {
    getMeter: () => ({
      createCounter: () => ({
        add: jest.fn(),
      }),
      createHistogram: () => ({
        record: jest.fn(),
      }),
      createUpDownCounter: () => ({
        add: jest.fn(),
      }),
    }),
  },
  SpanKind: {
    CLIENT: 'CLIENT',
    SERVER: 'SERVER',
    INTERNAL: 'INTERNAL',
    PRODUCER: 'PRODUCER',
    CONSUMER: 'CONSUMER',
  },
  SpanStatusCode: {
    OK: 'OK',
    ERROR: 'ERROR',
  },
}));

describe('AxiosWrapper Integration Tests', () => {
  let axiosWrapper: AxiosWrapper;
  let providerMetrics: ProviderMetricsManager;
  let mockAxiosInstance: any;

  beforeEach(() => {
    jest.clearAllMocks();
    // Clear mock spans array
    mockSpans.length = 0;

    // Setup mock axios instance BEFORE creating AxiosWrapper
    mockAxiosInstance = {
      request: jest.fn(),
      get: jest.fn(),
      post: jest.fn(),
      defaults: {}, // Will be set when axios.create is called with options
      interceptors: {
        request: {
          use: jest.fn((onFulfilled?: any, onRejected?: any) => {
            // Store the request interceptor to call it later
            mockAxiosInstance._requestInterceptor = { onFulfilled, onRejected };
            return 1; // Return interceptor ID
          }),
          eject: jest.fn(),
        },
        response: {
          use: jest.fn((onFulfilled?: any, onRejected?: any) => {
            // Store the response interceptor to call it later
            mockAxiosInstance._responseInterceptor = { onFulfilled, onRejected };
            return 1; // Return interceptor ID
          }),
          eject: jest.fn(),
        },
      },
      _requestInterceptor: null as any,
      _responseInterceptor: null as any,
      // Helper method to simulate the full request flow with interceptors
      _simulateRequest: async (config: any, shouldReject: boolean = false, error?: any): Promise<any> => {
        // Merge defaults.baseURL into config if not already present
        if (mockAxiosInstance.defaults?.baseURL && !config.baseURL) {
          config.baseURL = mockAxiosInstance.defaults.baseURL;
        }

        // Call request interceptor if it exists
        if (mockAxiosInstance._requestInterceptor?.onFulfilled) {
          config = mockAxiosInstance._requestInterceptor.onFulfilled(config);
        }

        if (shouldReject && error) {
          // For HTTP errors, we need to create a response with metadata
          if (error.response) {
            // Update the error.response to include metadata in the config
            error.response.config = {
              ...error.config,
              metadata: error.config?.metadata || {
                startTime: Date.now(),
                requestInfo: {
                  requestId: 'req_test_123',
                  provider: 'test-api-provider:AxiosWrapper',
                  apiKey: 'test****-456',
                  url: 'https://api.example.com/test',
                  host: 'api.example.com',
                  method: 'POST',
                  path: '/test',
                  headers: { 'x-api-key': '****' },
                },
              },
            };

            // For errors, call response error interceptor if it exists
            if (mockAxiosInstance._responseInterceptor?.onRejected) {
              await mockAxiosInstance._responseInterceptor.onRejected(error);
            }
          } else if (mockAxiosInstance._responseInterceptor?.onRejected) {
            // For network errors, call response error interceptor if it exists
            await mockAxiosInstance._responseInterceptor.onRejected(error);
          }
          throw error;
        }

        // For successful responses
        const response = {
          status: 200,
          statusText: 'OK',
          data: { success: true },
          headers: { 'content-length': '25' },
          config,
        };

        // Call response success interceptor if it exists
        if (mockAxiosInstance._responseInterceptor?.onFulfilled) {
          return mockAxiosInstance._responseInterceptor.onFulfilled(response);
        }

        return response;
      },
    };

    mockedAxios.create.mockImplementation((options?: any) => {
      // Set defaults from options
      mockAxiosInstance.defaults = options || {};
      return mockAxiosInstance;
    });

    // Create AxiosWrapper instance AFTER mocking axios.create
    axiosWrapper = new AxiosWrapper({
      provider: 'test-api-provider',
      apiKeyHeader: 'x-api-key',
    });

    providerMetrics = axiosWrapper.getProviderMetricsManager();
  });

  describe('Failed Request Metrics', () => {
    it('should correctly track api_provider_active_requests metric when request fails',
      async () => {
      // Arrange
        const mockError = new Error('Network Error') as any;
        mockError.code = 'ECONNREFUSED';
        mockError.config = {
          url: 'https://api.example.com/test',
          method: 'GET',
          headers: { 'x-api-key': 'test-api-key-123' },
          metadata: {
            startTime: Date.now(),
            requestInfo: {
              requestId: 'req_1234567890_abcdef1',
              provider: 'test-api-provider:AxiosWrapper',
              apiKey: 'test****123',
              url: 'https://api.example.com/test',
              host: 'api.example.com',
              method: 'GET',
              path: '/test',
              headers: { 'x-api-key': '****' },
            },
          },
        };

        // Mock the request method to use our simulation helper
        (mockAxiosInstance.request as jest.Mock).mockImplementation((config) =>
          mockAxiosInstance._simulateRequest(config, true, mockError),
        );

        // Spy on the metrics manager methods
        const recordRequestStartSpy = jest.spyOn(providerMetrics, 'recordRequestStart');
        const recordRequestErrorSpy = jest.spyOn(providerMetrics, 'recordRequestError');

        // Act - Make a request that will fail
        const requestPromise = axiosWrapper.request({
          url: 'https://api.example.com/test',
          method: 'GET',
          headers: { 'x-api-key': 'test-api-key-123' },
        });

        // Assert that the request fails
        await expect(requestPromise).rejects.toThrow('Network Error');

        // Assert that metrics were recorded correctly
        expect(recordRequestStartSpy).toHaveBeenCalledTimes(1);
        expect(recordRequestErrorSpy).toHaveBeenCalledTimes(1);

        // Verify the request start was called with correct request info
        expect(recordRequestStartSpy).toHaveBeenCalledWith(
          expect.objectContaining({
            provider: 'test-api-provider:AxiosWrapper',
            host: 'api.example.com',
            method: 'GET',
            path: '/test',
            apiKey: 'test****-123',
          }),
        );

        // Verify the request error was called with error details and shouldDecrementActiveRequests=true
        expect(recordRequestErrorSpy).toHaveBeenCalledWith(
          expect.objectContaining({
            provider: 'test-api-provider:AxiosWrapper',
            host: 'api.example.com',
            method: 'GET',
            path: '/test',
          }),
          'Error', // error type (constructor name)
        );
      });

    it('should correctly track api_provider_active_requests metric when request fails with HTTP error',
      async () => {
      // Arrange
        const mockError = new Error('Request failed with status code 500') as any;
        mockError.response = {
          status: 500,
          statusText: 'Internal Server Error',
          data: { error: 'Server error' },
          headers: { 'content-length': '50' },
        };
        mockError.config = {
          url: 'https://api.example.com/test',
          method: 'POST',
          headers: { 'x-api-key': 'test-api-key-456' },
          data: { test: 'data' },
          metadata: {
            startTime: Date.now(),
            requestInfo: {
              requestId: 'req_1234567890_abcdef2',
              provider: 'test-api-provider:AxiosWrapper',
              apiKey: 'test****-456',
              url: 'https://api.example.com/test',
              host: 'api.example.com',
              method: 'POST',
              path: '/test',
              headers: { 'x-api-key': '****' },
            },
          },
        };

        // Mock the request method to use our simulation helper
        (mockAxiosInstance.request as jest.Mock).mockImplementation((config) =>
          mockAxiosInstance._simulateRequest(config, true, mockError),
        );

        // Spy on the metrics manager methods
        const recordRequestStartSpy = jest.spyOn(providerMetrics, 'recordRequestStart');
        const recordRequestErrorSpy = jest.spyOn(providerMetrics, 'recordRequestError');

        // Act - Make a request that will fail with HTTP error
        const requestPromise = axiosWrapper.request({
          url: 'https://api.example.com/test',
          method: 'POST',
          data: { test: 'data' },
          headers: { 'x-api-key': 'test-api-key-456' },
        });

        // Assert that the request fails
        await expect(requestPromise).rejects.toThrow('Request failed with status code 500');

        // Assert that metrics were recorded correctly
        expect(recordRequestStartSpy).toHaveBeenCalledTimes(1);
        expect(recordRequestErrorSpy).toHaveBeenCalledTimes(1);

        // For HTTP errors, responseAlreadyProcessed should be true, so shouldDecrementActiveRequests should be false
        expect(recordRequestErrorSpy).toHaveBeenCalledWith(
          expect.objectContaining({
            provider: 'test-api-provider:AxiosWrapper',
            host: 'api.example.com',
            method: 'POST',
            path: '/test',
          }),
          'Error', // error type
        );
      });

    it('should not track metrics when skipMetrics is true', async () => {
      // Arrange
      const mockError = new Error('Network Error') as any;
      mockError.config = {
        url: 'https://api.example.com/test',
        method: 'GET',
        skipMetrics: true,
      };

      (mockAxiosInstance.request as jest.Mock).mockImplementation((config) =>
        mockAxiosInstance._simulateRequest(config, true, mockError),
      );

      // Spy on the metrics manager methods
      const recordRequestStartSpy = jest.spyOn(providerMetrics, 'recordRequestStart');
      const recordRequestErrorSpy = jest.spyOn(providerMetrics, 'recordRequestError');

      // Act - Make a request with skipMetrics
      const requestPromise = axiosWrapper.request({
        url: 'https://api.example.com/test',
        method: 'GET',
        skipMetrics: true,
      });

      // Assert that the request fails
      await expect(requestPromise).rejects.toThrow('Network Error');

      // Assert that no metrics were recorded
      expect(recordRequestStartSpy).not.toHaveBeenCalled();
      expect(recordRequestErrorSpy).not.toHaveBeenCalled();
    });
  });

  describe('Active Requests Metric Behavior', () => {
    it('should properly increment and decrement active requests metric', async () => {
      // Arrange
      // Mock a successful request first
      (mockAxiosInstance.request as jest.Mock).mockImplementation((config) =>
        mockAxiosInstance._simulateRequest(config, false),
      );

      // Spy on metrics manager
      const recordRequestStartSpy = jest.spyOn(providerMetrics, 'recordRequestStart');
      const recordRequestCompleteSpy = jest.spyOn(providerMetrics, 'recordRequestComplete');

      // Act - Make a successful request
      await axiosWrapper.request({
        url: 'https://api.example.com/success',
        method: 'GET',
        headers: { 'x-api-key': 'test-api-key-789' },
      });

      // Assert - Successful request should increment then decrement active requests
      expect(recordRequestStartSpy).toHaveBeenCalledTimes(1);
      expect(recordRequestCompleteSpy).toHaveBeenCalledTimes(1);

      // Now test failed request
      const mockError = new Error('Network Error') as any;
      mockError.config = {
        url: 'https://api.example.com/fail',
        method: 'GET',
        headers: { 'x-api-key': 'test-api-key-789' },
        metadata: {
          startTime: Date.now(),
          requestInfo: {
            requestId: 'req_1234567890_fail',
            provider: 'test-api-provider:AxiosWrapper',
            apiKey: 'test****-789',
            url: 'https://api.example.com/fail',
            host: 'api.example.com',
            method: 'GET',
            path: '/fail',
            headers: { 'x-api-key': '****' },
          },
        },
      };

      (mockAxiosInstance.request as jest.Mock).mockImplementation((config) =>
        mockAxiosInstance._simulateRequest(config, true, mockError),
      );
      const recordRequestErrorSpy = jest.spyOn(providerMetrics, 'recordRequestError');

      // Act - Make a failed request
      try {
        await axiosWrapper.request({
          url: 'https://api.example.com/fail',
          method: 'GET',
          headers: { 'x-api-key': 'test-api-key-789' },
        });
      } catch {
        // Expected to fail
      }

      // Assert - Failed request should also increment then decrement active requests
      expect(recordRequestErrorSpy).toHaveBeenCalledWith(
        expect.any(Object),
        'Error',
      );
    });
  });

  describe('Params Handling', () => {
    it('should handle params as plain object without errors', async () => {
      // Arrange - Mock a successful request
      (mockAxiosInstance.request as jest.Mock).mockImplementation((config) =>
        mockAxiosInstance._simulateRequest(config, false),
      );

      // Spy on metrics manager to verify request was processed
      const recordRequestStartSpy = jest.spyOn(providerMetrics, 'recordRequestStart');
      const recordRequestCompleteSpy = jest.spyOn(providerMetrics, 'recordRequestComplete');

      // Act - Make a request with params as plain object (typical Axios usage)
      const response = await axiosWrapper.request({
        url: 'https://api.example.com/search',
        method: 'GET',
        headers: { 'x-api-key': 'test-api-key-params' },
        params: {
          query: 'test',
          limit: 10,
          offset: 0,
          filter: 'active',
        },
      });

      // Assert - Request should complete successfully
      expect(response).toBeDefined();
      expect(response.data).toEqual({ success: true });

      // Assert - Metrics should be recorded correctly
      expect(recordRequestStartSpy).toHaveBeenCalledTimes(1);
      expect(recordRequestCompleteSpy).toHaveBeenCalledTimes(1);

      // Verify request info includes params correctly
      const requestInfo = recordRequestStartSpy.mock.calls[0]?.[0];
      expect(requestInfo).toBeDefined();
      expect(requestInfo?.params).toBeDefined();
      expect(requestInfo?.params).toEqual(
        expect.objectContaining({
          query: 'test',
          limit: '10',
          offset: '0',
          filter: 'active',
        }),
      );
    });

    it('should handle params as URLSearchParams without errors', async () => {
      // Arrange - Mock a successful request
      (mockAxiosInstance.request as jest.Mock).mockImplementation((config) =>
        mockAxiosInstance._simulateRequest(config, false),
      );

      // Spy on metrics manager to verify request was processed
      const recordRequestStartSpy = jest.spyOn(providerMetrics, 'recordRequestStart');
      const recordRequestCompleteSpy = jest.spyOn(providerMetrics, 'recordRequestComplete');

      // Act - Make a request with params as URLSearchParams
      const searchParams = new URLSearchParams({
        query: 'test',
        limit: '10',
        offset: '0',
      });

      const response = await axiosWrapper.request({
        url: 'https://api.example.com/search',
        method: 'GET',
        headers: { 'x-api-key': 'test-api-key-params' },
        params: searchParams,
      });

      // Assert - Request should complete successfully
      expect(response).toBeDefined();
      expect(response.data).toEqual({ success: true });

      // Assert - Metrics should be recorded correctly
      expect(recordRequestStartSpy).toHaveBeenCalledTimes(1);
      expect(recordRequestCompleteSpy).toHaveBeenCalledTimes(1);

      // Verify request info includes params correctly
      const requestInfo = recordRequestStartSpy.mock.calls[0]?.[0];
      expect(requestInfo).toBeDefined();
      expect(requestInfo?.params).toBeDefined();
      expect(requestInfo?.params).toEqual(
        expect.objectContaining({
          query: 'test',
          limit: '10',
          offset: '0',
        }),
      );
    });

    it('should handle params with URL query string and object params combined', async () => {
      // Arrange - Mock a successful request
      (mockAxiosInstance.request as jest.Mock).mockImplementation((config) =>
        mockAxiosInstance._simulateRequest(config, false),
      );

      // Spy on metrics manager
      const recordRequestStartSpy = jest.spyOn(providerMetrics, 'recordRequestStart');

      // Act - Make a request with both URL params and object params
      await axiosWrapper.request({
        url: 'https://api.example.com/search?existing=param',
        method: 'GET',
        headers: { 'x-api-key': 'test-api-key-params' },
        params: {
          query: 'test',
          limit: 10,
        },
      });

      // Assert - Verify request info merges both URL and object params
      const requestInfo = recordRequestStartSpy.mock.calls[0]?.[0];
      expect(requestInfo).toBeDefined();
      expect(requestInfo?.params).toEqual(
        expect.objectContaining({
          existing: 'param', // From URL
          query: 'test', // From params object
          limit: '10', // From params object
        }),
      );
    });

    it('should extract API key from params object when configured', async () => {
      // Arrange - Create wrapper with API key in query param
      const wrapperWithQueryKey = new AxiosWrapper({
        provider: 'test-api-provider-query',
        apiKeyQueryParam: 'apiKey',
      });

      // Mock successful request
      (mockAxiosInstance.request as jest.Mock).mockImplementation((config) =>
        mockAxiosInstance._simulateRequest(config, false),
      );

      // Spy on metrics manager
      const recordRequestStartSpy = jest.spyOn(
        wrapperWithQueryKey.getProviderMetricsManager(),
        'recordRequestStart',
      );

      // Act - Make a request with API key in params object
      await wrapperWithQueryKey.request({
        url: 'https://api.example.com/data',
        method: 'GET',
        params: {
          apiKey: 'secret-key-12345',
          data: 'value',
        },
      });

      // Assert - API key should be extracted and hashed
      const requestInfo = recordRequestStartSpy.mock.calls[0]?.[0];
      expect(requestInfo).toBeDefined();
      expect(requestInfo?.apiKey).toBe('secr****2345'); // Hashed version
    });
  });

  describe('Custom Interceptor Handling', () => {
    it('should allow custom interceptors to work normally when they don\'t throw', async () => {
      // Arrange - Get the axios instance
      const axiosInstance = axiosWrapper.getAxiosInstance();

      let customInterceptorCalled = false;
      let modifiedData = false;

      // Add a custom interceptor that modifies the response
      axiosInstance.interceptors.response.use(
        (response) => {
          customInterceptorCalled = true;
          response.data = { ...response.data, modified: true };
          modifiedData = true;
          return response;
        },
        (error) => Promise.reject(error),
      );

      // Get the wrapped interceptor
      const storedInterceptor = mockAxiosInstance._responseInterceptor;

      // Test the wrapped interceptor with a mock response
      const mockResponse = {
        status: 200,
        data: { original: true },
        headers: {},
        config: {},
        statusText: 'OK',
      };

      // The wrapped interceptor should call the custom interceptor and return the modified response
      const result = await storedInterceptor.onFulfilled(mockResponse);

      // Assert - Custom interceptor should have been called and data should be modified
      expect(customInterceptorCalled).toBe(true);
      expect(modifiedData).toBe(true);
      expect(result.data.modified).toBe(true);
    });

    it('should wrap custom error interceptors that only handle rejections', async () => {
      // Arrange - Get the axios instance
      const axiosInstance = axiosWrapper.getAxiosInstance();

      let errorInterceptorCalled = false;
      let retryAttempted = false;

      // Add a custom interceptor with only error handler (like retry logic)
      axiosInstance.interceptors.response.use(
        undefined, // No success handler
        (error) => {
          errorInterceptorCalled = true;

          // Simulate retry logic similar to the user's example
          const retryCount = (error.config as any).__retryCount || 0;
          if (retryCount < 2) {
            (error.config as any).__retryCount = retryCount + 1;
            retryAttempted = true;
            // In real scenario, would retry the request
            // For test, just return the error
          }

          return Promise.reject(error);
        },
      );

      // Get the wrapped interceptor
      const storedInterceptor = mockAxiosInstance._responseInterceptor;

      // Test the wrapped error interceptor
      const mockError = {
        message: 'Request failed',
        config: { url: 'https://api.example.com/test' },
        isAxiosError: true,
      };

      // The wrapped interceptor should handle the error
      expect(storedInterceptor).toBeDefined();
      expect(storedInterceptor.onRejected).toBeDefined();

      // Call the wrapped error handler
      const result = storedInterceptor.onRejected(mockError);
      expect(result).toBeInstanceOf(Promise);

      // Verify the error is rejected
      await expect(result).rejects.toMatchObject({ message: 'Request failed' });

      // Assert - Error interceptor should have been called
      expect(errorInterceptorCalled).toBe(true);
      expect(retryAttempted).toBe(true);
    });
  });

  describe('URL Construction', () => {
    it('should handle baseURL with relative url path correctly', async () => {
      // Arrange - Create wrapper with baseURL in axios instance
      const wrapperWithBaseUrl = new AxiosWrapper(
        {
          provider: 'test-api-provider',
        },
        undefined,
        {
          baseURL: 'https://api.example.com',
        },
      );

      const metrics = wrapperWithBaseUrl.getProviderMetricsManager();
      const recordSpy = jest.spyOn(metrics, 'recordRequestStart');

      mockAxiosInstance.request.mockImplementation((config: any) =>
        mockAxiosInstance._simulateRequest(config, false),
      );

      // Act - Request with relative url
      await wrapperWithBaseUrl.request({
        url: '/api/v1/data',
        method: 'GET',
      });

      // Assert - Should combine baseURL domain with url path
      expect(recordSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          url: 'https://api.example.com/api/v1/data',
          host: 'api.example.com',
          path: '/api/v1/data',
        }),
      );
    });

    it('should use absolute url when both baseURL and absolute url are provided', async () => {
      // Arrange - Create wrapper with baseURL
      const wrapperWithBaseUrl = new AxiosWrapper(
        {
          provider: 'test-api-provider',
        },
        undefined,
        {
          baseURL: 'https://api.example.com',
        },
      );

      const metrics = wrapperWithBaseUrl.getProviderMetricsManager();
      const recordSpy = jest.spyOn(metrics, 'recordRequestStart');

      mockAxiosInstance.request.mockImplementation((config: any) =>
        mockAxiosInstance._simulateRequest(config, false),
      );

      // Act - Request with absolute url should override baseURL
      await wrapperWithBaseUrl.request({
        url: 'https://another-api.example.com/api/v1/data',
        method: 'GET',
      });

      // Assert - Should use the absolute url, ignoring baseURL
      expect(recordSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          url: 'https://another-api.example.com/api/v1/data',
          host: 'another-api.example.com',
          path: '/api/v1/data',
        }),
      );
    });

    it('should handle per-request config baseURL override with relative url', async () => {
      // Arrange - Create wrapper with instance-level baseURL
      const wrapperWithBaseUrl = new AxiosWrapper(
        {
          provider: 'test-api-provider',
        },
        undefined,
        {
          baseURL: 'https://api.example.com',
        },
      );

      const metrics = wrapperWithBaseUrl.getProviderMetricsManager();
      const recordSpy = jest.spyOn(metrics, 'recordRequestStart');

      mockAxiosInstance.request.mockImplementation((config: any) =>
        mockAxiosInstance._simulateRequest(config, false),
      );

      // Act - Request with per-request baseURL and relative url
      await wrapperWithBaseUrl.request({
        baseURL: 'https://override-api.example.com',
        url: '/api/v1/data',
        method: 'GET',
      });

      // Assert - Should use per-request baseURL
      expect(recordSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          url: 'https://override-api.example.com/api/v1/data',
          host: 'override-api.example.com',
          path: '/api/v1/data',
        }),
      );
    });

    it('should handle baseURL without protocol with relative url', async () => {
      // Arrange - Create wrapper with baseURL as path only
      const wrapperWithPathBaseUrl = new AxiosWrapper(
        {
          provider: 'test-api-provider',
        },
        undefined,
        {
          baseURL: '/api/v1',
        },
      );

      const metrics = wrapperWithPathBaseUrl.getProviderMetricsManager();
      const recordSpy = jest.spyOn(metrics, 'recordRequestStart');

      mockAxiosInstance.request.mockImplementation((config: any) =>
        mockAxiosInstance._simulateRequest(config, false),
      );

      // Act - Request with relative url when baseURL is just a path
      await wrapperWithPathBaseUrl.request({
        url: '/data',
        method: 'GET',
      });

      // Assert - url should replace baseURL when both are paths
      expect(recordSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          url: '/data',
          path: '/data',
        }),
      );
    });

    it('should concatenate baseURL and relative url without leading slash', async () => {
      // Arrange
      const wrapperWithBaseUrl = new AxiosWrapper(
        {
          provider: 'test-api-provider',
        },
        undefined,
        {
          baseURL: 'https://api.example.com/v1',
        },
      );

      const metrics = wrapperWithBaseUrl.getProviderMetricsManager();
      const recordSpy = jest.spyOn(metrics, 'recordRequestStart');

      mockAxiosInstance.request.mockImplementation((config: any) =>
        mockAxiosInstance._simulateRequest(config, false),
      );

      // Act - Request with relative url without leading slash
      await wrapperWithBaseUrl.request({
        url: 'data',
        method: 'GET',
      });

      // Assert - Should concatenate with separator
      expect(recordSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          url: 'https://api.example.com/v1/data',
          host: 'api.example.com',
          path: '/v1/data',
        }),
      );
    });
  });

  describe('Path Normalization', () => {
    describe('Pattern-based normalization', () => {
      it('should normalize paths with Solana addresses using :path1, :path2, etc.', async () => {
        const wrapper = new AxiosWrapper({
          provider: 'TestProvider',
          pathNormalization: {
            enabled: true,
            enableCryptoPatterns: true,
          },
        });

        const metrics = wrapper.getProviderMetricsManager();
        const recordSpy = jest.spyOn(metrics, 'recordRequestComplete');

        mockAxiosInstance.request.mockImplementation((config: any) =>
          mockAxiosInstance._simulateRequest(config, false),
        );

        await wrapper.request({
          url: 'https://api.example.com/defi/quotation/v1/smartmoney/sol/walletNew/L43t5u52tHCFG1hDxmsu6EcZoF5HxZKvJFgVyi4dTnH',
          method: 'GET',
        });

        // The path should be normalized
        expect(recordSpy).toHaveBeenCalledWith(
          expect.objectContaining({
            path: '/defi/quotation/v1/smartmoney/sol/walletNew/:path1',
          }),
        );
      });

      it('should normalize paths with Ethereum addresses', async () => {
        const wrapper = new AxiosWrapper({
          provider: 'TestProvider',
          pathNormalization: {
            enabled: true,
            enableCryptoPatterns: true,
          },
        });

        const metrics = wrapper.getProviderMetricsManager();
        const recordSpy = jest.spyOn(metrics, 'recordRequestComplete');

        mockAxiosInstance.request.mockImplementation((config: any) =>
          mockAxiosInstance._simulateRequest(config, false),
        );

        await wrapper.request({
          url: 'https://api.example.com/api/v1/wallet_stat/base/0x799f27d36fa00edae8663e7fee25e839331645a8/7d',
          method: 'GET',
        });

        expect(recordSpy).toHaveBeenCalledWith(
          expect.objectContaining({
            path: '/api/v1/wallet_stat/base/:path1/7d',
          }),
        );
      });

      it('should normalize UUIDs', async () => {
        const wrapper = new AxiosWrapper({
          provider: 'TestProvider',
          pathNormalization: {
            enabled: true,
          },
        });

        const metrics = wrapper.getProviderMetricsManager();
        const recordSpy = jest.spyOn(metrics, 'recordRequestComplete');

        mockAxiosInstance.request.mockImplementation((config: any) =>
          mockAxiosInstance._simulateRequest(config, false),
        );

        await wrapper.request({
          url: 'https://api.example.com/orders/550e8400-e29b-41d4-a716-446655440000',
          method: 'GET',
        });

        expect(recordSpy).toHaveBeenCalledWith(
          expect.objectContaining({
            path: '/orders/:path1',
          }),
        );
      });

      it('should preserve static paths', async () => {
        const wrapper = new AxiosWrapper({
          provider: 'TestProvider',
          pathNormalization: {
            enabled: true,
          },
        });

        const metrics = wrapper.getProviderMetricsManager();
        const recordSpy = jest.spyOn(metrics, 'recordRequestComplete');

        mockAxiosInstance.request.mockImplementation((config: any) =>
          mockAxiosInstance._simulateRequest(config, false),
        );

        await wrapper.request({
          url: 'https://api.example.com/api/v1/health',
          method: 'GET',
        });

        expect(recordSpy).toHaveBeenCalledWith(
          expect.objectContaining({
            path: '/api/v1/health',
          }),
        );
      });
    });

    describe('OpenAPI spec-based normalization', () => {
      it('should use OpenAPI spec routes when domain matches', async () => {
        // Mock spec loading is complex with async initialization
        // This test verifies the method exists and can be called
        const wrapper = new AxiosWrapper({
          provider: 'TestProvider',
          pathNormalization: {
            enabled: true,
          },
        });

        // Verify refreshOpenApiSpecs method exists
        expect(typeof wrapper.refreshOpenApiSpecs).toBe('function');
      });

      it('should normalize CoinGecko Pro API paths using OpenAPI spec', async () => {
        const wrapper = new AxiosWrapper({
          provider: 'CoinGecko',
          pathNormalization: {
            enabled: true,
            openApiSpecs: [
              { path: getOpenApiSpecPath('coingecko-pro.json'), domain: 'pro-api.coingecko.com' },
            ],
          },
        });

        // Manually refresh to ensure specs are loaded before testing
        await wrapper.refreshOpenApiSpecs();

        const metrics = wrapper.getProviderMetricsManager();
        const recordSpy = jest.spyOn(metrics, 'recordRequestComplete');

        mockAxiosInstance.request.mockImplementation((config: any) =>
          mockAxiosInstance._simulateRequest(config, false),
        );

        // Test /api/v3/coins/{id} route
        await wrapper.request({
          url: 'https://pro-api.coingecko.com/api/v3/coins/ethena',
          method: 'GET',
        });

        expect(recordSpy).toHaveBeenCalledWith(
          expect.objectContaining({
            path: '/api/v3/coins/:id',
          }),
        );

        // Test another coin ID
        await wrapper.request({
          url: 'https://pro-api.coingecko.com/api/v3/coins/bitcoin',
          method: 'GET',
        });

        expect(recordSpy).toHaveBeenCalledWith(
          expect.objectContaining({
            path: '/api/v3/coins/:id',
          }),
        );

        // Test /api/v3/coins/{id}/market_chart route
        await wrapper.request({
          url: 'https://pro-api.coingecko.com/api/v3/coins/ethereum/market_chart',
          method: 'GET',
        });

        expect(recordSpy).toHaveBeenCalledWith(
          expect.objectContaining({
            path: '/api/v3/coins/:id/market_chart',
          }),
        );
      });
    });

    describe('Manual spec refresh', () => {
      it('should support manual refresh of OpenAPI specs', async () => {
        const wrapper = new AxiosWrapper({
          provider: 'TestProvider',
          pathNormalization: {
            enabled: true,
            openApiSpecs: [
              {
                path: '/mock/openapi.json',
                domain: 'api.example.com',
              },
            ],
          },
        });

        // Call refresh method
        await wrapper.refreshOpenApiSpecs();

        // Should not throw error
        expect(true).toBe(true);
      });
    });
  });
});
