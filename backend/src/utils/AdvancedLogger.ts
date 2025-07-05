import winston from 'winston';
import DailyRotateFile from 'winston-daily-rotate-file';
import path from 'path';
import fs from 'fs';

interface PerformanceMetrics {
  endpoint: string;
  method: string;
  responseTime: number;
  statusCode: number;
  memoryUsage: number;
  timestamp: number;
}

interface LogContext {
  requestId?: string;
  userId?: string;
  ip?: string;
  userAgent?: string;
  [key: string]: any;
}

class AdvancedLogger {
  private logger!: winston.Logger;
  private performanceLogger!: winston.Logger;
  private performanceMetrics: Map<string, PerformanceMetrics[]> = new Map();
  private requestTimings: Map<string, number> = new Map();
  private logDirectory: string;

  constructor() {
    this.logDirectory = path.join(process.cwd(), 'logs');
    this.ensureLogDirectory();
    this.initializeLoggers();
    this.startMetricsCollection();
  }

  private ensureLogDirectory(): void {
    if (!fs.existsSync(this.logDirectory)) {
      fs.mkdirSync(this.logDirectory, { recursive: true });
    }
  }

  private initializeLoggers(): void {
    // Main application logger
    this.logger = winston.createLogger({
      level: process.env.LOG_LEVEL || 'info',
      format: winston.format.combine(
        winston.format.timestamp({
          format: 'YYYY-MM-DD HH:mm:ss.SSS'
        }),
        winston.format.errors({ stack: true }),
        winston.format.json(),
        winston.format.printf(({ timestamp, level, message, service, ...meta }) => {
          return JSON.stringify({
            timestamp,
            level,
            service,
            message,
            ...meta
          });
        })
      ),
      defaultMeta: { service: 'deci-backend' },
      transports: [
        // Console transport for development
        new winston.transports.Console({
          format: winston.format.combine(
            winston.format.colorize(),
            winston.format.simple(),
            winston.format.printf(({ timestamp, level, message, service, ...meta }) => {
              const metaStr = Object.keys(meta).length ? JSON.stringify(meta, null, 2) : '';
              return `[${timestamp}] [${level.toUpperCase()}] [${service}] ${message} ${metaStr}`;
            })
          )
        }),

        // Error log - only errors
        new DailyRotateFile({
          filename: path.join(this.logDirectory, 'error-%DATE%.log') as any,
          datePattern: 'YYYY-MM-DD',
          level: 'error',
          maxSize: '20m',
          maxFiles: '30d',
          handleExceptions: true,
          handleRejections: true
        }),

        // Combined log - all levels
        new DailyRotateFile({
          filename: path.join(this.logDirectory, 'combined-%DATE%.log') as any,
          datePattern: 'YYYY-MM-DD',
          maxSize: '50m',
          maxFiles: '14d'
        }),

        // Warn log - warnings and above
        new DailyRotateFile({
          filename: path.join(this.logDirectory, 'warn-%DATE%.log') as any,
          datePattern: 'YYYY-MM-DD',
          level: 'warn',
          maxSize: '20m',
          maxFiles: '7d'
        })
      ]
    });

    // Performance metrics logger
    this.performanceLogger = winston.createLogger({
      level: 'info',
      format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.json()
      ),
      transports: [
        new DailyRotateFile({
          filename: path.join(this.logDirectory, 'performance-%DATE%.log') as any,
          datePattern: 'YYYY-MM-DD',
          maxSize: '100m',
          maxFiles: '30d'
        })
      ]
    });

    this.logger.info('Advanced logging system initialized', {
      logDirectory: this.logDirectory,
      logLevel: process.env.LOG_LEVEL || 'info'
    });
  }

  private startMetricsCollection(): void {
    // Aggregate and log performance metrics every minute
    setInterval(() => {
      this.aggregateAndLogMetrics();
    }, 60000);

    // Clean old request timings every 5 minutes
    setInterval(() => {
      this.cleanOldTimings();
    }, 300000);
  }

  private aggregateAndLogMetrics(): void {
    const now = Date.now();
    const aggregated = new Map<string, {
      count: number;
      totalTime: number;
      avgTime: number;
      minTime: number;
      maxTime: number;
      errorCount: number;
      memoryAvg: number;
    }>();

    // Aggregate metrics by endpoint
    for (const [endpoint, metrics] of this.performanceMetrics.entries()) {
      const recentMetrics = metrics.filter(m => now - m.timestamp < 60000); // Last minute
      
      if (recentMetrics.length === 0) continue;

      const totalTime = recentMetrics.reduce((sum, m) => sum + m.responseTime, 0);
      const errorCount = recentMetrics.filter(m => m.statusCode >= 400).length;
      const avgMemory = recentMetrics.reduce((sum, m) => sum + m.memoryUsage, 0) / recentMetrics.length;

      aggregated.set(endpoint, {
        count: recentMetrics.length,
        totalTime,
        avgTime: totalTime / recentMetrics.length,
        minTime: Math.min(...recentMetrics.map(m => m.responseTime)),
        maxTime: Math.max(...recentMetrics.map(m => m.responseTime)),
        errorCount,
        memoryAvg: avgMemory
      });
    }

    // Log aggregated metrics
    for (const [endpoint, stats] of aggregated.entries()) {
      this.performanceLogger.info('Performance metrics', {
        endpoint,
        ...stats,
        timestamp: now
      });
    }

    // Clean old metrics (keep last hour)
    for (const [endpoint, metrics] of this.performanceMetrics.entries()) {
      const filtered = metrics.filter(m => now - m.timestamp < 3600000);
      this.performanceMetrics.set(endpoint, filtered);
    }
  }

  private cleanOldTimings(): void {
    const cutoff = Date.now() - 300000; // 5 minutes ago
    for (const [key, timestamp] of this.requestTimings.entries()) {
      if (timestamp < cutoff) {
        this.requestTimings.delete(key);
      }
    }
  }

  // Request lifecycle logging
  startRequest(requestId: string, method: string, url: string, context: LogContext = {}): void {
    this.requestTimings.set(requestId, Date.now());
    
    this.logger.info('Request started', {
      requestId,
      method,
      url,
      ...context
    });
  }

  endRequest(
    requestId: string, 
    method: string, 
    url: string, 
    statusCode: number, 
    context: LogContext = {}
  ): void {
    const startTime = this.requestTimings.get(requestId);
    const responseTime = startTime ? Date.now() - startTime : 0;
    const memoryUsage = process.memoryUsage().heapUsed;

    // Log request completion
    this.logger.info('Request completed', {
      requestId,
      method,
      url,
      statusCode,
      responseTime,
      memoryUsage: Math.round(memoryUsage / 1024 / 1024), // MB
      ...context
    });

    // Store performance metrics
    const endpoint = `${method} ${url}`;
    if (!this.performanceMetrics.has(endpoint)) {
      this.performanceMetrics.set(endpoint, []);
    }

    this.performanceMetrics.get(endpoint)!.push({
      endpoint,
      method,
      responseTime,
      statusCode,
      memoryUsage,
      timestamp: Date.now()
    });

    // Clean up timing
    this.requestTimings.delete(requestId);
  }

  // Application logging methods
  error(message: string, error?: any, context: LogContext = {}): void {
    this.logger.error(message, { 
      error: error ? {
        message: error.message,
        stack: error.stack,
        name: error.name
      } : undefined,
      ...context 
    });
  }

  warn(message: string, context: LogContext = {}): void {
    this.logger.warn(message, context);
  }

  info(message: string, context: LogContext = {}): void {
    this.logger.info(message, context);
  }

  debug(message: string, context: LogContext = {}): void {
    this.logger.debug(message, context);
  }

  // Performance logging
  logPerformance(
    operation: string, 
    duration: number, 
    success: boolean = true, 
    context: LogContext = {}
  ): void {
    this.performanceLogger.info('Operation performance', {
      operation,
      duration,
      success,
      memoryUsage: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
      timestamp: Date.now(),
      ...context
    });
  }

  // Security logging
  logSecurityEvent(
    event: string, 
    severity: 'low' | 'medium' | 'high' | 'critical',
    context: LogContext = {}
  ): void {
    this.logger.warn('Security event', {
      event,
      severity,
      timestamp: Date.now(),
      ...context
    });
  }

  // Memory and system logging
  logSystemMetrics(): void {
    const memUsage = process.memoryUsage();
    const cpuUsage = process.cpuUsage();
    
    this.logger.debug('System metrics', {
      memory: {
        rss: Math.round(memUsage.rss / 1024 / 1024),
        heapUsed: Math.round(memUsage.heapUsed / 1024 / 1024),
        heapTotal: Math.round(memUsage.heapTotal / 1024 / 1024),
        external: Math.round(memUsage.external / 1024 / 1024)
      },
      cpu: {
        user: cpuUsage.user,
        system: cpuUsage.system
      },
      uptime: process.uptime(),
      timestamp: Date.now()
    });
  }

  // Get performance statistics
  getPerformanceStats(): any {
    const stats: any = {};
    
    for (const [endpoint, metrics] of this.performanceMetrics.entries()) {
      if (metrics.length === 0) continue;

      const recentMetrics = metrics.filter(m => Date.now() - m.timestamp < 3600000); // Last hour
      if (recentMetrics.length === 0) continue;

      const responseTimes = recentMetrics.map(m => m.responseTime);
      const errorCount = recentMetrics.filter(m => m.statusCode >= 400).length;

      stats[endpoint] = {
        requestCount: recentMetrics.length,
        avgResponseTime: responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length,
        minResponseTime: Math.min(...responseTimes),
        maxResponseTime: Math.max(...responseTimes),
        errorRate: (errorCount / recentMetrics.length) * 100,
        errorCount
      };
    }

    return stats;
  }

  // Create child logger for specific component
  createChildLogger(component: string): any {
    return {
      error: (message: string, error?: any, context: LogContext = {}) => 
        this.error(message, error, { component, ...context }),
      warn: (message: string, context: LogContext = {}) => 
        this.warn(message, { component, ...context }),
      info: (message: string, context: LogContext = {}) => 
        this.info(message, { component, ...context }),
      debug: (message: string, context: LogContext = {}) => 
        this.debug(message, { component, ...context }),
      logPerformance: (operation: string, duration: number, success: boolean = true, context: LogContext = {}) =>
        this.logPerformance(operation, duration, success, { component, ...context })
    };
  }

  // Middleware factory
  createExpressMiddleware() {
    return (req: any, res: any, next: any) => {
      const requestId = `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      const startTime = Date.now();

      // Attach request ID
      req.requestId = requestId;

      // Log request start
      this.startRequest(requestId, req.method, req.path, {
        ip: req.ip,
        userAgent: req.get('User-Agent'),
        contentLength: req.get('Content-Length')
      });

      // Log request end when response finishes
      res.on('finish', () => {
        this.endRequest(requestId, req.method, req.path, res.statusCode, {
          ip: req.ip,
          userAgent: req.get('User-Agent'),
          responseSize: res.get('Content-Length')
        });
      });

      next();
    };
  }

  // Graceful shutdown
  async shutdown(): Promise<void> {
    return new Promise((resolve) => {
      this.logger.info('Shutting down logging system');
      this.logger.end(() => {
        this.performanceLogger.end(() => {
          resolve();
        });
      });
    });
  }
}

// Export singleton instance
export const advancedLogger = new AdvancedLogger();
export { LogContext, PerformanceMetrics };