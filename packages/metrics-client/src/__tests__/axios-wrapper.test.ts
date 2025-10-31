import axios from 'axios';
import { MeasuredAxios } from '../http-client/axios-wrapper';
import { Logger } from '@universal-kit/logger';

// Mock axios
jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

// Mock Logger
jest.mock('@universal-kit/logger', () => ({
  Logger: jest.fn().mockImplementation(() => ({
    setRequestId: jest.fn(),
    clearRequestId: jest.fn(),
    logApiCall: jest.fn(),
  })),
}));

describe('MeasuredAxios', () => {
  let measuredAxios: MeasuredAxios;
  let mockLogger: Logger;
  let mockAxiosInstance: any;

  beforeEach(() => {
    jest.clearAllMocks();

    // Mock Axios instance
    mockAxiosInstance = {
      defaults: {
        baseURL: '',
        timeout: 30000,
        headers: {},
      },
      interceptors: {
        request: { use: jest.fn() },
        response: { use: jest.fn() },
      },
      get: jest.fn(),
      post: jest.fn(),
      put: jest.fn(),
      patch: jest.fn(),
      delete: jest.fn(),
      head: jest.fn(),
      options: jest.fn(),
      request: jest.fn(),
      getUri: jest.fn(),
    };

    mockAxiosInstance.interceptors.request.use.mockImplementation(
      (onFulfilled: any, onRejected: any) => {
        return { onFulfilled, onRejected };
      }
    );

    mockAxiosInstance.interceptors.response.use.mockImplementation(
      (onFulfilled: any, onRejected: any) => {
        return { onFulfilled, onRejected };
      }
    );

    mockedAxios.create.mockReturnValue(mockAxiosInstance);

    mockLogger = new Logger();
    measuredAxios = new MeasuredAxios({}, mockLogger);
  });

  describe('constructor', () => {
    it('should create Axios instance with default configuration', () => {
      expect(mockedAxios.create).toHaveBeenCalledWith({
        baseURL: '',
        timeout: 30000,
        headers: {},
      });
    });

    it('should create Axios instance with custom configuration', () => {
      const customConfig = {
        baseUrl: 'https://api.example.com',
        timeout: 10000,
        headers: { Authorization: 'Bearer token' },
      };

      new MeasuredAxios(customConfig, mockLogger);

      expect(mockedAxios.create).toHaveBeenCalledWith({
        baseURL: 'https://api.example.com',
        timeout: 10000,
        headers: { Authorization: 'Bearer token' },
      });
    });

    it('should setup interceptors', () => {
      expect(mockAxiosInstance.interceptors.request.use).toHaveBeenCalledTimes(
        1
      );
      expect(mockAxiosInstance.interceptors.response.use).toHaveBeenCalledTimes(
        1
      );
    });
  });

  describe('Axios-compatible methods', () => {
    it('should delegate get method to Axios instance', async () => {
      const mockResponse = {
        data: 'test',
        status: 200,
        statusText: 'OK',
        headers: {},
        config: {},
      };
      mockAxiosInstance.get.mockResolvedValue(mockResponse);

      const result = await measuredAxios.get('/test');

      expect(mockAxiosInstance.get).toHaveBeenCalledWith('/test', undefined);
      expect(result).toBe(mockResponse);
    });

    it('should delegate post method to Axios instance', async () => {
      const mockResponse = {
        data: 'test',
        status: 201,
        statusText: 'Created',
        headers: {},
        config: {},
      };
      mockAxiosInstance.post.mockResolvedValue(mockResponse);

      const result = await measuredAxios.post('/test', { data: 'value' });

      expect(mockAxiosInstance.post).toHaveBeenCalledWith(
        '/test',
        { data: 'value' },
        undefined
      );
      expect(result).toBe(mockResponse);
    });

    it('should delegate put method to Axios instance', async () => {
      const mockResponse = {
        data: 'test',
        status: 200,
        statusText: 'OK',
        headers: {},
        config: {},
      };
      mockAxiosInstance.put.mockResolvedValue(mockResponse);

      const result = await measuredAxios.put('/test', { data: 'value' });

      expect(mockAxiosInstance.put).toHaveBeenCalledWith(
        '/test',
        { data: 'value' },
        undefined
      );
      expect(result).toBe(mockResponse);
    });

    it('should delegate patch method to Axios instance', async () => {
      const mockResponse = {
        data: 'test',
        status: 200,
        statusText: 'OK',
        headers: {},
        config: {},
      };
      mockAxiosInstance.patch.mockResolvedValue(mockResponse);

      const result = await measuredAxios.patch('/test', { data: 'value' });

      expect(mockAxiosInstance.patch).toHaveBeenCalledWith(
        '/test',
        { data: 'value' },
        undefined
      );
      expect(result).toBe(mockResponse);
    });

    it('should delegate delete method to Axios instance', async () => {
      const mockResponse = {
        data: 'test',
        status: 204,
        statusText: 'No Content',
        headers: {},
        config: {},
      };
      mockAxiosInstance.delete.mockResolvedValue(mockResponse);

      const result = await measuredAxios.delete('/test');

      expect(mockAxiosInstance.delete).toHaveBeenCalledWith('/test', undefined);
      expect(result).toBe(mockResponse);
    });

    it('should delegate request method to Axios instance', async () => {
      const mockResponse = {
        data: 'test',
        status: 200,
        statusText: 'OK',
        headers: {},
        config: {},
      };
      const requestConfig = { method: 'GET', url: '/test' };
      mockAxiosInstance.request.mockResolvedValue(mockResponse);

      const result = await measuredAxios.request(requestConfig);

      expect(mockAxiosInstance.request).toHaveBeenCalledWith(requestConfig);
      expect(result).toBe(mockResponse);
    });
  });

  describe('measured methods', () => {
    it('should return ApiCallResult for measuredGet', async () => {
      const mockResponse = {
        data: { id: 1, name: 'test' },
        status: 200,
        statusText: 'OK',
        headers: {},
        config: { method: 'get', url: '/test' },
        _metrics: {
          duration: 100,
          method: 'GET',
          url: '/test',
          statusCode: 200,
        },
      };
      mockAxiosInstance.get.mockResolvedValue(mockResponse);

      const result = await measuredAxios.measuredGet('/test');

      expect(result).toEqual({
        data: { id: 1, name: 'test' },
        metrics: {
          duration: 100,
          method: 'GET',
          url: '/test',
          statusCode: 200,
        },
        success: true,
      });
    });

    it('should handle errors in measuredGet', async () => {
      const mockError = {
        _metrics: {
          duration: 100,
          method: 'GET',
          url: '/test',
          statusCode: 404,
        },
      };
      mockAxiosInstance.get.mockRejectedValue(mockError);

      try {
        await measuredAxios.measuredGet('/test');
        fail('Should have thrown an error');
      } catch (error: any) {
        expect(error).toEqual({
          data: undefined,
          metrics: {
            duration: 100,
            method: 'GET',
            url: '/test',
            statusCode: 404,
          },
          success: false,
          error: mockError,
        });
      }
    });

    it('should return ApiCallResult for measuredPost', async () => {
      const mockResponse = {
        data: { id: 1, name: 'created' },
        status: 201,
        statusText: 'Created',
        headers: {},
        config: { method: 'post', url: '/test' },
        _metrics: {
          duration: 150,
          method: 'POST',
          url: '/test',
          statusCode: 201,
        },
      };
      mockAxiosInstance.post.mockResolvedValue(mockResponse);

      const result = await measuredAxios.measuredPost('/test', {
        name: 'test',
      });

      expect(result).toEqual({
        data: { id: 1, name: 'created' },
        metrics: {
          duration: 150,
          method: 'POST',
          url: '/test',
          statusCode: 201,
        },
        success: true,
      });
    });
  });

  describe('utility methods', () => {
    it('should get defaults from Axios instance', () => {
      const defaults = measuredAxios.defaults;
      expect(defaults).toBe(mockAxiosInstance.defaults);
    });

    it('should get interceptors from Axios instance', () => {
      const interceptors = measuredAxios.interceptors;
      expect(interceptors).toBe(mockAxiosInstance.interceptors);
    });

    it('should delegate getUri to Axios instance', () => {
      const config = { url: '/test' };
      mockAxiosInstance.getUri.mockReturnValue('/base/test');

      const uri = measuredAxios.getUri(config);

      expect(mockAxiosInstance.getUri).toHaveBeenCalledWith(config);
      expect(uri).toBe('/base/test');
    });

    it('should get underlying Axios instance', () => {
      const instance = measuredAxios.getAxiosInstance();
      expect(instance).toBe(mockAxiosInstance);
    });
  });

  describe('configuration methods', () => {
    it('should set configuration', () => {
      measuredAxios.setConfig({
        baseUrl: 'https://new-api.example.com',
        timeout: 5000,
        headers: { 'X-New-Header': 'value' },
      });

      expect(mockAxiosInstance.defaults.baseURL).toBe(
        'https://new-api.example.com'
      );
      expect(mockAxiosInstance.defaults.timeout).toBe(5000);
      expect(mockAxiosInstance.defaults.headers).toEqual(
        expect.objectContaining({ 'X-New-Header': 'value' })
      );
    });

    it('should get configuration', () => {
      const config = measuredAxios.getConfig();
      expect(config).toEqual({
        baseUrl: '',
        timeout: 30000,
        headers: {},
        retryConfig: {
          attempts: 3,
          delay: 1000,
        },
        enableMetrics: true,
      });
    });
  });

  describe('createApiCallResult', () => {
    it('should create ApiCallResult from successful response', () => {
      const response = {
        data: { test: 'data' },
        status: 200,
        statusText: 'OK',
        headers: {},
        config: { method: 'get', url: '/test' },
        _metrics: {
          duration: 100,
          method: 'GET',
          url: '/test',
          statusCode: 200,
        },
      };

      const result = measuredAxios.createApiCallResult(response);

      expect(result).toEqual({
        data: { test: 'data' },
        metrics: {
          duration: 100,
          method: 'GET',
          url: '/test',
          statusCode: 200,
        },
        success: true,
      });
    });

    it('should handle missing metrics', () => {
      const response = {
        data: { test: 'data' },
        status: 200,
        statusText: 'OK',
        headers: {},
        config: { method: 'get', url: '/test' },
      };

      const result = measuredAxios.createApiCallResult(response);

      expect(result.metrics).toEqual({
        duration: 0,
        method: 'GET',
        url: '/test',
        statusCode: 200,
      });
    });

    it('should determine success based on status code', () => {
      const successResponse = {
        data: { test: 'data' },
        status: 201,
        statusText: 'Created',
        headers: {},
        config: { method: 'post', url: '/test' },
      };

      const errorResponse = {
        data: { error: 'Not found' },
        status: 404,
        statusText: 'Not Found',
        headers: {},
        config: { method: 'get', url: '/test' },
      };

      const successResult = measuredAxios.createApiCallResult(successResponse);
      const errorResult = measuredAxios.createApiCallResult(errorResponse);

      expect(successResult.success).toBe(true);
      expect(errorResult.success).toBe(false);
    });
  });
});
