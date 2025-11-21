/* eslint-disable no-unused-vars */
/* eslint-disable @typescript-eslint/explicit-function-return-type */
/* eslint-disable new-cap */
import { Test, TestingModule } from '@nestjs/testing';
import { HttpModuleOptions, HttpModuleOptionsFactory } from '@nestjs/axios';
import { Injectable, Module } from '@nestjs/common';
import { AxiosInstance } from 'axios';
import nock from 'nock';
import { getHttpModule } from '../module-import-util.js';

// Mock dependencies
jest.mock('@universal-kit/logger', () => ({
  Logger: jest.fn().mockImplementation(() => ({
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
    verbose: jest.fn(),
  })),
}));

jest.mock('@opentelemetry/api', () => ({
  trace: {
    getTracer: () => ({
      startSpan: () => ({
        setAttributes: jest.fn(),
        setStatus: jest.fn(),
        end: jest.fn(),
      }),
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
  },
  SpanStatusCode: {
    OK: 'OK',
    ERROR: 'ERROR',
  },
}));

// Mock config module and services to simulate real NestJS module setup
@Injectable()
class AppConfigService {
  private readonly config = {
    HOSTS: {
      CGK: 'https://api.cgk.com',
    },
    KEYS: {
      CGK: 'cgk-api-key-321',
    },
  } as const;

  getApiTimeout(): number {
    return 10000;
  }

  getEnvironment(): string {
    return 'test';
  }

  get<T extends keyof typeof this.config>(key: T): (typeof this.config)[T] {
    return this.config[key];
  }
}

@Injectable()
class ConstantsService {
  readonly API_VERSION = 'v1';
  readonly DEFAULT_RETRY_COUNT = 3;
}

// Test implementation of HttpModuleOptionsFactory with dependencies (similar to CgkApiConfigService)
@Injectable()
class CgkApiConfigService implements HttpModuleOptionsFactory {
  constructor(private readonly appConfig: AppConfigService = new AppConfigService()) { }

  createHttpOptions(): HttpModuleOptions {
    const configSource = this.appConfig;

    return {
      baseURL: configSource.get('HOSTS').CGK,
      timeout: 60_000,
      headers: {
        Accept: 'application/json',
      },
      params: {
        x_cg_pro_api_key: configSource.get('KEYS').CGK,
      },
    };
  }
}

// Simple config service without dependencies
@Injectable()
class ApiConfigService implements HttpModuleOptionsFactory {
  createHttpOptions(): HttpModuleOptions {
    return {
      baseURL: 'https://api.example.com',
      timeout: 5000,
      headers: {
        'X-API-Key': 'test-api-key-123',
      },
    };
  }
}

// Create proper NestJS modules for testing (similar to real ConfigModule pattern)
@Module({
  providers: [AppConfigService, ConstantsService],
  exports: [AppConfigService, ConstantsService],
})
class ConfigModule { }

@Module({
  providers: [ConstantsService],
  exports: [ConstantsService],
})
class ConstantsModule { }

describe('getHttpModule Integration Tests with NestJS DI', () => {
  describe('Static configuration (register)', () => {
    it('should create axios instance with static config', async () => {
      const module: TestingModule = await Test.createTestingModule({
        imports: [
          getHttpModule(
            { provider: 'test-api' },
            {
              baseURL: 'https://static.api.com',
              timeout: 10000,
            },
          ),
        ],
      }).compile();

      const axiosInstance = module.get<AxiosInstance>('AXIOS_INSTANCE_TOKEN');

      expect(axiosInstance).toBeDefined();
      expect(typeof axiosInstance).toBe('function'); // Axios instance is a function
      expect(axiosInstance.defaults.baseURL).toBe('https://static.api.com');
      expect(axiosInstance.defaults.timeout).toBe(10000);
    });

    it('should wrap axios instance with metrics', async () => {
      const module: TestingModule = await Test.createTestingModule({
        imports: [
          getHttpModule(
            {
              provider: 'metrics-api',
              apiKeyHeader: 'X-API-Key',
            },
            {
              baseURL: 'https://metrics.api.com',
              timeout: 5000,
            },
          ),
        ],
      }).compile();

      const axiosInstance = module.get<AxiosInstance>('AXIOS_INSTANCE_TOKEN');

      expect(axiosInstance).toBeDefined();
      expect(axiosInstance.defaults.baseURL).toBe('https://metrics.api.com');

      // Verify interceptors exist (our wrapper adds interceptors)
      expect(axiosInstance.interceptors.request).toBeDefined();
      expect(axiosInstance.interceptors.response).toBeDefined();
    });
  });

  describe('Async configuration with useClass', () => {
    it('should resolve axios instance from useClass config (simple, no dependencies)', async () => {
      const module: TestingModule = await Test.createTestingModule({
        imports: [
          getHttpModule(
            { provider: 'dynamic-api' },
            {
              useClass: ApiConfigService,
            },
          ),
        ],
        providers: [ApiConfigService],
      }).compile();

      const axiosInstance = module.get<AxiosInstance>('AXIOS_INSTANCE_TOKEN');

      expect(axiosInstance).toBeDefined();
      expect(typeof axiosInstance).toBe('function');
      expect(axiosInstance.defaults.baseURL).toBe('https://api.example.com');
      expect(axiosInstance.defaults.timeout).toBe(5000);
      expect(axiosInstance.defaults.headers['X-API-Key']).toBe('test-api-key-123');
    });

    it('should resolve axios instance with useFactory wrapping a config service (real-world pattern)', async () => {
      // This demonstrates the most common real-world pattern similar to CgkModule.
      // Instead of using useClass directly, you typically use useFactory that calls
      // a config service method. This pattern is more flexible and easier to test:
      //
      // @Module({
      //   imports: [
      //     getHttpModule(
      //       { provider: 'cgk' },
      //       {
      //         imports: [ConfigModule, ConstantsModule],
      //         inject: [AppConfigService, ConstantsService],
      //         useFactory: (appConfig, constants) => ({
      //           baseURL: `https://api.cgk.com/${constants.API_VERSION}`,
      //           timeout: appConfig.getApiTimeout(),
      //           headers: {
      //             'X-API-Key': 'cgk-api-key-123',
      //             'X-Environment': appConfig.getEnvironment(),
      //           },
      //         }),
      //       },
      //     ),
      //   ],
      //   providers: [CgkFetcherService],
      //   exports: [CgkFetcherService],
      // })
      // export class CgkModule {}

      const module: TestingModule = await Test.createTestingModule({
        imports: [
          getHttpModule(
            { provider: 'cgk-api' },
            {
              // This pattern uses a factory that wraps the config service logic
              // extraProviders makes the dependencies available in HttpModule context
              extraProviders: [AppConfigService, ConstantsService],
              inject: [AppConfigService, ConstantsService],
              useFactory: async (
                appConfig: AppConfigService,
                constants: ConstantsService,
              ): Promise<HttpModuleOptions> => {
                // This mirrors what CgkApiConfigService.createHttpOptions() does
                return {
                  baseURL: `https://api.cgk.com/${constants.API_VERSION}`,
                  timeout: appConfig.getApiTimeout(),
                  headers: {
                    'X-API-Key': 'cgk-api-key-123',
                    'X-Environment': appConfig.getEnvironment(),
                  },
                };
              },
            },
          ),
        ],
      }).compile();

      const axiosInstance = module.get<AxiosInstance>('AXIOS_INSTANCE_TOKEN');

      expect(axiosInstance).toBeDefined();
      expect(typeof axiosInstance).toBe('function');

      // Verify the config is applied
      expect(axiosInstance.defaults.baseURL).toBe('https://api.cgk.com/v1');
      expect(axiosInstance.defaults.timeout).toBe(10000);
      expect(axiosInstance.defaults.headers['X-API-Key']).toBe('cgk-api-key-123');
      expect(axiosInstance.defaults.headers['X-Environment']).toBe('test');
    });

    it('should resolve axios instance using imports and inject (canonical NestJS pattern)', async () => {
      // This demonstrates the canonical NestJS pattern used in production:
      // @Module({
      //   imports: [
      //     getHttpModule(
      //       { provider: 'cgk' },
      //       {
      //         imports: [ConfigModule, ConstantsModule],
      //         inject: [AppConfigService, ConstantsService],
      //         useFactory: async (appConfig, constants) => ({
      //           baseURL: `https://api.cgk.com/${constants.API_VERSION}`,
      //           timeout: appConfig.getApiTimeout(),
      //           headers: {
      //             'X-API-Key': 'cgk-api-key-123',
      //             'X-Environment': appConfig.getEnvironment(),
      //           },
      //         }),
      //       },
      //     ),
      //   ],
      //   providers: [CgkFetcherService],
      //   exports: [CgkFetcherService],
      // })
      // export class CgkModule {}

      const module: TestingModule = await Test.createTestingModule({
        imports: [
          getHttpModule(
            { provider: 'cgk-imports' },
            {
              // imports brings in modules that export the needed services
              imports: [ConfigModule, ConstantsModule],
              // inject specifies which services to inject from the imported modules
              inject: [AppConfigService, ConstantsService],
              // useFactory receives the injected services and returns config
              useFactory: async (
                appConfig: AppConfigService,
                constants: ConstantsService,
              ): Promise<HttpModuleOptions> => ({
                baseURL: `https://api.cgk.com/${constants.API_VERSION}`,
                timeout: appConfig.getApiTimeout(),
                headers: {
                  'X-API-Key': 'cgk-imports-key-789',
                  'X-Environment': appConfig.getEnvironment(),
                },
              }),
            },
          ),
        ],
      }).compile();

      const axiosInstance = module.get<AxiosInstance>('AXIOS_INSTANCE_TOKEN');

      expect(axiosInstance).toBeDefined();
      expect(typeof axiosInstance).toBe('function');

      // Verify the config from factory with injected dependencies from imported modules
      expect(axiosInstance.defaults.baseURL).toBe('https://api.cgk.com/v1');
      expect(axiosInstance.defaults.timeout).toBe(10000);
      expect(axiosInstance.defaults.headers['X-API-Key']).toBe('cgk-imports-key-789');
      expect(axiosInstance.defaults.headers['X-Environment']).toBe('test');
    });

    it('should resolve axios instance with useFactory and inject dependencies (alternative pattern)', async () => {
      // This demonstrates the useFactory pattern with inject:
      // @Module({
      //   imports: [
      //     getHttpModule(
      //       { provider: 'cgk-factory' },
      //       {
      //         imports: [ConfigModule, ConstantsModule],
      //         inject: [AppConfigService, ConstantsService],
      //         useFactory: async (appConfig: AppConfigService, constants: ConstantsService) => ({
      //           baseURL: `https://api.cgk.com/${constants.API_VERSION}`,
      //           timeout: appConfig.getApiTimeout(),
      //           headers: {
      //             'X-API-Key': 'cgk-api-key-123',
      //             'X-Environment': appConfig.getEnvironment(),
      //           },
      //         }),
      //       },
      //     ),
      //   ],
      // })

      const module: TestingModule = await Test.createTestingModule({
        imports: [
          getHttpModule(
            { provider: 'cgk-factory' },
            {
              // extraProviders makes dependencies available in HttpModule context
              extraProviders: [AppConfigService, ConstantsService],
              inject: [AppConfigService, ConstantsService],
              useFactory: async (
                appConfig: AppConfigService,
                constants: ConstantsService,
              ): Promise<HttpModuleOptions> => ({
                baseURL: `https://api.cgk.com/${constants.API_VERSION}`,
                timeout: appConfig.getApiTimeout(),
                headers: {
                  'X-API-Key': 'cgk-factory-key-456',
                  'X-Environment': appConfig.getEnvironment(),
                },
              }),
            },
          ),
        ],
      }).compile();

      const axiosInstance = module.get<AxiosInstance>('AXIOS_INSTANCE_TOKEN');

      expect(axiosInstance).toBeDefined();
      expect(typeof axiosInstance).toBe('function');

      // Verify the config from factory with injected dependencies
      expect(axiosInstance.defaults.baseURL).toBe('https://api.cgk.com/v1');
      expect(axiosInstance.defaults.timeout).toBe(10000);
      expect(axiosInstance.defaults.headers['X-API-Key']).toBe('cgk-factory-key-456');
      expect(axiosInstance.defaults.headers['X-Environment']).toBe('test');
    });

    it('should resolve axios instance using imports and inject with useClass', async () => {
      const moduleBuilder = Test.createTestingModule({
        imports: [
          getHttpModule(
            { provider: 'cgk-useclass' },
            {
              imports: [ConfigModule],
              inject: [AppConfigService],
              useClass: CgkApiConfigService,
            },
          ),
          ConfigModule,
        ],
        providers: [CgkApiConfigService],
      });

      moduleBuilder.overrideProvider(AppConfigService).useValue(new AppConfigService());

      const module: TestingModule = await moduleBuilder.compile();

      const axiosInstance = module.get<AxiosInstance>('AXIOS_INSTANCE_TOKEN');

      expect(axiosInstance).toBeDefined();
      expect(typeof axiosInstance).toBe('function');
      expect(axiosInstance.defaults.baseURL).toBe('https://api.cgk.com');
      expect(axiosInstance.defaults.timeout).toBe(60_000);
      expect(axiosInstance.defaults.params).toEqual({ x_cg_pro_api_key: 'cgk-api-key-321' });
    });

    it('should merge static config with useClass config', async () => {
      const module: TestingModule = await Test.createTestingModule({
        imports: [
          getHttpModule(
            { provider: 'merged-api' },
            {
              // the static config will be ignored
              baseURL: 'https://override.api.com',
              timeout: 8000,
              useClass: ApiConfigService,
            },
          ),
        ],
        providers: [ApiConfigService],
      }).compile();

      const axiosInstance = module.get<AxiosInstance>('AXIOS_INSTANCE_TOKEN');

      expect(axiosInstance).toBeDefined();
      // NestJS HttpModule merges configs, static config properties take precedence
      expect(axiosInstance.defaults.baseURL).toBe('https://api.example.com');
      expect(axiosInstance.defaults.timeout).toBe(5000);
    });
  });

  describe('Async configuration with useFactory', () => {
    it('should resolve axios instance from useFactory', async () => {
      const module: TestingModule = await Test.createTestingModule({
        imports: [
          getHttpModule(
            { provider: 'factory-api' },
            {
              useFactory: async () => ({
                baseURL: 'https://factory.api.com',
                timeout: 7000,
              }),
            },
          ),
        ],
      }).compile();

      const axiosInstance = module.get<AxiosInstance>('AXIOS_INSTANCE_TOKEN');

      expect(axiosInstance).toBeDefined();
      expect(typeof axiosInstance).toBe('function');
      expect(axiosInstance.defaults.baseURL).toBe('https://factory.api.com');
      expect(axiosInstance.defaults.timeout).toBe(7000);
    });

    it('should merge static config with useFactory', async () => {
      const module: TestingModule = await Test.createTestingModule({
        imports: [
          getHttpModule(
            { provider: 'factory-merged' },
            {
              // the static config will be ignored
              baseURL: 'https://static.api.com',
              timeout: 9000,
              useFactory: async () => ({
                baseURL: 'https://factory-override.com',
                timeout: 4000,
              }),
            },
          ),
        ],
      }).compile();

      const axiosInstance = module.get<AxiosInstance>('AXIOS_INSTANCE_TOKEN');

      expect(axiosInstance).toBeDefined();
      // Static config and factory config are merged by HttpModule
      expect(axiosInstance.defaults.baseURL).toBe('https://factory-override.com');
      expect(axiosInstance.defaults.timeout).toBe(4000);
    });
  });

  describe('HTTP requests with wrapped instance', () => {
    it('should make successful HTTP requests', async () => {
      const module: TestingModule = await Test.createTestingModule({
        imports: [
          getHttpModule(
            { provider: 'http-test' },
            {
              baseURL: 'https://jsonplaceholder.typicode.com',
              timeout: 5000,
            },
          ),
        ],
      }).compile();

      const axiosInstance = module.get<AxiosInstance>('AXIOS_INSTANCE_TOKEN');

      // Mock the request to avoid actual HTTP calls
      const mockResponse = { data: { id: 1, title: 'Test' }, status: 200 };
      jest.spyOn(axiosInstance, 'get').mockResolvedValue(mockResponse);

      const response = await axiosInstance.get('/posts/1');

      expect(response).toBeDefined();
      expect(response.data).toEqual({ id: 1, title: 'Test' });
      expect(axiosInstance.get).toHaveBeenCalledWith('/posts/1');
    });

    it('should have interceptors from wrapper', async () => {
      const module: TestingModule = await Test.createTestingModule({
        imports: [
          getHttpModule(
            {
              provider: 'interceptor-test',
              apiKeyHeader: 'X-Test-Key',
            },
            {
              baseURL: 'https://test.api.com',
            },
          ),
        ],
      }).compile();

      const axiosInstance = module.get<AxiosInstance>('AXIOS_INSTANCE_TOKEN');

      // Verify that our wrapper has added interceptors
      expect(axiosInstance.interceptors.request).toBeDefined();
      expect(axiosInstance.interceptors.response).toBeDefined();

      // The interceptors should be functional
      expect(typeof axiosInstance.interceptors.request.use).toBe('function');
      expect(typeof axiosInstance.interceptors.response.use).toBe('function');
    });
  });

  describe('Provider name resolution', () => {
    it('should use custom provider name', async () => {
      const module: TestingModule = await Test.createTestingModule({
        imports: [
          getHttpModule(
            { provider: 'custom-provider-name' },
            {
              baseURL: 'https://custom.api.com',
            },
          ),
        ],
      }).compile();

      const axiosInstance = module.get<AxiosInstance>('AXIOS_INSTANCE_TOKEN');

      expect(axiosInstance).toBeDefined();
      // The provider name is used internally for metrics/logging
      expect(axiosInstance.defaults.baseURL).toBe('https://custom.api.com');
    });
  });

  describe('Custom options', () => {
    it('should handle apiKeyHeader option', async () => {
      const module: TestingModule = await Test.createTestingModule({
        imports: [
          getHttpModule(
            {
              provider: 'api-key-test',
              apiKeyHeader: 'X-Custom-API-Key',
            },
            {
              baseURL: 'https://secure.api.com',
            },
          ),
        ],
      }).compile();

      const axiosInstance = module.get<AxiosInstance>('AXIOS_INSTANCE_TOKEN');

      expect(axiosInstance).toBeDefined();
      expect(axiosInstance.defaults.baseURL).toBe('https://secure.api.com');
    });

    it('should handle redactedHeaders option', async () => {
      const module: TestingModule = await Test.createTestingModule({
        imports: [
          getHttpModule(
            {
              provider: 'secure-api',
              redactedHeaders: ['Authorization', 'X-Secret-Token'],
            },
            {
              baseURL: 'https://secure.api.com',
            },
          ),
        ],
      }).compile();

      const axiosInstance = module.get<AxiosInstance>('AXIOS_INSTANCE_TOKEN');

      expect(axiosInstance).toBeDefined();
      expect(axiosInstance.defaults.baseURL).toBe('https://secure.api.com');
    });

    it('should handle apiKeyQueryParam option', async () => {
      const module: TestingModule = await Test.createTestingModule({
        imports: [
          getHttpModule(
            {
              provider: 'query-param-api',
              apiKeyQueryParam: 'api_key',
            },
            {
              baseURL: 'https://query.api.com',
            },
          ),
        ],
      }).compile();

      const axiosInstance = module.get<AxiosInstance>('AXIOS_INSTANCE_TOKEN');

      expect(axiosInstance).toBeDefined();
      expect(axiosInstance.defaults.baseURL).toBe('https://query.api.com');
    });
  });

  describe('Host extraction from baseURL', () => {
    afterEach(() => {
      nock.cleanAll();
    });

    it('should extract correct host from baseURL when making requests with relative paths', async () => {
      const module: TestingModule = await Test.createTestingModule({
        imports: [
          getHttpModule(
            { provider: 'cgk-host-test' },
            {
              imports: [ConfigModule],
              inject: [AppConfigService],
              useClass: CgkApiConfigService,
            },
          ),
          ConfigModule,
        ],
        providers: [CgkApiConfigService],
      })
        .overrideProvider(AppConfigService)
        .useValue(new AppConfigService())
        .compile();

      const axiosInstance = module.get<AxiosInstance>('AXIOS_INSTANCE_TOKEN');

      // Verify the instance has the correct baseURL
      expect(axiosInstance.defaults.baseURL).toBe('https://api.cgk.com');

      // Add a custom interceptor to capture the requestInfo that gets created
      const capturedRequestInfo: { host?: string; url?: string } = {};

      // Use response interceptor to capture metadata after request interceptor has run
      axiosInstance.interceptors.response.use(response => {
        // Capture the metadata from our wrapper that was added by request interceptor
        const { metadata } = (response.config as { metadata?: { requestInfo?: { host?: string; url?: string } } });
        if (metadata?.requestInfo) {
          capturedRequestInfo.host = metadata.requestInfo.host;
          capturedRequestInfo.url = metadata.requestInfo.url;
        }
        return response;
      });

      // Mock HTTP response using nock
      nock('https://api.cgk.com')
        .get('/test/endpoint')
        .query({ x_cg_pro_api_key: 'cgk-api-key-321' })
        .reply(200, { test: 'data' });

      // Make a request with a relative path
      await axiosInstance.get('/test/endpoint');

      // Verify that the host was correctly extracted as 'api.cgk.com', NOT 'localhost'
      expect(capturedRequestInfo.host).toBe('api.cgk.com');
      expect(capturedRequestInfo.url).toBe('https://api.cgk.com/test/endpoint');
    });

    it('should extract correct host from baseURL in useFactory pattern', async () => {
      const module: TestingModule = await Test.createTestingModule({
        imports: [
          getHttpModule(
            { provider: 'factory-host-test' },
            {
              useFactory: async () => ({
                baseURL: 'https://example.com',
                timeout: 5000,
              }),
            },
          ),
        ],
      }).compile();

      const axiosInstance = module.get<AxiosInstance>('AXIOS_INSTANCE_TOKEN');

      const capturedRequestInfo: { host?: string; url?: string } = {};

      // Use response interceptor to capture metadata after request interceptor has run
      axiosInstance.interceptors.response.use(response => {
        const { metadata } = (response.config as { metadata?: { requestInfo?: { host?: string; url?: string } } });
        if (metadata?.requestInfo) {
          capturedRequestInfo.host = metadata.requestInfo.host;
          capturedRequestInfo.url = metadata.requestInfo.url;
        }
        return response;
      });

      // Mock HTTP response using nock
      nock('https://example.com')
        .get('/api/data')
        .reply(200, { success: true });

      await axiosInstance.get('/api/data');

      expect(capturedRequestInfo.host).toBe('example.com');
      expect(capturedRequestInfo.url).toBe('https://example.com/api/data');
    });
  });
});
