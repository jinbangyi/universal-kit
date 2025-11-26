import { Logger } from '@universal-kit/logger';
import { BaseHttpClient, type BaseWrapperConfig } from './common.js';
import type { AxiosRequestMetadata } from '../typing.js';

type InstrumentedRequest = Request & { skipMetrics?: boolean };

interface InstrumentedRequestInit extends RequestInit {
  skipMetrics?: boolean;
}

export class NodeFetchWrapper extends BaseHttpClient {
  constructor(
    config: BaseWrapperConfig,
    logger?: Logger,
  ) {
    const baseConfig: BaseWrapperConfig = {
      ...config,
      provider: `${config.provider}:${NodeFetchWrapper.name}`,
    };

    super(baseConfig, logger);
  }

  private stripInstrumentationOptions(options: InstrumentedRequestInit): RequestInit {
    const clonedOptions = { ...options };
    delete clonedOptions.skipMetrics;
    return clonedOptions;
  }

  private async determineResponseSize(response: Response): Promise<number> {
    const headersRecord = this.normalizeHeaders(response.headers);
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

    const requestInfo = this.createRequestInfo({
      method,
      url,
      headers: options.headers,
      body: options.body,
    });
    const { span, startTime } = this.processRequestStart(requestInfo);
    const metadata: AxiosRequestMetadata = {
      startTime,
      requestInfo,
      span: span ?? null,
    };

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
    const baseOptions: InstrumentedRequestInit = { ...(init ?? {}) };
    let url: string;

    if (input instanceof Request) {
      const request = input as InstrumentedRequest;
      const {
        url: requestUrl,
        method: requestMethod,
        headers: requestHeaders,
        body: requestBody,
        signal: requestSignal,
        skipMetrics: requestSkipMetrics,
      } = request;

      url = requestUrl;
      baseOptions.method = baseOptions.method ?? requestMethod;
      baseOptions.headers = baseOptions.headers ?? requestHeaders;
      if (baseOptions.body === undefined && requestBody !== null) {
        baseOptions.body = requestBody;
      }
      if (baseOptions.signal === undefined) {
        baseOptions.signal = requestSignal;
      }
      if (baseOptions.skipMetrics === undefined && requestSkipMetrics !== undefined) {
        baseOptions.skipMetrics = requestSkipMetrics;
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

  // Expose refreshOpenApiSpecs for manual refresh
  override async refreshOpenApiSpecs(): Promise<void> {
    return super.refreshOpenApiSpecs();
  }
}
