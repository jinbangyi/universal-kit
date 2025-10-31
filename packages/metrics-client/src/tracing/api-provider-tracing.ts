import { Logger } from '@universal-kit/logger';
import { trace, SpanKind, SpanStatusCode, context as otelContext, Tracer, Span } from '@opentelemetry/api';
import { BaseApiMetrics, ApiMetrics } from '../typing';

export interface RequestTraceConfig {
  enabled?: boolean; // Default: true
  tracingName?: string; // Default: 'api-provider-tracing'
  tracingVersion?: string; // Default: '1.0.0'
  traceFailedRequests?: boolean; // Default: true
  logRequestEvents?: boolean; // Default: true
  includeFailedRequestBody?: boolean; // Default: true
}

interface RequestEvent extends BaseApiMetrics {
  type: 'start' | 'complete' | 'error' | 'retry';
  timestamp: number;
  url: string;
  statusCode?: number;
  duration?: number;
  error?: Error;
  metadata?: Record<string, any>;
}

export class RequestTracer {
  private config: Required<RequestTraceConfig>;
  private logger: Logger;
  private tracer: Tracer;

  constructor(config: RequestTraceConfig, logger: Logger) {
    this.config = {
      enabled: true,
      tracingName: 'api-provider-tracing',
      tracingVersion: '1.0.0',
      traceFailedRequests: true,
      logRequestEvents: true,
      includeFailedRequestBody: true,
      ...config,
    };

    this.logger = logger;

    this.tracer = trace.getTracer(this.config.tracingName, this.config.tracingVersion);
  }

  createRequestSpan(
    baseAttributes: BaseApiMetrics,
  ): Span | null {
    if (!this.config.enabled) return null;

    const span = this.tracer.startSpan(
      `HTTP ${baseAttributes.method} ${baseAttributes.path}`,
      {
        kind: SpanKind.CLIENT,
        attributes: {
          'request.id': baseAttributes.requestId,
          'api.provider': baseAttributes.provider,
          'api.key': baseAttributes.apiKey,
          'http.host': baseAttributes.host,
          'http.method': baseAttributes.method,
          'http.path': baseAttributes.path,
        },
      },
    );

    return span;
  }

  logRequestEvent(event: RequestEvent): void {
    if (!this.config.enabled || !this.config.logRequestEvents) return;

    const logData = {
      requestId: event.requestId,
      provider: event.provider,
      apiKey: event.apiKey,
      method: event.method,
      url: event.url,
      statusCode: event.statusCode,
      duration: event.duration,
      error: event.error ? {
        name: event.error.name,
        message: event.error.message,
        stack: event.error.stack,
      } : undefined,
      metadata: event.metadata,
    };

    switch (event.type) {
      case 'start':
        this.logger.info(
          `Request started: ${event.method} ${event.url}`,
          logData,
        );
        break;

      case 'complete':
        this.logger.info(
          `Request completed: ${event.method} ${event.url} (${event.statusCode})`,
          logData,
        );
        break;

      case 'error':
        this.logger.error(
          `Request failed: ${event.method} ${event.url}`,
          event.error || new Error('Unknown error'),
          { requestId: event.requestId }
        );
        break;

      case 'retry':
        this.logger.warn(
          `Request retry: ${event.method} ${event.url}`,
          logData,
        );
        break;
    }
  }

  logFailedRequestDetails(
    requestId: string,
    method: string,
    url: string,
    error: Error,
    request?: { method: string; url: string; headers: Record<string, any>; body: any },
  ): void {
    if (!this.config.enabled || !this.config.traceFailedRequests) return;

    const errorDetails = {
      requestId,
      method,
      url,
      error: {
        name: error.name,
        message: error.message,
        stack: error.stack,
      },
      request: request && this.config.includeFailedRequestBody ? this.sanitizeRequest(request) : undefined,
      timestamp: Date.now(),
    };

    this.logger.error(
      `Detailed failed request`,
      error,
      { requestId },
    );

    // Log the detailed error data as structured metadata
    this.logger.info(
      `Failed request details:`,
      errorDetails,
    );
  }

  finishRequestSpan(span: Span | null, metrics: ApiMetrics): void {
    if (!span || !this.config.enabled) return;

    span.setAttributes({
      'http.status_code': metrics.statusCode,
      'response.duration_ms': metrics.duration,
      ...(metrics.provider && { 'api.provider': metrics.provider }),
      ...(metrics.apiKey && { 'api.key': metrics.apiKey }),
      ...(metrics.path && { 'http.target': metrics.path }),
    });

    if (metrics.statusCode && metrics.statusCode >= 400) {
      span.setStatus({
        code: SpanStatusCode.ERROR,
        message: `HTTP ${metrics.statusCode}`,
      });
    } else {
      span.setStatus({
        code: SpanStatusCode.OK,
      });
    }

    span.end();
  }

  setSpanAttributes(span: any, attributes: Record<string, any>): void {
    if (!span || !this.config.enabled) return;

    span.setAttributes(attributes);
  }

  addSpanEvent(span: any, name: string, attributes?: Record<string, any>): void {
    if (!span || !this.config.enabled) return;

    span.addEvent(name, attributes);
  }

  private sanitizeRequest(request: { method: string; url: string; headers: Record<string, any>; body: any }): any {
    if (!request) return undefined;

    const sanitized: any = {
      method: request.method,
      url: request.url,
      headers: this.sanitizeHeaders(request.headers),
    };

    if (request.body) {
      const requestData = JSON.stringify(request.body);
      if (requestData.length <= 2048) { // 2KB limit for request body
        sanitized.data = request.body;
      } else {
        sanitized.data = {
          type: typeof request.body,
          size: requestData.length,
          truncated: true,
        };
      }
    }

    return sanitized;
  }

  private sanitizeHeaders(headers: Record<string, any>): Record<string, any> {
    const sanitized: Record<string, any> = {};

    for (const [key, value] of Object.entries(headers)) {
      // Skip sensitive headers
      const lowerKey = key.toLowerCase();
      if (lowerKey.includes('authorization') ||
          lowerKey.includes('api-key') ||
          lowerKey.includes('token') ||
          lowerKey.includes('secret')) {
        sanitized[key] = '****';
      } else {
        sanitized[key] = value;
      }
    }

    return sanitized;
  }

  // Get current span from context
  getCurrentSpan(): any {
    return trace.getSpan(otelContext.active());
  }

  // Get configuration
  getConfig(): RequestTraceConfig {
    return { ...this.config };
  }

  // Update configuration
  updateConfig(config: Partial<RequestTraceConfig>): void {
    this.config = { ...this.config, ...config };
  }
}
