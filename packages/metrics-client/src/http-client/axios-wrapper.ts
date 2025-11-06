import axios, {
  AxiosInstance,
  AxiosRequestConfig,
  AxiosResponse,
  AxiosError,
  InternalAxiosRequestConfig,
} from 'axios';
import { Logger } from '@universal-kit/logger';
import { BaseHttpClient, defaultApiKey } from './common.js';
import type { BaseWrapperConfig } from './common.js';
import type { AxiosRequestMetadata, ErrorContext, RequestInfo } from '../typing.js';

// Axios-compatible interfaces
export interface AxiosWrapperRequestConfig<D = any> extends AxiosRequestConfig<D> {
  skipMetrics?: boolean;
}

/**
 * Axios wrapper that provides automatic API usage measurement
 * while maintaining full compatibility with Axios API
 */
export class AxiosWrapper extends BaseHttpClient {
  private axiosInstance: AxiosInstance;

  constructor(config: BaseWrapperConfig, logger?: Logger) {
    // Create a temporary bound function after super call
    const baseConfig: BaseWrapperConfig = {
      getApiKey: (options: InternalAxiosRequestConfig) => this.getApiKeyFromConfig(options),
      ...config,
      provider: `${config.provider}:${AxiosWrapper.name}`,
    };

    super(baseConfig, logger);

    // Create Axios instance with base configuration
    this.axiosInstance = axios.create();

    this.setupInterceptors();
  }

  private getApiKeyFromConfig(config?: AxiosRequestConfig): string {
    const apikey = config?.headers ?
      (config.headers as Record<string, string>)[this.config.apiKeyHeader] :
      undefined;
    if (apikey) return apikey;
    return defaultApiKey;
  }

  private setupInterceptors() {
    // Request interceptor
    this.axiosInstance.interceptors.request.use(
      config => {
        if (!config.skipMetrics) {
          const requestInfo = this.createRequestInfo(config);
          const { span, startTime } = this.processRequestStart(requestInfo);

          const existingMetadata = config.metadata || {};
          config.metadata = {
            ...existingMetadata,
            startTime,
            requestInfo,
            span: span ?? null,
          };
        }
        return config;
      },
      error => {
        return Promise.reject(error);
      },
      { synchronous: true, runWhen: () => /* This function returns true */ true }
    );

    // Response interceptor
    this.axiosInstance.interceptors.response.use(
      response => {
        if (!response.config.skipMetrics) {
          this.processResponse(response);
        }
        return response;
      },
      (error: AxiosError) => {
        if (!error.config?.skipMetrics) {
          this.processError(error);
        }
        return Promise.reject(error);
      },
    );
  }

  private processResponse(response: AxiosResponse) {
    const requestMetadata = (response.config.metadata as AxiosRequestMetadata) || {};
    let responseSize: number = 0;
    // Calculate response size if available
    const contentLength = response.headers['content-length'];
    if (contentLength) {
      responseSize = parseInt(contentLength, 10);
    } else if (response.data) {
      try {
        responseSize = Buffer.byteLength(JSON.stringify(response.data), 'utf8');
      } catch {
        responseSize = 0;
      }
    }
    const statusCode = response.status;

    return this.processRequestComplete(
      requestMetadata, statusCode, responseSize
    );
  }

  private processError(error: AxiosError) {
    const requestMetadata = (error.config?.metadata as AxiosRequestMetadata) || {};
    const responseMessage = error.response?.statusText;
    const responseStatus = error.response?.status;
    const errorContext: ErrorContext = {
      responseMessage,
      responseStatus,
    };

    this.processRequestError(requestMetadata, error, {
      ...errorContext,
    });
  }

  request(config: AxiosWrapperRequestConfig): Promise<AxiosResponse> {
    return this.axiosInstance.request(config);
  }

  get<T = any, R = AxiosResponse<T>>(url: string, config?: AxiosWrapperRequestConfig): Promise<R> {
    return this.axiosInstance.get<T, R>(url, config);
  }

  post<T = any, R = AxiosResponse<T>>(url: string, data?: T, config?: AxiosWrapperRequestConfig): Promise<R> {
    return this.axiosInstance.post<T, R>(url, data, config);
  }

  // Get underlying Axios instance for advanced usage
  getAxiosInstance(): AxiosInstance {
    return this.axiosInstance;
  }
}

// Extend AxiosRequestConfig to include metadata
declare module 'axios' {
  interface AxiosRequestConfig {
    metadata?: AxiosRequestMetadata;
    skipMetrics?: boolean;
  }

  interface InternalAxiosRequestConfig<D = any> {
    metadata?: AxiosRequestMetadata;
    skipMetrics?: boolean;
  }
}
