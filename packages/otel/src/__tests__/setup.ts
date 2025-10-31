// Mock OpenTelemetry modules
jest.mock('@opentelemetry/api', () => ({
  trace: {
    getTracer: jest.fn(() => ({
      startSpan: jest.fn(() => ({
        setAttribute: jest.fn(),
        recordException: jest.fn(),
        setStatus: jest.fn(),
        end: jest.fn(),
      })),
    })),
  },
  SpanKind: {
    INTERNAL: 'INTERNAL',
    CLIENT: 'CLIENT',
    SERVER: 'SERVER',
    PRODUCER: 'PRODUCER',
    CONSUMER: 'CONSUMER',
  },
  SpanStatusCode: {
    OK: 'OK',
    ERROR: 'ERROR',
    UNSET: 'UNSET',
  },
}));

jest.mock('@opentelemetry/sdk-node', () => ({
  NodeSDK: jest.fn(() => ({
    start: jest.fn(),
    shutdown: jest.fn(() => Promise.resolve()),
  })),
}));

jest.mock('@opentelemetry/auto-instrumentations-node', () => ({
  getNodeAutoInstrumentations: jest.fn(() => []),
}));
