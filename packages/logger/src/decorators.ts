import { DecoratorConfig } from '@universal-kit/core';
import { Logger } from './logger';

export function trackFunction(config: DecoratorConfig = {}) {
  return function (
    target: any,
    propertyKey: string,
    descriptor: PropertyDescriptor
  ) {
    const originalMethod = descriptor.value;
    const logger = new Logger({
      library: target.constructor.name || 'unknown',
      customFields: {
        ...config.customMetadata,
      },
    });

    descriptor.value = function (...args: any[]) {
      const startTime = Date.now();
      const requestId = `track_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;

      const logData: any = {
        functionName: propertyKey,
        className: target.constructor.name,
        requestId,
      };

      if (config.includeArgs) {
        logData.args = args;
      }

      logger.debug(
        `Tracking function start: ${propertyKey}`,
        logData
      );

      try {
        const result = originalMethod.apply(this, args);
        const duration = Date.now() - startTime;

        if (result && typeof result === 'object' && result instanceof Promise) {
          return result
            .then(asyncResult => {
              const asyncDuration = Date.now() - startTime;
              logger.info(
                `Async function ${propertyKey} completed`,
                {
                  ...logData,
                  duration: asyncDuration,
                  success: true,
                }
              );
              return asyncResult;
            })
            .catch(error => {
              const asyncDuration = Date.now() - startTime;
              const errorObj =
                error instanceof Error ? error : new Error('Unknown error');

              logger.error(
                `Async function ${propertyKey} failed`,
                errorObj,
                {
                  ...logData,
                  duration: asyncDuration,
                  success: false,
                }
              );

              throw errorObj;
            });
        } else {
          logger.info(
            `Function ${propertyKey} completed`,
            {
              ...logData,
              duration,
              success: true,
            }
          );
          return result;
        }
      } catch (error) {
        const duration = Date.now() - startTime;
        const errorObj =
          error instanceof Error ? error : new Error('Unknown error');

        logger.error(
          `Function ${propertyKey} failed`,
          errorObj,
          {
            ...logData,
            duration,
            success: false,
          }
        );

        throw errorObj;
      }
    };

    return descriptor;
  };
}
