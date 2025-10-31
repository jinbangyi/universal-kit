export interface BaseApiMetrics {
  requestId: string;
  provider: string;
  apiKey: string;
  host: string;
  method: string;
  path: string;
}

export interface ApiMetrics extends BaseApiMetrics {
  duration: number;
  statusCode?: number;
  url?: string;
  userAgent?: string;
  error?: Error;
  metadata?: Record<string, any>;
  requestSize?: number;
  responseSize?: number;
  timestamp?: number;
}
