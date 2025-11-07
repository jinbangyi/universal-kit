// Mock fetch for testing
global.fetch = jest.fn();

// Mock AbortSignal.timeout for Node < 20 compatibility
if (!global.AbortSignal.timeout) {
  global.AbortSignal.timeout = jest.fn(() => {
    const controller = new AbortController();
    setTimeout(() => controller.abort(), 100);
    return controller.signal;
  });
}

// Mock OpenTelemetry for testing
jest.mock('@opentelemetry/api', () => ({
  metrics: {
    getMeter: jest.fn(() => ({
      createUpDownCounter: jest.fn(() => ({
        add: jest.fn(),
      })),
      createCounter: jest.fn(() => ({
        add: jest.fn(),
      })),
      createHistogram: jest.fn(() => ({
        record: jest.fn(),
      })),
    })),
  },
  trace: {
    getTracer: jest.fn(() => ({
      startSpan: jest.fn(() => ({
        end: jest.fn(),
        setAttribute: jest.fn(),
        recordException: jest.fn(),
        setStatus: jest.fn(),
      })),
    })),
  },
  context: {
    active: jest.fn(),
    with: jest.fn(),
  },
}));
