import { Logger } from '@universal-kit/logger';
import { trace, SpanKind, SpanStatusCode, context as otelContext, Tracer, Span } from '@opentelemetry/api';
import { RequestInfo, ResponseInfo } from '../typing';

export interface RequestTraceConfig {
  enabled?: boolean; // Default: true
  tracingName?: string; // Default: 'api-provider-tracing'
  tracingVersion?: string; // Default: '1.0.0'
  traceFailedRequests?: boolean; // Default: true
  logRequestEvents?: boolean; // Default: true
  includeFailedRequestBody?: boolean; // Default: true
}

interface RequestEvent extends RequestInfo {
  type: 'start' | 'complete' | 'error' | 'retry';
  timestamp: number;
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
    requestInfo: RequestInfo,
  ): Span | null {
    if (!this.config.enabled) return null;

    const span = this.tracer.startSpan(
      `HTTP ${requestInfo.method} ${requestInfo.path}`,
      {
        kind: SpanKind.CLIENT,
        attributes: {
          'request.id': requestInfo.requestId,
          'api.provider': requestInfo.provider,
          'api.key': requestInfo.apiKey,
          'http.host': requestInfo.host,
          'http.method': requestInfo.method,
          'http.path': requestInfo.path,
        },
      },
    );

    return span;
  }

  logRequestEvent(event: RequestEvent): void {
    if (!this.config.enabled || !this.config.logRequestEvents) return;

    const baseMessage = `Request [${event.type.toUpperCase()}] ${event.method} ${event.url}`;
    const logData = {
      requestId: event.requestId,
      provider: event.provider,
      apiKey: event.apiKey,
      statusCode: event.statusCode,
      duration: event.duration,
      metadata: event.metadata,
    };
    const fullLogData = {
      ...logData,
      params: event.params,
      headers: event.headers,
      body: event.body,
    };

    switch (event.type) {
      case 'start':
        this.logger.verbose(
          baseMessage,
          fullLogData,
        );
        break;

      case 'complete':
        this.logger.info(
          `${baseMessage} (${event.statusCode})`,
          { ...logData, statusCode: undefined },
        );
        break;

      case 'error':
        this.logger.error(
          baseMessage,
          event.error || new Error('Unknown error'),
          fullLogData,
        );
        break;

      case 'retry':
        this.logger.warn(
          baseMessage,
          logData,
        );
        break;
    }
  }

  logFailedRequestDetails(
    requestInfo: RequestInfo,
    error: Error,
  ) {
    if (!this.config.enabled || !this.config.traceFailedRequests) return;

    const errorDetails = {
      requestId: requestInfo.requestId,
      method: requestInfo.method,
      url: requestInfo.url,
      error: {
        name: error.name,
        message: error.message,
        stack: error.stack,
      },
      request: this.config.includeFailedRequestBody ? this.sanitizeRequest(requestInfo) : undefined,
      timestamp: Date.now(),
    };

    // Log the error summary
    this.logger.error(
      `Detailed failed request`,
      error,
      { requestId: requestInfo.requestId },
    );

    // Log the detailed error data as structured metadata
    this.logger.info(
      `Failed request details:`,
      errorDetails,
    );
  }

  finishRequestSpan(span: Span, metrics: ResponseInfo) {
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

  private sanitizeRequest(request: RequestInfo): any {
    if (!request) return undefined;

    const sanitized: any = {
      headers: this.sanitizeHeaders(request.headers),
      data: undefined,
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
