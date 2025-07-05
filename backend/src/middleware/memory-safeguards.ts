import { Request, Response, NextFunction } from 'express';
import { Logger } from '../utils/Logger';

interface MemoryStats {
  rss: number;
  heapUsed: number;
  heapTotal: number;
  external: number;
  arrayBuffers: number;
}

interface MemoryConfig {
  maxHeapUsed: number;
  maxRSS: number;
  gcThreshold: number;
  alertThreshold: number;
  checkInterval: number;
}

export class MemorySafeguards {
  private logger: Logger;
  private config: MemoryConfig;
  private monitoringInterval?: NodeJS.Timeout;
  private lastGcTime: number = 0;
  private memoryAlerts: number = 0;
  private maxMemoryAlerts: number = 5;
  private gcForced: boolean = false;

  constructor(config?: Partial<MemoryConfig>) {
    this.logger = new Logger('MemorySafeguards');
    this.config = {
      maxHeapUsed: config?.maxHeapUsed || 512 * 1024 * 1024, // 512MB
      maxRSS: config?.maxRSS || 1024 * 1024 * 1024, // 1GB
      gcThreshold: config?.gcThreshold || 400 * 1024 * 1024, // 400MB
      alertThreshold: config?.alertThreshold || 300 * 1024 * 1024, // 300MB
      checkInterval: config?.checkInterval || 30000 // 30 seconds
    };

    this.startMonitoring();
    this.setupProcessHandlers();
  }

  private startMonitoring(): void {
    this.logger.info('Starting memory monitoring', {
      maxHeapUsed: `${Math.round(this.config.maxHeapUsed / 1024 / 1024)}MB`,
      maxRSS: `${Math.round(this.config.maxRSS / 1024 / 1024)}MB`,
      gcThreshold: `${Math.round(this.config.gcThreshold / 1024 / 1024)}MB`,
      checkInterval: `${this.config.checkInterval}ms`
    });

    this.monitoringInterval = setInterval(() => {
      this.checkMemoryUsage();
    }, this.config.checkInterval);
  }

  private setupProcessHandlers(): void {
    // Listen for memory pressure warnings
    process.on('warning', (warning) => {
      if (warning.name === 'MaxListenersExceededWarning' || 
          warning.message.includes('memory')) {
        this.logger.warn('Process warning detected', {
          name: warning.name,
          message: warning.message,
          currentMemory: this.getCurrentMemoryStats()
        });
        this.handleMemoryPressure();
      }
    });
  }

  private getCurrentMemoryStats(): MemoryStats {
    const memUsage = process.memoryUsage();
    return {
      rss: memUsage.rss,
      heapUsed: memUsage.heapUsed,
      heapTotal: memUsage.heapTotal,
      external: memUsage.external,
      arrayBuffers: memUsage.arrayBuffers
    };
  }

  private checkMemoryUsage(): void {
    const stats = this.getCurrentMemoryStats();
    
    // Log current memory usage periodically
    this.logger.debug('Memory usage check', {
      heapUsed: `${Math.round(stats.heapUsed / 1024 / 1024)}MB`,
      heapTotal: `${Math.round(stats.heapTotal / 1024 / 1024)}MB`,
      rss: `${Math.round(stats.rss / 1024 / 1024)}MB`,
      external: `${Math.round(stats.external / 1024 / 1024)}MB`
    });

    // Check if we need to trigger garbage collection
    if (stats.heapUsed > this.config.gcThreshold) {
      this.triggerGarbageCollection();
    }

    // Check for memory alerts
    if (stats.heapUsed > this.config.alertThreshold) {
      this.handleMemoryAlert(stats);
    }

    // Critical memory check
    if (stats.heapUsed > this.config.maxHeapUsed || stats.rss > this.config.maxRSS) {
      this.handleCriticalMemory(stats);
    }
  }

  private triggerGarbageCollection(): void {
    const now = Date.now();
    
    // Prevent too frequent GC calls
    if (now - this.lastGcTime < 10000) { // 10 seconds
      return;
    }

    try {
      if (global.gc) {
        this.logger.info('Triggering garbage collection');
        const beforeStats = this.getCurrentMemoryStats();
        
        global.gc();
        this.gcForced = true;
        this.lastGcTime = now;
        
        // Log GC effectiveness
        setTimeout(() => {
          const afterStats = this.getCurrentMemoryStats();
          const freed = beforeStats.heapUsed - afterStats.heapUsed;
          
          this.logger.info('Garbage collection completed', {
            freedMemory: `${Math.round(freed / 1024 / 1024)}MB`,
            beforeHeap: `${Math.round(beforeStats.heapUsed / 1024 / 1024)}MB`,
            afterHeap: `${Math.round(afterStats.heapUsed / 1024 / 1024)}MB`
          });
        }, 1000);
      } else {
        this.logger.warn('Garbage collection not available (run with --expose-gc)');
      }
    } catch (error) {
      this.logger.error('Failed to trigger garbage collection', error);
    }
  }

  private handleMemoryAlert(stats: MemoryStats): void {
    this.memoryAlerts++;
    
    this.logger.warn('Memory usage alert', {
      heapUsed: `${Math.round(stats.heapUsed / 1024 / 1024)}MB`,
      threshold: `${Math.round(this.config.alertThreshold / 1024 / 1024)}MB`,
      alertCount: this.memoryAlerts,
      rss: `${Math.round(stats.rss / 1024 / 1024)}MB`
    });

    // Reset alert counter after successful GC
    if (this.gcForced) {
      this.memoryAlerts = Math.max(0, this.memoryAlerts - 1);
      this.gcForced = false;
    }
  }

  private handleCriticalMemory(stats: MemoryStats): void {
    this.logger.error('CRITICAL: Memory usage exceeded limits', {
      heapUsed: `${Math.round(stats.heapUsed / 1024 / 1024)}MB`,
      maxHeapUsed: `${Math.round(this.config.maxHeapUsed / 1024 / 1024)}MB`,
      rss: `${Math.round(stats.rss / 1024 / 1024)}MB`,
      maxRSS: `${Math.round(this.config.maxRSS / 1024 / 1024)}MB`
    });

    // Force garbage collection immediately
    this.triggerGarbageCollection();

    // If alerts are too frequent, log critical warning
    if (this.memoryAlerts > this.maxMemoryAlerts) {
      this.logger.error('CRITICAL: Multiple memory alerts detected - potential memory leak', {
        alertCount: this.memoryAlerts,
        maxAlerts: this.maxMemoryAlerts,
        recommendation: 'Consider restarting the service'
      });
    }
  }

  private handleMemoryPressure(): void {
    this.logger.warn('Memory pressure detected, cleaning up resources');
    
    // Force garbage collection
    this.triggerGarbageCollection();
    
    // Additional cleanup could be added here
    // - Clear caches
    // - Release unused connections
    // - Defer non-critical operations
  }

  // Middleware function
  public middleware() {
    return (req: Request, res: Response, next: NextFunction) => {
      const startMemory = process.memoryUsage().heapUsed;
      
      // Monitor request memory usage
      res.on('finish', () => {
        const endMemory = process.memoryUsage().heapUsed;
        const memoryDelta = endMemory - startMemory;
        
        // Log significant memory increases
        if (memoryDelta > 10 * 1024 * 1024) { // 10MB
          this.logger.warn('High memory usage for request', {
            method: req.method,
            url: req.url,
            memoryDelta: `${Math.round(memoryDelta / 1024 / 1024)}MB`,
            currentHeap: `${Math.round(endMemory / 1024 / 1024)}MB`
          });
        }
      });

      next();
    };
  }

  // Circuit breaker for memory
  public memoryCircuitBreaker() {
    return (req: Request, res: Response, next: NextFunction) => {
      const stats = this.getCurrentMemoryStats();
      
      // Reject requests if memory is critically high
      if (stats.heapUsed > this.config.maxHeapUsed * 0.9) {
        this.logger.error('Rejecting request due to high memory usage', {
          heapUsed: `${Math.round(stats.heapUsed / 1024 / 1024)}MB`,
          limit: `${Math.round(this.config.maxHeapUsed * 0.9 / 1024 / 1024)}MB`
        });
        
        return res.status(503).json({
          error: 'Service temporarily unavailable due to high memory usage',
          retryAfter: 30,
          timestamp: new Date().toISOString()
        });
      }

      next();
    };
  }

  public getMemoryStatus() {
    const stats = this.getCurrentMemoryStats();
    
    return {
      current: {
        heapUsed: Math.round(stats.heapUsed / 1024 / 1024),
        heapTotal: Math.round(stats.heapTotal / 1024 / 1024),
        rss: Math.round(stats.rss / 1024 / 1024),
        external: Math.round(stats.external / 1024 / 1024)
      },
      limits: {
        maxHeapUsed: Math.round(this.config.maxHeapUsed / 1024 / 1024),
        maxRSS: Math.round(this.config.maxRSS / 1024 / 1024),
        gcThreshold: Math.round(this.config.gcThreshold / 1024 / 1024)
      },
      stats: {
        memoryAlerts: this.memoryAlerts,
        lastGcTime: this.lastGcTime,
        gcAvailable: !!global.gc
      },
      health: {
        status: stats.heapUsed > this.config.maxHeapUsed * 0.8 ? 'warning' : 'healthy',
        memoryPressure: stats.heapUsed / this.config.maxHeapUsed > 0.8
      }
    };
  }

  public stop(): void {
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
      this.monitoringInterval = undefined;
    }
    this.logger.info('Memory monitoring stopped');
  }
}

// Export singleton instance
export const memorySafeguards = new MemorySafeguards();