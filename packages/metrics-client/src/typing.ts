import { Span } from '@opentelemetry/api';

export interface OpenApiSpecConfig {
  path?: string; // File path to OpenAPI spec
  url?: string; // URL to OpenAPI spec
  domain: string; // Domain to match for this spec
}

export interface PathNormalizationConfig {
  enabled: boolean;
  openApiSpecs?: OpenApiSpecConfig[];
  enableCryptoPatterns?: boolean; // Optional crypto-specific pattern detection
}

export interface RequestInfo {
  requestId: string;
  provider: string;
  apiKey: string;
  url: string;
  host: string;
  method: string;
  path: string;
  headers: Record<string, string>;
  params?: Record<string, string>;
  body?: RequestInit['body'];
  requestSize?: number;
}

export interface AxiosRequestMetadata {
  startTime: number;
  requestInfo: RequestInfo;
  span: Span | null;
}

export interface ResponseInfo extends RequestInfo {
  statusCode: number;
  duration: number;
  responseSize: number;
}

export interface ErrorContext {
  responseAlreadyProcessed?: boolean;
  responseMessage?: string;
  responseStatus?: number;
}
