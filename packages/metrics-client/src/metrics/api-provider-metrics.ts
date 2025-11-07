import { Histogram, Counter, UpDownCounter, metrics, Meter } from '@opentelemetry/api';
import type { RequestInfo, ResponseInfo } from '../typing.js';

export interface ProviderMetricsConfig {
  enabled: boolean;
  meterName?: string;
  meterVersion?: string;
  // eslint-disable-next-line no-unused-vars
  getStatusCategory?: (statusCode: number | string) => string;
  // eslint-disable-next-line no-unused-vars
  isSuccessStatus?: (statusCode: number) => boolean;
}

export interface ProviderMetricsCollection {
  // API Provider latency metrics
  providerLatency: Histogram;

  // Provider success rate metrics
  providerRequests: Counter;
  providerSuccesses: Counter;
  providerFailures: Counter;

  // Active requests gauge
  activeRequests: UpDownCounter;

  // Request/response size metrics
  requestSize: Histogram;
  responseSize: Histogram;
}

interface BaseProviderLabels {
  provider: string;
  api_key: string;
  host: string;
}

interface FullProviderLabels extends BaseProviderLabels {
  method: string;
  path: string;
  status_code: string;
  status_category: string;
}

export class ProviderMetricsManager {
  private metrics: ProviderMetricsCollection;
  private config: Required<ProviderMetricsConfig>;
  private meter: Meter;

  constructor(config: ProviderMetricsConfig = {
    enabled: true,
  }) {
    this.config = {
      meterName: 'api-provider-metrics',
      meterVersion: '1.0.0',
      getStatusCategory: this.getStatusCategory.bind(this),
      isSuccessStatus: (statusCode: number): boolean => statusCode >= 200 && statusCode < 400,
      ...config,
    };

    this.meter = metrics.getMeter(
      this.config.meterName,
      this.config.meterVersion,
    );

    this.metrics = {} as ProviderMetricsCollection;
    this.initializeMetrics();
  }

  private initializeMetrics(): void {
    // API Provider latency histogram
    this.metrics.providerLatency = this.meter.createHistogram('api_provider_latency_ms', {
      description: 'API provider request latency in milliseconds, will ignore failed requests',
      unit: 'ms',
      advice: {
        // 50ms -> 60s
        explicitBucketBoundaries: [50, 100, 500, 1000, 2000, 5000, 10000, 30000, 60000],
      },
    });

    // Provider request counters
    this.metrics.providerRequests = this.meter.createCounter('api_provider_requests_total', {
      description: 'Total number of requests to API providers',
    });

    this.metrics.providerSuccesses = this.meter.createCounter('api_provider_successes_total', {
      description: 'Total number of successful requests to API providers',
    });

    this.metrics.providerFailures = this.meter.createCounter('api_provider_failures_total', {
      description: 'Total number of failed requests to API providers',
    });

    // Active requests gauge
    this.metrics.activeRequests = this.meter.createUpDownCounter('api_provider_active_requests', {
      description: 'Number of currently active requests to API providers',
    });

    // Request size histogram
    this.metrics.requestSize = this.meter.createHistogram('api_provider_request_size_bytes', {
      description: 'Size of API provider requests in bytes',
      unit: 'bytes',
      advice: {
        // 100bytes -> 60KB
        explicitBucketBoundaries: [100, 500, 1000, 2000, 5000, 10000, 30000, 60000],
      },
    });

    // Response size histogram
    this.metrics.responseSize = this.meter.createHistogram('api_provider_response_size_bytes', {
      description: 'Size of API provider responses in bytes',
      unit: 'bytes',
      advice: {
        // 100bytes -> 60KB
        explicitBucketBoundaries: [100, 500, 1000, 2000, 5000, 10000, 30000, 60000],
      },
    });
  }

  private recordResponseSize(
    attributes: BaseProviderLabels,
    responseSize: number,
  ): void {
    this.metrics.responseSize.record(responseSize, {
      provider: attributes.provider,
      api_key: attributes.api_key,
      host: attributes.host,
    });
  }

  private recordRequestSize(
    attributes: BaseProviderLabels,
    requestSize: number,
  ): void {
    this.metrics.requestSize.record(requestSize, {
      provider: attributes.provider,
      api_key: attributes.api_key,
      host: attributes.host,
    });
  }

  private changeActiveRequests(
    attributes: BaseProviderLabels,
    delta: number,
  ): void {
    this.metrics.activeRequests.add(delta, {
      provider: attributes.provider,
      api_key: attributes.api_key,
      host: attributes.host,
    });
  }

  private incrementProviderRequests(
    attributes: FullProviderLabels,
  ): void {
    this.metrics.providerRequests.add(1, {
      provider: attributes.provider,
      api_key: attributes.api_key,
      host: attributes.host,
      method: attributes.method,
      path: attributes.path,
      status_code: attributes.status_code,
      status_category: attributes.status_category,
    });
  }

  private incrementProviderSuccesses(
    attributes: FullProviderLabels,
  ): void {
    this.metrics.providerSuccesses.add(1, {
      provider: attributes.provider,
      api_key: attributes.api_key,
      host: attributes.host,
      method: attributes.method,
      path: attributes.path,
      status_category: attributes.status_category,
    });
  }

  private incrementProviderFailures(
    attributes: FullProviderLabels,
  ): void {
    this.metrics.providerFailures.add(1, {
      provider: attributes.provider,
      api_key: attributes.api_key,
      host: attributes.host,
      method: attributes.method,
      path: attributes.path,
      status_category: attributes.status_category,
    });
  }

  private recordProviderLatency(
    attributes: BaseProviderLabels,
    duration: number,
  ): void {
    this.metrics.providerLatency.record(duration, {
      provider: attributes.provider,
      api_key: attributes.api_key,
      host: attributes.host,
    });
  }

  recordRequestStart(requestInfo: RequestInfo): void {
    if (!this.config.enabled) return;

    // Increment active requests
    this.changeActiveRequests({
      ...requestInfo,
      api_key: requestInfo.apiKey,
    }, 1);

    // Record request size if available
    if (requestInfo.requestSize !== undefined) {
      this.recordRequestSize({
        ...requestInfo,
        api_key: requestInfo.apiKey,
      }, requestInfo.requestSize);
    }
  }

  recordRequestComplete(responseInfo: ResponseInfo): void {
    if (!this.config.enabled) return;

    // Record latency
    this.recordProviderLatency({
      ...responseInfo,
      api_key: responseInfo.apiKey,
    }, responseInfo.duration);

    // Record response size if available
    this.recordResponseSize({
      ...responseInfo,
      api_key: responseInfo.apiKey,
    }, responseInfo.responseSize);

    // Record provider request counters
    this.incrementProviderRequests({
      ...responseInfo,
      api_key: responseInfo.apiKey,
      status_code: responseInfo.statusCode.toString(),
      status_category: this.config.getStatusCategory(responseInfo.statusCode),
    });

    // Record success or failure
    if (this.config.isSuccessStatus(responseInfo.statusCode)) {
      this.incrementProviderSuccesses({
        ...responseInfo,
        api_key: responseInfo.apiKey,
        status_code: responseInfo.statusCode.toString(),
        status_category: this.config.getStatusCategory(responseInfo.statusCode),
      });
    } else {
      this.incrementProviderFailures({
        ...responseInfo,
        api_key: responseInfo.apiKey,
        status_code: responseInfo.statusCode.toString(),
        status_category: this.config.getStatusCategory(responseInfo.statusCode),
      });
    }

    // Decrement active requests
    this.changeActiveRequests({
      ...responseInfo,
      api_key: responseInfo.apiKey,
    }, -1);
  }

  recordRequestError(
    requestInfo: RequestInfo,
    errorType: string,
    shouldDecrementActiveRequests: boolean,
  ): void {
    if (!this.config.enabled) return;

    const codeString = errorType.substring(0, 10);
    // Record provider failure
    this.incrementProviderFailures({
      ...requestInfo,
      api_key: requestInfo.apiKey,
      status_code: codeString,
      status_category: this.config.getStatusCategory(codeString),
    });

    // Decrement active requests if requested (to avoid double-decrementing)
    if (shouldDecrementActiveRequests) {
      this.changeActiveRequests({
        ...requestInfo,
        api_key: requestInfo.apiKey,
      }, -1);
    }
  }

  private getStatusCategory(statusCode: number | string): string {
    if (typeof statusCode === 'string') return statusCode;
    if (this.config.isSuccessStatus(statusCode)) return 'success';
    if (statusCode >= 300 && statusCode < 400) return 'redirection';
    if (statusCode >= 400 && statusCode < 500) return 'client_error';
    if (statusCode >= 500) return 'server_error';
    return 'unknown';
  }

  // Get metrics collection for advanced usage
  getMetrics(): ProviderMetricsCollection {
    return this.metrics;
  }

  // Get the OpenTelemetry meter for advanced usage
  getMeter(): Meter {
    return this.meter;
  }
}

// Global metrics instance (singleton)
let defaultProviderMetrics: ProviderMetricsManager | null = null;

/**
 * Initialize provider metrics with OpenTelemetry
 * @returns ProviderMetricsManager instance
 */
export function initializeProviderMetrics(
  config?: ProviderMetricsConfig,
): ProviderMetricsManager {
  defaultProviderMetrics ??= new ProviderMetricsManager(config);
  return defaultProviderMetrics;
}

/**
 * Get default provider metrics instance
 * @returns ProviderMetricsManager instance or creates new one if not exists
 */
export function getProviderMetrics(): ProviderMetricsManager {
  defaultProviderMetrics ??= new ProviderMetricsManager();
  return defaultProviderMetrics;
}
