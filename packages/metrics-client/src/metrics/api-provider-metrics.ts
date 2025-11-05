import { Histogram, Counter, UpDownCounter, metrics, Meter } from '@opentelemetry/api';
import type { BaseApiMetrics } from '../typing.js';

export interface ProviderMetricsConfig {
  enabled: boolean;
  meterName?: string;
  meterVersion?: string;
  getStatusCategory?: (statusCode: number | string) => string;
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
      isSuccessStatus: (statusCode: number) => statusCode >= 200 && statusCode < 400,
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
    });

    // Response size histogram
    this.metrics.responseSize = this.meter.createHistogram('api_provider_response_size_bytes', {
      description: 'Size of API provider responses in bytes',
      unit: 'bytes',
    });
  }

  private recordResponseSize(
    attributes: BaseProviderLabels,
    responseSize: number,
  ) {
    this.metrics.responseSize.record(responseSize, {
      provider: attributes.provider,
      api_key: attributes.api_key,
      host: attributes.host,
    });
  }

  private recordRequestSize(
    attributes: BaseProviderLabels,
    requestSize: number,
  ) {
    this.metrics.requestSize.record(requestSize, {
      provider: attributes.provider,
      api_key: attributes.api_key,
      host: attributes.host,
    });
  }

  private changeActiveRequests(
    attributes: BaseProviderLabels,
    delta: number
  ) {
    this.metrics.activeRequests.add(delta, {
      provider: attributes.provider,
      api_key: attributes.api_key,
      host: attributes.host,
    });
  }

  private incrementProviderRequests(
    attributes: FullProviderLabels
  ) {
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
    attributes: FullProviderLabels
  ) {
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
    attributes: FullProviderLabels
  ) {
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
  ) {
    this.metrics.providerLatency.record(duration, {
      provider: attributes.provider,
      api_key: attributes.api_key,
      host: attributes.host,
    });
  }

  recordRequestStart(
    baseAttributes: BaseApiMetrics,
    requestSize?: number,
  ): void {
    if (!this.config.enabled) return;

    // Increment active requests
    this.changeActiveRequests({
      ...baseAttributes,
      api_key: baseAttributes.apiKey,
    }, 1);

    // Record request size if available
    if (requestSize !== undefined) {
      this.recordRequestSize({
        ...baseAttributes,
        api_key: baseAttributes.apiKey,
      }, requestSize);
    }
  }

  recordRequestComplete(
    baseApiMetrics: BaseApiMetrics,
    statusCode: number,
    duration: number,
    responseSize?: number,
  ): void {
    if (!this.config.enabled) return;

    // Record latency
    this.recordProviderLatency({
      ...baseApiMetrics,
      api_key: baseApiMetrics.apiKey,
    }, duration);

    // Record response size if available
    if (responseSize !== undefined) {
      this.recordResponseSize({
        ...baseApiMetrics,
        api_key: baseApiMetrics.apiKey,
      }, responseSize);
    }

    // Record provider request counters
    this.incrementProviderRequests({
      ...baseApiMetrics,
      api_key: baseApiMetrics.apiKey,
      status_code: statusCode.toString(),
      status_category: this.config.getStatusCategory(statusCode),
    });

    // Record success or failure
    if (this.config.isSuccessStatus(statusCode)) {
      this.incrementProviderSuccesses({
        ...baseApiMetrics,
        api_key: baseApiMetrics.apiKey,
        status_code: statusCode.toString(),
        status_category: this.config.getStatusCategory(statusCode),
      });
    } else {
      this.incrementProviderFailures({
        ...baseApiMetrics,
        api_key: baseApiMetrics.apiKey,
        status_code: statusCode.toString(),
        status_category: this.config.getStatusCategory(statusCode),
      });
    }

    // Decrement active requests
    this.changeActiveRequests({
      ...baseApiMetrics,
      api_key: baseApiMetrics.apiKey,
    }, -1);
  }

  recordRequestError(
    baseApiMetrics: BaseApiMetrics,
    errorType: string,
  ): void {
    if (!this.config.enabled) return;

    const codeString = errorType.substring(0, 10);
    // Record provider failure
    this.incrementProviderFailures({
      ...baseApiMetrics,
      api_key: baseApiMetrics.apiKey,
      status_code: codeString,
      status_category: this.config.getStatusCategory(codeString),
    });

    // Decrement active requests
    this.changeActiveRequests({
      ...baseApiMetrics,
      api_key: baseApiMetrics.apiKey,
    }, -1);
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
  getMeter(): any {
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
  if (!defaultProviderMetrics) {
    defaultProviderMetrics = new ProviderMetricsManager(config);
  }
  return defaultProviderMetrics;
}

/**
 * Get default provider metrics instance
 * @returns ProviderMetricsManager instance or creates new one if not exists
 */
export function getProviderMetrics(): ProviderMetricsManager {
  if (!defaultProviderMetrics) {
    defaultProviderMetrics = new ProviderMetricsManager();
  }
  return defaultProviderMetrics;
}
