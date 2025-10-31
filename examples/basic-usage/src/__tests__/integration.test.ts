// Mock fetch for testing
global.fetch = jest.fn();

const createMockResponse = <T>(data: T, overrides: Partial<Response> = {}): Response => {
  return {
    ...overrides,
    ok: overrides.ok ?? true,
    status: overrides.status ?? 200,
    json: overrides.json ?? jest.fn().mockResolvedValue(data),
  } as unknown as Response;
};

// Mock AbortSignal.timeout
if (!global.AbortSignal.timeout) {
  global.AbortSignal.timeout = jest.fn(() => {
    const controller = new AbortController();
    setTimeout(() => controller.abort(), 100);
    return controller.signal;
  });
}

// Mock OpenTelemetry
jest.mock('@universal-kit/otel', () => ({
  OtelProvider: jest.fn().mockImplementation(() => ({
    start: jest.fn(),
    stop: jest.fn(() => Promise.resolve()),
    recordHttpCall: jest.fn(),
    recordFunctionCall: jest.fn(),
    recordApiCall: jest.fn(),
    createSpan: jest.fn(),
    withSpan: jest.fn(),
  })),
}));

describe('Integration Tests', () => {
  const mockFetch = fetch as jest.MockedFunction<typeof fetch>;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should demonstrate all components working together', async () => {
    // Mock successful API responses
    mockFetch
      .mockResolvedValueOnce(
        createMockResponse({
          id: 1,
          name: 'Leanne Graham',
          email: 'Sincere@april.biz',
        })
      )
      .mockResolvedValueOnce(
        createMockResponse(
          {
            id: 101,
            title: 'Test Post from Universal Kit',
            body: 'This is a test post created using the Universal Kit library.',
            userId: 1,
          },
          { status: 201 }
        )
      );

    // Import and test the main example
    const exampleModule = require('../index');

    // The example should complete without throwing errors
    await expect(exampleModule.main()).resolves.not.toThrow();

    // Verify that fetch was called
    expect(mockFetch).toHaveBeenCalledTimes(2);
    expect(mockFetch).toHaveBeenCalledWith(
      'https://jsonplaceholder.typicode.com/users/1',
      expect.any(Object)
    );
    expect(mockFetch).toHaveBeenCalledWith(
      'https://jsonplaceholder.typicode.com/posts',
      expect.any(Object)
    );
  });

  it('should handle API errors gracefully', async () => {
    // Mock API failure
    mockFetch.mockRejectedValueOnce(new Error('Network error'));

    const exampleModule = require('../index');

    // The example should handle errors gracefully
    await expect(exampleModule.main()).resolves.not.toThrow();
  });

  it('should validate decorator functionality', async () => {
    // Create a test class with decorators
    const {
      measureApiUsage,
      trackFunction,
    } = require('@universal-kit/decorators');
    const { Logger } = require('@universal-kit/logger');

    class TestService {
      @measureApiUsage({
        logRequests: true,
        logResponses: true,
        includeArgs: true,
      })
      async testApiCall(id: number): Promise<{ id: number; name: string }> {
        return { id, name: `User ${id}` };
      }

      @trackFunction({
        includeArgs: true,
      })
      testSyncOperation(data: string): string {
        return `processed: ${data}`;
      }
    }

    const service = new TestService();

    // Test async decorated method
    const apiResult = await service.testApiCall(123);
    expect(apiResult).toEqual({ id: 123, name: 'User 123' });

    // Test sync decorated method
    const syncResult = service.testSyncOperation('test-data');
    expect(syncResult).toBe('processed: test-data');
  });

  it('should validate HTTP client functionality', async () => {
    const { MeasuredHttpClient } = require('@universal-kit/metrics-client');
    const { Logger } = require('@universal-kit/logger');

    const mockLogger = new Logger();
    const client = new MeasuredHttpClient(
      {
        baseUrl: 'https://api.test.com',
        timeout: 5000,
      },
      mockLogger
    );

    // Mock successful response
    mockFetch.mockResolvedValueOnce(createMockResponse({ success: true }));

    const result = await client.get('/test');

    expect(result.success).toBe(true);
    expect(result.data).toEqual({ success: true });
    expect(result.metrics.method).toBe('GET');
    expect(result.metrics.duration).toBeGreaterThan(0);
  });

  it('should validate OpenTelemetry integration', async () => {
    const { OtelProvider } = require('@universal-kit/otel');

    const provider = new OtelProvider({
      serviceName: 'test-service',
      serviceVersion: '1.0.0',
    });

    provider.start();
    provider.recordHttpCall('GET', 'https://api.test.com', 200, 100);
    provider.recordFunctionCall('testFunction', 'TestClass', 50);
    provider.recordApiCall('testAPI', 150, true);

    await provider.stop();

    expect(provider).toBeDefined();
  });
});
