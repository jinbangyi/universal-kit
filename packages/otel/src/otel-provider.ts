import {
  diag,
  DiagConsoleLogger,
  DiagLogLevel,
  trace,
} from '@opentelemetry/api';
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
import { OTLPLogExporter } from '@opentelemetry/exporter-logs-otlp-http';
import { OTLPMetricExporter } from '@opentelemetry/exporter-metrics-otlp-http';
import { PrometheusExporter } from '@opentelemetry/exporter-prometheus';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import {
  defaultResource,
  // emptyResource,
  resourceFromAttributes,
  Resource,
} from '@opentelemetry/resources';
import { BatchLogRecordProcessor } from '@opentelemetry/sdk-logs';
import { PeriodicExportingMetricReader } from '@opentelemetry/sdk-metrics';
import { NodeSDK } from '@opentelemetry/sdk-node';
import {
  ATTR_SERVICE_NAME,
  ATTR_SERVICE_VERSION,
} from '@opentelemetry/semantic-conventions';
import { IncomingMessage } from 'http';

function getEnvNumber(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) {
    return fallback;
  }
  const value = Number(raw);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

const serviceName = process.env.OTEL_SERVICE_NAME ?? 'universal-kit';
const serviceVersion =
  process.env.OTEL_SERVICE_VERSION ?? '0.0.1';
const metricExportTimeout = getEnvNumber('OTEL_METRIC_EXPORT_TIMEOUT', 30000);
const prometheusPort = getEnvNumber('OTEL_PROMETHEUS_PORT', 9000);

const globalSdkKey = Symbol.for(`${serviceName}.telemetry.sdk`);

type GlobalTelemetry = typeof globalThis & {
  [globalSdkKey]?: NodeSDK;
};

const telemetryGlobals = globalThis as GlobalTelemetry;

function configureDiagnostics(): void {
  const level = (process.env.OTEL_LOG_LEVEL ?? '').toUpperCase();
  const levelMapping: Record<string, DiagLogLevel> = {
    ALL: DiagLogLevel.ALL,
    VERBOSE: DiagLogLevel.VERBOSE,
    DEBUG: DiagLogLevel.DEBUG,
    INFO: DiagLogLevel.INFO,
    WARN: DiagLogLevel.WARN,
    ERROR: DiagLogLevel.ERROR,
    NONE: DiagLogLevel.NONE,
  };
  const selectedLevel = levelMapping[level] ?? DiagLogLevel.INFO;
  diag.setLogger(new DiagConsoleLogger(), selectedLevel);
}

function buildResource(): Resource {
  const resourceAttributes: Record<string, string> = {
    [ATTR_SERVICE_NAME]: serviceName,
  };

  if (serviceVersion) {
    resourceAttributes[ATTR_SERVICE_VERSION] = serviceVersion;
  }

  return defaultResource().merge(resourceFromAttributes(resourceAttributes));
}

function createSdk(): void {
  if (telemetryGlobals[globalSdkKey]) {
    return;
  }

  configureDiagnostics();

  const otlpExporter = new OTLPMetricExporter();
  const traceExporter = new OTLPTraceExporter();
  const prometheusExporter = new PrometheusExporter({
    // predefined prefix will cause common metrics(which will accross multi services) diff to be grouped
    // prefix: serviceName.replace(/-/g, '_'),
    port: prometheusPort,
    withResourceConstantLabels: /^(service\.name|service\.version)$/, // turn resource attrs into default labels
  });
  // const resource = emptyResource().merge(resourceFromAttributes({
  //   'serviceName': serviceName,
  // }));
  const logExporter = new OTLPLogExporter();
  const otlpReader = new PeriodicExportingMetricReader({
    exporter: otlpExporter,
    exportTimeoutMillis: metricExportTimeout,
  });

  const sdk = new NodeSDK({
    resource: buildResource(),
    traceExporter,
    metricReaders: [otlpReader, prometheusExporter],
    logRecordProcessors: [new BatchLogRecordProcessor(logExporter)],
    instrumentations: [
      getNodeAutoInstrumentations({
        '@opentelemetry/instrumentation-dns': {
          enabled: false,
        },
        '@opentelemetry/instrumentation-fs': {
          enabled: false,
        },
        '@opentelemetry/instrumentation-openai': {
          enabled: false,
        },
        '@opentelemetry/instrumentation-winston': {
          enabled: false,
        },

        '@opentelemetry/instrumentation-http': {
          ignoreIncomingRequestHook: (req: IncomingMessage) => {
            const url = req.url ?? '';
            const isHealthCheck =
              url === '/health' || url.startsWith('/health/');
            const isMetrics = url === '/metrics' || url.startsWith('/metrics/');
            return isHealthCheck || isMetrics;
          },
        },
        '@opentelemetry/instrumentation-undici': {
          enabled: true,
          requestHook: (span, request) => {
            // https://signoz.io/docs/external-api-monitoring/overview/#how-it-works
            span.setAttribute(
              'telemetry.sdk.instrumentation',
              'UndiciInstrumentation',
            );
            span.setAttribute('net.peer.name', request.origin);
            span.setAttribute('http.url', request.origin + request.path);
            span.setAttribute('http.target', request.path);
          },
          responseHook: (span, response) => {
            // https://signoz.io/docs/external-api-monitoring/overview/#how-it-works
            span.setAttribute(
              'telemetry.sdk.instrumentation',
              'UndiciInstrumentation',
            );
            span.setAttribute('net.peer.name', response.request.origin);
            span.setAttribute(
              'http.url',
              response.request.origin + response.request.path,
            );
            span.setAttribute('http.target', response.request.path);
          },
        },
      }),
    ],
  });

  Promise.resolve(sdk.start())
    .then(() => diag.debug('OpenTelemetry SDK successfully started'))
    .catch(err => diag.error('OpenTelemetry SDK failed to start', err));

  // registerProcessShutdown(sdk);
  telemetryGlobals[globalSdkKey] = sdk;
}

export class OtelProvider {
  private tracer = trace.getTracer(serviceName, '0.1.0');

  start(): void {
    // SDK is already started by createSdk
    createSdk();
  }

  stop(): Promise<void> {
    // Get the global SDK and shut it down
    const sdk = telemetryGlobals[globalSdkKey];
    if (sdk) {
      return sdk.shutdown();
    }
    return Promise.resolve();
  }
}

export const defaultOtelProvider = new OtelProvider();
