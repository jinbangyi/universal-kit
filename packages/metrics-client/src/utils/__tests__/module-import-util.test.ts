/* eslint-disable @typescript-eslint/explicit-function-return-type */
import { HttpModuleOptions, HttpModuleOptionsFactory } from '@nestjs/axios';
import { getHttpModule } from '../module-import-util.js';
import { AxiosWrapper } from '../../http-client/axios-wrapper.js';

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

// Mock AppConfigService for the test
class MockAppConfigService {
  get(key: string) {
    const config: Record<string, any> = {
      HOSTS: {
        CGK: 'https://api.coingecko-conf.com',
      },
      KEYS: {
        CGK: 'test-api-key-12345',
      },
    };
    return config[key];
  }
}

// Test implementation of HttpModuleOptionsFactory
class CgkApiConfigService implements HttpModuleOptionsFactory {
  private readonly _appConfig: MockAppConfigService;

  constructor(appConfig: MockAppConfigService) {
    this._appConfig = appConfig;
  }

  createHttpOptions(): HttpModuleOptions {
    return {
      baseURL: this._appConfig.get('HOSTS').CGK,
      headers: {
        accept: 'application/json',
      },
      timeout: 1000 * 60,
      params: {
        x_cg_pro_api_key: this._appConfig.get('KEYS').CGK,
      },
    };
  }
}

describe('getHttpModule with useClass', () => {
  it('should create AxiosWrapper with static config when useClass is provided', () => {
    // When useClass is provided along with static config,
    // the AxiosWrapper should use the static config
    const module = getHttpModule(
      {
        provider: 'coingecko',
        apiKeyHeader: 'x-cg-pro-api-key',
      },
      {
        baseURL: 'https://api.coingecko.com',
        timeout: 60000,
        maxRedirects: 5,
        useClass: CgkApiConfigService,
      },
    );

    // Verify the module was created
    expect(module).toBeDefined();
    expect(module.providers).toBeDefined();
    expect(Array.isArray(module.providers)).toBe(true);

    // Find the AXIOS_INSTANCE_TOKEN provider
    const axiosProvider = module.providers?.find(
      (p: any) => typeof p === 'object' && p.provide === 'AXIOS_INSTANCE_TOKEN',
    );

    // Verify the provider exists and uses useFactory (not useValue)
    // because useClass configurations are resolved dynamically by NestJS DI
    expect(axiosProvider).toBeDefined();
    expect(axiosProvider).toHaveProperty('useFactory');
    expect(typeof (axiosProvider as any).useFactory).toBe('function');
  });

  it('should handle useClass provider with dependencies', () => {
    // Test with a class that has constructor dependencies
    const appConfig = new MockAppConfigService();

    // Manually instantiate to test the config service
    const configService = new CgkApiConfigService(appConfig);
    const httpOptions = configService.createHttpOptions();

    expect(httpOptions).toBeDefined();
    expect(httpOptions.baseURL).toBe('https://api.coingecko-conf.com');
    expect(httpOptions.timeout).toBe(60000);
    expect(httpOptions.params).toEqual({
      x_cg_pro_api_key: 'test-api-key-12345',
    });
  });

  it('should merge static config with useClass config', () => {
    // If you provide static config WITH useClass, the static config is used for AxiosWrapper
    const module = getHttpModule(
      {
        provider: 'coingecko',
        apiKeyHeader: 'x-cg-pro-api-key',
      },
      {
        baseURL: 'https://api.coingecko.com',
        timeout: 60000,
        maxRedirects: 5,
        useClass: CgkApiConfigService,
      },
    );

    const axiosProvider = module.providers?.find(
      (p: any) => typeof p === 'object' && p.provide === 'AXIOS_INSTANCE_TOKEN',
    );

    // When useClass is provided, the provider uses useFactory instead of useValue
    // The factory will be called by NestJS DI with the resolved config
    expect(axiosProvider).toHaveProperty('useFactory');
    expect(typeof (axiosProvider as any).useFactory).toBe('function');

    // Verify the factory has the correct inject dependencies
    expect(axiosProvider).toHaveProperty('inject');
    expect(Array.isArray((axiosProvider as any).inject)).toBe(true);
  });

  it("should handle useClass's options", async () => {
    class SimpleConfigService implements HttpModuleOptionsFactory {
      createHttpOptions(): HttpModuleOptions {
        return {
          baseURL: 'https://example-conf.com',
          timeout: 6000,
        };
      }
    }

    const module = getHttpModule(
      {
        provider: 'example',
      },
      {
        // When using useClass, the axios instance is created via a factory
        // that will be resolved by NestJS DI at runtime
        useClass: SimpleConfigService,
      },
    );

    const axiosProvider = module.providers?.find(
      (p: any) => typeof p === 'object' && p.provide === 'AXIOS_INSTANCE_TOKEN',
    );

    // Should have a factory function that will create the wrapped axios instance
    expect(axiosProvider).toHaveProperty('useFactory');
    expect(typeof (axiosProvider as any).useFactory).toBe('function');

    // The factory should have proper inject tokens to receive the HttpModule config
    expect(axiosProvider).toHaveProperty('inject');
    expect(Array.isArray((axiosProvider as any).inject)).toBe(true);
  });

  it('should use static config with useClass', () => {
    class FailingConfigService implements HttpModuleOptionsFactory {
      constructor() {
        throw new Error('Constructor failed');
      }

      createHttpOptions(): HttpModuleOptions {
        return {
          baseURL: 'https://should-not-reach.com',
        };
      }
    }

    const module = getHttpModule(
      {
        provider: 'failing',
      },
      {
        baseURL: 'https://fallback.com',
        timeout: 3000,
        useClass: FailingConfigService,
      },
    );

    const axiosProvider = module.providers?.find(
      (p: any) => typeof p === 'object' && p.provide === 'AXIOS_INSTANCE_TOKEN',
    );

    // Should have a factory that will merge static config with class config
    expect(axiosProvider).toHaveProperty('useFactory');
    expect(typeof (axiosProvider as any).useFactory).toBe('function');

    // Verify the factory has the correct inject dependencies
    expect(axiosProvider).toHaveProperty('inject');
    expect(Array.isArray((axiosProvider as any).inject)).toBe(true);
  });
});

describe('getHttpModule with register (static config)', () => {
  it('should create module with static configuration only', () => {
    const module = getHttpModule(
      {
        provider: 'test-provider',
      },
      {
        baseURL: 'https://api.example.com',
        timeout: 5000,
        headers: {
          'Content-Type': 'application/json',
        },
      },
    );

    expect(module).toBeDefined();
    expect(module.providers).toBeDefined();

    const axiosProvider = module.providers?.find(
      (p: any) => typeof p === 'object' && p.provide === 'AXIOS_INSTANCE_TOKEN',
    );

    const axiosInstance = (axiosProvider as any).useValue;
    expect(axiosInstance.defaults.baseURL).toBe('https://api.example.com');
    expect(axiosInstance.defaults.timeout).toBe(5000);
  });

  it('should use default provider name when not specified', () => {
    // This should use the caller parent dir name
    const module = getHttpModule(
      {},
      {
        baseURL: 'https://api.example.com',
      },
    );

    expect(module).toBeDefined();
    expect(module.providers).toBeDefined();
  });

  it('should accept custom apiKeyHeader option', () => {
    const module = getHttpModule(
      {
        provider: 'custom-api',
        apiKeyHeader: 'X-Custom-API-Key',
      },
      {
        baseURL: 'https://custom-api.com',
      },
    );

    expect(module).toBeDefined();
  });

  it('should accept custom redactedHeaders option', () => {
    const module = getHttpModule(
      {
        provider: 'secure-api',
        redactedHeaders: ['X-Secret-Token', 'X-Private-Key'],
      },
      {
        baseURL: 'https://secure-api.com',
      },
    );

    expect(module).toBeDefined();
  });
});

describe('getHttpModule with registerAsync (useFactory)', () => {
  it('should create module with async factory', () => {
    const module = getHttpModule(
      {
        provider: 'factory-provider',
      },
      {
        useFactory: async () => ({
          baseURL: 'https://factory.example.com',
          timeout: 10000,
        }),
      },
    );

    expect(module).toBeDefined();
    expect(module.providers).toBeDefined();
  });

  it('should merge static config with factory config', () => {
    const module = getHttpModule(
      {
        provider: 'merged-provider',
      },
      {
        timeout: 5000,
        maxRedirects: 3,
        useFactory: async () => ({
          baseURL: 'https://factory.example.com',
        }),
      },
    );

    expect(module).toBeDefined();

    // Check that factory was wrapped
    const factoryProvider = module.providers?.find(
      (p: any) => typeof p === 'object' && p.useFactory,
    );
    expect(factoryProvider).toBeDefined();
  });

  it('should handle factory with dependencies via inject', () => {
    class ConfigService {
      getApiUrl() {
        return 'https://injected.example.com';
      }
    }

    const module = getHttpModule(
      {
        provider: 'injected-provider',
      },
      {
        imports: [],
        inject: [ConfigService],
        useFactory: async (config: ConfigService) => ({
          baseURL: config.getApiUrl(),
          timeout: 8000,
        }),
      },
    );

    expect(module).toBeDefined();
    expect(module.providers).toBeDefined();
  });

  it('should preserve global option with factory', () => {
    const module = getHttpModule(
      {
        provider: 'global-provider',
      },
      {
        global: true,
        useFactory: async () => ({
          baseURL: 'https://global.example.com',
        }),
      },
    );

    expect(module).toBeDefined();
    expect(module.global).toBe(true);
  });
});

describe('getHttpModule with registerAsync (useExisting)', () => {
  it('should create module with useExisting', () => {
    class ExistingConfigService implements HttpModuleOptionsFactory {
      createHttpOptions(): HttpModuleOptions {
        return {
          baseURL: 'https://existing.example.com',
          timeout: 7000,
        };
      }
    }

    const module = getHttpModule(
      {
        provider: 'existing-provider',
      },
      {
        useExisting: ExistingConfigService,
      },
    );

    expect(module).toBeDefined();
    expect(module.providers).toBeDefined();
  });

  it('should handle useExisting with static config', () => {
    class ExistingConfigService implements HttpModuleOptionsFactory {
      createHttpOptions(): HttpModuleOptions {
        return {
          baseURL: 'https://existing.example.com',
        };
      }
    }

    const module = getHttpModule(
      {
        provider: 'existing-static-provider',
      },
      {
        baseURL: 'https://static.example.com',
        timeout: 9000,
        useExisting: ExistingConfigService,
      },
    );

    expect(module).toBeDefined();

    const axiosProvider = module.providers?.find(
      (p: any) => typeof p === 'object' && p.provide === 'AXIOS_INSTANCE_TOKEN',
    );

    // Should have a factory for async resolution
    expect(axiosProvider).toHaveProperty('useFactory');
    expect(typeof (axiosProvider as any).useFactory).toBe('function');

    // Verify the factory has the correct inject dependencies
    expect(axiosProvider).toHaveProperty('inject');
    expect(Array.isArray((axiosProvider as any).inject)).toBe(true);
  });
});

describe('getHttpModule with custom AxiosWrapper', () => {
  it('should accept pre-configured AxiosWrapper instance', () => {
    const customWrapper = new AxiosWrapper(
      {
        provider: 'custom-wrapper',
        apiKeyHeader: 'X-Custom-Key',
      },
      undefined,
      {
        baseURL: 'https://custom-wrapper.com',
        timeout: 15000,
      },
    );

    const module = getHttpModule(
      {
        apiKeyHeader: 'X-Different-Key', // This should be ignored
      },
      {
        baseURL: 'https://different.com', // This should be ignored
      },
      customWrapper,
    );

    expect(module).toBeDefined();

    const axiosProvider = module.providers?.find(
      (p: any) => typeof p === 'object' && p.provide === 'AXIOS_INSTANCE_TOKEN',
    );
    const axiosInstance = (axiosProvider as any).useValue;

    // Should use the custom wrapper's config
    expect(axiosInstance).toBe(customWrapper.getAxiosInstance());
  });

  it('should use provider name from AxiosWrapper when not specified', () => {
    const customWrapper = new AxiosWrapper(
      {
        provider: 'wrapper-provider',
      },
      undefined,
      {
        baseURL: 'https://wrapper.com',
      },
    );

    const module = getHttpModule(
      {
        // No provider specified
      },
      {},
      customWrapper,
    );

    expect(module).toBeDefined();
  });
});

describe('getHttpModule with custom HttpModule', () => {
  it('should accept custom HttpModule class', () => {
    // Mock a custom HttpModule
    const CustomHttpModule: any = {
      register: jest.fn(() => ({
        module: CustomHttpModule,
        providers: [
          {
            provide: 'AXIOS_INSTANCE_TOKEN',
            useValue: {},
          },
        ],
      })),
      registerAsync: jest.fn(() => ({
        module: CustomHttpModule,
        providers: [],
      })),
    };

    const module = getHttpModule(
      {
        provider: 'custom-module-provider',
        HttpModule: CustomHttpModule,
      },
      {
        baseURL: 'https://custom-module.com',
      },
    );

    expect(module).toBeDefined();
    expect(CustomHttpModule.register).toHaveBeenCalled();
  });
});

describe('getHttpModule edge cases', () => {
  it('should handle empty options', () => {
    const module = getHttpModule(
      {
        provider: 'minimal-provider',
      },
    );

    expect(module).toBeDefined();
    expect(module.providers).toBeDefined();
  });

  it('should use caller directory as provider when not specified', () => {
    // When no provider is specified and no axiosWrapper is provided,
    // it should derive the provider from the caller's parent directory
    const module = getHttpModule({});

    expect(module).toBeDefined();
    expect(module.providers).toBeDefined();
  });

  it('should handle complex configuration with all options', () => {
    const module = getHttpModule(
      {
        provider: 'complex-provider',
        apiKeyHeader: 'X-API-Key',
        apiKeyQueryParam: 'apikey',
        redactedHeaders: ['X-Secret', 'Authorization'],
      },
      {
        baseURL: 'https://complex.example.com',
        timeout: 20000,
        headers: {
          'User-Agent': 'test-agent',
        },
        maxRedirects: 10,
        validateStatus: (status) => status < 500,
      },
    );

    expect(module).toBeDefined();

    const axiosProvider = module.providers?.find(
      (p: any) => typeof p === 'object' && p.provide === 'AXIOS_INSTANCE_TOKEN',
    );
    const axiosInstance = (axiosProvider as any).useValue;

    expect(axiosInstance.defaults.baseURL).toBe('https://complex.example.com');
    expect(axiosInstance.defaults.timeout).toBe(20000);
    expect(axiosInstance.defaults.maxRedirects).toBe(10);
  });

  it('should preserve module metadata', () => {
    const module = getHttpModule(
      {
        provider: 'metadata-provider',
      },
      {
        global: true,
        baseURL: 'https://metadata.example.com',
      },
    );

    expect(module).toBeDefined();
    expect(module.module).toBeDefined();
  });

  it('should handle apiKeyQueryParam option', () => {
    const module = getHttpModule(
      {
        provider: 'query-param-provider',
        apiKeyQueryParam: 'api_key',
      },
      {
        baseURL: 'https://query-param.example.com',
      },
    );

    expect(module).toBeDefined();
  });
});

