import { Logger } from './Logger';

export enum CircuitState {
  CLOSED = 'CLOSED',     // Normal operation
  OPEN = 'OPEN',         // Circuit is open, rejecting calls
  HALF_OPEN = 'HALF_OPEN' // Testing if service is back up
}

export interface CircuitBreakerOptions {
  failureThreshold: number;     // Number of failures before opening
  resetTimeout: number;         // Time before attempting to close (ms)
  timeout: number;              // Request timeout (ms)
  name: string;                 // Circuit breaker name for logging
}

export class CircuitBreaker<T = any> {
  private state: CircuitState = CircuitState.CLOSED;
  private failures: number = 0;
  private lastFailureTime: number = 0;
  private logger: Logger;

  constructor(
    private readonly executeFunction: (...args: any[]) => Promise<T>,
    private readonly options: CircuitBreakerOptions
  ) {
    this.logger = new Logger(`CircuitBreaker:${options.name}`);
    this.logger.info('Circuit breaker initialized', {
      failureThreshold: options.failureThreshold,
      resetTimeout: options.resetTimeout,
      timeout: options.timeout
    });
  }

  async execute(...args: any[]): Promise<T> {
    this.logger.debug('Execute requested', { state: this.state, failures: this.failures });

    if (this.state === CircuitState.OPEN) {
      if (this.shouldAttemptReset()) {
        this.state = CircuitState.HALF_OPEN;
        this.logger.info('Circuit breaker transitioning to HALF_OPEN');
      } else {
        const error = new Error(`Circuit breaker is OPEN. Service ${this.options.name} is unavailable.`);
        this.logger.warn('Circuit breaker rejecting call - still OPEN');
        throw error;
      }
    }

    try {
      this.logger.time('execution');
      
      // Create timeout promise
      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => {
          reject(new Error(`Request timeout after ${this.options.timeout}ms`));
        }, this.options.timeout);
      });

      // Race between actual execution and timeout
      const result = await Promise.race([
        this.executeFunction(...args),
        timeoutPromise
      ]);

      this.onSuccess();
      this.logger.timeEnd('execution');
      this.logger.debug('Execution successful');
      
      return result;

    } catch (error) {
      this.logger.timeEnd('execution');
      this.onFailure(error);
      throw error;
    }
  }

  private shouldAttemptReset(): boolean {
    const timeSinceLastFailure = Date.now() - this.lastFailureTime;
    return timeSinceLastFailure >= this.options.resetTimeout;
  }

  private onSuccess(): void {
    this.failures = 0;
    if (this.state === CircuitState.HALF_OPEN) {
      this.state = CircuitState.CLOSED;
      this.logger.info('Circuit breaker closed - service recovered');
    }
  }

  private onFailure(error: any): void {
    this.failures++;
    this.lastFailureTime = Date.now();
    
    this.logger.error(`Circuit breaker failure ${this.failures}/${this.options.failureThreshold}`, error);

    if (this.failures >= this.options.failureThreshold) {
      this.state = CircuitState.OPEN;
      this.logger.error(`Circuit breaker OPENED - ${this.options.name} service is down`);
    }
  }

  getState(): CircuitState {
    return this.state;
  }

  getFailures(): number {
    return this.failures;
  }

  reset(): void {
    this.state = CircuitState.CLOSED;
    this.failures = 0;
    this.lastFailureTime = 0;
    this.logger.info('Circuit breaker manually reset');
  }

  getStats() {
    return {
      state: this.state,
      failures: this.failures,
      lastFailureTime: this.lastFailureTime,
      name: this.options.name
    };
  }
}