import { HttpModule as DefaultHttpModule, HttpModuleAsyncOptions } from '@nestjs/axios';
import { createRequire } from 'node:module';
import { AXIOS_INSTANCE_TOKEN } from '@nestjs/axios/dist/http.constants';
import { DynamicModule } from '@nestjs/common';
import { AxiosWrapper } from '../http-client/axios-wrapper.js';

function resolveConsumerHttpModule(): typeof DefaultHttpModule | undefined {
  try {
    const consumerRequire = createRequire(`${process.cwd()}/`);
    return consumerRequire('@nestjs/axios').HttpModule;
  } catch {
    return undefined;
  }
}

function getHttpModule(
  options: {
    provider: string
    apiKeyHeader?: string
    apiKeyQueryParam?: string
    redactedHeaders?: string[]
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    HttpModule?: any // Allow consumer to pass their HttpModule to avoid multiple instances
  },
  httpModuleOptions?: HttpModuleAsyncOptions,
  axiosWrapper?: AxiosWrapper,
): DynamicModule {
  axiosWrapper ??= new AxiosWrapper({
    provider: options.provider,
    apiKeyHeader: options.apiKeyHeader,
    apiKeyQueryParam: options.apiKeyQueryParam,
    redactedHeaders: options.redactedHeaders ?? [],
  });

  httpModuleOptions ??= {};
  const consumerHttpModule = resolveConsumerHttpModule();
  const HttpModule = options.HttpModule ?? consumerHttpModule ?? DefaultHttpModule;

  // Use the consumer's HttpModule if provided, otherwise use the default one
  // const HttpModule = options.HttpModule ?? DefaultHttpModule;

  // TODO, if there async function in httpModuleOptions, use registerAsync with those options merged in
  const module = HttpModule.register(httpModuleOptions);

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
