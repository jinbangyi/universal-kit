import { Histogram, Counter, UpDownCounter, metrics, Meter } from '@opentelemetry/api';
import { BaseApiMetrics } from '../typing';

export interface ProviderMetricsConfig {
  enabled: boolean;
  meterName?: string;
  meterVersion?: string;
  getStatusCategory?: (statusCode: number) => string;
  isSuccessStatus?: (statusCode: number) => boolean;
}

export interface ProviderMetricsCollection {
  // API Provider latency metrics
  providerLatency: Histogram;

  // API Key usage tracking
  apiKeyUsage: Counter;

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

    // API Key usage counter
    this.metrics.apiKeyUsage = this.meter.createCounter('api_provider_api_key_usage_total', {
      description: 'Total number of API key usages',
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

  recordRequestStart(
    baseAttributes: BaseApiMetrics,
    requestSize?: number,
  ): void {
    if (!this.config.enabled) return;

    const attributes = {
      provider: baseAttributes.provider,
      api_key: baseAttributes.apiKey,
      host: baseAttributes.host,
      method: baseAttributes.method,
      path: baseAttributes.path,
    };

    // Increment active requests
    this.metrics.activeRequests.add(1, attributes);

    // Record request size if available
    if (requestSize !== undefined) {
      this.metrics.requestSize.record(requestSize, attributes);
    }

    // Record API key usage
    this.metrics.apiKeyUsage.add(1, {
      provider: baseAttributes.provider,
      api_key: baseAttributes.apiKey,
      path: baseAttributes.path,
    });
  }

  recordRequestComplete(
    baseApiMetrics: BaseApiMetrics,
    statusCode: number,
    duration: number,
    responseSize?: number,
  ): void {
    if (!this.config.enabled) return;

    const baseAttributes = {
      provider: baseApiMetrics.provider,
      api_key: baseApiMetrics.apiKey,
      host: baseApiMetrics.host,
      method: baseApiMetrics.method,
      path: baseApiMetrics.path,
    };

    const attributes = {
      ...baseAttributes,
      status_code: statusCode.toString(),
      status_category: this.config.getStatusCategory(statusCode),
    };

    // Record latency
    this.metrics.providerLatency.record(duration, attributes);

    // Record response size if available
    if (responseSize !== undefined) {
      this.metrics.responseSize.record(responseSize, attributes);
    }

    // Record provider request counters
    this.metrics.providerRequests.add(1, baseAttributes);

    // Record success or failure
    if (this.config.isSuccessStatus(statusCode)) {
      this.metrics.providerSuccesses.add(1, {
        ...baseAttributes,
        status_code: statusCode.toString(),
      });
    } else {
      this.metrics.providerFailures.add(1, {
        ...baseAttributes,
        status_code: statusCode.toString(),
      });
    }

    // Decrement active requests
    this.metrics.activeRequests.add(-1, baseAttributes);
  }

  recordRequestError(
    baseApiMetrics: BaseApiMetrics,
    errorType: string,
  ): void {
    if (!this.config.enabled) return;

    const attributes = {
      provider: baseApiMetrics.provider,
      host: baseApiMetrics.host,
      api_key: baseApiMetrics.apiKey,
      method: baseApiMetrics.method,
      path: baseApiMetrics.path,
      error_type: errorType,
    };

    // Record provider failure
    this.metrics.providerFailures.add(1, attributes);

    // Decrement active requests
    this.metrics.activeRequests.add(-1, attributes);
  }

  getProviderSuccessRate(provider: string, apiKey: string): number {
    // This would typically be calculated from metrics data
    // For now, return a placeholder implementation
    return 0.95; // Placeholder
  }

  private getStatusCategory(statusCode: number): string {
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
