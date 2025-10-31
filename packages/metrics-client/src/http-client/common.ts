import { Logger } from '@universal-kit/logger';
import { ProviderMetricsManager } from '../metrics/api-provider-metrics';
import { RequestTracer, RequestTraceConfig } from '../tracing/api-provider-tracing';
import { ApiMetrics, BaseApiMetrics } from '../typing';

export interface BaseWrapperConfig {
  // name of the API
  provider: string;
  getApiKey?: (options: any) => string;
  apiKeyHeader?: string; // Default: 'x-api-key'
  retryConfig?: { // Default: { attempts: 0, delay: 1000 }
    attempts: number;
    delay: number;
  };
  traceFailedRequests?: boolean; // Default: true
  logRequestEvents?: boolean; // Default: true
}

export const defaultApiKey = 'NOT_FOUND_API_KEY';

export abstract class BaseHttpClient {
  protected config: Required<BaseWrapperConfig>;
  protected logger: Logger;
  protected providerMetrics: ProviderMetricsManager;
  protected requestTracer: RequestTracer;

  constructor(config: BaseWrapperConfig, logger?: Logger) {
    this.config = {
      getApiKey: this.getDefaultApiKey.bind(this),
      apiKeyHeader: 'x-api-key',
      retryConfig: {
        attempts: 0,
        delay: 1000,
      },
      traceFailedRequests: true,
      logRequestEvents: true,
      ...config,
    };

    this.logger = logger || new Logger({ library: this.config.provider });

    this.providerMetrics = new ProviderMetricsManager({ enabled: true });

    // Initialize request tracer
    const traceConfig: RequestTraceConfig = {
      traceFailedRequests: this.config.traceFailedRequests,
      logRequestEvents: this.config.logRequestEvents,
    };
    this.requestTracer = new RequestTracer(traceConfig, this.logger);
  }

  // Common utility methods
  protected hashApiKey(apiKey: string): string {
    if (apiKey === defaultApiKey) return apiKey;
    // Simple hash implementation for privacy
    if (apiKey.length <= 8) return '****';
    return `${apiKey.substring(0, 4)}****${apiKey.substring(apiKey.length - 4)}`;
  }

  protected getDefaultApiKey(options: any): string {
    return defaultApiKey;
  }

  protected generateRequestId(): string {
    return `req_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
  }

  protected calculateRequestSize(data?: any): number | undefined {
    if (!data) return undefined;

    if (typeof data === 'string') {
      return Buffer.byteLength(data, 'utf8');
    } else if (data instanceof ArrayBuffer) {
      return data.byteLength;
    } else if (data instanceof Blob) {
      return data.size;
    } else if (data instanceof Uint8Array) {
      return data.length;
    } else {
      // For objects, stringify and measure
      try {
        return Buffer.byteLength(JSON.stringify(data), 'utf8');
      } catch {
        return 0;
      }
    }
  }

  protected calculateResponseSizeFromHeaders(headers: Record<string, any>): number | undefined {
    const contentLength = headers['content-length'] || headers['Content-Length'];
    if (contentLength) {
      return parseInt(contentLength, 10);
    }
    return undefined;
  }

  protected calculateResponseSizeFromData(data?: any): number | undefined {
    if (!data) return undefined;

    try {
      return Buffer.byteLength(JSON.stringify(data), 'utf8');
    } catch {
      return undefined;
    }
  }

  protected parseUrl(url: string): { host: string; pathname: string } {
    try {
      const parsedUrl = new URL(url);
      return {
        host: parsedUrl.hostname || 'unknown',
        pathname: parsedUrl.pathname || '/',
      };
    } catch {
      // Fallback for relative URLs
      return {
        host: 'localhost',
        pathname: url.split('?')[0] || '/',
      };
    }
  }

  protected createBaseAttributes(
    requestId: string,
    method: string,
    url: string,
    apiKey: string,
  ): BaseApiMetrics {
    const { host, pathname: path } = this.parseUrl(url);
    return {
      requestId,
      provider: this.config.provider,
      apiKey,
      host,
      method,
      path,
    };
  }

  protected processRequestStart(
    baseAttributes: BaseApiMetrics,
    url: string,
    requestSize?: number,
  ): { span: any; startTime: number } {
    const startTime = Date.now();

    // Create request span for tracing
    const span = this.requestTracer.createRequestSpan(baseAttributes);

    // Log request start event
    this.requestTracer.logRequestEvent({
      ...baseAttributes,
      type: 'start',
      timestamp: startTime,
      url,
      metadata: { requestSize },
    });

    // Record provider metrics start
    this.providerMetrics.recordRequestStart(baseAttributes, requestSize);

    return { span, startTime };
  }

  protected processRequestComplete(
    baseAttributes: BaseApiMetrics,
    url: string,
    response: any,
    startTime: number,
    span: any,
    requestSize?: number,
    responseSize?: number,
  ): ApiMetrics {
    const duration = Date.now() - startTime;
    const apiMetrics: ApiMetrics = {
      ...baseAttributes,
      duration,
      url,
      statusCode: response.status,
      timestamp: startTime,
      ...(requestSize !== undefined && { requestSize }),
      ...(responseSize !== undefined && { responseSize }),
    };

    // Record provider metrics
    this.providerMetrics.recordRequestComplete(
      baseAttributes,
      response.status,
      duration,
      responseSize,
    );

    // Log request completion
    this.requestTracer.logRequestEvent({
      ...baseAttributes,
      type: 'complete',
      timestamp: Date.now(),
      url,
      statusCode: response.status,
      duration,
      metadata: { responseSize },
    });

    // Finish request span
    if (span) {
      this.requestTracer.finishRequestSpan(span, apiMetrics);
    }

    return apiMetrics;
  }

  protected processRequestError(
    baseAttributes: BaseApiMetrics,
    url: string,
    error: Error,
    startTime: number,
    span: any,
    requestSize?: number,
    request?: any,
  ): ApiMetrics {
    const duration = Date.now() - startTime;
    const apiMetrics: ApiMetrics = {
      ...baseAttributes,
      duration,
      url,
      error,
      timestamp: startTime,
      ...(requestSize !== undefined && { requestSize }),
    };

    // Record provider error metrics
    this.providerMetrics.recordRequestError(
      baseAttributes,
      error.constructor.name,
    );

    // Log request error
    this.requestTracer.logRequestEvent({
      ...baseAttributes,
      type: 'error',
      timestamp: Date.now(),
      url,
      duration,
      error,
    });

    // Log detailed failed request information
    if (this.config.traceFailedRequests) {
      this.requestTracer.logFailedRequestDetails(
        baseAttributes.requestId,
        baseAttributes.method,
        url,
        error,
        request,
      );
    }

    // Finish request span with error
    if (span) {
      this.requestTracer.finishRequestSpan(span, apiMetrics);
    }

    return apiMetrics;
  }

  // Public API methods
  setConfig(config: Partial<BaseWrapperConfig>): void {
    this.config = { ...this.config, ...config };
  }

  getConfig(): Readonly<Required<BaseWrapperConfig>> {
    return this.config;
  }

  getProviderMetricsManager(): ProviderMetricsManager {
    return this.providerMetrics;
  }

  getRequestTracer(): RequestTracer {
    return this.requestTracer;
  }
}
