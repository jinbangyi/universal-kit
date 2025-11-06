import { Logger } from '@universal-kit/logger';
import { ProviderMetricsManager } from '../metrics/api-provider-metrics.js';
import { RequestTracer } from '../tracing/api-provider-tracing.js';
import type { RequestTraceConfig } from '../tracing/api-provider-tracing.js';
import type { AxiosRequestMetadata, ErrorContext, RequestInfo, ResponseInfo } from '../typing.js';
import { InternalAxiosRequestConfig } from 'axios';

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
  redactedHeaders?: string[]; // Headers to redact in logs and traces
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
      redactedHeaders: [],
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

  protected parseUrl(url: string) {
    try {
      const parsedUrl = new URL(url);
      return {
        host: parsedUrl.hostname || 'unknown',
        pathname: parsedUrl.pathname || '/',
        params: Object.fromEntries(parsedUrl.searchParams.entries()),
      };
    } catch {
      // Fallback for relative URLs
      return {
        host: 'localhost',
        pathname: url.split('?')[0] || '/',
        params: Object.fromEntries(new URLSearchParams(url.split('?')[1] || '').entries()),
      };
    }
  }

  protected requestDataAttributes(request: Pick<RequestInfo, 'headers' | 'body'>): Record<string, string> {
    if (!request) return {};
    // create attributes for headers and body info
    const sanitized: Record<string, string> = {};

    if (request.headers) {
      sanitized['request.headers'] = JSON.stringify(request.headers);
    }

    if (request.body) {
      const bodyData = JSON.stringify(request.body);
      if (bodyData.length <= 2048) { // 2KB limit for request body
        sanitized['request.body'] = bodyData;
      } else {
        sanitized['request.body'] = `type: ${typeof request.body}, size: ${bodyData.length}, truncated: true`;
      }
    }

    return sanitized;
  }

  protected createRequestInfo(
    config: InternalAxiosRequestConfig,
  ): RequestInfo {
    const _apikey = this.config.getApiKey(config);
    const headersRecord = this.normalizeHeaders(config.headers);
    const sanitizedHeaders = this.sanitizeHeaders(headersRecord, _apikey);

    const apiKey = this.hashApiKey(_apikey);
    const method = config.method?.toUpperCase() || 'GET';
    const url = config.url || '';
    const requestId = this.generateRequestId();
    const { host, pathname, params } = this.parseUrl(url);
    const requestSize = this.calculateRequestSize(config.data);

    return {
      requestId,
      provider: this.config.provider,
      apiKey,
      url,
      host,
      method,
      path: pathname,
      headers: sanitizedHeaders,
      params,
      body: config.data,
      ...(requestSize !== undefined && { requestSize }),
    };
  }

  private normalizeHeaders(rawHeaders: InternalAxiosRequestConfig['headers']): Record<string, any> {
    const headers: Record<string, any> = {};

    if (!rawHeaders) return headers;

    const candidate = rawHeaders as any;

    if (candidate && typeof candidate.toJSON === 'function') {
      return { ...candidate.toJSON() };
    }

    return { ...(candidate as Record<string, any>) };
  }

  protected sanitizeHeaders(headers: Record<string, any>, apiKey: string): Record<string, any> {
    const sanitized: Record<string, any> = {};
    const apiKeyHeader = this.config.apiKeyHeader?.toLowerCase();
    const redactedHeaders = this.config.redactedHeaders?.map(header => header.toLowerCase()) ?? [];

    for (const [key, value] of Object.entries(headers)) {
      const lowerKey = key.toLowerCase();
      let sanitizedValue = value;

      if (apiKeyHeader && lowerKey === apiKeyHeader) {
        sanitizedValue = '****';
      } else if (redactedHeaders.includes(lowerKey)) {
        sanitizedValue = '****';
      } else if (value === apiKey) {
        sanitizedValue = '****';
      }

      sanitized[key] = sanitizedValue;
    }

    return sanitized;
  }

  protected processRequestStart(
    requestInfo: RequestInfo,
  ): { span: any; startTime: number } {
    const startTime = Date.now();

    // Create request span for tracing
    const span = this.requestTracer.createRequestSpan(requestInfo);

    // Log request start event
    this.requestTracer.logRequestEvent({
      ...requestInfo,
      type: 'start',
      timestamp: startTime,
    });

    // Record provider metrics start
    this.providerMetrics.recordRequestStart(requestInfo);

    return { span, startTime };
  }

  protected processRequestComplete(
    requestMetadata: AxiosRequestMetadata,
    statusCode: number,
    responseSize: number,
  ): ResponseInfo {
    const duration = Date.now() - requestMetadata.startTime;
    const responseInfo: ResponseInfo = {
      ...requestMetadata.requestInfo,
      duration,
      statusCode,
      responseSize,
    };

    // Record provider metrics
    this.providerMetrics.recordRequestComplete(responseInfo);

    // Log request completion
    this.requestTracer.logRequestEvent({
      ...responseInfo,
      type: 'complete',
      timestamp: Date.now(),
    });

    // Finish request span
    this.requestTracer.finishRequestSpan(requestMetadata.span, responseInfo);

    return responseInfo;
  }

  protected processRequestError(
    requestMetadata: AxiosRequestMetadata,
    error: Error,
    responseContext?: ErrorContext,
  ): RequestInfo {
    const duration = Date.now() - requestMetadata.startTime;
    const requestInfo: RequestInfo = requestMetadata.requestInfo;

    // Record provider error metrics
    this.providerMetrics.recordRequestError(
      requestInfo,
      error.constructor.name,
    );

    // Log request error
    this.requestTracer.logRequestEvent({
      ...requestInfo,
      type: 'error',
      timestamp: Date.now(),
      duration,
      error,
    });

    // Log detailed failed request information
    if (this.config.traceFailedRequests) {
      this.requestTracer.logFailedRequestDetails(
        requestInfo,
        error,
        responseContext || {},
      );
    }

    // axios error may have response with status code
    const statusCode = (error as any).response?.status || 501;
    // Finish request span with error
    this.requestTracer.finishRequestSpan(
      requestMetadata.span,
      { ...requestInfo, duration, statusCode, responseSize: 0 },
      this.requestDataAttributes(requestMetadata.requestInfo),
    );

    return requestInfo;
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
