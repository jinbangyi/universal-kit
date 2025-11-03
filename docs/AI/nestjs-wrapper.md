# NestJS HttpService Wrapper

The `NestJsHttpWrapper` provides automatic API usage measurement for NestJS applications while maintaining full compatibility with the NestJS HttpService API.

## Installation

```bash
npm install @universal-kit/metrics-client
npm install @nestjs/axios rxjs  # Peer dependencies
```

## Basic Usage

```typescript
import { Injectable } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { NestJsHttpWrapper, Logger } from '@universal-kit/metrics-client';

@Injectable()
export class ApiService {
  private httpWrapper: NestJsHttpWrapper;

  constructor(private httpService: HttpService) {
    this.httpWrapper = new NestJsHttpWrapper(
      {
        provider: 'my-api',
        apiKeyHeader: 'x-api-key',
        getApiKey: (config) => config?.headers?.['x-api-key'] || 'default-key',
      },
      httpService,
      new Logger({ library: 'api-service' })
    );
  }

  getUsers() {
    return this.httpWrapper.get('https://api.example.com/users');
  }

  createUser(userData: any) {
    return this.httpWrapper.post('https://api.example.com/users', userData);
  }
}
```

## Features

- **Automatic Metrics**: All HTTP calls are automatically measured and tracked
- **Full Compatibility**: Works exactly like NestJS HttpService
- **Request Correlation**: Automatic request ID generation and tracking
- **Error Tracking**: Comprehensive error logging and metrics
- **OpenTelemetry Support**: Built-in OTEL integration
- **Configurable**: Flexible configuration options

## API Methods

The wrapper provides all standard HTTP methods:

- `get<T>(url, config?)`
- `post<T>(url, data?, config?)`
- `put<T>(url, data?, config?)`
- `patch<T>(url, data?, config?)`
- `delete<T>(url, config?)`
- `head<T>(url, config?)`
- `options<T>(url, config?)`
- `request<T>(config)`

## Configuration Options

```typescript
interface BaseWrapperConfig {
  provider: string;                    // Name of the API provider
  getApiKey?: (options: any) => string; // Function to extract API key
  apiKeyHeader?: string;               // Default: 'x-api-key'
  retryConfig?: {
    attempts: number;
    delay: number;
  };
  traceFailedRequests?: boolean;       // Default: true
  logRequestEvents?: boolean;          // Default: true
}
```

## Skipping Metrics

To skip metrics collection for specific requests:

```typescript
this.httpWrapper.get('https://api.example.com/health', {
  skipMetrics: true
});
```

## Accessing Metrics

```typescript
// Get collected metrics
const metrics = this.httpWrapper.getProviderMetricsManager().getAllMetrics();

// Access request tracer
const tracer = this.httpWrapper.getRequestTracer();
```

## Module Setup

```typescript
import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { ApiService } from './api.service';

@Module({
  imports: [HttpModule],
  providers: [ApiService],
  exports: [ApiService],
})
export class ApiModule {}
```

## Example Controller

```typescript
import { Controller, Get, Param } from '@nestjs/common';
import { ApiService } from './api.service';

@Controller('users')
export class UsersController {
  constructor(private readonly apiService: ApiService) {}

  @Get(':id')
  getUser(@Param('id') id: string) {
    return this.apiService.getUser(id);
  }
}
```