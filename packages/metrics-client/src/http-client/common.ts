import { Logger } from '@universal-kit/logger';
import { Span } from '@opentelemetry/api';

import { ProviderMetricsManager } from '../metrics/api-provider-metrics.js';
import { RequestTracer, type RequestTraceConfig } from '../tracing/api-provider-tracing.js';
import type { AxiosRequestMetadata, ErrorContext, RequestInfo, ResponseInfo } from '../typing.js';

export interface GeneralRequestConfig {
  url: string;
  method: string;
  params?: URLSearchParams | Record<string, unknown>;
  headers?: RequestInit['headers'];
  body?: RequestInit['body'];
}

// eslint-disable-next-line no-unused-vars
type ApiKeyResolver = (arg: GeneralRequestConfig) => string;

export interface BaseWrapperConfig {
  // name of the API
  provider: string;
  getApiKey?: ApiKeyResolver;
  apiKeyHeader?: string; // Default: 'x-api-key'
  apiKeyQueryParam?: string; // Default: 'x-api-key'
  retryConfig?: { // Default: { attempts: 0, delay: 1000 }
    attempts: number;
    delay: number;
  };
  traceFailedRequests?: boolean; // Default: true
  logRequestEvents?: boolean; // Default: true
  redactedHeaders?: string[]; // Headers to redact in logs and traces
}

export const defaultApiKey = 'NOT_FOUND_API_KEY';
const generalApiKeyHeaders = [
  'x-api-key',
  'authorization',
  'apikey',
  'OK-ACCESS-KEY',
  'x-cg-pro-api-key',
  'X-CMC_PRO_API_KEY',
  'AccessKey',
].map(header => header.toLowerCase());
const defaultRedactedHeaders = [
  ...generalApiKeyHeaders,
  'OK-ACCESS-SIGN',
  'OK-ACCESS-PASSPHRASE',
].map(header => header.toLowerCase());

export abstract class BaseHttpClient {
  protected config: Required<BaseWrapperConfig>;
  protected logger: Logger;
  protected providerMetrics: ProviderMetricsManager;
  protected requestTracer: RequestTracer;

  constructor(config: BaseWrapperConfig, logger?: Logger) {
    this.config = {
      getApiKey: this.getDefaultApiKey.bind(this),
      apiKeyHeader: '',
      apiKeyQueryParam: '',
      retryConfig: {
        attempts: 0,
        delay: 1000,
      },
      traceFailedRequests: true,
      logRequestEvents: true,
      redactedHeaders: defaultRedactedHeaders,
      ...config,
    };

    this.logger = logger ?? new Logger({ library: this.config.provider });

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

  protected normalizeHeaders(headers: RequestInit['headers']): Record<string, string> {
    const result: Record<string, string> = {};

    if (!headers) return result;

    if (Array.isArray(headers)) {
      for (const entry of headers) {
        if (!Array.isArray(entry)) continue;
        const [key, value] = entry;
        if (key === undefined || value === undefined) continue;
        result[String(key)] = String(value);
      }
      return result;
    }

    if ((typeof headers.forEach) === 'function') {
      headers.forEach((value: string, key: string) => {
        result[String(key)] = String(value);
      });
      return result;
    }

    for (const [key, value] of Object.entries(headers as Record<string, string>)) {
      result[String(key)] = String(value);
    }

    return result;
  }

  private getDefaultApiKey(config: GeneralRequestConfig): string {
    const _normalizedHeaders = this.normalizeHeaders(config.headers);
    const normalizedHeaders: Record<string, string> = {};
    // lowercase key _normalizedHeaders
    for (const key of Object.keys(_normalizedHeaders)) {
      if (!_normalizedHeaders[key]) continue;
      normalizedHeaders[key.toLowerCase()] = _normalizedHeaders[key];
    }

    let headers: string[] = [];
    // try lowercase, uppercase, and original case
    if (
      (this.config.apiKeyHeader === undefined || this.config.apiKeyHeader === '') &&
      (this.config.apiKeyQueryParam === undefined || this.config.apiKeyQueryParam === '')
    ) {
      headers = generalApiKeyHeaders;
    } else {
      headers = [
        (this.config.apiKeyHeader ?? '').toLowerCase(),
      ];
    }

    // try to read from header
    const apiKey = headers.map(header => normalizedHeaders[header]).find(Boolean);
    if (apiKey) return apiKey;

    // try to read from query param
    if (config.params) {
      let queryParamKeys: string[] = [];

      if (this.config.apiKeyQueryParam === undefined || this.config.apiKeyQueryParam === '') {
        queryParamKeys = generalApiKeyHeaders;
      } else if (this.config.apiKeyQueryParam) {
        queryParamKeys = [this.config.apiKeyQueryParam.toLowerCase()];
      }

      if (queryParamKeys.length > 0) {
        const normalizedParamKeys = new Set(queryParamKeys.map(key => key.toLowerCase()));

        if (config.params instanceof URLSearchParams) {
          for (const [key, value] of config.params.entries()) {
            if (normalizedParamKeys.has(key.toLowerCase()) && value) {
              return value;
            }
          }
        } else if (typeof config.params === 'object') {
          const paramsObject = config.params;
          for (const [key, value] of Object.entries(paramsObject)) {
            if (value == null) continue;
            if (normalizedParamKeys.has(key.toLowerCase())) {
              return String(value);
            }
          }
        }
      }
    }

    return defaultApiKey;
  }

  protected generateRequestId(): string {
    return `req_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
  }

  protected calculateRequestSize(data?: unknown): number | undefined {
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

  protected calculateResponseSizeFromHeaders(headers: Record<string, unknown>): number | undefined {
    const contentLength = headers['content-length'] ?? headers['Content-Length'];
    if (typeof contentLength === 'string' && contentLength.length > 0) {
      return parseInt(contentLength, 10);
    }
    return undefined;
  }

  protected calculateResponseSizeFromData(data?: unknown): number | undefined {
    if (!data) return undefined;

    try {
      return Buffer.byteLength(JSON.stringify(data), 'utf8');
    } catch {
      return undefined;
    }
  }

  protected parseUrl(url: string): { host: string; pathname: string; params: Record<string, string> } {
    try {
      const parsedUrl = new URL(url);
      const host = parsedUrl.hostname && parsedUrl.hostname.length > 0 ? parsedUrl.hostname : 'unknown';
      const pathname = parsedUrl.pathname && parsedUrl.pathname.length > 0 ? parsedUrl.pathname : '/';
      return {
        host,
        pathname,
        params: Object.fromEntries(parsedUrl.searchParams.entries()),
      };
    } catch {
      // Fallback for relative URLs
      const [rawPath, rawQuery] = url.split('?');
      const pathname = rawPath && rawPath.length > 0 ? rawPath : '/';
      const query = rawQuery ?? '';
      return {
        host: 'localhost',
        pathname,
        params: Object.fromEntries(new URLSearchParams(query).entries()),
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
    config: GeneralRequestConfig,
  ): RequestInfo {
    const url = config.url ?? '';
    const requestId = this.generateRequestId();
    const { host, pathname, params } = this.parseUrl(url);
    // combine params read from URL and config.params
    if (config.params) {
      // Handle different types of params (URLSearchParams, plain object, etc.)
      if (config.params instanceof URLSearchParams) {
        for (const [key, value] of config.params.entries()) {
          params[key] = value;
        }
      } else if (typeof config.params === 'object') {
        // Handle plain object params (e.g., from Axios)
        for (const [key, value] of Object.entries(config.params)) {
          params[key] = String(value);
        }
      }
      config.params = new URLSearchParams(params);
    }

    const _apikey = this.config.getApiKey(config);
    const headersRecord = this.normalizeHeaders(config.headers);
    const sanitizedHeaders = this.sanitizeHeaders(headersRecord, _apikey);

    const apiKey = this.hashApiKey(_apikey);
    const method = config.method ? config.method.toUpperCase() : 'GET';
    const requestSize = this.calculateRequestSize(config.body);

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
      body: config.body,
      ...(requestSize !== undefined && { requestSize }),
    };
  }

  protected sanitizeHeaders(headers: Record<string, string>, apiKey: string): Record<string, string> {
    const sanitized: Record<string, string> = {};
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
  ): { span: Span | null; startTime: number } {
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
    this.requestTracer.finishRequestSpan(
      requestMetadata.span,
      responseInfo,
    );

    return responseInfo;
  }

  protected processRequestError(
    requestMetadata: AxiosRequestMetadata,
    error: Error,
    responseContext?: ErrorContext,
    spanAlreadyFinished: boolean = false,
  ): RequestInfo {
    const duration = Date.now() - requestMetadata.startTime;
    const { requestInfo } = requestMetadata;

    // Record provider error metrics
    // If response was already processed (for Axios errors with response), don't decrement active requests again
    const shouldDecrementActiveRequests = !responseContext?.responseAlreadyProcessed;
    this.providerMetrics.recordRequestError(
      requestInfo,
      error.constructor.name,
      shouldDecrementActiveRequests,
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
        responseContext ?? {},
      );
    }

    // Only finish the span if it hasn't been finished already
    if (!spanAlreadyFinished) {
      // axios error may have response with status code
      const statusCode = (error as { response?: { status?: number } }).response?.status ?? 501;
      // Finish request span with error
      this.requestTracer.finishRequestSpan(
        requestMetadata.span,
        { ...requestInfo, duration, statusCode, responseSize: 0 },
        this.requestDataAttributes(requestMetadata.requestInfo),
      );
    }

    return requestInfo;
  }

  getProviderMetricsManager(): ProviderMetricsManager {
    return this.providerMetrics;
  }

  getRequestTracer(): RequestTracer {
    return this.requestTracer;
  }

  getProviderName(): string {
    return this.config.provider;
  }
}
