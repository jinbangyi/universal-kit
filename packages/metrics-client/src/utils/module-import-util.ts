import { HttpModule, HttpModuleAsyncOptions, HttpModuleOptions } from '@nestjs/axios';
import { AXIOS_INSTANCE_TOKEN } from '@nestjs/axios/dist/http.constants';
import { DynamicModule } from '@nestjs/common';
import { AxiosWrapper } from '../http-client/axios-wrapper.js';

function getHttpModule(
  options: {
    provider: string
    apiKeyHeader?: string
    apiKeyQueryParam?: string
    redactedHeaders?: string[]
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

  httpModuleOptions ??= {
    useFactory: (): HttpModuleOptions => ({
      timeout: 60000,
    }),
  };
  httpModuleOptions.extraProviders = [
    ...(httpModuleOptions.extraProviders ?? []),
    {
      provide: AXIOS_INSTANCE_TOKEN,
      useValue: axiosWrapper.getAxiosInstance(),
    },
  ];

  return HttpModule.registerAsync(httpModuleOptions);
}

export { getHttpModule };
