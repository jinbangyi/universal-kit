/**
 * Example usage of NestJS HttpService wrapper
 * This demonstrates how to use the NestJsHttpWrapper in a NestJS application
 */

import { Injectable } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { Observable } from 'rxjs';
import { AxiosResponse } from 'axios';
import { NestJsHttpWrapper, Logger } from '@universal-kit/metrics-client/src';

@Injectable()
export class ExampleApiService {
  private httpWrapper: NestJsHttpWrapper;

  constructor(
    private httpService: HttpService,
  ) {
    // Initialize the wrapper with configuration
    this.httpWrapper = new NestJsHttpWrapper(
      {
        provider: 'example-api',
        apiKeyHeader: 'x-api-key',
        getApiKey: (config) => {
          return config?.headers?.['x-api-key'] || 'default-key';
        },
      },
      httpService,
      new Logger({ library: 'example-api-service' })
    );
  }

  // Example GET request with automatic metrics
  getUser(id: string): Observable<AxiosResponse<any>> {
    return this.httpWrapper.get(`https://api.example.com/users/${id}`, {
      headers: {
        'x-api-key': 'your-api-key-here',
      },
    });
  }

  // Example POST request with automatic metrics
  createUser(userData: any): Observable<AxiosResponse<any>> {
    return this.httpWrapper.post('https://api.example.com/users', userData, {
      headers: {
        'x-api-key': 'your-api-key-here',
        'Content-Type': 'application/json',
      },
    });
  }

  // Example request with metrics disabled
  healthCheck(): Observable<AxiosResponse<any>> {
    return this.httpWrapper.get('https://api.example.com/health', {
      skipMetrics: true, // This request won't be tracked
    });
  }

  // Access to underlying provider metrics manager
  getMetrics() {
    return this.httpWrapper.getProviderMetricsManager().getAllMetrics();
  }

  // Access to underlying request tracer
  getTracer() {
    return this.httpWrapper.getRequestTracer();
  }
}

/**
 * Example module setup in NestJS application
 */
import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';

@Module({
  imports: [HttpModule],
  providers: [ExampleApiService],
  exports: [ExampleApiService],
})
export class ExampleApiModule {}

/**
 * Usage in a controller:
 *
 * import { Controller, Get, Param } from '@nestjs/common';
 * import { ExampleApiService } from './example-api.service';
 *
 * @Controller('users')
 * export class UsersController {
 *   constructor(private readonly apiService: ExampleApiService) {}
 *
 *   @Get(':id')
 *   getUser(@Param('id') id: string) {
 *     return this.apiService.getUser(id);
 *   }
 * }
 */