export interface ApiMetrics {
  duration: number;
  statusCode?: number;
  method?: string;
  url?: string;
  userAgent?: string;
  requestId?: string;
  error?: Error;
  metadata?: Record<string, any>;
  // Enhanced provider monitoring
  provider?: string;
  apiKey?: string;
  path?: string;
  requestSize?: number;
  responseSize?: number;
  timestamp?: number;
}

export interface LogMetadata {
  library: string;
  function: string;
  requestId?: string;
  timestamp: Date;
  [key: string]: any;
}

export interface LoggerConfig {
  level: 'debug' | 'info' | 'warn' | 'error';
  includeMetadata: boolean;
  customFields?: Record<string, any>;
}

export interface HttpClientConfig {
  baseUrl?: string;
  timeout?: number;
  headers?: Record<string, string>;
  retryConfig?: {
    attempts: number;
    delay: number;
  };
  enableMetrics?: boolean;
  // Provider monitoring configuration
  provider?: string;
  apiKey?: string;
  apiKeyHeader?: string; // Default: 'x-api-key'
  traceFailedRequests?: boolean; // Default: true
  logRequestEvents?: boolean; // Default: true
}

export interface DecoratorConfig {
  logRequests?: boolean;
  logResponses?: boolean;
  includeArgs?: boolean;
  customMetadata?: Record<string, any>;
}

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface ApiCallResult<T = any> {
  data: T;
  metrics: ApiMetrics;
  success: boolean;
}
