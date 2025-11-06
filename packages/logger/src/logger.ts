import { logs, SeverityNumber, Logger as OtelLogger } from '@opentelemetry/api-logs';
import type { Attributes, AttributeValue } from '@opentelemetry/api';
import winston from 'winston';

type LogLevel = 'debug' | 'verbose' | 'info' | 'notice' | 'warn' | 'error';
const serviceName = process.env.OTEL_SERVICE_NAME || 'universal-kit';
const serviceVersion = process.env.OTEL_SERVICE_VERSION || '0.0.1';
const globalLogLevel = process.env.KIT_LOG_LEVEL || (process.env.OTEL_LOG_LEVEL || 'info');

export interface LoggerConfig {
  library: string;
  level?: string;
  includeMetadata?: boolean;
  customFields?: Record<string, any>;
  enableOtel?: boolean;
  otelLoggerName?: string;
  otelLoggerVersion?: string;
}

interface LogData {
  library: string;
  requestId?: string;
  [key: string]: any;
}

interface WinstonInfo {
  timestamp?: string;
  level?: string;
  message?: string;
  metadata?: {
    library?: string;
    requestId?: string;
    [key: string]: any;
  };
  [key: string]: any;
}

const universalKitFormat = winston.format.combine(
  winston.format.timestamp({
    format: 'YYYY-MM-DDTHH:mm:ssZ',
  }),
  winston.format.errors({ stack: true }),
  winston.format.metadata({
    fillExcept: ['message', 'level', 'timestamp', 'label'],
  }),
  winston.format.printf(info => {
    const winstonInfo = info as WinstonInfo;
    const { timestamp } = winstonInfo;
    const { level } = winstonInfo;
    const { message } = winstonInfo;
    const metadata = winstonInfo.metadata || {};
    const library = metadata.library || 'unknown';
    const { requestId } = metadata;

    let metadataStr = '';
    const metaObj: Record<string, any> = { ...metadata };
    if (metaObj.library === metaObj.provider) delete metaObj.provider;
    delete metaObj.library;
    delete metaObj.requestId;

    if (Object.keys(metaObj).length > 0) {
      metadataStr = ` ${JSON.stringify(metaObj)}`;
    }

    const levelStr = level?.toUpperCase() || 'INFO';
    if (requestId) {
      return `[${timestamp}] ${levelStr} [${library}:${requestId}] ${message}${metadataStr}`;
    }
    return `[${timestamp}] ${levelStr} [${library}] ${message}${metadataStr}`;
  }),
);

const levelsNumber: Record<LogLevel, number> = {
  debug: 5,
  verbose: 4,
  info: 3,
  notice: 2,
  warn: 1,
  error: 0,
};

export class Logger {
  private winston: winston.Logger;
  private config: Required<LoggerConfig>;
  private otelLogger?: OtelLogger;

  constructor(config: LoggerConfig) {
    this.config = {
      library: config.library,
      level: config.level || globalLogLevel,
      includeMetadata: config.includeMetadata ?? true,
      customFields: { ...config.customFields },
      enableOtel: config.enableOtel ?? true,
      otelLoggerName: config.otelLoggerName || serviceName,
      otelLoggerVersion: config.otelLoggerVersion || serviceVersion,
    };

    const transports: winston.transport[] = [];

    transports.push(
      new winston.transports.Console({
        format: universalKitFormat,
        level: this.config.level,
      }),
    );

    this.winston = winston.createLogger({
      level: this.config.level,
      transports,
      defaultMeta: this.config.customFields,
    });

    this.initializeOtel();
  }

  debug(message: string, metadata?: Record<string, any>): void {
    if (!this.shouldLog('debug')) return;
    const logData = this.createLogData(metadata);
    this.winston.debug(message, logData);
    this.winston.notice
    this.emitOtelLog('debug', message, logData);
  }

  verbose(message: string, metadata?: Record<string, any>): void {
    if (!this.shouldLog('verbose')) return;
    const logData = this.createLogData(metadata);
    this.winston.verbose(message, logData);
    this.emitOtelLog('verbose', message, logData);
  }

  info(message: string, metadata?: Record<string, any>): void {
    if (!this.shouldLog('info')) return;
    const logData = this.createLogData(metadata);
    this.winston.info(message, logData);
    this.emitOtelLog('info', message, logData);
  }

  warn(message: string, metadata?: Record<string, any>): void {
    if (!this.shouldLog('warn')) return;
    const logData = this.createLogData(metadata);
    this.winston.warn(message, logData);
    this.emitOtelLog('warn', message, logData);
  }

  error(message: string, error?: Error, metadata?: Record<string, any>): void {
    if (!this.shouldLog('error')) return;
    const logData = this.createLogData(metadata, error);
    this.winston.error(message, logData);
    this.emitOtelLog('error', message, logData, error);
  }

  addTransport(transport: winston.transport): void {
    this.winston.add(transport);
  }

  removeTransport(transport: winston.transport): void {
    this.winston.remove(transport);
  }

  child(metadata: Record<string, any>): winston.Logger {
    return this.winston.child(metadata);
  }

  setLevel(level: LogLevel): void {
    this.config.level = level;
    this.winston.level = level;
    this.winston.transports.forEach(transport => {
      transport.level = level;
    });
  }

  getConfig(): Readonly<LoggerConfig> {
    return Object.freeze({ ...this.config });
  }

  getWinstonLogger(): winston.Logger {
    return this.winston;
  }

  close(): void {
    this.winston.close();
  }

  private initializeOtel(): void {
    if (!this.config.enableOtel) {
      return;
    }
    this.otelLogger = logs.getLogger(
      this.config.otelLoggerName,
      this.config.otelLoggerVersion,
    );
  }

  private shouldLog(level: LogLevel): boolean {
    const levels: Record<LogLevel, number> = levelsNumber;
    return levels[level] <= levels[this.config.level as LogLevel];
  }

  private createLogData(
    metadata?: Record<string, any>,
    error?: Error,
  ): LogData {
    const logData: LogData = {
      ...this.config.customFields,
      // Priority: config.library first, then metadata.library if provided
      library: metadata?.library || this.config.library,
      requestId: metadata?.requestId,
    };

    if (error) {
      logData.error = {
        name: error.name,
        message: error.message,
      };
    }

    if (this.config.includeMetadata && metadata) {
      for (const [key, value] of Object.entries(metadata)) {
        if (key === 'library' || key === 'requestId') {
          continue;
        }
        logData[key] = value;
      }
    }

    return logData;
  }

  private emitOtelLog(level: LogLevel, message: string, logData: LogData, error?: Error): void {
    if (!this.otelLogger) {
      return;
    }

    // only the log level < notice will send to otel
    if (levelsNumber[level] >= levelsNumber['notice']) return;

    const attributes = this.convertToAttributes(logData, error);
    this.otelLogger.emit({
      timestamp: Date.now(),
      body: message,
      severityText: level.toUpperCase(),
      attributes,
    });
  }

  private convertToAttributes(logData: LogData, error?: Error): Attributes {
    const attributes: Attributes = {};

    for (const [key, value] of Object.entries(logData)) {
      if (value === undefined) {
        continue;
      }
      attributes[key] = this.normalizeAttributeValue(value);
    }

    if (error) {
      attributes['error.name'] = error.name;
      attributes['error.message'] = error.message;
      if (error.stack) {
        attributes['error.stack'] = error.stack;
      }
    }

    return attributes;
  }

  private normalizeAttributeValue(value: any): AttributeValue {
    if (value === null || value === undefined) {
      return 'null';
    }

    if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
      return value;
    }

    if (value instanceof Date) {
      return value.toISOString();
    }

    if (Array.isArray(value)) {
      const simple = value.filter(
        item => typeof item === 'string' || typeof item === 'number' || typeof item === 'boolean',
      );

      if (simple.length === value.length && simple.length > 0) {
        if (simple.every(item => typeof item === 'string')) {
          return simple;
        }
        if (simple.every(item => typeof item === 'number')) {
          return simple;
        }
        if (simple.every(item => typeof item === 'boolean')) {
          return simple;
        }
      }

      return JSON.stringify(value);
    }

    if (typeof value === 'object') {
      return JSON.stringify(value);
    }

    return String(value);
  }
}

export const defaultLogger = new Logger({ library: 'universal-kit' });

export { winston };
