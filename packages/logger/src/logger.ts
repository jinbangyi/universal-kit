import winston from 'winston';
import DailyRotateFile from 'winston-daily-rotate-file';

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface LoggerConfig {
  library: string;
  level?: LogLevel; // Default: 'info'
  includeMetadata?: boolean; // Default: true
  customFields?: Record<string, any>;
}

// Define interfaces for type safety
interface LogData {
  library?: string;
  requestId?: string;
  [key: string]: any;
}

interface WinstonInfo {
  timestamp?: string;
  level?: string;
  message?: string;
  metadata?: {
    library?: string;
    function?: string;
    requestId?: string;
    [key: string]: any;
  };
  [key: string]: any;
}

// Custom Winston format for structured logging with metadata
const universalKitFormat = winston.format.combine(
  winston.format.timestamp(),
  winston.format.errors({ stack: true }),
  winston.format.metadata({
    fillExcept: ['message', 'level', 'timestamp', 'label'],
  }),
  winston.format.json(),
  winston.format.printf(info => {
    const winstonInfo = info as WinstonInfo;
    const timestamp = winstonInfo.timestamp;
    const level = winstonInfo.level;
    const message = winstonInfo.message;
    const metadata = winstonInfo.metadata || {};
    const library = metadata.library || 'unknown';
    const function_ = metadata.function || 'unknown';
    const requestId = metadata.requestId;

    // Build metadata string
    let metadataStr = '';
    const metaObj: any = { ...metadata };
    delete metaObj.library;
    delete metaObj.function;
    delete metaObj.requestId;

    if (Object.keys(metaObj).length > 0) {
      metadataStr = ` ${JSON.stringify(metaObj)}`;
    }

    // Format with or without request ID
    const levelStr = level?.toUpperCase() || 'INFO';
    if (requestId) {
      return `[${timestamp}] ${levelStr} [${requestId}] ${message} (library: ${library}, function: ${function_})${metadataStr}`;
    } else {
      return `[${timestamp}] ${levelStr} ${message} (library: ${library}, function: ${function_})${metadataStr}`;
    }
  })
);

// Console format for development
const consoleFormat = winston.format.combine(
  winston.format.colorize(),
  winston.format.timestamp(),
  winston.format.printf(info => {
    const winstonInfo = info as WinstonInfo;
    const timestamp = winstonInfo.timestamp;
    const level = winstonInfo.level;
    const message = winstonInfo.message;
    const metadata = winstonInfo.metadata || {};
    const library = metadata.library || 'unknown';
    const function_ = metadata.function || 'unknown';
    const requestId = metadata.requestId;

    let metadataStr = '';
    const metaObj: any = { ...metadata };
    delete metaObj.library;
    delete metaObj.function;
    delete metaObj.requestId;

    if (Object.keys(metaObj).length > 0) {
      metadataStr = ` ${JSON.stringify(metaObj)}`;
    }

    const levelStr = level || 'INFO';
    if (requestId) {
      return `${levelStr} [${timestamp}] [${requestId}] ${message} (library: ${library}, function: ${function_})${metadataStr}`;
    } else {
      return `${levelStr} [${timestamp}] ${message} (library: ${library}, function: ${function_})${metadataStr}`;
    }
  })
);

export class Logger {
  private winston: winston.Logger;
  private config: Required<LoggerConfig>;

  constructor(config: LoggerConfig) {
    this.config = {
      level: 'info',
      includeMetadata: true,
      customFields: {},
      ...config,
    };

    // Create Winston transports
    const transports: winston.transport[] = [];

    // Console transport for development
    transports.push(
      new winston.transports.Console({
        format: consoleFormat,
        level: this.config.level,
      })
    );

    // Create Winston logger
    this.winston = winston.createLogger({
      level: this.config.level,
      transports,
      format: universalKitFormat,
      defaultMeta: this.config.customFields,
    });
  }

  private createLogData(
    additional?: Record<string, any>
  ): LogData {
    const logData: LogData = {
      library: this.config.library,
      ...this.config.customFields,
    };

    if (additional && this.config.includeMetadata) {
      Object.assign(logData, additional);
    }

    return logData;
  }

  private shouldLog(level: LogLevel): boolean {
    const levels: Record<LogLevel, number> = {
      debug: 0,
      info: 1,
      warn: 2,
      error: 3,
    };

    return levels[level] >= levels[this.config.level];
  }

  debug(
    message: string,
    additional?: Record<string, any>
  ): void {
    if (!this.shouldLog('debug')) return;

    const logData = this.createLogData(additional);
    this.winston.debug(message, logData);
  }

  info(
    message: string,
    additional?: Record<string, any>
  ): void {
    if (!this.shouldLog('info')) return;

    const logData = this.createLogData(additional);
    this.winston.info(message, logData);
  }

  warn(
    message: string,
    additional?: Record<string, any>
  ): void {
    if (!this.shouldLog('warn')) return;

    const logData = this.createLogData(additional);
    this.winston.warn(message, logData);
  }

  error(
    message: string,
    error?: Error,
    additional?: Record<string, any>
  ): void {
    if (!this.shouldLog('error')) return;

    const logData = this.createLogData(additional);

    if (error) {
      this.winston.error(message, { ...logData, error });
    } else {
      this.winston.error(message, logData);
    }
  }

  // Advanced Winston features
  addTransport(transport: winston.transport): void {
    this.winston.add(transport);
  }

  removeTransport(transport: winston.transport): void {
    this.winston.remove(transport);
  }

  child(metadata: Record<string, any>): winston.Logger {
    return this.winston.child(metadata);
  }

  // Query logs (useful for testing and debugging)
  async query(options: winston.QueryOptions): Promise<any[]> {
    return new Promise((resolve, reject) => {
      this.winston.query(options, (err, results) => {
        if (err) {
          reject(err);
        } else {
          resolve(results);
        }
      });
    });
  }

  // Stream logs (useful for real-time monitoring)
  stream(options: any): NodeJS.ReadableStream {
    return this.winston.stream(options);
  }

  // Configure log level at runtime
  setLevel(level: LogLevel): void {
    this.config.level = level;
    this.winston.level = level;
    this.winston.transports.forEach(transport => {
      transport.level = level;
    });
  }

  // Get current configuration
  getConfig(): Readonly<LoggerConfig> {
    return { ...this.config };
  }

  // Get underlying Winston logger for advanced usage
  getWinstonLogger(): winston.Logger {
    return this.winston;
  }

  // Close all transports and clean up
  close(): void {
    this.winston.close();
  }
}

// Create a default logger instance
export const defaultLogger = new Logger({library: 'universal-kit'});

// Export Winston for advanced usage
export { winston, DailyRotateFile };
