import { OtelProvider } from '../otel-provider';

describe('OtelProvider', () => {
  let otelProvider: OtelProvider;
  let mockTracer: any;
  let mockSpan: any;
  let mockSDK: any;

  beforeEach(() => {
    jest.clearAllMocks();

    // Mock span
    mockSpan = {
      setAttribute: jest.fn(),
      recordException: jest.fn(),
      setStatus: jest.fn(),
      end: jest.fn(),
    };

    // Mock tracer
    mockTracer = {
      startSpan: jest.fn(() => mockSpan),
    };

    // Mock SDK
    mockSDK = {
      start: jest.fn(),
      shutdown: jest.fn(() => Promise.resolve()),
    };

    // Set up the mocks
    const { trace } = require('@opentelemetry/api');
    trace.getTracer.mockReturnValue(mockTracer);

    const { NodeSDK } = require('@opentelemetry/sdk-node');
    NodeSDK.mockImplementation(() => mockSDK);
  });

  describe('constructor', () => {
    it('should create OtelProvider with default configuration', () => {
      const config = {
        serviceName: 'test-service',
      };

      otelProvider = new OtelProvider(config);

      expect(NodeSDK).toHaveBeenCalledWith(
        expect.objectContaining({
          serviceName: 'test-service',
          serviceVersion: '0.1.0',
          instrumentations: expect.any(Array),
        })
      );
    });

    it('should create OtelProvider with custom configuration', () => {
      const config = {
        serviceName: 'custom-service',
        serviceVersion: '2.0.0',
        endpoint: 'http://localhost:4317',
        headers: { 'x-api-key': 'test-key' },
      };

      otelProvider = new OtelProvider(config);

      expect(NodeSDK).toHaveBeenCalledWith(
        expect.objectContaining({
          serviceName: 'custom-service',
          serviceVersion: '2.0.0',
        })
      );
    });

    it('should get tracer on creation', () => {
      const { trace } = require('@opentelemetry/api');

      otelProvider = new OtelProvider({ serviceName: 'test-service' });

      expect(trace.getTracer).toHaveBeenCalledWith('universal-kit', '0.1.0');
    });
  });

  describe('lifecycle management', () => {
    beforeEach(() => {
      otelProvider = new OtelProvider({ serviceName: 'test-service' });
    });

    it('should start the SDK', () => {
      otelProvider.start();

      expect(mockSDK.start).toHaveBeenCalledTimes(1);
    });

    it('should stop the SDK', async () => {
      await otelProvider.stop();

      expect(mockSDK.shutdown).toHaveBeenCalledTimes(1);
    });
  });

  describe('span creation', () => {
    beforeEach(() => {
      otelProvider = new OtelProvider({ serviceName: 'test-service' });
    });

    it('should create a span with default configuration', () => {
      const { SpanKind } = require('@opentelemetry/api');

      const span = otelProvider.createSpan('test-span');

      expect(mockTracer.startSpan).toHaveBeenCalledWith('test-span', {
        kind: SpanKind.INTERNAL,
        attributes: {
          'service.name': 'universal-kit',
        },
      });
      expect(span).toBe(mockSpan);
    });

    it('should create a span with custom kind and attributes', () => {
      const { SpanKind } = require('@opentelemetry/api');

      const span = otelProvider.createSpan('http-request', SpanKind.CLIENT, {
        'http.method': 'GET',
        'http.url': 'https://api.test.com',
      });

      expect(mockTracer.startSpan).toHaveBeenCalledWith('http-request', {
        kind: SpanKind.CLIENT,
        attributes: {
          'service.name': 'universal-kit',
          'http.method': 'GET',
          'http.url': 'https://api.test.com',
        },
      });
    });
  });

  describe('HTTP call recording', () => {
    beforeEach(() => {
      otelProvider = new OtelProvider({ serviceName: 'test-service' });
    });

    it('should record successful HTTP call', () => {
      const { SpanKind, SpanStatusCode } = require('@opentelemetry/api');

      otelProvider.recordHttpCall(
        'GET',
        'https://api.test.com/users',
        200,
        150
      );

      expect(mockTracer.startSpan).toHaveBeenCalledWith('HTTP GET', {
        kind: SpanKind.CLIENT,
        attributes: {
          'http.method': 'GET',
          'http.url': 'https://api.test.com/users',
          'http.status_code': 200,
          duration_ms: 150,
        },
      });

      expect(mockSpan.setStatus).toHaveBeenCalledWith({
        code: SpanStatusCode.OK,
      });
      expect(mockSpan.end).toHaveBeenCalled();
    });

    it('should record HTTP call with error', () => {
      const { SpanKind, SpanStatusCode } = require('@opentelemetry/api');
      const error = new Error('Network error');

      otelProvider.recordHttpCall(
        'POST',
        'https://api.test.com/users',
        500,
        1000,
        error
      );

      expect(mockSpan.recordException).toHaveBeenCalledWith(error);
      expect(mockSpan.setStatus).toHaveBeenCalledWith({
        code: SpanStatusCode.ERROR,
        message: 'Network error',
      });
      expect(mockSpan.end).toHaveBeenCalled();
    });

    it('should record HTTP call with 4xx status as error', () => {
      const { SpanKind, SpanStatusCode } = require('@opentelemetry/api');

      otelProvider.recordHttpCall('GET', 'https://api.test.com/users', 404, 50);

      expect(mockSpan.setStatus).toHaveBeenCalledWith({
        code: SpanStatusCode.ERROR,
        message: 'HTTP 404',
      });
      expect(mockSpan.end).toHaveBeenCalled();
    });

    it('should handle undefined status code', () => {
      const { SpanKind, SpanStatusCode } = require('@opentelemetry/api');

      otelProvider.recordHttpCall(
        'GET',
        'https://api.test.com/users',
        undefined,
        100
      );

      expect(mockTracer.startSpan).toHaveBeenCalledWith('HTTP GET', {
        kind: SpanKind.CLIENT,
        attributes: {
          'http.method': 'GET',
          'http.url': 'https://api.test.com/users',
          'http.status_code': undefined,
          duration_ms: 100,
        },
      });

      expect(mockSpan.setStatus).toHaveBeenCalledWith({
        code: SpanStatusCode.OK,
      });
    });
  });

  describe('function call recording', () => {
    beforeEach(() => {
      otelProvider = new OtelProvider({ serviceName: 'test-service' });
    });

    it('should record successful function call', () => {
      const { SpanKind, SpanStatusCode } = require('@opentelemetry/api');

      otelProvider.recordFunctionCall('testFunction', 'TestClass', 75);

      expect(mockTracer.startSpan).toHaveBeenCalledWith(
        'TestClass.testFunction',
        {
          kind: SpanKind.INTERNAL,
          attributes: {
            'function.name': 'testFunction',
            'class.name': 'TestClass',
            duration_ms: 75,
          },
        }
      );

      expect(mockSpan.setStatus).toHaveBeenCalledWith({
        code: SpanStatusCode.OK,
      });
      expect(mockSpan.end).toHaveBeenCalled();
    });

    it('should record function call with metadata', () => {
      const { SpanKind } = require('@opentelemetry/api');

      otelProvider.recordFunctionCall(
        'processData',
        'DataService',
        120,
        undefined,
        { 'data.type': 'user', 'data.count': 10 }
      );

      expect(mockTracer.startSpan).toHaveBeenCalledWith(
        'DataService.processData',
        {
          kind: SpanKind.INTERNAL,
          attributes: {
            'function.name': 'processData',
            'class.name': 'DataService',
            duration_ms: 120,
            'data.type': 'user',
            'data.count': 10,
          },
        }
      );
    });

    it('should record function call with error', () => {
      const { SpanKind, SpanStatusCode } = require('@opentelemetry/api');
      const error = new Error('Function failed');

      otelProvider.recordFunctionCall(
        'failingFunction',
        'TestClass',
        50,
        error
      );

      expect(mockSpan.recordException).toHaveBeenCalledWith(error);
      expect(mockSpan.setStatus).toHaveBeenCalledWith({
        code: SpanStatusCode.ERROR,
        message: 'Function failed',
      });
      expect(mockSpan.end).toHaveBeenCalled();
    });
  });

  describe('API call recording', () => {
    beforeEach(() => {
      otelProvider = new OtelProvider({ serviceName: 'test-service' });
    });

    it('should record successful API call', () => {
      const { SpanKind, SpanStatusCode } = require('@opentelemetry/api');

      otelProvider.recordApiCall('userAPI', 200, true);

      expect(mockTracer.startSpan).toHaveBeenCalledWith('API userAPI', {
        kind: SpanKind.CLIENT,
        attributes: {
          'api.name': 'userAPI',
          duration_ms: 200,
          'api.success': true,
        },
      });

      expect(mockSpan.setStatus).toHaveBeenCalledWith({
        code: SpanStatusCode.OK,
      });
      expect(mockSpan.end).toHaveBeenCalled();
    });

    it('should record failed API call', () => {
      const { SpanKind, SpanStatusCode } = require('@opentelemetry/api');

      otelProvider.recordApiCall('paymentAPI', 500, false);

      expect(mockSpan.setStatus).toHaveBeenCalledWith({
        code: SpanStatusCode.ERROR,
        message: 'API call failed',
      });
      expect(mockSpan.end).toHaveBeenCalled();
    });

    it('should record API call with error and metadata', () => {
      const { SpanKind, SpanStatusCode } = require('@opentelemetry/api');
      const error = new Error('API timeout');

      otelProvider.recordApiCall('externalAPI', 5000, false, error, {
        'api.provider': 'external',
        'api.version': 'v2',
      });

      expect(mockTracer.startSpan).toHaveBeenCalledWith('API externalAPI', {
        kind: SpanKind.CLIENT,
        attributes: {
          'api.name': 'externalAPI',
          duration_ms: 5000,
          'api.success': false,
          'api.provider': 'external',
          'api.version': 'v2',
        },
      });

      expect(mockSpan.recordException).toHaveBeenCalledWith(error);
      expect(mockSpan.setStatus).toHaveBeenCalledWith({
        code: SpanStatusCode.ERROR,
        message: 'API timeout',
      });
    });
  });

  describe('withSpan helper', () => {
    beforeEach(() => {
      otelProvider = new OtelProvider({ serviceName: 'test-service' });
    });

    it('should execute function within span context', async () => {
      const { SpanKind, SpanStatusCode } = require('@opentelemetry/api');
      const mockFunction = jest.fn(span => {
        expect(span).toBe(mockSpan);
        return 'test result';
      });

      const result = await otelProvider.withSpan(
        'test-operation',
        mockFunction
      );

      expect(result).toBe('test result');
      expect(mockTracer.startSpan).toHaveBeenCalledWith('test-operation', {
        kind: SpanKind.INTERNAL,
        attributes: {
          'service.name': 'universal-kit',
        },
      });
      expect(mockSpan.setStatus).toHaveBeenCalledWith({
        code: SpanStatusCode.OK,
      });
      expect(mockSpan.end).toHaveBeenCalled();
    });

    it('should handle function errors', async () => {
      const { SpanKind, SpanStatusCode } = require('@opentelemetry/api');
      const error = new Error('Function error');
      const mockFunction = jest.fn(() => {
        throw error;
      });

      await expect(
        otelProvider.withSpan('failing-operation', mockFunction)
      ).rejects.toThrow('Function error');

      expect(mockSpan.recordException).toHaveBeenCalledWith(error);
      expect(mockSpan.setStatus).toHaveBeenCalledWith({
        code: SpanStatusCode.ERROR,
        message: 'Function error',
      });
      expect(mockSpan.end).toHaveBeenCalled();
    });

    it('should work with custom span kind and attributes', async () => {
      const { SpanKind, SpanStatusCode } = require('@opentelemetry/api');
      const mockFunction = jest.fn(() => 'success');

      await otelProvider.withSpan(
        'http-operation',
        mockFunction,
        SpanKind.CLIENT,
        { 'http.method': 'POST', 'service.name': 'test' }
      );

      expect(mockTracer.startSpan).toHaveBeenCalledWith('http-operation', {
        kind: SpanKind.CLIENT,
        attributes: {
          'service.name': 'universal-kit',
          'http.method': 'POST',
          'service.name': 'test',
        },
      });
      expect(mockSpan.end).toHaveBeenCalled();
    });

    it('should handle non-Error exceptions', async () => {
      const mockFunction = jest.fn(() => {
        throw 'String error';
      });

      await expect(
        otelProvider.withSpan('operation', mockFunction)
      ).rejects.toThrow('String error');

      expect(mockSpan.recordException).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'Error',
          message: 'Unknown error',
        })
      );
    });
  });

  describe('span management', () => {
    beforeEach(() => {
      otelProvider = new OtelProvider({ serviceName: 'test-service' });
    });

    it('should always end spans after recording', () => {
      otelProvider.recordHttpCall('GET', 'https://api.test.com', 200, 100);
      expect(mockSpan.end).toHaveBeenCalledTimes(1);

      otelProvider.recordFunctionCall('test', 'Class', 50);
      expect(mockSpan.end).toHaveBeenCalledTimes(2);

      otelProvider.recordApiCall('api', 100, true);
      expect(mockSpan.end).toHaveBeenCalledTimes(3);
    });

    it('should end spans even when errors occur', () => {
      const error = new Error('Test error');

      otelProvider.recordHttpCall(
        'GET',
        'https://api.test.com',
        500,
        100,
        error
      );
      expect(mockSpan.end).toHaveBeenCalledTimes(1);

      otelProvider.recordFunctionCall('test', 'Class', 50, error);
      expect(mockSpan.end).toHaveBeenCalledTimes(2);

      otelProvider.recordApiCall('api', 100, false, error);
      expect(mockSpan.end).toHaveBeenCalledTimes(3);
    });
  });
});
