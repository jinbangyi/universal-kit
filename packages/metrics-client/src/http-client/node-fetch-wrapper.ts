import { Logger } from '@universal-kit/logger';
import { BaseHttpClient, BaseWrapperConfig, defaultApiKey } from './common';

export interface NodeFetchWrapperConfig extends BaseWrapperConfig {
  getApiKey?: (options: RequestInit) => string;
}

export class NodeFetchWrapper extends BaseHttpClient {
  constructor(
    config: NodeFetchWrapperConfig,
    logger?: Logger,
  ) {
    config = {
      getApiKey: (options: RequestInit) => this.getApiKeyFromOptions(options),
      ...config,
    };
    super(config, logger);
  }

  private getApiKeyFromOptions(options: RequestInit): string {
    const apikey = options.headers ?
      (options.headers as Record<string, string>)[this.config.apiKeyHeader] :
      undefined;
    if (apikey) return apikey;
    return defaultApiKey;
  }

  private async makeRequest(
    method: string,
    url: string,
    options: RequestInit = {},
  ): Promise<Response> {
    const requestId = this.generateRequestId();
    const apiKey = this.hashApiKey(this.config.getApiKey(options));
    const requestSize = this.calculateRequestSize(options.body);

    const baseAttributes = this.createBaseAttributes(requestId, method, url, apiKey);
    const { span, startTime } = this.processRequestStart(baseAttributes, url, requestSize);

    let response: Response | undefined;
    let responseSize: number | undefined;
    let lastError: Error | undefined;

    try {
      response = await fetch(url, options);

      // Calculate response size if available
      responseSize = this.calculateResponseSizeFromHeaders(Object.fromEntries(response.headers.entries()));

      // Process successful response
      this.processRequestComplete(baseAttributes, url, response, startTime, span, requestSize, responseSize);
      return response;
    } catch (error) {
      lastError = error instanceof Error ? error : new Error('Unknown error');

      // Process error
      this.processRequestError(baseAttributes, url, lastError, startTime, span, requestSize,
        { url, method, headers: options.headers || {}, body: options.body },
      );
      throw lastError;
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
      return (
        error.name === 'AbortError' ||
        error.message.includes('timeout') ||
        error.message.includes('network') ||
        error.message.includes('fetch')
      );
    }
    return false;
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  async fetch(input: string | URL | Request, init?: RequestInit): Promise<Response> {
    const url = input instanceof Request ? input.url : input.toString();
    const options: RequestInit = input instanceof Request ? { ...input, ...init } : init || {};
    const method = options.method ? options.method.toUpperCase() : 'GET';

    return await this.withRetry(() =>
      this.makeRequest(method, url, { ...options, method }),
    );
  }
}
