import axios, {
  AxiosInstance,
  AxiosRequestConfig,
  AxiosResponse,
  AxiosError,
  InternalAxiosRequestConfig,
} from 'axios';
import { Logger } from '@universal-kit/logger';
import { BaseHttpClient, BaseWrapperConfig, defaultApiKey } from './common';
import { ApiMetrics } from '../typing';

// Axios-compatible interfaces
export interface AxiosWrapperRequestConfig extends AxiosRequestConfig {
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
    };

    super(baseConfig, logger);

    // Create Axios instance with base configuration
    this.axiosInstance = axios.create();

    this.setupInterceptors();
  }

  private getApiKeyFromConfig(config: AxiosRequestConfig): string {
    const apikey = config.headers ?
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


  // Axios-compatible methods
  async request<T = any>(
    config: AxiosWrapperRequestConfig,
  ): Promise<AxiosResponse<T>> {
    return this.axiosInstance.request(config);
  }

  async get<T = any>(
    url: string,
    config?: AxiosWrapperRequestConfig,
  ): Promise<AxiosResponse<T>> {
    return this.axiosInstance.get(url, config);
  }

  async post<T = any>(
    url: string,
    data?: any,
    config?: AxiosWrapperRequestConfig,
  ): Promise<AxiosResponse<T>> {
    return this.axiosInstance.post(url, data, config);
  }

  async put<T = any>(
    url: string,
    data?: any,
    config?: AxiosWrapperRequestConfig,
  ): Promise<AxiosResponse<T>> {
    return this.axiosInstance.put(url, data, config);
  }

  async patch<T = any>(
    url: string,
    data?: any,
    config?: AxiosWrapperRequestConfig,
  ): Promise<AxiosResponse<T>> {
    return this.axiosInstance.patch(url, data, config);
  }

  async delete<T = any>(
    url: string,
    config?: AxiosWrapperRequestConfig,
  ): Promise<AxiosResponse<T>> {
    return this.axiosInstance.delete(url, config);
  }

  async head<T = any>(
    url: string,
    config?: AxiosWrapperRequestConfig,
  ): Promise<AxiosResponse<T>> {
    return this.axiosInstance.head(url, config);
  }

  async options<T = any>(
    url: string,
    config?: AxiosWrapperRequestConfig,
  ): Promise<AxiosResponse<T>> {
    return this.axiosInstance.options(url, config);
  }

  // Access to Axios instance properties
  get defaults() {
    return this.axiosInstance.defaults;
  }

  get interceptors() {
    return this.axiosInstance.interceptors;
  }

  // Utility methods
  getUri(config?: AxiosWrapperRequestConfig): string {
    return this.axiosInstance.getUri(config);
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
