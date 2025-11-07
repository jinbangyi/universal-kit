# @universal-kit/logger

Winston-based structured logger with metadata support and advanced logging features for universal-kit. This package provides comprehensive logging capabilities with OpenTelemetry integration, child loggers, log querying, and function tracking decorators.

## Installation

```bash
npm install @universal-kit/logger winston
```

## Features

- ✅ **Winston-based**: Built on top of Winston's proven logging framework
- ✅ **Structured Logging**: Rich metadata support for easy log attribution
- ✅ **OpenTelemetry Integration**: Automatic correlation with OTel traces and spans
- ✅ **Advanced Features**: Log querying, child loggers, dynamic log levels
- ✅ **Multiple Transports**: Console, file, and custom Winston transports
- ✅ **Daily Rotating Files**: Automatic log rotation in production
- ✅ **Function Tracking**: Decorator for automatic function measurement
- ✅ **Error Handling**: Comprehensive error logging with stack traces
- ✅ **TypeScript Support**: Full TypeScript support with proper type definitions

## Usage

### Basic Logging

```typescript
import { Logger } from '@universal-kit/logger';

// Create a logger with custom configuration
const logger = new Logger({
  level: 'info',
  includeMetadata: true,
  customFields: { service: 'my-service', version: '1.0.0' },
});

// Basic logging with structured metadata
logger.info('Processing request', {
  userId: 123,
  requestId: 'req-abc123',
  operation: 'getUser'
});

logger.error('Request failed', {
  userId: 123,
  error: 'User not found',
  statusCode: 404
});

// All log levels
logger.debug('Debug information');
logger.verbose('Verbose information');
logger.notice('Important notice');
logger.warn('Warning message');
logger.error('Error message');
```

### Advanced Winston Features

```typescript
import { Logger } from '@universal-kit/logger';
import winston from 'winston';

const logger = new Logger();

// Add custom Winston transports
logger.addTransport(
  new winston.transports.File({
    filename: 'app.log',
    format: winston.format.json(),
  })
);

// Add daily rotating file transport
logger.addTransport(
  new winston.transports.DailyRotateFile({
    filename: 'logs/app-%DATE%.log',
    datePattern: 'YYYY-MM-DD',
    maxSize: '20m',
    maxFiles: '14d'
  })
);

// Query historical logs
const recentLogs = await logger.query({
  limit: 10,
  order: 'desc',
  level: 'error',
  fields: { service: 'my-service' }
});

// Create child logger with additional context
const childLogger = logger.child({ requestId: 'req-123' });
childLogger.info('Processing user request');

// Dynamic log level changes
logger.setLevel('debug');
logger.setLevel('warn');

// Stream logs in real-time
logger.stream({ start: 0 })
  .on('log', (log) => {
    console.log('New log entry:', log);
  });
```

### Function Tracking Decorator

```typescript
import { Logger, trackFunction } from '@universal-kit/logger';

class UserService {
  @trackFunction({
    logArguments: true,
    logResult: true,
    logErrors: true,
    logLevel: 'info'
  })
  async getUser(userId: number) {
    // Function execution is automatically tracked
    // Arguments, results, and errors are logged
    if (userId <= 0) {
      throw new Error('Invalid user ID');
    }
    return { id: userId, name: 'John Doe' };
  }

  @trackFunction({
    logLevel: 'debug',
    logResult: false // Don't log results for privacy
  })
  async updateUserProfile(userId: number, data: any) {
    // Update user profile
    // Only arguments will be logged
  }
}

const userService = new UserService();
await userService.getUser(123);
```

### OpenTelemetry Integration

```typescript
import { Logger } from '@universal-kit/logger';

const logger = new Logger({
  includeOpenTelemetryMetadata: true,
  customFields: { service: 'my-service' }
});

// When OpenTelemetry is initialized, logs automatically include:
// - trace_id: Correlation with traces
// - span_id: Correlation with spans
// - service_name: From OTel resource
// - And other OTel context information

logger.info('Processing request', {
  userId: 123
});
// Log will include OTel metadata if available in current context
```

### Configuration Options

```typescript
import { Logger, LogLevel } from '@universal-kit/logger';

const logger = new Logger({
  // Log level (default: 'info')
  level: LogLevel.INFO,

  // Include metadata in logs (default: true)
  includeMetadata: true,

  // Include OpenTelemetry metadata (default: true)
  includeOpenTelemetryMetadata: true,

  // Custom fields to include in all logs
  customFields: {
    service: 'my-service',
    version: '1.0.0',
    environment: 'production'
  },

  // Custom Winston format
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.json()
  ),

  // Default transports
  transports: [
    new winston.transports.Console({
      format: winston.format.simple()
    })
  ]
});
```

## API Reference

### Logger Class

#### Constructor

```typescript
new Logger(config?: LoggerConfig)
```

#### Log Methods

- `debug(message: string, metadata?: any)` - Debug level logging
- `verbose(message: string, metadata?: any)` - Verbose level logging
- `info(message: string, metadata?: any)` - Info level logging
- `notice(message: string, metadata?: any)` - Notice level logging
- `warn(message: string, metadata?: any)` - Warning level logging
- `error(message: string, metadata?: any)` - Error level logging

#### Utility Methods

- `addTransport(transport: any)` - Add Winston transport
- `removeTransport(transport: any)` - Remove Winston transport
- `setLevel(level: LogLevel)` - Set log level dynamically
- `getLevel()` - Get current log level
- `child(metadata: any)` - Create child logger with additional metadata
- `query(options: QueryOptions)` - Query historical logs
- `stream(options: StreamOptions)` - Stream logs in real-time

### trackFunction Decorator

```typescript
trackFunction(options?: TrackFunctionOptions)
```

#### TrackFunctionOptions

```typescript
interface TrackFunctionOptions {
  logLevel?: LogLevel;
  logArguments?: boolean;
  logResult?: boolean;
  logErrors?: boolean;
  includeMetadata?: boolean;
}
```

### Types

```typescript
type LogLevel = 'error' | 'warn' | 'info' | 'notice' | 'verbose' | 'debug';

interface LoggerConfig {
  level?: LogLevel;
  includeMetadata?: boolean;
  includeOpenTelemetryMetadata?: boolean;
  customFields?: Record<string, any>;
  format?: winston.Logform.Format;
  transports?: winston.transport[];
}

interface QueryOptions {
  limit?: number;
  start?: number;
  order?: 'asc' | 'desc';
  fields?: Record<string, any>;
  level?: LogLevel;
  from?: Date;
  until?: Date;
}

interface StreamOptions {
  start?: number;
}
```

## Examples

### Production-ready Logger Setup

```typescript
import { Logger } from '@universal-kit/logger';
import winston from 'winston';

const logger = new Logger({
  level: process.env.LOG_LEVEL || 'info',
  customFields: {
    service: process.env.SERVICE_NAME || 'unknown',
    version: process.env.SERVICE_VERSION || '1.0.0',
    environment: process.env.NODE_ENV || 'development'
  },
  transports: [
    // Console for development
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.simple()
      )
    }),

    // File for production
    new winston.transports.File({
      filename: 'logs/error.log',
      level: 'error',
      format: winston.format.json()
    }),

    // Daily rotating file for all logs
    new winston.transports.DailyRotateFile({
      filename: 'logs/app-%DATE%.log',
      datePattern: 'YYYY-MM-DD',
      maxSize: '20m',
      maxFiles: '14d',
      format: winston.format.json()
    })
  ]
});

// Use in your application
export { logger };
```