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
import type { ApiMetrics } from '../typing.js';

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

  private setupInterceptors(): void {
    // Request interceptor
    this.axiosInstance.interceptors.request.use(
      config => {
        if (!config.skipMetrics) {
          config.metadata = {
            startTime: Date.now(),
            requestId: this.generateRequestId(),
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

  private processResponse(response: AxiosResponse): ApiMetrics {
    const config = response.config;
    const startTime = config.metadata?.startTime || Date.now();
    const requestId = config.metadata?.requestId || this.generateRequestId();
    const method = config.method?.toUpperCase() || 'GET';
    const url = response.config.url || '';
    const apiKey = this.hashApiKey(this.config.getApiKey(config));

    const baseAttributes = this.createBaseAttributes(requestId, method, url, apiKey);
    const requestSize = this.calculateRequestSize(config.data);
    let responseSize: number | undefined;
    // Calculate response size if available
    const contentLength = response.headers['content-length'];
    if (contentLength) {
      responseSize = parseInt(contentLength, 10);
    } else if (response.data) {
      try {
        responseSize = Buffer.byteLength(JSON.stringify(response.data), 'utf8');
      } catch {
        responseSize = undefined;
      }
    }

    return this.processRequestComplete(baseAttributes, url, response, startTime, null, requestSize, responseSize);
  }

  private processError(error: AxiosError): ApiMetrics {
    const config = error.config;
    const startTime = config?.metadata?.startTime || Date.now();
    const requestId = config?.metadata?.requestId || this.generateRequestId();
    const method = config?.method?.toUpperCase() || 'GET';
    const url = config?.url || '';
    const apiKey = this.hashApiKey(this.config.getApiKey(config));

    const baseAttributes = this.createBaseAttributes(requestId, method, url, apiKey);
    const requestSize = this.calculateRequestSize(config?.data);

    return this.processRequestError(baseAttributes, url, error, startTime, null, requestSize,
      { url, method, headers: config?.headers || {}, body: config?.data },
    );
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
    metadata?: {
      startTime?: number;
      requestId?: string;
    };
    skipMetrics?: boolean;
  }
}
