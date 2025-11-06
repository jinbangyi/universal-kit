import { jest } from '@jest/globals';

// Mock fetch for testing
global.fetch = jest.fn() as unknown as typeof fetch;

// Mock AbortSignal.timeout for Node < 20 compatibility
if (!global.AbortSignal.timeout) {
  global.AbortSignal.timeout = jest.fn(() => {
    const controller = new AbortController();
    setTimeout(() => controller.abort(), 100);
    return controller.signal;
  }) as unknown as typeof AbortSignal.timeout;
}
