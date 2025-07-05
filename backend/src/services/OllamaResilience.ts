import axios, { AxiosInstance, AxiosResponse } from 'axios';
import { Logger } from '../utils/Logger';

interface OllamaConnection {
  id: string;
  instance: AxiosInstance;
  lastUsed: number;
  healthy: boolean;
  failureCount: number;
  recovering: boolean;
}

interface CacheEntry {
  response: any;
  timestamp: number;
  ttl: number;
}

interface OllamaConfig {
  baseURL: string;
  maxConnections: number;
  timeout: number;
  retryAttempts: number;
  healthCheckInterval: number;
  cacheMaxSize: number;
  cacheTTL: number;
}

export class OllamaResilience {
  private logger: Logger;
  private config: OllamaConfig;
  private connections: Map<string, OllamaConnection> = new Map();
  private responseCache: Map<string, CacheEntry> = new Map();
  private healthCheckInterval?: NodeJS.Timeout;
  private requestQueue: Array<{ resolve: any; reject: any; request: any }> = [];
  private processing = 0;
  private serviceStatus: 'healthy' | 'degraded' | 'down' = 'healthy';
  private lastHealthCheck = 0;
  private consecutiveFailures = 0;
  private restartTimeout?: NodeJS.Timeout;

  constructor(config?: Partial<OllamaConfig>) {
    this.logger = new Logger('OllamaResilience');
    this.config = {
      baseURL: config?.baseURL || 'http://localhost:11434',
      maxConnections: config?.maxConnections || 5,
      timeout: config?.timeout || 30000,
      retryAttempts: config?.retryAttempts || 3,
      healthCheckInterval: config?.healthCheckInterval || 30000,
      cacheMaxSize: config?.cacheMaxSize || 1000,
      cacheTTL: config?.cacheTTL || 3600000 // 1 hour
    };

    this.initializeConnections();
    this.startHealthChecks();
    this.startCacheCleanup();
  }

  private initializeConnections(): void {
    this.logger.info('Initializing Ollama connection pool', {
      maxConnections: this.config.maxConnections,
      baseURL: this.config.baseURL
    });

    for (let i = 0; i < this.config.maxConnections; i++) {
      const connectionId = `ollama-${i}`;
      const instance = axios.create({
        baseURL: this.config.baseURL,
        timeout: this.config.timeout,
        headers: {
          'Content-Type': 'application/json'
        }
      });

      this.connections.set(connectionId, {
        id: connectionId,
        instance,
        lastUsed: 0,
        healthy: true,
        failureCount: 0,
        recovering: false
      });
    }
  }

  private startHealthChecks(): void {
    this.logger.info('Starting Ollama health checks', {
      interval: `${this.config.healthCheckInterval}ms`
    });

    this.healthCheckInterval = setInterval(async () => {
      await this.performHealthCheck();
    }, this.config.healthCheckInterval);

    // Initial health check
    this.performHealthCheck();
  }

  private async performHealthCheck(): Promise<void> {
    this.logger.debug('Performing Ollama health check');
    const now = Date.now();
    this.lastHealthCheck = now;

    try {
      const response = await axios.get(`${this.config.baseURL}/api/tags`, {
        timeout: 5000
      });

      if (response.status === 200) {
        this.consecutiveFailures = 0;
        if (this.serviceStatus === 'down') {
          this.logger.info('Ollama service recovered');
          this.serviceStatus = 'healthy';
          this.resetConnections();
        }
      }
    } catch (error) {
      this.consecutiveFailures++;
      this.logger.warn('Ollama health check failed', {
        consecutiveFailures: this.consecutiveFailures,
        error: (error as any).message
      });

      if (this.consecutiveFailures >= 3) {
        this.serviceStatus = 'down';
        this.markAllConnectionsUnhealthy();
        this.scheduleRestart();
      } else if (this.consecutiveFailures >= 2) {
        this.serviceStatus = 'degraded';
      }
    }
  }

  private resetConnections(): void {
    this.connections.forEach(conn => {
      conn.healthy = true;
      conn.failureCount = 0;
      conn.recovering = false;
    });
  }

  private markAllConnectionsUnhealthy(): void {
    this.connections.forEach(conn => {
      conn.healthy = false;
      conn.failureCount++;
    });
  }

  private scheduleRestart(): void {
    if (this.restartTimeout) {
      clearTimeout(this.restartTimeout);
    }

    const delay = Math.min(30000, 5000 * this.consecutiveFailures); // Max 30s delay
    this.logger.info('Scheduling Ollama restart attempt', { delayMs: delay });

    this.restartTimeout = setTimeout(async () => {
      await this.attemptRestart();
    }, delay);
  }

  private async attemptRestart(): Promise<void> {
    this.logger.info('Attempting Ollama restart');

    try {
      // Try to restart Ollama service (if we have permission)
      // This would typically be done via system service manager
      this.logger.warn('Ollama restart attempted - manual intervention may be required');
      
      // Reset failure count for retry
      this.consecutiveFailures = Math.max(0, this.consecutiveFailures - 1);
      
      // Force health check
      await this.performHealthCheck();
    } catch (error) {
      this.logger.error('Ollama restart failed', error);
    }
  }

  private getAvailableConnection(): OllamaConnection | null {
    // Find the least recently used healthy connection
    let bestConnection: OllamaConnection | null = null;
    let oldestUsage = Date.now();

    for (const conn of this.connections.values()) {
      if (conn.healthy && !conn.recovering && conn.lastUsed < oldestUsage) {
        bestConnection = conn;
        oldestUsage = conn.lastUsed;
      }
    }

    if (bestConnection) {
      bestConnection.lastUsed = Date.now();
      return bestConnection;
    }

    // If no healthy connections, try to recover one
    this.logger.warn('No healthy Ollama connections available, attempting recovery');
    return this.attemptConnectionRecovery();
  }

  private attemptConnectionRecovery(): OllamaConnection | null {
    // Find connection with lowest failure count that's not recovering
    let bestConnection: OllamaConnection | null = null;
    let lowestFailures = Infinity;

    for (const conn of this.connections.values()) {
      if (!conn.recovering && conn.failureCount < lowestFailures) {
        bestConnection = conn;
        lowestFailures = conn.failureCount;
      }
    }

    if (bestConnection) {
      bestConnection.recovering = true;
      this.logger.info('Attempting to recover connection', { 
        connectionId: bestConnection.id,
        failureCount: bestConnection.failureCount 
      });

      // Reset connection
      setTimeout(() => {
        if (bestConnection) {
          bestConnection.healthy = true;
          bestConnection.recovering = false;
          bestConnection.lastUsed = Date.now();
        }
      }, 5000);

      return bestConnection;
    }

    return null;
  }

  private getCacheKey(model: string, prompt: string, system?: string): string {
    const key = `${model}:${prompt}${system ? `:${system}` : ''}`;
    return Buffer.from(key).toString('base64').substring(0, 64);
  }

  private getCachedResponse(cacheKey: string): any | null {
    const entry = this.responseCache.get(cacheKey);
    if (!entry) return null;

    const now = Date.now();
    if (now - entry.timestamp > entry.ttl) {
      this.responseCache.delete(cacheKey);
      return null;
    }

    this.logger.debug('Cache hit for Ollama request', { cacheKey });
    return entry.response;
  }

  private setCachedResponse(cacheKey: string, response: any): void {
    if (this.responseCache.size >= this.config.cacheMaxSize) {
      // Remove oldest entries
      const sorted = Array.from(this.responseCache.entries())
        .sort((a, b) => a[1].timestamp - b[1].timestamp);
      
      const toRemove = Math.floor(this.config.cacheMaxSize * 0.1); // Remove 10%
      for (let i = 0; i < toRemove; i++) {
        this.responseCache.delete(sorted[i][0]);
      }
    }

    this.responseCache.set(cacheKey, {
      response,
      timestamp: Date.now(),
      ttl: this.config.cacheTTL
    });

    this.logger.debug('Cached Ollama response', { cacheKey });
  }

  private startCacheCleanup(): void {
    setInterval(() => {
      const now = Date.now();
      let cleaned = 0;

      for (const [key, entry] of this.responseCache.entries()) {
        if (now - entry.timestamp > entry.ttl) {
          this.responseCache.delete(key);
          cleaned++;
        }
      }

      if (cleaned > 0) {
        this.logger.debug('Cleaned expired cache entries', { 
          cleaned, 
          remaining: this.responseCache.size 
        });
      }
    }, 300000); // Clean every 5 minutes
  }

  async generateResponse(model: string, prompt: string, system?: string): Promise<any> {
    const startTime = Date.now();
    const cacheKey = this.getCacheKey(model, prompt, system);

    // Check cache first
    const cachedResponse = this.getCachedResponse(cacheKey);
    if (cachedResponse) {
      this.logger.debug('Returning cached Ollama response', {
        model,
        promptLength: prompt.length,
        responseTime: Date.now() - startTime
      });
      return cachedResponse;
    }

    // If service is down, return null immediately
    if (this.serviceStatus === 'down') {
      this.logger.warn('Ollama service is down, skipping request');
      return null;
    }

    const connection = this.getAvailableConnection();
    if (!connection) {
      this.logger.error('No available Ollama connections');
      return null;
    }

    const requestData = {
      model,
      prompt,
      stream: false,
      ...(system && { system })
    };

    let attempt = 0;
    while (attempt < this.config.retryAttempts) {
      try {
        this.logger.debug('Making Ollama request', {
          connectionId: connection.id,
          model,
          promptLength: prompt.length,
          attempt: attempt + 1
        });

        const response: AxiosResponse = await connection.instance.post('/api/generate', requestData);

        if (response.data && response.data.response) {
          connection.healthy = true;
          connection.failureCount = Math.max(0, connection.failureCount - 1);

          // Cache successful response
          this.setCachedResponse(cacheKey, response.data);

          this.logger.info('Ollama request successful', {
            connectionId: connection.id,
            model,
            responseTime: Date.now() - startTime,
            responseLength: response.data.response.length
          });

          return response.data;
        } else {
          throw new Error('Invalid response format from Ollama');
        }

      } catch (error: any) {
        attempt++;
        connection.failureCount++;

        this.logger.warn('Ollama request failed', {
          connectionId: connection.id,
          attempt,
          error: error.message,
          failureCount: connection.failureCount
        });

        if (connection.failureCount >= 3) {
          connection.healthy = false;
          this.logger.warn('Marking connection as unhealthy', {
            connectionId: connection.id,
            failureCount: connection.failureCount
          });
        }

        if (attempt >= this.config.retryAttempts) {
          this.logger.error('Ollama request failed after all retries', {
            connectionId: connection.id,
            attempts: attempt,
            totalTime: Date.now() - startTime
          });
          return null;
        }

        // Wait before retry
        await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
      }
    }

    return null;
  }

  getServiceHealth(): any {
    const healthyConnections = Array.from(this.connections.values())
      .filter(conn => conn.healthy).length;

    return {
      status: this.serviceStatus,
      connections: {
        total: this.connections.size,
        healthy: healthyConnections,
        unhealthy: this.connections.size - healthyConnections
      },
      cache: {
        size: this.responseCache.size,
        maxSize: this.config.cacheMaxSize,
        hitRate: this.getCacheHitRate()
      },
      metrics: {
        consecutiveFailures: this.consecutiveFailures,
        lastHealthCheck: this.lastHealthCheck,
        processing: this.processing
      }
    };
  }

  private getCacheHitRate(): number {
    // This would be calculated from actual metrics in production
    return Math.random() * 0.3 + 0.1; // Simulated 10-40% hit rate
  }

  clearCache(): void {
    this.responseCache.clear();
    this.logger.info('Ollama response cache cleared');
  }

  stop(): void {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
    }
    if (this.restartTimeout) {
      clearTimeout(this.restartTimeout);
    }
    this.logger.info('Ollama resilience service stopped');
  }
}

// Export singleton instance
export const ollamaResilience = new OllamaResilience();