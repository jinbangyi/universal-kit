import { logs, Logger as OtelLogger } from '@opentelemetry/api-logs';
import type { Attributes, AttributeValue } from '@opentelemetry/api';
import winston from 'winston';

type LogLevel = 'debug' | 'verbose' | 'info' | 'notice' | 'warn' | 'error';
const LOG_LEVEL_ORDER: LogLevel[] = ['debug', 'verbose', 'info', 'notice', 'warn', 'error'];

const isLogLevel = (value: string | undefined | null): value is LogLevel => {
  if (value === null || value === undefined) {
    return false;
  }
  return (LOG_LEVEL_ORDER as readonly string[]).includes(value);
};

const resolveLogLevel = (value?: string | null): LogLevel =>
  isLogLevel(value) ? value : 'info';

const serviceName = process.env.OTEL_SERVICE_NAME ?? 'universal-kit';
const serviceVersion = process.env.OTEL_SERVICE_VERSION ?? '0.0.1';
const globalLogLevel = resolveLogLevel(process.env.KIT_LOG_LEVEL ?? process.env.OTEL_LOG_LEVEL);

export interface LoggerConfig {
  library: string;
  level?: LogLevel;
  includeMetadata?: boolean;
  customFields?: Record<string, unknown>;
  enableOtel?: boolean;
  otelLoggerName?: string;
  otelLoggerVersion?: string;
}

type NormalizedLoggerConfig = {
  library: string;
  level: LogLevel;
  includeMetadata: boolean;
  customFields: Record<string, unknown>;
  enableOtel: boolean;
  otelLoggerName: string;
  otelLoggerVersion: string;
};

interface LogData extends Record<string, unknown> {
  library: string;
  requestId?: string;
}

interface WinstonInfo extends Record<string, unknown> {
  timestamp?: string;
  level?: string;
  message?: string;
  metadata?: Record<string, unknown>;
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
    const metadata: Record<string, unknown> = winstonInfo.metadata ?? {};
    const library = typeof metadata.library === 'string' ? metadata.library : 'unknown';
    const requestId = typeof metadata.requestId === 'string' ? metadata.requestId : undefined;

    let metadataStr = '';
    const metaObj: Record<string, unknown> = { ...metadata };
    if (
      typeof metaObj.library === 'string' &&
      typeof metaObj.provider === 'string' &&
      metaObj.library === metaObj.provider
    ) {
      delete metaObj.provider;
    }
    delete metaObj.library;
    delete metaObj.requestId;

    if (Object.keys(metaObj).length > 0) {
      metadataStr = ` ${JSON.stringify(metaObj)}`;
    }

    const levelStr = level?.toUpperCase() ?? 'INFO';
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
  private readonly winston: winston.Logger;
  private readonly config: NormalizedLoggerConfig;
  private otelLogger?: OtelLogger;

  constructor(config: LoggerConfig) {
    const resolvedLevel = config.level ? resolveLogLevel(config.level) : globalLogLevel;

    this.config = {
      library: config.library,
      level: resolvedLevel,
      includeMetadata: config.includeMetadata ?? true,
      customFields: { ...(config.customFields ?? {}) },
      enableOtel: config.enableOtel ?? true,
      otelLoggerName: config.otelLoggerName ?? serviceName,
      otelLoggerVersion: config.otelLoggerVersion ?? serviceVersion,
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

  debug(message: string, metadata?: Record<string, unknown>): void {
    if (!this.shouldLog('debug')) return;
    const logData = this.createLogData(metadata);
    this.winston.debug(message, logData);
    this.emitOtelLog('debug', message, logData);
  }

  verbose(message: string, metadata?: Record<string, unknown>): void {
    if (!this.shouldLog('verbose')) return;
    const logData = this.createLogData(metadata);
    this.winston.verbose(message, logData);
    this.emitOtelLog('verbose', message, logData);
  }

  info(message: string, metadata?: Record<string, unknown>): void {
    if (!this.shouldLog('info')) return;
    const logData = this.createLogData(metadata);
    this.winston.info(message, logData);
    this.emitOtelLog('info', message, logData);
  }

  warn(message: string, metadata?: Record<string, unknown>): void {
    if (!this.shouldLog('warn')) return;
    const logData = this.createLogData(metadata);
    this.winston.warn(message, logData);
    this.emitOtelLog('warn', message, logData);
  }

  error(message: string, error?: Error, metadata?: Record<string, unknown>): void {
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

  child(metadata: Record<string, unknown>): winston.Logger {
    return this.winston.child(metadata);
  }

  setLevel(level: LogLevel): void {
    this.config.level = level;
    this.winston.level = level;
    this.winston.transports.forEach(transport => {
      transport.level = level;
    });
  }

  getConfig(): Readonly<NormalizedLoggerConfig> {
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
    return levels[level] <= levels[this.config.level];
  }

  private createLogData(
    metadata?: Record<string, unknown>,
    error?: Error,
  ): LogData {
    const library =
      typeof metadata?.library === 'string' ? metadata.library : this.config.library;
    const requestId =
      typeof metadata?.requestId === 'string' ? metadata.requestId : undefined;

    const logData: LogData = {
      ...this.config.customFields,
      library,
      requestId,
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
    const prefix = 'universal-kit.';
    const attributes: Attributes = {};

    for (const [key, value] of Object.entries(logData)) {
      if (value === undefined) {
        continue;
      }
      attributes[`${prefix}${key}`] = this.normalizeAttributeValue(value);
    }

    if (error) {
      attributes[`${prefix}error.name`] = error.name;
      attributes[`${prefix}error.message`] = error.message;
      if (error.stack) {
        attributes[`${prefix}error.stack`] = error.stack;
      }
    }

    return attributes;
  }

  private normalizeAttributeValue(value: unknown): AttributeValue {
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
      if (value.every((item): item is string => typeof item === 'string')) {
        return value;
      }
      if (value.every((item): item is number => typeof item === 'number')) {
        return value;
      }
      if (value.every((item): item is boolean => typeof item === 'boolean')) {
        return value;
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
