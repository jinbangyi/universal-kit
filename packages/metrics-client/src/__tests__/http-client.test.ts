import { MeasuredHttpClient } from '../http-client/node-fetch-wrapper';
import { Logger } from '@universal-kit/logger';

// Mock the logger
jest.mock('@universal-kit/logger');

describe('MeasuredHttpClient', () => {
  let httpClient: MeasuredHttpClient;
  let mockLogger: jest.Mocked<Logger>;
  let mockFetch: jest.MockedFunction<typeof fetch>;

  beforeEach(() => {
    // Reset all mocks
    jest.clearAllMocks();

    // Create fresh mocks
    mockLogger = {
      setRequestId: jest.fn(),
      clearRequestId: jest.fn(),
      debug: jest.fn(),
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      logApiCall: jest.fn(),
      logFunctionCall: jest.fn(),
    } as any;

    mockFetch = fetch as jest.MockedFunction<typeof fetch>;
    mockFetch.mockClear();

    httpClient = new MeasuredHttpClient(
      {
        baseUrl: 'https://api.test.com',
        timeout: 5000,
        headers: { 'User-Agent': 'test-client' },
      },
      mockLogger
    );
  });

  describe('constructor', () => {
    it('should create client with default configuration', () => {
      const client = new MeasuredHttpClient();
      expect(client).toBeInstanceOf(MeasuredHttpClient);
    });

    it('should create client with custom configuration', () => {
      const config = {
        baseUrl: 'https://api.example.com',
        timeout: 10000,
        headers: { Authorization: 'Bearer token' },
        retryConfig: { attempts: 5, delay: 2000 },
        enableMetrics: false,
      };

      const client = new MeasuredHttpClient(config);
      expect(client).toBeInstanceOf(MeasuredHttpClient);

      const clientConfig = client.getConfig();
      expect(clientConfig.baseUrl).toBe('https://api.example.com');
      expect(clientConfig.timeout).toBe(10000);
      expect(clientConfig.headers).toEqual({ Authorization: 'Bearer token' });
      expect(clientConfig.retryConfig).toEqual({ attempts: 5, delay: 2000 });
      expect(clientConfig.enableMetrics).toBe(false);
    });

    it('should use default logger when none provided', () => {
      const client = new MeasuredHttpClient();
      expect(client).toBeInstanceOf(MeasuredHttpClient);
    });
  });

  describe('configuration management', () => {
    it('should update configuration', () => {
      httpClient.setConfig({ timeout: 15000 });
      const config = httpClient.getConfig();
      expect(config.timeout).toBe(15_000);
    });

    it('should return immutable configuration', () => {
      const config = httpClient.getConfig();
      expect(config.baseUrl).toBe('https://api.test.com');
      expect(() => {
        (config as any).baseUrl = 'https://malicious.com';
      }).not.toThrow();
      expect(httpClient.getConfig().baseUrl).toBe('https://api.test.com');
    });
  });

  describe('HTTP methods', () => {
    const mockResponse = {
      ok: true,
      status: 200,
      json: jest.fn().mockResolvedValue({ id: 1, name: 'Test' }),
    };

    describe('GET request', () => {
      it('should make successful GET request', async () => {
        mockFetch.mockResolvedValueOnce(mockResponse);

        const result = await httpClient.get('/users/1');

        expect(mockFetch).toHaveBeenCalledWith(
          'https://api.test.com/users/1',
          expect.objectContaining({
            method: 'GET',
            headers: { 'User-Agent': 'test-client' },
            signal: expect.any(AbortSignal),
          })
        );

        expect(result.data).toEqual({ id: 1, name: 'Test' });
        expect(result.success).toBe(true);
        expect(result.metrics.duration).toBeGreaterThan(0);
        expect(result.metrics.method).toBe('GET');
        expect(result.metrics.url).toBe('https://api.test.com/users/1');
        expect(result.metrics.statusCode).toBe(200);
      });

      it('should handle HTTP error response', async () => {
        const errorResponse = {
          ok: false,
          status: 404,
          json: jest.fn().mockResolvedValue({ error: 'Not found' }),
        };
        mockFetch.mockResolvedValueOnce(errorResponse);

        await expect(httpClient.get('/users/999')).rejects.toThrow(
          'HTTP error! status: 404'
        );
      });

      it('should handle network error', async () => {
        mockFetch.mockRejectedValueOnce(new Error('Network error'));

        await expect(httpClient.get('/users/1')).rejects.toThrow(
          'Network error'
        );
      });

      it('should retry failed requests', async () => {
        mockFetch
          .mockRejectedValueOnce(new Error('Network error'))
          .mockRejectedValueOnce(new Error('Network error'))
          .mockResolvedValueOnce(mockResponse);

        const result = await httpClient.get('/users/1');

        expect(mockFetch).toHaveBeenCalledTimes(3);
        expect(result.data).toEqual({ id: 1, name: 'Test' });
      });
    });

    describe('POST request', () => {
      it('should make successful POST request', async () => {
        mockFetch.mockResolvedValueOnce({
          ok: true,
          status: 201,
          json: jest.fn().mockResolvedValue({ id: 2, name: 'New User' }),
        });

        const userData = { name: 'New User', email: 'test@example.com' };
        const result = await httpClient.post('/users', userData);

        expect(mockFetch).toHaveBeenCalledWith(
          'https://api.test.com/users',
          expect.objectContaining({
            method: 'POST',
            body: JSON.stringify(userData),
            headers: {
              'Content-Type': 'application/json',
              'User-Agent': 'test-client',
            },
          })
        );

        expect(result.data).toEqual({ id: 2, name: 'New User' });
        expect(result.metrics.method).toBe('POST');
        expect(result.metrics.statusCode).toBe(201);
      });

      it('should handle POST without data', async () => {
        mockFetch.mockResolvedValueOnce(mockResponse);

        const result = await httpClient.post('/users');

        expect(mockFetch).toHaveBeenCalledWith(
          'https://api.test.com/users',
          expect.objectContaining({
            method: 'POST',
            body: undefined,
          })
        );

        expect(result.success).toBe(true);
      });
    });

    describe('PUT request', () => {
      it('should make successful PUT request', async () => {
        mockFetch.mockResolvedValueOnce(mockResponse);

        const userData = { name: 'Updated User' };
        const result = await httpClient.put('/users/1', userData);

        expect(mockFetch).toHaveBeenCalledWith(
          'https://api.test.com/users/1',
          expect.objectContaining({
            method: 'PUT',
            body: JSON.stringify(userData),
            headers: {
              'Content-Type': 'application/json',
              'User-Agent': 'test-client',
            },
          })
        );

        expect(result.metrics.method).toBe('PUT');
      });
    });

    describe('DELETE request', () => {
      it('should make successful DELETE request', async () => {
        mockFetch.mockResolvedValueOnce({
          ok: true,
          status: 204,
          json: jest.fn().mockResolvedValue(undefined),
        });

        const result = await httpClient.delete('/users/1');

        expect(mockFetch).toHaveBeenCalledWith(
          'https://api.test.com/users/1',
          expect.objectContaining({
            method: 'DELETE',
          })
        );

        expect(result.data).toBeUndefined();
        expect(result.metrics.statusCode).toBe(204);
      });

      it('should handle DELETE with response data', async () => {
        mockFetch.mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: jest
            .fn()
            .mockResolvedValue({ message: 'Deleted successfully' }),
        });

        const result = await httpClient.delete('/users/1');

        expect(result.data).toEqual({ message: 'Deleted successfully' });
      });
    });
  });

  describe('retry logic', () => {
    it('should retry on network errors', async () => {
      mockFetch
        .mockRejectedValueOnce(new Error('Network error'))
        .mockRejectedValueOnce(new Error('Network error'))
        .mockResolvedValueOnce(mockResponse);

      const result = await httpClient.get('/users/1');

      expect(mockFetch).toHaveBeenCalledTimes(3);
      expect(result.success).toBe(true);
    });

    it('should respect maximum retry attempts', async () => {
      mockFetch.mockRejectedValue(new Error('Persistent network error'));

      await expect(httpClient.get('/users/1')).rejects.toThrow(
        'Persistent network error'
      );
      expect(mockFetch).toHaveBeenCalledTimes(4); // 1 initial + 3 retries
    });

    it('should not retry on non-retryable errors', async () => {
      const nonRetryableError = new Error('Authentication failed');
      mockFetch.mockRejectedValueOnce(nonRetryableError);

      await expect(httpClient.get('/users/1')).rejects.toThrow(
        'Authentication failed'
      );
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    it('should use exponential backoff', async () => {
      const startTime = Date.now();
      mockFetch
        .mockRejectedValueOnce(new Error('Network error'))
        .mockRejectedValueOnce(new Error('Network error'))
        .mockResolvedValueOnce(mockResponse);

      await httpClient.get('/users/1');
      const duration = Date.now() - startTime;

      // Should include delay for retries
      expect(duration).toBeGreaterThan(2000); // Account for retry delays
    });
  });

  describe('logging', () => {
    it('should set and clear request ID for each request', async () => {
      mockFetch.mockResolvedValueOnce(mockResponse);

      await httpClient.get('/users/1');

      expect(mockLogger.setRequestId).toHaveBeenCalledTimes(1);
      expect(mockLogger.clearRequestId).toHaveBeenCalledTimes(1);
      expect(mockLogger.setRequestId).toHaveBeenCalledWith(
        expect.stringMatching(/^req_\d+_[a-z0-9]+$/)
      );
    });

    it('should log debug messages for request start', async () => {
      mockFetch.mockResolvedValueOnce(mockResponse);

      await httpClient.get('/users/1');

      expect(mockLogger.debug).toHaveBeenCalledWith(
        'Starting GET request to https://api.test.com/users/1',
        'http-client',
        'request',
        expect.objectContaining({
          method: 'GET',
          url: 'https://api.test.com/users/1',
          headers: { 'User-Agent': 'test-client' },
        })
      );
    });

    it('should log successful API calls', async () => {
      mockFetch.mockResolvedValueOnce(mockResponse);

      await httpClient.get('/users/1');

      expect(mockLogger.logApiCall).toHaveBeenCalledWith(
        'GET',
        'https://api.test.com/users/1',
        expect.any(Number),
        200,
        'http-client',
        undefined
      );
    });

    it('should log failed API calls', async () => {
      const error = new Error('Network error');
      mockFetch.mockRejectedValueOnce(error);

      await expect(httpClient.get('/users/1')).rejects.toThrow();

      expect(mockLogger.logApiCall).toHaveBeenCalledWith(
        'GET',
        'https://api.test.com/users/1',
        expect.any(Number),
        undefined,
        'http-client',
        error
      );
    });

    it('should log retry attempts', async () => {
      mockFetch
        .mockRejectedValueOnce(new Error('Network error'))
        .mockResolvedValueOnce(mockResponse);

      await httpClient.get('/users/1');

      expect(mockLogger.warn).toHaveBeenCalledWith(
        'Request failed, retrying (1/3)',
        'http-client',
        'retry',
        expect.objectContaining({
          attempt: 1,
          error: 'Network error',
        })
      );
    });
  });

  describe('base URL handling', () => {
    it('should concatenate base URL with relative URL', async () => {
      mockFetch.mockResolvedValueOnce(mockResponse);

      await httpClient.get('/users/1');

      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.test.com/users/1',
        expect.any(Object)
      );
    });

    it('should handle client without base URL', async () => {
      const client = new MeasuredHttpClient({});
      mockFetch.mockResolvedValueOnce(mockResponse);

      await client.get('https://api.direct.com/users/1');

      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.direct.com/users/1',
        expect.any(Object)
      );
    });

    it('should handle absolute URLs with base URL', async () => {
      mockFetch.mockResolvedValueOnce(mockResponse);

      await httpClient.get('https://api.external.com/users/1');

      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.test.com/https://api.external.com/users/1',
        expect.any(Object)
      );
    });
  });

  describe('timeout handling', () => {
    it('should set timeout for requests', async () => {
      mockFetch.mockResolvedValueOnce(mockResponse);

      await httpClient.get('/users/1');

      expect(mockFetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          signal: expect.any(AbortSignal),
        })
      );
    });
  });

  describe('custom headers', () => {
    it('should merge custom headers with default headers', async () => {
      mockFetch.mockResolvedValueOnce(mockResponse);

      await httpClient.get('/users/1', {
        headers: { Authorization: 'Bearer token', Accept: 'application/json' },
      });

      expect(mockFetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          headers: {
            'User-Agent': 'test-client',
            Authorization: 'Bearer token',
            Accept: 'application/json',
          },
        })
      );
    });

    it('should override default headers with custom headers', async () => {
      mockFetch.mockResolvedValueOnce(mockResponse);

      await httpClient.get('/users/1', {
        headers: { 'User-Agent': 'custom-agent' },
      });

      expect(mockFetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          headers: {
            'User-Agent': 'custom-agent',
          },
        })
      );
    });
  });
});
