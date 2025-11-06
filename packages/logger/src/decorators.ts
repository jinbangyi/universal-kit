import { Logger } from './logger';

export interface DecoratorConfig {
  logRequests?: boolean;
  logResponses?: boolean;
  includeArgs?: boolean;
  customMetadata?: Record<string, unknown>;
}

// eslint-disable-next-line no-unused-vars
type CommonFunction = (...args: unknown[]) => unknown;

const resolveLibraryName = (target: object): string => {
  if (typeof target === 'function' && typeof target.name === 'string' && target.name.length > 0) {
    return target.name;
  }

  const constructorName = (target as { constructor?: { name?: string } }).constructor?.name;
  if (typeof constructorName === 'string' && constructorName.length > 0) {
    return constructorName;
  }

  return 'unknown';
};

export function trackFunction(config: DecoratorConfig = {}): MethodDecorator {
  return function (
    target: object,
    propertyKey: string | symbol,
    descriptor: PropertyDescriptor,
  ): PropertyDescriptor {
    if (typeof descriptor.value !== 'function') {
      return descriptor;
    }

    const originalMethod: CommonFunction = descriptor.value;
    const baseLibraryName = resolveLibraryName(target);
    const methodName = propertyKey.toString();

    const logger = new Logger({
      library: baseLibraryName,
      customFields: {
        ...config.customMetadata,
      },
    });

    descriptor.value = function (this: unknown, ...executionArgs: unknown[]): unknown {
      const startTime = Date.now();
      const requestId = `track_${Date.now()}_${Math.random()
        .toString(36)
        .substring(2, 9)}`;

      let runtimeLibraryName = baseLibraryName;
      if (typeof this === 'object' && this !== null) {
        runtimeLibraryName = resolveLibraryName(this);
      }

      const logData: Record<string, unknown> = {
        functionName: methodName,
        className: runtimeLibraryName,
        requestId,
      };

      if (config.includeArgs) {
        logData.args = executionArgs;
      }

      logger.debug(`Tracking function start: ${methodName}`, logData);

      try {
        const result = originalMethod.apply(this, executionArgs);
        const duration = Date.now() - startTime;

        if (result instanceof Promise) {
          return result
            .then(asyncResult => {
              const asyncDuration = Date.now() - startTime;
              logger.info(`Async function ${methodName} completed`, {
                ...logData,
                duration: asyncDuration,
                success: true,
              });
              return asyncResult;
            })
            .catch(error => {
              const asyncDuration = Date.now() - startTime;
              const errorObj = error instanceof Error ? error : new Error('Unknown error');

              logger.error(`Async function ${methodName} failed`, errorObj, {
                ...logData,
                duration: asyncDuration,
                success: false,
              });

              throw errorObj;
            });
        }

        logger.info(`Function ${methodName} completed`, {
          ...logData,
          duration,
          success: true,
        });
        return result;
      } catch (error) {
        const duration = Date.now() - startTime;
        const errorObj = error instanceof Error ? error : new Error('Unknown error');

        logger.error(`Function ${methodName} failed`, errorObj, {
          ...logData,
          duration,
          success: false,
        });

        throw errorObj;
      }
    };

    return descriptor;
  };
}
