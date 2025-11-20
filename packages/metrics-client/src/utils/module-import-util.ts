import {
  HttpModule as DefaultHttpModule,
  HttpModuleAsyncOptions,
  HttpModuleOptions,
} from '@nestjs/axios';
import { createRequire } from 'node:module';
import { AXIOS_INSTANCE_TOKEN } from '@nestjs/axios/dist/http.constants';
import { DynamicModule } from '@nestjs/common';
import { AxiosWrapper } from '../http-client/axios-wrapper.js';

/**
 * Attempts to resolve the HttpModule from the consumer's node_modules
 * to ensure we use the same instance and avoid multiple package installations
 */
function resolveConsumerHttpModule(): typeof DefaultHttpModule | undefined {
  try {
    const consumerRequire = createRequire(`${process.cwd()}/`);
    return consumerRequire('@nestjs/axios').HttpModule;
  } catch {
    return undefined;
  }
}

type HttpModuleConfig = HttpModuleOptions & Partial<HttpModuleAsyncOptions>;
type HttpModuleFactory = NonNullable<HttpModuleAsyncOptions['useFactory']>;

const ASYNC_ONLY_KEYS = [
  'imports',
  'inject',
  'extraProviders',
  'useExisting',
  'useClass',
  'useFactory',
] as const;
const ASYNC_ONLY_KEY_SET = new Set<keyof HttpModuleAsyncOptions>(ASYNC_ONLY_KEYS);
const ASYNC_KEYS_WITH_GLOBAL = [...ASYNC_ONLY_KEYS, 'global'] as const;

/**
 * Extracts only the static HTTP options from the config,
 * filtering out async-only properties
 */
function extractStaticHttpOptions(options?: HttpModuleConfig): HttpModuleOptions {
  if (!options) {
    return {};
  }

  const staticOptions: Partial<HttpModuleOptions> = {};

  for (const [key, value] of Object.entries(options)) {
    if (!ASYNC_ONLY_KEY_SET.has(key as keyof HttpModuleAsyncOptions)) {
      staticOptions[key as keyof HttpModuleOptions] = value as never;
    }
  }

  return staticOptions as HttpModuleOptions;
}

/**
 * Extracts only the async HTTP module options from the config
 */
function pickAsyncHttpModuleOptions(options?: HttpModuleConfig): HttpModuleAsyncOptions {
  if (!options) {
    return {};
  }

  const asyncOptions: Partial<HttpModuleAsyncOptions> = {};

  for (const key of ASYNC_KEYS_WITH_GLOBAL) {
    const value = options[key];
    if (value !== undefined) {
      asyncOptions[key] = value as never;
    }
  }

  return asyncOptions as HttpModuleAsyncOptions;
}

/**
 * Resolves the provider name from options, axiosWrapper, or caller directory
 */
function resolveProviderName(
  providerOption: string | undefined,
  axiosWrapper?: AxiosWrapper,
): string {
  if (providerOption) {
    return providerOption;
  }

  if (axiosWrapper) {
    return axiosWrapper.getProviderName();
  }

  // use parent dir name where call this function as provider
  // const callerProvider = getCallerParentDirName([]);
  // if (callerProvider) {
  //   return callerProvider;
  // }

  throw new Error('Provider name must be specified either in options or via axiosWrapper');
}

/**
 * Creates the appropriate HttpModule based on the configuration
 */
function createHttpModule(
  HttpModule: typeof DefaultHttpModule,
  staticHttpConfig: HttpModuleOptions,
  asyncHttpConfig: HttpModuleAsyncOptions,
  asyncFactory?: HttpModuleFactory,
  hasClassOrExisting?: boolean,
): DynamicModule {
  if (typeof asyncFactory === 'function') {
    // Use registerAsync with a factory that merges static and dynamic config
    return HttpModule.registerAsync({
      ...asyncHttpConfig,
      useFactory: async (...factoryArgs: Parameters<HttpModuleFactory>) => {
        const resolvedConfig = await asyncFactory(...factoryArgs);
        return {
          ...staticHttpConfig,
          ...resolvedConfig,
        };
      },
    });
  }

  if (hasClassOrExisting) {
    // Use registerAsync with useClass or useExisting
    return HttpModule.registerAsync(asyncHttpConfig);
  }

  // Use simple register for static configuration only
  return HttpModule.register(staticHttpConfig);
}

/**
 * Replaces the AXIOS_INSTANCE_TOKEN provider with our wrapped axios instance
 * For async configurations (useClass/useExisting/useFactory), this creates a factory
 * that wraps the axios instance dynamically when it's resolved by NestJS DI
 */
function injectWrappedAxiosInstance(
  module: DynamicModule,
  HttpModule: typeof DefaultHttpModule,
  options: {
    provider: string
    apiKeyHeader?: string
    apiKeyQueryParam?: string
    redactedHeaders?: string[]
    axiosWrapper?: AxiosWrapper
    staticConfig?: HttpModuleOptions
  },
): DynamicModule {
  const { provider, axiosWrapper, staticConfig, ...wrapperOptions } = options;

  // Get the static providers from HttpModule's @Module decorator metadata
  const staticProviders = Reflect.getMetadata('providers', HttpModule) ?? [];

  // Filter out AXIOS_INSTANCE_TOKEN from staticProviders as we'll replace it
  const newProviders = staticProviders.filter(
    (p: unknown) =>
      !(typeof p === 'object' && p !== null && 'provide' in p && p.provide === AXIOS_INSTANCE_TOKEN),
  );

  // Find the original AXIOS_INSTANCE_TOKEN provider from the module
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let originalAxiosProvider: any = null;
  for (const p of module.providers ?? []) {
    if (
      typeof p === 'object' &&
      'provide' in p &&
      p.provide === AXIOS_INSTANCE_TOKEN
    ) {
      originalAxiosProvider = p;
      break;
    }
  }

  // Add other providers from the module (except the original AXIOS_INSTANCE_TOKEN)
  for (const p of module.providers ?? []) {
    if (
      typeof p === 'object' &&
      'provide' in p &&
      p.provide === AXIOS_INSTANCE_TOKEN
    ) {
      continue; // Skip the original axios instance provider
    }
    newProviders.push(p);
  }

  // If we have a pre-configured axiosWrapper, use it directly
  if (axiosWrapper) {
    newProviders.push({
      provide: AXIOS_INSTANCE_TOKEN,
      useValue: axiosWrapper.getAxiosInstance(),
    });
  } else if (originalAxiosProvider && 'useFactory' in originalAxiosProvider) {
    // For async providers (useFactory from useClass/useExisting/custom factory),
    // wrap the factory to create AxiosWrapper with the resolved config
    const originalFactory = originalAxiosProvider.useFactory;
    const originalInject = originalAxiosProvider.inject;

    newProviders.push({
      provide: AXIOS_INSTANCE_TOKEN,
      inject: originalInject,
      useFactory: async (...args: unknown[]) => {
        // Get the original axios instance or config
        const originalResult = await originalFactory(...args);

        // Create AxiosWrapper with the resolved config
        const wrapper = new AxiosWrapper(
          {
            provider,
            ...wrapperOptions,
            redactedHeaders: wrapperOptions.redactedHeaders ?? [],
          },
          undefined,
          originalResult?.defaults ?? originalResult ?? staticConfig,
        );

        return wrapper.getAxiosInstance();
      },
    });
  } else if (originalAxiosProvider && 'useValue' in originalAxiosProvider) {
    // For static providers with useValue
    const wrapper = new AxiosWrapper(
      {
        provider,
        ...wrapperOptions,
        redactedHeaders: wrapperOptions.redactedHeaders ?? [],
      },
      undefined,
      originalAxiosProvider.useValue?.defaults ?? staticConfig,
    );

    newProviders.push({
      provide: AXIOS_INSTANCE_TOKEN,
      useValue: wrapper.getAxiosInstance(),
    });
  } else {
    // Fallback: create with static config
    const wrapper = new AxiosWrapper(
      {
        provider,
        ...wrapperOptions,
        redactedHeaders: wrapperOptions.redactedHeaders ?? [],
      },
      undefined,
      staticConfig,
    );

    newProviders.push({
      provide: AXIOS_INSTANCE_TOKEN,
      useValue: wrapper.getAxiosInstance(),
    });
  }

  return {
    ...module,
    providers: newProviders,
  };
}/**
 * get a wrapped HttpModule for otel metrics
 * @param options options to configure the HttpModule
 *  - provider: use axiosWrapper's provider if it is provided, otherwise use the parent dirname of the caller file
 *  - apiKeyHeader: try to found api key from [
        'x-api-key',
        'authorization',
        'apikey',
        'api-key',
        'OK-ACCESS-KEY',
        'x-cg-pro-api-key',
        'X-CMC_PRO_API_KEY',
        'AccessKey',
      ] header by default.(**ignore case**)
 *  - apiKeyQueryParam: same logic as apiKeyHeader but search in query params
 *  - redactedHeaders: list of headers to redact from logs/metrics, default: [
        'x-api-key',
        'authorization',
        'apikey',
        'api-key',
        'OK-ACCESS-KEY',
        'x-cg-pro-api-key',
        'X-CMC_PRO_API_KEY',
        'AccessKey',
        'OK-ACCESS-SIGN',
        'OK-ACCESS-PASSPHRASE',
      ].(**ignore case**)
 *  - HttpModule: custom HttpModule to use instead of the default one
 * @param httpModuleOptions options to pass to HttpModule.register or registerAsync
 * @param axiosWrapper wrapped axios instance
 * @returns DynamicModule
 */
function getHttpModule(
  options: {
    provider: string
    apiKeyHeader?: string
    apiKeyQueryParam?: string
    redactedHeaders?: string[]
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    HttpModule?: any // Allow consumer to pass their HttpModule to avoid multiple instances
  },
  httpModuleOptions?: HttpModuleConfig,
  axiosWrapper?: AxiosWrapper,
): DynamicModule {
  // Step 1: Resolve provider name
  const provider = resolveProviderName(options.provider, axiosWrapper);

  // Step 2: Resolve which HttpModule to use (consumer's or default)
  const consumerHttpModule = resolveConsumerHttpModule();
  const HttpModule = options.HttpModule ?? consumerHttpModule ?? DefaultHttpModule;

  // Step 3: Extract static and async configurations
  const staticHttpConfig = extractStaticHttpOptions(httpModuleOptions);
  const asyncHttpConfig = pickAsyncHttpModuleOptions(httpModuleOptions);
  const asyncFactory = httpModuleOptions?.useFactory;
  const hasClassOrExisting = Boolean(
    httpModuleOptions?.useClass ?? httpModuleOptions?.useExisting,
  );

  // Step 4: Create the base HttpModule
  const module = createHttpModule(
    HttpModule,
    staticHttpConfig,
    asyncHttpConfig,
    asyncFactory,
    hasClassOrExisting,
  );

  // Step 5: Inject our wrapped axios instance into the module
  return injectWrappedAxiosInstance(
    module,
    HttpModule,
    {
      provider,
      apiKeyHeader: options.apiKeyHeader,
      apiKeyQueryParam: options.apiKeyQueryParam,
      redactedHeaders: options.redactedHeaders,
      axiosWrapper,
      staticConfig: staticHttpConfig,
    },
  );
}

export { getHttpModule };
