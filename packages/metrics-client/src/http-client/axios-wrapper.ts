import axios, {
  AxiosInstance,
  AxiosRequestConfig,
  AxiosResponse,
  AxiosError,
  InternalAxiosRequestConfig,
} from 'axios';
import { Logger } from '@universal-kit/logger';
import { BaseHttpClient, type BaseWrapperConfig, type GeneralRequestConfig } from './common.js';
import type { AxiosRequestMetadata, ErrorContext } from '../typing.js';

// Axios-compatible interfaces
export interface AxiosWrapperRequestConfig<TData = unknown> extends AxiosRequestConfig<TData> {
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
      ...config,
      provider: `${config.provider}:${AxiosWrapper.name}`,
    };

    super(baseConfig, logger);

    // Create Axios instance with base configuration
    this.axiosInstance = axios.create();

    this.setupInterceptors();
  }

  private convertConfigToRequestInfo(config: InternalAxiosRequestConfig): GeneralRequestConfig {
    return {
      url: config.url ?? '',
      method: config.method ?? 'GET',
      headers: config.headers,
      body: config.data,
      params: config.params,
    };
  }

  private setupInterceptors(): void {
    // Request interceptor
    this.axiosInstance.interceptors.request.use(
      config => {
        if (!config.skipMetrics) {
          const requestInfo = this.createRequestInfo(this.convertConfigToRequestInfo(config));
          const { span, startTime } = this.processRequestStart(requestInfo);

          const existingMetadata = config.metadata ?? {};
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
      { synchronous: true, runWhen: () => /* This function returns true */ true },
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
          if (error.response) {
            // For errors with responses, process the response first to handle completion metrics
            this.processResponse(error.response);
            // Then process the error, but don't decrement active requests again
            this.processError(error, true); // Pass flag indicating response was already processed
          } else {
            // For errors without responses, process the error normally
            this.processError(error, false);
          }
        }
        return Promise.reject(error);
      },
    );
  }

  private processResponse(response: AxiosResponse): void {
    const requestMetadata: AxiosRequestMetadata | undefined = response.config.metadata;
    if (!requestMetadata) {
      return;
    }
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

    this.processRequestComplete(requestMetadata, statusCode, responseSize);
  }

  private processError(error: AxiosError, responseAlreadyProcessed: boolean = false): void {
    const requestMetadata: AxiosRequestMetadata | undefined = error.config?.metadata;
    if (!requestMetadata) {
      return;
    }
    const responseMessage = error.response?.statusText;
    const responseStatus = error.response?.status;
    const errorContext: ErrorContext = {
      responseMessage,
      responseStatus,
      responseAlreadyProcessed,
    };

    this.processRequestError(requestMetadata, error, {
      ...errorContext,
    });
  }

  request(config: AxiosWrapperRequestConfig): Promise<AxiosResponse> {
    return this.axiosInstance.request(config);
  }

  get<T = unknown, R = AxiosResponse<T>>(url: string, config?: AxiosWrapperRequestConfig<T>): Promise<R> {
    return this.axiosInstance.get<T, R>(url, config);
  }

  post<T = unknown, R = AxiosResponse<T>>(url: string, data?: T, config?: AxiosWrapperRequestConfig<T>): Promise<R> {
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

  interface InternalAxiosRequestConfig {
    metadata?: AxiosRequestMetadata;
    skipMetrics?: boolean;
  }
}
