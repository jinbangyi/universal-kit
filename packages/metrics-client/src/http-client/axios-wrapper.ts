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
  private requestInterceptorId: number | null = null;
  private responseInterceptorId: number | null = null;
  private originalResponseUse: AxiosInstance['interceptors']['response']['use'];
  private originalRequestUse: AxiosInstance['interceptors']['request']['use'];

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  constructor(config: BaseWrapperConfig, logger?: Logger, options?: axios.CreateAxiosDefaults<any> | undefined) {
    // Create a temporary bound function after super call
    const baseConfig: BaseWrapperConfig = {
      ...config,
      provider: `${config.provider}:${AxiosWrapper.name}`,
    };

    super(baseConfig, logger);

    // Create Axios instance with base configuration
    this.axiosInstance = axios.create(options);

    // Store original interceptor use methods before wrapping
    this.originalResponseUse = this.axiosInstance.interceptors.response.use.bind(
      this.axiosInstance.interceptors.response,
    );
    this.originalRequestUse = this.axiosInstance.interceptors.request.use.bind(
      this.axiosInstance.interceptors.request,
    );

    this.setupInterceptors();
    this.wrapInterceptors();
  }

  private convertConfigToRequestInfo(config: InternalAxiosRequestConfig): GeneralRequestConfig {
    // the url should combine baseURL and url if both are present
    let fullUrl = config.url ?? '';
    // Use config.baseURL if available, otherwise fall back to instance defaults
    const baseURL = config.baseURL ?? this.axiosInstance?.defaults?.baseURL;

    if (baseURL && fullUrl) {
    // Rule 3: If url is absolute (http://, https://, or //), it overrides baseURL
      if ((/^https?:\/\/|^\/\//).test(fullUrl)) {
      // fullUrl is already absolute, use as-is
      } else if (fullUrl.startsWith('/')) {
      // If baseURL has a domain (http://, https://), extract domain and append url
        if ((/^https?:\/\//).test(baseURL)) {
          try {
            const baseUrlObj = new URL(baseURL);
            fullUrl = `${baseUrlObj.protocol}//${baseUrlObj.host}${fullUrl}`;
          } catch {
          // If parsing fails, url replaces baseURL entirely
            this.logger.warn(`Failed to parse baseURL: ${baseURL}, using url as-is: ${fullUrl}`);
          }
        }
      // If baseURL is just a path (no domain), url replaces it entirely
      // fullUrl already starts with '/', so use it as-is
      } else {
      // Ensure baseURL ends with / for proper concatenation unless url would create double slash
        const separator = baseURL.endsWith('/') ? '' : '/';
        fullUrl = `${baseURL}${separator}${fullUrl}`;
      }
    } else if (baseURL && !fullUrl) {
      // Only baseURL exists
      fullUrl = baseURL;
    }

    return {
      url: fullUrl,
      method: config.method ?? 'GET',
      headers: config.headers,
      body: config.data,
      params: config.params,
    };
  }

  private setupInterceptors(): void {
    // Request interceptor
    this.requestInterceptorId = this.axiosInstance.interceptors.request.use(
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
    this.responseInterceptorId = this.axiosInstance.interceptors.response.use(
      response => {
        if (!response.config.skipMetrics) {
          const requestMetadata = response.config.metadata;
          this.processResponse(response);
          if (requestMetadata) {
            this.processRequestEnd(requestMetadata.requestInfo, {
              span: requestMetadata.span,
              startTime: requestMetadata.startTime,
            });
          }
        }
        return response;
      },
      (error: AxiosError) => {
        if (!error.config?.skipMetrics) {
          const requestMetadata = error.config?.metadata;
          if (error.response) {
            this.processResponse(error.response);
          }
          this.processError(error);
          if (requestMetadata) {
            this.processRequestEnd(requestMetadata.requestInfo, {
              span: requestMetadata.span,
              startTime: requestMetadata.startTime,
            });
          }
        }
        return Promise.reject(error);
      },
    );
  }

  /**
   * Wrap the interceptors to ensure wrapper's interceptors always run last
   * This ensures that even if users add custom interceptors, metrics are still collected
   */
  private wrapInterceptors(): void {
    // Override response.use to wrap user interceptors with error handling
    this.axiosInstance.interceptors.response.use = (onFulfilled?, onRejected?): number => {
      // Wrap the user's fulfilled handler to catch any errors they might throw
      const wrappedFulfilled = onFulfilled ?
        (response: AxiosResponse): AxiosResponse | Promise<AxiosResponse> => {
          try {
            return onFulfilled(response);
          } catch (error) {
            this.logger.warn(
              'User response interceptor threw an error while handling a response. ' +
              'Re-throwing the error.',
            );

            throw error;
          }
        } :
        onFulfilled;

      // Wrap the user's rejected handler to log any errors they might throw
      const wrappedRejected = onRejected ?
        (error: AxiosError): unknown => {
          try {
            return onRejected(error);
          } catch (err) {
            this.logger.warn(
              'User response interceptor threw an error while handling an error. ' +
              'Processing the thrown error through metrics.',
            );

            throw err;
          }
        } :
        onRejected;

      // Add the wrapped user interceptor
      const interceptorId = this.originalResponseUse(wrappedFulfilled, wrappedRejected);
      return interceptorId;
    };

    // Override request.use with similar wrapping for consistency
    this.axiosInstance.interceptors.request.use = (onFulfilled?, onRejected?): number => {
      // Wrap the user's fulfilled handler to catch any errors they might throw
      const wrappedFulfilled = onFulfilled ?
        (config: InternalAxiosRequestConfig): InternalAxiosRequestConfig | Promise<InternalAxiosRequestConfig> => {
          try {
            return onFulfilled(config);
          } catch (error) {
            this.logger.warn(
              'User request interceptor threw an error while handling a request. ' +
              'Re-throwing the error.',
            );

            throw error;
          }
        } :
        onFulfilled;

      // Wrap the user's rejected handler to catch any errors they might throw
      const wrappedRejected = onRejected ?
        (error: Error): unknown => {
          try {
            return onRejected(error);
          } catch (err) {
            this.logger.warn(
              'User request interceptor threw an error while handling an error. ' +
              'Re-throwing the error.',
            );

            throw err;
          }
        } :
        onRejected;

      // Add the wrapped user interceptor
      const interceptorId = this.originalRequestUse(wrappedFulfilled, wrappedRejected);
      return interceptorId;
    };
  }

  private processResponse(response: AxiosResponse): void {
    // console.log('console.log: processing response', response);
    const requestMetadata: AxiosRequestMetadata | undefined = response.config.metadata;
    if (!requestMetadata) {
      this.logger.warn('No request metadata found in response config, cannot process response for metrics.');
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

  private processError(error: AxiosError): void {
    // console.log('console.log: processing error', error);
    const requestMetadata: AxiosRequestMetadata | undefined = error.config?.metadata;
    if (!requestMetadata) {
      this.logger.warn('No request metadata found in error config, cannot process error for metrics.');
      return;
    }
    const responseMessage = error.response?.statusText;
    const responseStatus = error.response?.status;
    const errorContext: ErrorContext = {
      responseMessage,
      responseStatus,
    };
    // const spanAlreadyFinished = responseAlreadyProcessed;

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

  // Expose refreshOpenApiSpecs for manual refresh
  override async refreshOpenApiSpecs(): Promise<void> {
    return super.refreshOpenApiSpecs();
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
