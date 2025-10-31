import { Logger } from '../logger';
import winston from 'winston';

// Mock Winston modules
jest.mock('winston', () => ({
  format: {
    combine: jest.fn(),
    timestamp: jest.fn(),
    errors: jest.fn(),
    metadata: jest.fn(),
    json: jest.fn(),
    printf: jest.fn(),
    colorize: jest.fn(),
  },
  createLogger: jest.fn(() => ({
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    add: jest.fn(),
    remove: jest.fn(),
    child: jest.fn(),
    query: jest.fn(),
    stream: jest.fn(),
    close: jest.fn(),
    transports: [],
  })),
  transports: {
    Console: jest.fn(),
    File: jest.fn(),
  },
}));

jest.mock('winston-daily-rotate-file', () => {
  return jest.fn().mockImplementation(() => ({
    level: 'info',
    close: jest.fn(),
  }));
});

describe('Winston-based Logger', () => {
  let logger: Logger;
  let mockWinstonLogger: any;
  let mockCreateLogger: jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();

    // Mock Winston logger
    mockWinstonLogger = {
      debug: jest.fn(),
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      add: jest.fn(),
      remove: jest.fn(),
      child: jest.fn(),
      query: jest.fn(),
      stream: jest.fn(),
      close: jest.fn(),
      level: 'info',
      transports: [],
    };

    // Mock createLogger
    mockCreateLogger = (winston as any).createLogger as jest.Mock;
    mockCreateLogger.mockReturnValue(mockWinstonLogger);

    // Mock Console transport
    const mockConsoleTransport = { level: 'info', close: jest.fn() };
    (winston.transports.Console as jest.Mock).mockImplementation(
      () => mockConsoleTransport
    );

    logger = new Logger();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('constructor', () => {
    it('should create logger with default configuration', () => {
      expect(logger).toBeInstanceOf(Logger);
      expect(mockCreateLogger).toHaveBeenCalledWith(
        expect.objectContaining({
          level: 'info',
          format: expect.any(Object),
          defaultMeta: {},
          transports: expect.any(Array),
        })
      );
    });

    it('should create logger with custom configuration', () => {
      const config = {
        level: 'debug' as const,
        includeMetadata: false,
        customFields: { service: 'test-service', version: '1.0.0' },
      };

      const customLogger = new Logger(config);

      expect(mockCreateLogger).toHaveBeenCalledWith(
        expect.objectContaining({
          level: 'debug',
          defaultMeta: { service: 'test-service', version: '1.0.0' },
        })
      );
    });

    it('should create Console transport', () => {
      expect(winston.transports.Console).toHaveBeenCalledWith(
        expect.objectContaining({
          format: expect.any(Object),
          level: 'info',
        })
      );
    });

    it('should create file transports in production', () => {
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'production';

      new Logger(); // This should create file transports

      expect(require('winston-daily-rotate-file')).toHaveBeenCalledTimes(2);

      process.env.NODE_ENV = originalEnv;
    });
  });

  describe('request ID management', () => {
    it('should set and clear request ID', () => {
      logger.setRequestId('req-123');
      logger.info('test message', 'test-lib', 'test-func');

      expect(mockWinstonLogger.info).toHaveBeenCalledWith(
        'test message',
        expect.objectContaining({
          library: 'test-lib',
          function: 'test-func',
          requestId: 'req-123',
        })
      );

      logger.clearRequestId();
      logger.info('test message 2', 'test-lib', 'test-func');

      expect(mockWinstonLogger.info).toHaveBeenCalledWith(
        'test message 2',
        expect.objectContaining({
          library: 'test-lib',
          function: 'test-func',
        })
      );
      expect(mockWinstonLogger.info).not.toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          requestId: expect.any(String),
        })
      );
    });
  });

  describe('log levels', () => {
    it('should respect log level hierarchy', () => {
      const logger = new Logger({ level: 'warn' });

      logger.debug('debug message', 'test-lib', 'test-func');
      logger.info('info message', 'test-lib', 'test-func');
      logger.warn('warn message', 'test-lib', 'test-func');
      logger.error('error message', 'test-lib', 'test-func');

      expect(mockWinstonLogger.debug).not.toHaveBeenCalled();
      expect(mockWinstonLogger.info).not.toHaveBeenCalled();
      expect(mockWinstonLogger.warn).toHaveBeenCalledTimes(1);
      expect(mockWinstonLogger.error).toHaveBeenCalledTimes(1);
    });

    it('should log all messages at debug level', () => {
      const logger = new Logger({ level: 'debug' });

      logger.debug('debug message', 'test-lib', 'test-func');
      logger.info('info message', 'test-lib', 'test-func');
      logger.warn('warn message', 'test-lib', 'test-func');
      logger.error('error message', 'test-lib', 'test-func');

      expect(mockWinstonLogger.debug).toHaveBeenCalledTimes(1);
      expect(mockWinstonLogger.info).toHaveBeenCalledTimes(1);
      expect(mockWinstonLogger.warn).toHaveBeenCalledTimes(1);
      expect(mockWinstonLogger.error).toHaveBeenCalledTimes(1);
    });

    it('should only log errors at error level', () => {
      const logger = new Logger({ level: 'error' });

      logger.debug('debug message', 'test-lib', 'test-func');
      logger.info('info message', 'test-lib', 'test-func');
      logger.warn('warn message', 'test-lib', 'test-func');
      logger.error('error message', 'test-lib', 'test-func');

      expect(mockWinstonLogger.debug).not.toHaveBeenCalled();
      expect(mockWinstonLogger.info).not.toHaveBeenCalled();
      expect(mockWinstonLogger.warn).not.toHaveBeenCalled();
      expect(mockWinstonLogger.error).toHaveBeenCalledTimes(1);
    });
  });

  describe('log data creation', () => {
    it('should include library and function names', () => {
      logger.info('test message', 'my-library', 'my-function');

      expect(mockWinstonLogger.info).toHaveBeenCalledWith(
        'test message',
        expect.objectContaining({
          library: 'my-library',
          function: 'my-function',
        })
      );
    });

    it('should include custom fields from configuration', () => {
      const logger = new Logger({
        customFields: { service: 'test-service', version: '1.0.0' },
      });

      logger.info('test message', 'test-lib', 'test-func');

      expect(mockWinstonLogger.info).toHaveBeenCalledWith(
        'test message',
        expect.objectContaining({
          library: 'test-lib',
          function: 'test-func',
          service: 'test-service',
          version: '1.0.0',
        })
      );
    });

    it('should include additional metadata when enabled', () => {
      logger.info('test message', 'test-lib', 'test-func', {
        userId: '123',
        action: 'create',
      });

      expect(mockWinstonLogger.info).toHaveBeenCalledWith(
        'test message',
        expect.objectContaining({
          library: 'test-lib',
          function: 'test-func',
          userId: '123',
          action: 'create',
        })
      );
    });

    it('should exclude additional metadata when disabled', () => {
      const logger = new Logger({ includeMetadata: false });

      logger.info('test message', 'test-lib', 'test-func', { userId: '123' });

      expect(mockWinstonLogger.info).toHaveBeenCalledWith(
        'test message',
        expect.objectContaining({
          library: 'test-lib',
          function: 'test-func',
        })
      );
      expect(mockWinstonLogger.info).not.toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          userId: expect.any(String),
        })
      );
    });
  });

  describe('error logging', () => {
    it('should include error details', () => {
      const error = new Error('Test error');
      logger.error('test error message', 'test-lib', 'test-func', error);

      expect(mockWinstonLogger.error).toHaveBeenCalledWith(
        'test error message',
        expect.objectContaining({
          library: 'test-lib',
          function: 'test-func',
          error,
        })
      );
    });

    it('should handle errors without stack', () => {
      const error = new Error('Test error');
      error.stack = undefined;
      logger.error('test error message', 'test-lib', 'test-func', error);

      expect(mockWinstonLogger.error).toHaveBeenCalledWith(
        'test error message',
        expect.objectContaining({
          library: 'test-lib',
          function: 'test-func',
          error,
        })
      );
    });

    it('should handle no error provided', () => {
      logger.error('test error message', 'test-lib', 'test-func');

      expect(mockWinstonLogger.error).toHaveBeenCalledWith(
        'test error message',
        expect.objectContaining({
          library: 'test-lib',
          function: 'test-func',
        })
      );
    });
  });

  describe('specialized logging methods', () => {
    describe('logApiCall', () => {
      it('should log successful API call', () => {
        logger.logApiCall('GET', 'https://api.test.com/users', 150, 200);

        expect(mockWinstonLogger.info).toHaveBeenCalledWith(
          'API GET https://api.test.com/users completed in 150ms with status 200',
          expect.objectContaining({
            library: 'http-client',
            function: 'request',
            method: 'GET',
            url: 'https://api.test.com/users',
            duration: 150,
            statusCode: 200,
            type: 'api-call',
          })
        );
      });

      it('should log failed API call with error', () => {
        const error = new Error('Network error');
        logger.logApiCall(
          'POST',
          'https://api.test.com/users',
          500,
          undefined,
          'test-lib',
          error
        );

        expect(mockWinstonLogger.error).toHaveBeenCalledWith(
          'API POST https://api.test.com/users failed in 500ms',
          expect.objectContaining({
            library: 'test-lib',
            function: 'request',
            method: 'POST',
            url: 'https://api.test.com/users',
            duration: 500,
            type: 'api-call',
            error,
          })
        );
      });

      it('should use default library name', () => {
        logger.logApiCall('GET', 'https://api.test.com/users', 100, 200);

        expect(mockWinstonLogger.info).toHaveBeenCalledWith(
          expect.any(String),
          expect.objectContaining({
            library: 'http-client',
          })
        );
      });
    });

    describe('logFunctionCall', () => {
      it('should log successful function call', () => {
        logger.logFunctionCall(
          'testFunction',
          'test-lib',
          75,
          ['arg1', 'arg2'],
          'result'
        );

        expect(mockWinstonLogger.info).toHaveBeenCalledWith(
          'Function testFunction completed in 75ms',
          expect.objectContaining({
            library: 'test-lib',
            function: 'testFunction',
            duration: 75,
            args: ['arg1', 'arg2'],
            result: 'result',
            type: 'function-call',
          })
        );
      });

      it('should log failed function call with error', () => {
        const error = new Error('Function error');
        logger.logFunctionCall(
          'testFunction',
          'test-lib',
          50,
          undefined,
          undefined,
          error
        );

        expect(mockWinstonLogger.error).toHaveBeenCalledWith(
          'Function testFunction failed in 50ms',
          expect.objectContaining({
            library: 'test-lib',
            function: 'testFunction',
            duration: 50,
            type: 'function-call',
            error,
          })
        );
      });

      it('should handle function call without args and result', () => {
        logger.logFunctionCall('testFunction', 'test-lib', 25);

        expect(mockWinstonLogger.info).toHaveBeenCalledWith(
          'Function testFunction completed in 25ms',
          expect.objectContaining({
            library: 'test-lib',
            function: 'testFunction',
            duration: 25,
            type: 'function-call',
          })
        );
      });

      it('should not include args and result when metadata disabled', () => {
        const logger = new Logger({ includeMetadata: false });
        logger.logFunctionCall(
          'testFunction',
          'test-lib',
          25,
          ['args'],
          'result'
        );

        expect(mockWinstonLogger.info).toHaveBeenCalledWith(
          expect.any(String),
          expect.objectContaining({
            library: 'test-lib',
            function: 'testFunction',
            duration: 25,
            type: 'function-call',
          })
        );
        expect(mockWinstonLogger.info).not.toHaveBeenCalledWith(
          expect.any(String),
          expect.objectContaining({
            args: expect.any(Array),
          })
        );
      });
    });
  });

  describe('advanced Winston features', () => {
    it('should add custom transport', () => {
      const mockTransport = { level: 'debug', close: jest.fn() };
      logger.addTransport(mockTransport);

      expect(mockWinstonLogger.add).toHaveBeenCalledWith(mockTransport);
    });

    it('should remove transport', () => {
      const mockTransport = { level: 'debug', close: jest.fn() };
      logger.removeTransport(mockTransport);

      expect(mockWinstonLogger.remove).toHaveBeenCalledWith(mockTransport);
    });

    it('should create child logger', () => {
      const mockChildLogger = { info: jest.fn() };
      mockWinstonLogger.child.mockReturnValue(mockChildLogger);

      const child = logger.child({ service: 'child-service' });

      expect(mockWinstonLogger.child).toHaveBeenCalledWith({
        service: 'child-service',
      });
      expect(child).toBe(mockChildLogger);
    });

    it('should query logs', async () => {
      const mockResults = [{ message: 'test log' }];
      mockWinstonLogger.query.mockImplementation((options, callback) => {
        callback(null, mockResults);
      });

      const results = await logger.query({ limit: 10 });

      expect(mockWinstonLogger.query).toHaveBeenCalledWith(
        { limit: 10 },
        expect.any(Function)
      );
      expect(results).toEqual(mockResults);
    });

    it('should handle query errors', async () => {
      const mockError = new Error('Query failed');
      mockWinstonLogger.query.mockImplementation((options, callback) => {
        callback(mockError, null);
      });

      await expect(logger.query({ limit: 10 })).rejects.toThrow('Query failed');
    });

    it('should stream logs', () => {
      const mockStream = { on: jest.fn() };
      mockWinstonLogger.stream.mockReturnValue(mockStream);

      const stream = logger.stream({ start: 0 });

      expect(mockWinstonLogger.stream).toHaveBeenCalledWith({ start: 0 });
      expect(stream).toBe(mockStream);
    });

    it('should set log level at runtime', () => {
      logger.setLevel('debug');

      expect(logger.getConfig().level).toBe('debug');
      expect(mockWinstonLogger.level).toBe('debug');
    });

    it('should get configuration', () => {
      const config = logger.getConfig();

      expect(config).toEqual({
        level: 'info',
        includeMetadata: true,
        customFields: {},
      });
      expect(config).toBeReadOnly();
    });

    it('should get underlying Winston logger', () => {
      const winstonLogger = logger.getWinstonLogger();

      expect(winstonLogger).toBe(mockWinstonLogger);
    });

    it('should close logger', () => {
      logger.close();

      expect(mockWinstonLogger.close).toHaveBeenCalled();
    });
  });

  describe('default logger', () => {
    it('should export default logger instance', () => {
      const { defaultLogger } = require('../logger');

      expect(defaultLogger).toBeInstanceOf(Logger);
    });
  });

  describe('Winston exports', () => {
    it('should export Winston and DailyRotateFile', () => {
      const { winston, DailyRotateFile } = require('../logger');

      expect(winston).toBeDefined();
      expect(DailyRotateFile).toBeDefined();
    });
  });
});
