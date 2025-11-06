import { Span } from "@opentelemetry/api";

export interface RequestInfo {
  requestId: string;
  provider: string;
  apiKey: string;
  url: string;
  host: string;
  method: string;
  path: string;
  headers: Record<string, any>;
  params?: Record<string, any>;
  body?: any;
  requestSize?: number;
}

export interface AxiosRequestMetadata {
  startTime: number;
  requestInfo: RequestInfo;
  span: Span;
}

export interface ResponseInfo extends RequestInfo {
  statusCode: number;
  duration: number;
  responseSize: number;
}

export interface ErrorContext {
  responseMessage?: string;
  responseStatus?: number;
}
