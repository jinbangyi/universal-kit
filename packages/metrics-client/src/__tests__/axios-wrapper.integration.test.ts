import { AxiosWrapper } from '../http-client/axios-wrapper.js';
import { ProviderMetricsManager } from '../metrics/api-provider-metrics.js';
import axios from 'axios';

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

    mockedAxios.create.mockReturnValue(mockAxiosInstance);

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
          true, // shouldDecrementActiveRequests - should be true for network errors
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
          false, // shouldDecrementActiveRequests - should be false for HTTP errors (response already processed)
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
        true, // shouldDecrementActiveRequests
      );
    });
  });
});
