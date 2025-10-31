import {
  ApiMetrics,
  LogMetadata,
  LoggerConfig,
  HttpClientConfig,
  DecoratorConfig,
  LogLevel,
  ApiCallResult,
} from '../index';

describe('Core Types', () => {
  describe('ApiMetrics', () => {
    it('should accept complete metrics data', () => {
      const metrics: ApiMetrics = {
        duration: 100,
        statusCode: 200,
        method: 'GET',
        url: 'https://api.example.com/users',
        userAgent: 'test-agent',
        requestId: 'req-123',
        metadata: { userId: '123' },
      };

      expect(metrics.duration).toBe(100);
      expect(metrics.statusCode).toBe(200);
      expect(metrics.method).toBe('GET');
      expect(metrics.url).toBe('https://api.example.com/users');
      expect(metrics.userAgent).toBe('test-agent');
      expect(metrics.requestId).toBe('req-123');
      expect(metrics.metadata).toEqual({ userId: '123' });
    });

    it('should accept minimal metrics data', () => {
      const metrics: ApiMetrics = {
        duration: 50,
      };

      expect(metrics.duration).toBe(50);
      expect(metrics.statusCode).toBeUndefined();
      expect(metrics.method).toBeUndefined();
      expect(metrics.url).toBeUndefined();
    });

    it('should accept metrics with error', () => {
      const error = new Error('Test error');
      const metrics: ApiMetrics = {
        duration: 25,
        error,
      };

      expect(metrics.duration).toBe(25);
      expect(metrics.error).toBe(error);
      expect(metrics.error?.message).toBe('Test error');
    });
  });

  describe('LogMetadata', () => {
    it('should accept required metadata fields', () => {
      const metadata: LogMetadata = {
        library: 'test-library',
        function: 'testFunction',
        timestamp: new Date('2023-01-01T00:00:00Z'),
      };

      expect(metadata.library).toBe('test-library');
      expect(metadata.function).toBe('testFunction');
      expect(metadata.timestamp).toEqual(new Date('2023-01-01T00:00:00Z'));
      expect(metadata.requestId).toBeUndefined();
    });

    it('should accept optional requestId', () => {
      const metadata: LogMetadata = {
        library: 'test-library',
        function: 'testFunction',
        timestamp: new Date(),
        requestId: 'req-abc123',
      };

      expect(metadata.requestId).toBe('req-abc123');
    });

    it('should accept additional custom fields', () => {
      const metadata: LogMetadata = {
        library: 'test-library',
        function: 'testFunction',
        timestamp: new Date(),
        userId: 'user-123',
        customField: 'custom-value',
      };

      expect((metadata as any).userId).toBe('user-123');
      expect((metadata as any).customField).toBe('custom-value');
    });
  });

  describe('LoggerConfig', () => {
    it('should accept default configuration', () => {
      const config: LoggerConfig = {
        level: 'info',
        includeMetadata: true,
      };

      expect(config.level).toBe('info');
      expect(config.includeMetadata).toBe(true);
      expect(config.customFields).toBeUndefined();
    });

    it('should accept configuration with custom fields', () => {
      const config: LoggerConfig = {
        level: 'debug',
        includeMetadata: false,
        customFields: { service: 'test-service', version: '1.0.0' },
      };

      expect(config.level).toBe('debug');
      expect(config.includeMetadata).toBe(false);
      expect(config.customFields).toEqual({
        service: 'test-service',
        version: '1.0.0',
      });
    });

    it('should accept all log levels', () => {
      const levels: LogLevel[] = ['debug', 'info', 'warn', 'error'];

      levels.forEach(level => {
        const config: LoggerConfig = {
          level,
          includeMetadata: true,
        };
        expect(config.level).toBe(level);
      });
    });
  });

  describe('HttpClientConfig', () => {
    it('should accept empty configuration', () => {
      const config: HttpClientConfig = {};

      expect(config.baseUrl).toBeUndefined();
      expect(config.timeout).toBeUndefined();
      expect(config.headers).toBeUndefined();
      expect(config.retryConfig).toBeUndefined();
      expect(config.enableMetrics).toBeUndefined();
    });

    it('should accept complete configuration', () => {
      const config: HttpClientConfig = {
        baseUrl: 'https://api.example.com',
        timeout: 30000,
        headers: { Authorization: 'Bearer token' },
        retryConfig: { attempts: 5, delay: 2000 },
        enableMetrics: true,
      };

      expect(config.baseUrl).toBe('https://api.example.com');
      expect(config.timeout).toBe(30000);
      expect(config.headers).toEqual({ Authorization: 'Bearer token' });
      expect(config.retryConfig).toEqual({ attempts: 5, delay: 2000 });
      expect(config.enableMetrics).toBe(true);
    });
  });

  describe('DecoratorConfig', () => {
    it('should accept empty configuration', () => {
      const config: DecoratorConfig = {};

      expect(config.logRequests).toBeUndefined();
      expect(config.logResponses).toBeUndefined();
      expect(config.includeArgs).toBeUndefined();
      expect(config.customMetadata).toBeUndefined();
    });

    it('should accept configuration with all options', () => {
      const config: DecoratorConfig = {
        logRequests: true,
        logResponses: true,
        includeArgs: true,
        customMetadata: { service: 'test-service' },
      };

      expect(config.logRequests).toBe(true);
      expect(config.logResponses).toBe(true);
      expect(config.includeArgs).toBe(true);
      expect(config.customMetadata).toEqual({ service: 'test-service' });
    });
  });

  describe('ApiCallResult', () => {
    it('should represent successful API call', () => {
      const data = { id: 1, name: 'Test User' };
      const metrics: ApiMetrics = { duration: 150, statusCode: 200 };
      const result: ApiCallResult<typeof data> = {
        data,
        metrics,
        success: true,
      };

      expect(result.data).toEqual(data);
      expect(result.metrics).toEqual(metrics);
      expect(result.success).toBe(true);
    });

    it('should represent failed API call', () => {
      const error = new Error('API failed');
      const metrics: ApiMetrics = { duration: 100, error, statusCode: 500 };
      const result: ApiCallResult = {
        data: null,
        metrics,
        success: false,
      };

      expect(result.data).toBe(null);
      expect(result.metrics).toEqual(metrics);
      expect(result.success).toBe(false);
    });

    it('should work with different data types', () => {
      const stringResult: ApiCallResult<string> = {
        data: 'success',
        metrics: { duration: 50 },
        success: true,
      };

      const arrayResult: ApiCallResult<number[]> = {
        data: [1, 2, 3],
        metrics: { duration: 75 },
        success: true,
      };

      expect(stringResult.data).toBe('success');
      expect(arrayResult.data).toEqual([1, 2, 3]);
    });
  });

  describe('LogLevel type', () => {
    it('should accept valid log levels', () => {
      const validLevels: LogLevel[] = ['debug', 'info', 'warn', 'error'];

      validLevels.forEach(level => {
        expect(level).toMatch(/^(debug|info|warn|error)$/);
      });
    });
  });
});
