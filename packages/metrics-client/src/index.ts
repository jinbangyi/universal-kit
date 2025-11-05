export { BaseHttpClient, type BaseWrapperConfig } from './http-client/common.js';
export { NodeFetchWrapper, type NodeFetchWrapperConfig } from './http-client/node-fetch-wrapper.js';
export { AxiosWrapper, type AxiosWrapperRequestConfig } from './http-client/axios-wrapper.js';

// Export enhanced metrics and tracing functionality
export { ProviderMetricsManager, initializeProviderMetrics } from './metrics/api-provider-metrics.js';
export type { ProviderMetricsConfig, ProviderMetricsCollection } from './metrics/api-provider-metrics.js';

export { RequestTracer } from './tracing/api-provider-tracing.js';
export type { RequestTraceConfig } from './tracing/api-provider-tracing.js';
