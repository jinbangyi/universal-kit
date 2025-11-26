import { Logger } from '@universal-kit/logger';
import { Span } from '@opentelemetry/api';

import { ProviderMetricsManager } from '../metrics/api-provider-metrics.js';
import { RequestTracer, type RequestTraceConfig } from '../tracing/api-provider-tracing.js';
import type {
  AxiosRequestMetadata, ErrorContext, RequestInfo, ResponseInfo, PathNormalizationConfig,
} from '../typing.js';

interface RequestStartObject {
  span: Span | null;
  startTime: number;
}

export interface GeneralRequestConfig {
  url: string;
  method: string;
  params?: URLSearchParams | Record<string, unknown>;
  headers?: RequestInit['headers'];
  body?: RequestInit['body'];
}

// eslint-disable-next-line no-unused-vars
type ApiKeyResolver = (arg: GeneralRequestConfig) => string;

export interface BaseWrapperConfig {
  // name of the API
  provider: string;
  getApiKey?: ApiKeyResolver;
  apiKeyHeader?: string; // Default: 'x-api-key'
  apiKeyQueryParam?: string; // Default: 'x-api-key'
  retryConfig?: { // Default: { attempts: 0, delay: 1000 }
    attempts: number;
    delay: number;
  };
  traceFailedRequests?: boolean; // Default: true
  logRequestEvents?: boolean; // Default: true
  redactedHeaders?: string[]; // Headers to redact in logs and traces
  pathNormalization?: PathNormalizationConfig; // Path normalization configuration
}

export const defaultApiKey = 'NOT_FOUND_API_KEY';
const generalApiKeyHeaders = [
  'x-api-key',
  'authorization',
  'apikey',
  'api-key',
  'OK-ACCESS-KEY',
  'x-cg-pro-api-key',
  'X-CMC_PRO_API_KEY',
  'AccessKey',
].map(header => header.toLowerCase());
const defaultRedactedHeaders = [
  ...generalApiKeyHeaders,
  'OK-ACCESS-SIGN',
  'OK-ACCESS-PASSPHRASE',
].map(header => header.toLowerCase());

// Resolve path to openapi-specs relative to this compiled file
// The openapi-specs are copied to dist/openapi-specs during build (see tsup.config.ts)
// When bundled by tsup:
//   - dist/index.cjs -> dist/openapi-specs/ (same directory level)
//   - dist/index.js -> dist/openapi-specs/ (same directory level)
// When installed via npm:
//   - node_modules/@universal-kit/metrics-client/dist/index.cjs
//     -> node_modules/@universal-kit/metrics-client/dist/openapi-specs/
// During development/tests (src/):
//   - src/http-client/common.ts -> src/openapi-specs/ (up one level)
export const getOpenApiSpecPath = (filename: string): string => {
  const path = require('path');

  if (typeof __dirname !== 'undefined') {
    // Check if we're in development (src directory structure)
    if (__dirname.includes('/src/http-client')) {
      // During development: go up one level from http-client to src
      return path.resolve(__dirname, `../openapi-specs/${filename}`);
    }
    // When code is bundled into dist/index.cjs or dist/index.js
    // __dirname will be the dist/ directory, so openapi-specs/ is at the same level
    return path.resolve(__dirname, `openapi-specs/${filename}`);
  }

  // Fallback: use current working directory
  // This should rarely be hit since __dirname is typically available
  return path.resolve(process.cwd(), `dist/openapi-specs/${filename}`);
};/**
 * processRequestStart -- ok    -> processRequestComplete -- finish -> processRequestEnd
 *                     -- error -> processRequestError    -- finish -> processRequestEnd
 */
export abstract class BaseHttpClient {
  protected config: Required<BaseWrapperConfig>;
  protected logger: Logger;
  protected providerMetrics: ProviderMetricsManager;
  protected requestTracer: RequestTracer;

  // Path normalization caches
  private openApiRoutesByDomain: Map<string, Map<string, string>> = new Map();
  private compiledPatterns: Map<string, RegExp> | null = null;

  constructor(config: BaseWrapperConfig, logger?: Logger) {
    this.config = {
      getApiKey: this.getDefaultApiKey.bind(this),
      apiKeyHeader: '',
      apiKeyQueryParam: '',
      retryConfig: {
        attempts: 0,
        delay: 1000,
      },
      traceFailedRequests: true,
      logRequestEvents: true,
      redactedHeaders: defaultRedactedHeaders,
      pathNormalization: {
        enabled: true,
        enableCryptoPatterns: true,
        openApiSpecs: [
          { path: getOpenApiSpecPath('coingecko-pro.json'), domain: 'pro-api.coingecko.com' },
        ],
      },
      ...config,
    };

    this.logger = logger ?? new Logger({ library: this.config.provider });

    this.providerMetrics = new ProviderMetricsManager({ enabled: true });

    // Initialize request tracer
    const traceConfig: RequestTraceConfig = {
      traceFailedRequests: this.config.traceFailedRequests,
      logRequestEvents: this.config.logRequestEvents,
    };
    this.requestTracer = new RequestTracer(traceConfig, this.logger);

    // Initialize OpenAPI specs if path normalization is enabled (async, non-blocking)
    if (this.config.pathNormalization.enabled) {
      this.loadOpenApiSpecs().catch((error) => {
        this.logger.warn(`Failed to initialize OpenAPI specs: ${error?.message ?? error}`);
      });
    }
  }

  // Common utility methods
  protected hashApiKey(apiKey: string): string {
    if (apiKey === defaultApiKey) return apiKey;
    // Simple hash implementation for privacy
    if (apiKey.length <= 8) return '****';
    return `${apiKey.substring(0, 4)}****${apiKey.substring(apiKey.length - 4)}`;
  }

  protected normalizeHeaders(headers: RequestInit['headers']): Record<string, string> {
    const result: Record<string, string> = {};

    if (!headers) return result;

    if (Array.isArray(headers)) {
      for (const entry of headers) {
        if (!Array.isArray(entry)) continue;
        const [key, value] = entry;
        if (key === undefined || value === undefined) continue;
        result[String(key)] = String(value);
      }
      return result;
    }

    if ((typeof headers.forEach) === 'function') {
      headers.forEach((value: string, key: string) => {
        result[String(key)] = String(value);
      });
      return result;
    }

    for (const [key, value] of Object.entries(headers as Record<string, string>)) {
      result[String(key)] = String(value);
    }

    return result;
  }

  private getDefaultApiKey(config: GeneralRequestConfig): string {
    const _normalizedHeaders = this.normalizeHeaders(config.headers);
    const normalizedHeaders: Record<string, string> = {};
    // lowercase key _normalizedHeaders
    for (const key of Object.keys(_normalizedHeaders)) {
      if (!_normalizedHeaders[key]) continue;
      normalizedHeaders[key.toLowerCase()] = _normalizedHeaders[key];
    }

    let headers: string[] = [];
    // try lowercase, uppercase, and original case
    if (
      (this.config.apiKeyHeader === undefined || this.config.apiKeyHeader === '') &&
      (this.config.apiKeyQueryParam === undefined || this.config.apiKeyQueryParam === '')
    ) {
      headers = generalApiKeyHeaders;
    } else {
      headers = [
        (this.config.apiKeyHeader ?? '').toLowerCase(),
      ];
    }

    // try to read from header
    const apiKey = headers.map(header => normalizedHeaders[header]).find(Boolean);
    if (apiKey) return apiKey;

    // try to read from query param
    if (config.params) {
      let queryParamKeys: string[] = [];

      if (this.config.apiKeyQueryParam === undefined || this.config.apiKeyQueryParam === '') {
        queryParamKeys = generalApiKeyHeaders;
      } else if (this.config.apiKeyQueryParam) {
        queryParamKeys = [this.config.apiKeyQueryParam.toLowerCase()];
      }

      if (queryParamKeys.length > 0) {
        const normalizedParamKeys = new Set(queryParamKeys.map(key => key.toLowerCase()));

        if (config.params instanceof URLSearchParams) {
          for (const [key, value] of config.params.entries()) {
            if (normalizedParamKeys.has(key.toLowerCase()) && value) {
              return value;
            }
          }
        } else if (typeof config.params === 'object') {
          const paramsObject = config.params;
          for (const [key, value] of Object.entries(paramsObject)) {
            if (value == null) continue;
            if (normalizedParamKeys.has(key.toLowerCase())) {
              return String(value);
            }
          }
        }
      }
    }

    return defaultApiKey;
  }

  protected generateRequestId(): string {
    return `req_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
  }

  protected calculateRequestSize(data?: unknown): number | undefined {
    if (!data) return undefined;

    if (typeof data === 'string') {
      return Buffer.byteLength(data, 'utf8');
    } else if (data instanceof ArrayBuffer) {
      return data.byteLength;
    } else if (data instanceof Blob) {
      return data.size;
    } else if (data instanceof Uint8Array) {
      return data.length;
    } else {
      // For objects, stringify and measure
      try {
        return Buffer.byteLength(JSON.stringify(data), 'utf8');
      } catch {
        return 0;
      }
    }
  }

  protected calculateResponseSizeFromHeaders(headers: Record<string, unknown>): number | undefined {
    const contentLength = headers['content-length'] ?? headers['Content-Length'];
    if (typeof contentLength === 'string' && contentLength.length > 0) {
      return parseInt(contentLength, 10);
    }
    return undefined;
  }

  protected calculateResponseSizeFromData(data?: unknown): number | undefined {
    if (!data) return undefined;

    try {
      return Buffer.byteLength(JSON.stringify(data), 'utf8');
    } catch {
      return undefined;
    }
  }

  /**
   * Load and parse OpenAPI specifications
   * Logs warnings on errors and continues with pattern-based normalization
   */
  private async loadOpenApiSpecs(): Promise<void> {
    if (!this.config.pathNormalization.openApiSpecs) return;

    for (const specConfig of this.config.pathNormalization.openApiSpecs) {
      try {
        let specContent: string;

        if (specConfig.path) {
          // Load from file - use require in Jest environment, dynamic import otherwise
          try {
            // Try dynamic import first (for ESM)
            const fs = await import('fs/promises');
            specContent = await fs.readFile(specConfig.path, 'utf-8');
          } catch {
            // Fallback to require for Jest/CJS environment
            const fs = require('fs');
            specContent = fs.readFileSync(specConfig.path, 'utf-8');
          }
        } else if (specConfig.url) {
          // Load from URL
          const response = await fetch(specConfig.url);
          if (!response.ok) {
            throw new Error(`Failed to fetch spec from ${specConfig.url}: ${response.status}`);
          }
          specContent = await response.text();
        } else {
          this.logger.warn(`OpenAPI spec config missing both path and url for domain ${specConfig.domain}`);
          continue;
        }

        // Parse spec (JSON or YAML)
        const spec = await this.parseOpenApiSpec(specContent, specConfig);
        if (spec) {
          this.openApiRoutesByDomain.set(specConfig.domain, spec);
          this.logger.info(`Loaded OpenAPI spec for domain: ${specConfig.domain} (${spec.size} routes)`);
        }
      } catch (error: unknown) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        this.logger.warn(`Failed to load OpenAPI spec for domain ${specConfig.domain}: ${errorMsg}`);
        // Continue with pattern-based normalization for this domain
      }
    }
  }

  /**
   * Parse OpenAPI spec and extract route templates
   */
  private async parseOpenApiSpec(content: string, specConfig: { domain: string }): Promise<Map<string, string> | null> {
    try {
      let spec: { openapi?: string; paths?: Record<string, unknown>; servers?: Array<{ url: string }> };

      // Try parsing as JSON first
      try {
        spec = JSON.parse(content);
      } catch {
        // Try YAML parsing - optional dependency
        try {
          const yaml = require('yaml');
          spec = yaml.parse(content);
        // eslint-disable-next-line no-unused-vars, @typescript-eslint/no-unused-vars
        } catch (yamlError) {
          this.logger.warn(`Failed to parse spec for ${specConfig.domain}: not valid JSON or YAML`);
          return null;
        }
      }

      // Basic validation
      if (!spec.openapi || !spec.paths) {
        this.logger.warn(`Invalid OpenAPI spec for ${specConfig.domain}: missing openapi or paths`);
        return null;
      }

      // Extract base path from server URL if present
      let basePath = '';
      if (spec.servers && spec.servers.length > 0 && spec.servers[0]) {
        try {
          const serverUrl = new URL(spec.servers[0].url);
          basePath = serverUrl.pathname !== '/' ? serverUrl.pathname : '';
        } catch {
          // Invalid URL, use empty base path
        }
      }

      // Extract and normalize paths
      const routeMap = new Map<string, string>();
      // eslint-disable-next-line no-unused-vars
      for (const [path, _] of Object.entries(spec.paths)) {
        // Prepend base path and convert OpenAPI parameter format {paramName} to :paramName
        const fullPath = basePath + path;
        const normalizedPath = fullPath.replace(/\{([^}]+)\}/g, ':$1');
        routeMap.set(fullPath, normalizedPath);
        // Also store the normalized version for matching
        routeMap.set(normalizedPath, normalizedPath);
      }

      return routeMap;
    } catch (error: unknown) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      this.logger.warn(`Error parsing OpenAPI spec for ${specConfig.domain}: ${errorMsg}`);
      return null;
    }
  }

  /**
   * Refresh OpenAPI specs from their sources
   */
  public async refreshOpenApiSpecs(): Promise<void> {
    this.openApiRoutesByDomain.clear();
    await this.loadOpenApiSpecs();
  }

  /**
   * Lazy-initialize pattern regex cache
   */
  private getCompiledPatterns(): Map<string, RegExp> {
    if (this.compiledPatterns) return this.compiledPatterns;

    this.compiledPatterns = new Map([
      // UUID pattern (v4 and v5)
      ['uuid', /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i],
      // Base58 (typical for crypto addresses, 32-44 chars)
      ['base58', /^[1-9A-HJ-NP-Za-km-z]{32,44}$/],
      // Hex hash (32, 40, 64 chars for various hash types)
      ['hex', /^(0x)?[0-9a-f]{32,64}$/i],
      // MongoDB ObjectId
      ['objectid', /^[0-9a-f]{24}$/i],
    ]);

    return this.compiledPatterns;
  }

  /**
   * Match path against OpenAPI spec routes
   */
  private matchOpenApiRoute(pathname: string, domain: string): string | null {
    const routeMap = this.openApiRoutesByDomain.get(domain);
    if (!routeMap) return null;

    // Direct match
    if (routeMap.has(pathname)) {
      const route = routeMap.get(pathname);
      return route ?? null;
    }

    // Try to match by segments
    const pathSegments = pathname.split('/');
    for (const [specPath, normalizedPath] of routeMap) {
      const specSegments = specPath.split('/');
      if (specSegments.length !== pathSegments.length) continue;

      let matches = true;
      for (let i = 0; i < specSegments.length; i++) {
        const specSeg = specSegments[i];
        const pathSeg = pathSegments[i];

        // Skip if both are empty (leading slash)
        if (!specSeg && !pathSeg) continue;

        // Match if spec segment is a parameter or exact match
        if (specSeg && (specSeg.startsWith(':') || specSeg.startsWith('{') || specSeg === pathSeg)) {
          continue;
        }

        matches = false;
        break;
      }

      if (matches) return normalizedPath;
    }

    return null;
  }

  /**
   * Normalize path with OpenAPI-first priority, fallback to pattern-based
   */
  protected normalizePath(pathname: string, host: string): string {
    if (!this.config.pathNormalization.enabled) return pathname;

    // Try OpenAPI spec matching first
    const openApiNormalized = this.matchOpenApiRoute(pathname, host);
    if (openApiNormalized) return openApiNormalized;

    // Fallback to pattern-based normalization (synchronous approximation)
    // We'll make this sync to avoid async in createRequestInfo
    const segments = pathname.split('/');
    const patterns = this.getCompiledPatterns();
    let pathCounter = 1;

    const normalizedSegments = segments.map((segment) => {
      if (!segment || segment.startsWith(':')) return segment;

      // Inline crypto patterns if enabled
      if (this.config.pathNormalization.enableCryptoPatterns) {
        // Ethereum address
        if ((/^0x[0-9a-f]{40}$/i).test(segment)) return `:path${pathCounter++}`;
        // Solana address
        if ((/^[1-9A-HJ-NP-Za-km-z]{32,44}$/).test(segment)) return `:path${pathCounter++}`;
        // Transaction hash
        if ((/^0x[0-9a-f]{64}$/i).test(segment)) return `:path${pathCounter++}`;
      }

      // Try generic patterns
      for (const pattern of patterns.values()) {
        if (pattern.test(segment)) {
          return `:path${pathCounter++}`;
        }
      }

      return segment;
    });

    return normalizedSegments.join('/');
  }

  protected parseUrl(url: string): { host: string; pathname: string; params: Record<string, string> } {
    try {
      // console.log('console.log: parseUrl called with url:', url);
      const parsedUrl = new URL(url);
      const host = parsedUrl.hostname && parsedUrl.hostname.length > 0 ? parsedUrl.hostname : 'unknown';
      const pathname = parsedUrl.pathname && parsedUrl.pathname.length > 0 ? parsedUrl.pathname : '/';
      return {
        host,
        pathname,
        params: Object.fromEntries(parsedUrl.searchParams.entries()),
      };
    } catch {
      // Fallback for relative URLs
      const [rawPath, rawQuery] = url.split('?');
      const pathname = rawPath && rawPath.length > 0 ? rawPath : '/';
      const query = rawQuery ?? '';
      this.logger.warn(`Failed to parse URL: ${url}, using fallback parsing.`);
      return {
        host: 'localhost',
        pathname,
        params: Object.fromEntries(new URLSearchParams(query).entries()),
      };
    }
  }

  protected requestDataAttributes(request: Pick<RequestInfo, 'headers' | 'body'>): Record<string, string> {
    if (!request) return {};
    // create attributes for headers and body info
    const sanitized: Record<string, string> = {};

    if (request.headers) {
      sanitized['request.headers'] = JSON.stringify(request.headers);
    }

    if (request.body) {
      const bodyData = JSON.stringify(request.body);
      if (bodyData.length <= 2048) { // 2KB limit for request body
        sanitized['request.body'] = bodyData;
      } else {
        sanitized['request.body'] = `type: ${typeof request.body}, size: ${bodyData.length}, truncated: true`;
      }
    }

    return sanitized;
  }

  protected createRequestInfo(
    config: GeneralRequestConfig,
  ): RequestInfo {
    const requestId = this.generateRequestId();
    const { host, pathname, params } = this.parseUrl(config.url);

    // Normalize path if enabled
    const path = this.config.pathNormalization.enabled ?
      this.normalizePath(pathname, host) :
      pathname;

    // combine params read from URL and config.params
    if (config.params) {
      // Handle different types of params (URLSearchParams, plain object, etc.)
      if (config.params instanceof URLSearchParams) {
        for (const [key, value] of config.params.entries()) {
          params[key] = value;
        }
      } else if (typeof config.params === 'object') {
        // Handle plain object params (e.g., from Axios)
        for (const [key, value] of Object.entries(config.params)) {
          params[key] = String(value);
        }
      }
      config.params = new URLSearchParams(params);
    }

    const _apikey = this.config.getApiKey(config);
    const headersRecord = this.normalizeHeaders(config.headers);
    const sanitizedHeaders = this.sanitizeHeaders(headersRecord, _apikey);

    const apiKey = this.hashApiKey(_apikey);
    const method = config.method ? config.method.toUpperCase() : 'GET';
    const requestSize = this.calculateRequestSize(config.body);

    return {
      requestId,
      provider: this.config.provider,
      apiKey,
      url: config.url,
      host,
      method,
      path,
      headers: sanitizedHeaders,
      params,
      body: config.body,
      ...(requestSize !== undefined && { requestSize }),
    };
  }

  protected sanitizeHeaders(headers: Record<string, string>, apiKey: string): Record<string, string> {
    const sanitized: Record<string, string> = {};
    const apiKeyHeader = this.config.apiKeyHeader?.toLowerCase();
    const redactedHeaders = this.config.redactedHeaders?.map(header => header.toLowerCase()) ?? [];

    for (const [key, value] of Object.entries(headers)) {
      const lowerKey = key.toLowerCase();
      let sanitizedValue = value;

      if (apiKeyHeader && lowerKey === apiKeyHeader) {
        sanitizedValue = '****';
      } else if (redactedHeaders.includes(lowerKey)) {
        sanitizedValue = '****';
      } else if (value === apiKey) {
        sanitizedValue = '****';
      }

      sanitized[key] = sanitizedValue;
    }

    return sanitized;
  }

  protected processRequestStart(
    requestInfo: RequestInfo,
  ): RequestStartObject {
    // console.log('console.log - processRequestStart - requestInfo:', requestInfo);
    const startTime = Date.now();

    // Create request span for tracing
    const span = this.requestTracer.createRequestSpan(requestInfo);

    // Log request start event
    this.requestTracer.logRequestEvent({
      ...requestInfo,
      type: 'start',
      timestamp: startTime,
    });

    // Record provider metrics start
    this.providerMetrics.recordRequestStart(requestInfo);

    return { span, startTime };
  }

  protected processRequestEnd(
    requestInfo: RequestInfo,
    requestStartObject: RequestStartObject,
  ): void {
    // console.log('console.log: processRequestEnd called');
    const endTime = Date.now();

    // Log request end event
    this.requestTracer.logRequestEvent({
      ...requestInfo,
      type: 'end',
      timestamp: endTime,
      duration: (endTime - requestStartObject.startTime),
    });

    // Record provider metrics end
    this.providerMetrics.recordRequestEnd(requestInfo);

    // Finish request span
    this.requestTracer.finishRequestSpan(
      requestStartObject.span,
      requestInfo,
    );
  }

  protected processRequestComplete(
    requestMetadata: AxiosRequestMetadata,
    statusCode: number,
    responseSize: number,
  ): ResponseInfo {
    const duration = Date.now() - requestMetadata.startTime;
    const responseInfo: ResponseInfo = {
      ...requestMetadata.requestInfo,
      duration,
      statusCode,
      responseSize,
    };

    // Record provider metrics
    this.providerMetrics.recordRequestComplete(responseInfo);

    // Log request completion
    this.requestTracer.logRequestEvent({
      ...responseInfo,
      type: 'complete',
      timestamp: Date.now(),
    });

    // Finish request span
    this.requestTracer.addAttributesToSpan(
      requestMetadata.span,
      responseInfo,
    );

    return responseInfo;
  }

  protected processRequestError(
    requestMetadata: AxiosRequestMetadata,
    error: Error,
    responseContext?: ErrorContext,
  ): RequestInfo {
    const duration = Date.now() - requestMetadata.startTime;
    const { requestInfo } = requestMetadata;

    // Record provider error metrics
    // If response was already processed (for Axios errors with response), don't decrement active requests again
    // const shouldDecrementActiveRequests = !responseContext?.responseAlreadyProcessed;
    this.providerMetrics.recordRequestError(
      requestInfo,
      error.constructor.name,
      // shouldDecrementActiveRequests,
    );

    // Log request error
    this.requestTracer.logRequestEvent({
      ...requestInfo,
      type: 'error',
      timestamp: Date.now(),
      duration,
      error,
    });

    // Log detailed failed request information
    if (this.config.traceFailedRequests) {
      this.requestTracer.logFailedRequestDetails(
        requestInfo,
        error,
        responseContext ?? {},
      );
    }

    // axios error may have response with status code
    const statusCode = (error as { response?: { status?: number } }).response?.status ?? 501;
    // add request span with error
    this.requestTracer.addAttributesToSpan(
      requestMetadata.span,
      { ...requestInfo, duration, statusCode, responseSize: 0 },
      this.requestDataAttributes(requestMetadata.requestInfo),
    );

    return requestInfo;
  }

  getProviderMetricsManager(): ProviderMetricsManager {
    return this.providerMetrics;
  }

  getRequestTracer(): RequestTracer {
    return this.requestTracer;
  }

  getProviderName(): string {
    return this.config.provider;
  }
}
