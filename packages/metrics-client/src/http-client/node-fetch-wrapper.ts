import { Logger } from '@universal-kit/logger';
import { BaseHttpClient, defaultApiKey } from './common.js';
import type { BaseWrapperConfig } from './common.js';
import type { AxiosRequestMetadata, RequestInfo } from '../typing.js';

type InstrumentedRequest = Request & { skipMetrics?: boolean };

interface InstrumentedRequestInit extends RequestInit {
  skipMetrics?: boolean;
}

export interface NodeFetchWrapperConfig extends BaseWrapperConfig {
  getApiKey?: (options: RequestInit) => string;
}

export class NodeFetchWrapper extends BaseHttpClient {
  constructor(
    config: NodeFetchWrapperConfig,
    logger?: Logger,
  ) {
    const baseConfig: BaseWrapperConfig = {
      getApiKey: (options: RequestInit) => this.getApiKeyFromOptions(options),
      ...config,
      provider: `${config.provider}:${NodeFetchWrapper.name}`,
    };

    super(baseConfig, logger);
  }

  private getApiKeyFromOptions(options: RequestInit = {}): string {
    const headers = this.headersToRecord(options.headers);

    if (this.config.apiKeyHeader) {
      const headerName = this.config.apiKeyHeader.toLowerCase();

      for (const [key, value] of Object.entries(headers)) {
        if (key.toLowerCase() === headerName && value) {
          return value;
        }
      }
    }

    return defaultApiKey;
  }

  private headersToRecord(headers?: RequestInit['headers']): Record<string, string> {
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

    if (typeof (headers as any).forEach === 'function') {
      (headers as any).forEach((value: string, key: string) => {
        result[String(key)] = String(value);
      });
      return result;
    }

    for (const [key, value] of Object.entries(headers as Record<string, string>)) {
      result[String(key)] = String(value);
    }

    return result;
  }

  private createRequestInfoForFetch(
    method: string,
    url: string,
    options: InstrumentedRequestInit,
  ): RequestInfo {
    const rawHeaders = this.headersToRecord(options.headers);
    const apiKey = this.config.getApiKey(options);
    const hashedApiKey = this.hashApiKey(apiKey);
    const { host, pathname, params } = this.parseUrl(url);
    const requestSize = this.calculateRequestSize(options.body);

    const requestInfo: RequestInfo = {
      requestId: this.generateRequestId(),
      provider: this.config.provider,
      apiKey: hashedApiKey,
      url,
      host,
      method,
      path: pathname,
      headers: this.sanitizeHeaders(rawHeaders, apiKey),
      params,
      body: options.body,
    };

    if (requestSize !== undefined) {
      requestInfo.requestSize = requestSize;
    }

    return requestInfo;
  }

  private stripInstrumentationOptions(options: InstrumentedRequestInit): RequestInit {
    const { skipMetrics: _skipMetrics, ...rest } = options;
    return { ...rest };
  }

  private async determineResponseSize(response: Response): Promise<number> {
    const headersRecord = this.headersToRecord(response.headers);
    const headerSize = this.calculateResponseSizeFromHeaders(headersRecord);

    if (headerSize !== undefined) {
      return headerSize;
    }

    try {
      const clone = response.clone();
      const buffer = await clone.arrayBuffer();
      return buffer.byteLength;
    } catch {
      return 0;
    }
  }

  private async makeRequest(
    method: string,
    url: string,
    options: InstrumentedRequestInit = {},
  ): Promise<Response> {
    const skipMetrics = options.skipMetrics ?? false;
    const requestInit: RequestInit = { ...this.stripInstrumentationOptions(options), method };

    if (skipMetrics) {
      return fetch(url, requestInit);
    }

    const requestInfo = this.createRequestInfoForFetch(method, url, options);
    const { span, startTime } = this.processRequestStart(requestInfo);
    const metadata = {
      startTime,
      requestInfo,
      span: span ?? null,
    } as AxiosRequestMetadata;

    try {
      const response = await fetch(url, requestInit);
      const responseSize = await this.determineResponseSize(response);

      this.processRequestComplete(metadata, response.status, responseSize);

      return response;
    } catch (error) {
      const normalizedError = error instanceof Error ? error : new Error('Unknown error');
      this.processRequestError(metadata, normalizedError);
      throw normalizedError;
    }
  }

  private async withRetry<T>(
    operation: () => Promise<T>,
    attempt: number = 1,
  ): Promise<T> {
    try {
      return await operation();
    } catch (error) {
      if (
        attempt < this.config.retryConfig.attempts &&
        this.shouldRetry(error)
      ) {
        this.logger.warn(
          `Request failed, retrying (${attempt}/${this.config.retryConfig.attempts})`,
          {
            attempt,
            error: error instanceof Error ? error.message : 'Unknown error',
          },
        );

        await this.delay(this.config.retryConfig.delay * attempt);
        return this.withRetry(operation, attempt + 1);
      }
      throw error;
    }
  }

  private shouldRetry(error: unknown): boolean {
    if (error instanceof Error) {
      const message = error.message.toLowerCase();
      return (
        error.name === 'AbortError' ||
        message.includes('timeout') ||
        message.includes('network') ||
        message.includes('fetch')
      );
    }
    return false;
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  async fetch(input: string | URL | Request, init?: InstrumentedRequestInit): Promise<Response> {
    const baseOptions: InstrumentedRequestInit = { ...(init || {}) };
    let url: string;

    if (input instanceof Request) {
      const request = input as InstrumentedRequest;
      url = request.url;
      baseOptions.method = baseOptions.method ?? request.method;
      baseOptions.headers = baseOptions.headers ?? request.headers;
      if (baseOptions.body === undefined && request.body !== null) {
        baseOptions.body = request.body as any;
      }
      if (baseOptions.signal === undefined) {
        baseOptions.signal = request.signal;
      }
      if (baseOptions.skipMetrics === undefined && request.skipMetrics !== undefined) {
        baseOptions.skipMetrics = request.skipMetrics;
      }
    } else {
      url = input instanceof URL ? input.toString() : input;
    }

    const method = (baseOptions.method ?? 'GET').toUpperCase();
    const options: InstrumentedRequestInit = { ...baseOptions, method };

    return await this.withRetry(() =>
      this.makeRequest(method, url, options),
    );
  }
}
