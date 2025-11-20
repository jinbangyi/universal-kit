import { HttpModule as DefaultHttpModule, HttpModuleAsyncOptions, HttpModuleOptions } from '@nestjs/axios';
import { createRequire } from 'node:module';
import { AXIOS_INSTANCE_TOKEN } from '@nestjs/axios/dist/http.constants';
import { DynamicModule } from '@nestjs/common';
import { AxiosWrapper } from '../http-client/axios-wrapper.js';
import { getCallerParentDirName } from './file.js';

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
 * get a wrapped HttpModule for otel metrics
 * @param options options to configure the HttpModule
 *  - provider: use axiosWrapper's provider if it is provided, otherwise use the parent dirname of the caller file
 *  - apiKeyHeader: try to found api key from [
        'x-api-key',
        'authorization',
        'apikey',
        'OK-ACCESS-KEY',
        'x-cg-pro-api-key',
        'X-CMC_PRO_API_KEY',
        'AccessKey',
      ] header by default.(**ignore case**)
 *  - apiKeyQueryParam: name of the query param to use for api key
 *  - redactedHeaders: list of headers to redact from logs/metrics
 *  - HttpModule: custom HttpModule to use instead of the default one
 * @param httpModuleOptions options to pass to HttpModule.register or registerAsync
 * @param axiosWrapper wrapped axios instance
 * @returns DynamicModule
 */
function getHttpModule(
  options: {
    provider?: string
    apiKeyHeader?: string
    apiKeyQueryParam?: string
    redactedHeaders?: string[]
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    HttpModule?: any // Allow consumer to pass their HttpModule to avoid multiple instances
  },
  httpModuleOptions?: HttpModuleConfig,
  axiosWrapper?: AxiosWrapper,
): DynamicModule {
  if (!options.provider) {
    if (axiosWrapper) {
      options.provider = axiosWrapper.getProviderName();
    } else {
      // use parent dir name where call this function as provider
      options.provider = getCallerParentDirName([]) ?? undefined;
    }
  }

  if (!options.provider) {
    throw new Error('Provider name must be specified either in options or via axiosWrapper');
  }

  axiosWrapper ??= new AxiosWrapper({
    provider: options.provider,
    apiKeyHeader: options.apiKeyHeader,
    apiKeyQueryParam: options.apiKeyQueryParam,
    redactedHeaders: options.redactedHeaders ?? [],
  });

  const moduleOptions: HttpModuleConfig = httpModuleOptions ?? {};
  const consumerHttpModule = resolveConsumerHttpModule();
  const HttpModule = options.HttpModule ?? consumerHttpModule ?? DefaultHttpModule;

  // Use the consumer's HttpModule if provided, otherwise use the default one
  // const HttpModule = options.HttpModule ?? DefaultHttpModule;

  const staticHttpConfig = extractStaticHttpOptions(moduleOptions);
  const asyncHttpConfig = pickAsyncHttpModuleOptions(moduleOptions);
  const asyncFactory = moduleOptions.useFactory;
  const hasClassOrExisting = Boolean(moduleOptions.useClass ?? moduleOptions.useExisting);

  let module: DynamicModule;

  if (typeof asyncFactory === 'function') {
    module = HttpModule.registerAsync({
      ...asyncHttpConfig,
      useFactory: async (...factoryArgs: Parameters<HttpModuleFactory>) => {
        const resolvedConfig = await asyncFactory(...factoryArgs);
        return {
          ...staticHttpConfig,
          ...resolvedConfig,
        };
      },
    });
  } else if (hasClassOrExisting) {
    module = HttpModule.registerAsync(asyncHttpConfig);
  } else {
    module = HttpModule.register(staticHttpConfig);
  }

  // Get the static providers and exports from HttpModule's @Module decorator metadata
  // This ensures we use the same HttpService class reference as the consumer's node_modules
  const staticProviders = Reflect.getMetadata('providers', HttpModule) ?? [];
  const staticExports = Reflect.getMetadata('exports', HttpModule) ?? [];

  const newProviders = [...staticProviders];

  // use our axios instance instead of the default one
  for (const provider of module.providers ?? []) {
    if (typeof provider === 'object' && 'provide' in provider && provider.provide === AXIOS_INSTANCE_TOKEN) {
      // Skip this provider as we'll replace it below
      continue;
    } else {
      newProviders.push(provider);
    }
  }

  // Always add our custom axios instance
  newProviders.push({
    provide: AXIOS_INSTANCE_TOKEN,
    useValue: axiosWrapper.getAxiosInstance(),
  });

  return {
    ...module,
    providers: newProviders,
    exports: staticExports, // Use the static exports which include HttpService
  };
}

export { getHttpModule };
