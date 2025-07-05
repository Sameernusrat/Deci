import fs from 'fs';
import path from 'path';
import { Logger } from './Logger';

interface CrashReport {
  timestamp: string;
  pid: number;
  type: 'uncaughtException' | 'unhandledRejection' | 'SIGTERM' | 'SIGINT' | 'memoryLimit' | 'manual';
  error?: {
    name: string;
    message: string;
    stack: string;
  };
  reason?: any;
  promise?: any;
  systemInfo: {
    memory: NodeJS.MemoryUsage;
    uptime: number;
    cpuUsage: NodeJS.CpuUsage;
    nodeVersion: string;
    platform: string;
  };
  processInfo: {
    argv: string[];
    execPath: string;
    cwd: string;
    env: Record<string, string>;
  };
  applicationState: {
    routes: string[];
    connections: number;
    services: Record<string, any>;
  };
}

interface RecoveryConfig {
  maxCrashReports: number;
  crashReportDir: string;
  autoRestart: boolean;
  restartDelay: number;
  maxRestarts: number;
  resetInterval: number;
  healthCheckInterval: number;
  memoryThreshold: number;
}

class CrashRecovery {
  private logger: Logger;
  private config: RecoveryConfig;
  private crashCount = 0;
  private startTime = Date.now();
  private healthCheckInterval?: NodeJS.Timeout;
  private isShuttingDown = false;
  private applicationState: any = {};

  constructor(config?: Partial<RecoveryConfig>) {
    this.logger = new Logger('CrashRecovery');
    this.config = {
      maxCrashReports: 50,
      crashReportDir: './crash-reports',
      autoRestart: true,
      restartDelay: 5000,
      maxRestarts: 10,
      resetInterval: 3600000, // 1 hour
      healthCheckInterval: 30000, // 30 seconds
      memoryThreshold: 800 * 1024 * 1024, // 800MB
      ...config
    };

    this.setupCrashHandlers();
    this.ensureCrashReportDirectory();
    this.startHealthChecks();
    this.setupRecoveryReset();
  }

  private ensureCrashReportDirectory(): void {
    if (!fs.existsSync(this.config.crashReportDir)) {
      fs.mkdirSync(this.config.crashReportDir, { recursive: true });
    }
  }

  private setupCrashHandlers(): void {
    // Uncaught Exception Handler
    process.on('uncaughtException', (error: Error) => {
      this.logger.error('Uncaught Exception detected', error);
      
      const crashReport = this.generateCrashReport('uncaughtException', { error });
      this.saveCrashReport(crashReport);
      
      this.handleCrash('uncaughtException', error);
    });

    // Unhandled Promise Rejection Handler
    process.on('unhandledRejection', (reason: any, promise: Promise<any>) => {
      this.logger.error('Unhandled Promise Rejection detected', { reason, promise });
      
      const crashReport = this.generateCrashReport('unhandledRejection', { reason, promise });
      this.saveCrashReport(crashReport);
      
      this.handleCrash('unhandledRejection', reason);
    });

    // Graceful shutdown handlers
    process.on('SIGTERM', () => {
      this.logger.info('SIGTERM received, initiating graceful shutdown');
      this.gracefulShutdown('SIGTERM');
    });

    process.on('SIGINT', () => {
      this.logger.info('SIGINT received, initiating graceful shutdown');
      this.gracefulShutdown('SIGINT');
    });

    // Memory warnings
    process.on('warning', (warning) => {
      if (warning.name === 'MaxListenersExceededWarning' || 
          warning.message.includes('memory')) {
        this.logger.warn('Process warning detected', { 
          name: warning.name, 
          message: warning.message 
        });
        
        this.checkMemoryUsage();
      }
    });
  }

  private generateCrashReport(
    type: CrashReport['type'], 
    details: { error?: Error; reason?: any; promise?: any } = {}
  ): CrashReport {
    const memoryUsage = process.memoryUsage();
    const cpuUsage = process.cpuUsage();

    return {
      timestamp: new Date().toISOString(),
      pid: process.pid,
      type,
      error: details.error ? {
        name: details.error.name,
        message: details.error.message,
        stack: details.error.stack || ''
      } : undefined,
      reason: details.reason,
      promise: details.promise ? String(details.promise) : undefined,
      systemInfo: {
        memory: memoryUsage,
        uptime: process.uptime(),
        cpuUsage,
        nodeVersion: process.version,
        platform: process.platform
      },
      processInfo: {
        argv: process.argv,
        execPath: process.execPath,
        cwd: process.cwd(),
        env: this.sanitizeEnvironment(process.env)
      },
      applicationState: {
        routes: this.applicationState.routes || [],
        connections: this.applicationState.connections || 0,
        services: this.applicationState.services || {}
      }
    };
  }

  private sanitizeEnvironment(env: NodeJS.ProcessEnv): Record<string, string> {
    const sensitiveKeys = ['PASSWORD', 'SECRET', 'KEY', 'TOKEN', 'API_KEY'];
    const sanitized: Record<string, string> = {};

    for (const [key, value] of Object.entries(env)) {
      if (value && sensitiveKeys.some(sensitive => key.toUpperCase().includes(sensitive))) {
        sanitized[key] = '[REDACTED]';
      } else {
        sanitized[key] = value || '';
      }
    }

    return sanitized;
  }

  private saveCrashReport(report: CrashReport): void {
    try {
      const filename = `crash-${report.timestamp.replace(/[:.]/g, '-')}-${report.pid}.json`;
      const filepath = path.join(this.config.crashReportDir, filename);
      
      fs.writeFileSync(filepath, JSON.stringify(report, null, 2));
      
      this.logger.info('Crash report saved', { filepath });
      
      // Cleanup old crash reports
      this.cleanupOldCrashReports();
      
    } catch (error) {
      this.logger.error('Failed to save crash report', error);
    }
  }

  private cleanupOldCrashReports(): void {
    try {
      const files = fs.readdirSync(this.config.crashReportDir)
        .filter(file => file.startsWith('crash-') && file.endsWith('.json'))
        .map(file => ({
          name: file,
          path: path.join(this.config.crashReportDir, file),
          stats: fs.statSync(path.join(this.config.crashReportDir, file))
        }))
        .sort((a, b) => b.stats.mtime.getTime() - a.stats.mtime.getTime());

      // Keep only the latest reports
      if (files.length > this.config.maxCrashReports) {
        const filesToDelete = files.slice(this.config.maxCrashReports);
        
        for (const file of filesToDelete) {
          fs.unlinkSync(file.path);
        }
        
        this.logger.info('Cleaned up old crash reports', { 
          deleted: filesToDelete.length,
          remaining: this.config.maxCrashReports 
        });
      }
    } catch (error) {
      this.logger.error('Failed to cleanup crash reports', error);
    }
  }

  private handleCrash(type: string, error: any): void {
    this.crashCount++;
    
    this.logger.error('Application crash detected', {
      type,
      crashCount: this.crashCount,
      maxRestarts: this.config.maxRestarts,
      error: error?.message || 'Unknown error'
    });

    if (this.crashCount >= this.config.maxRestarts) {
      this.logger.error('Maximum restart attempts reached, shutting down permanently', {
        crashCount: this.crashCount,
        maxRestarts: this.config.maxRestarts
      });
      
      this.permanentShutdown();
      return;
    }

    if (this.config.autoRestart && !this.isShuttingDown) {
      this.logger.info('Attempting automatic restart', {
        delay: this.config.restartDelay,
        attempt: this.crashCount
      });
      
      this.scheduleRestart();
    } else {
      this.logger.warn('Auto-restart disabled or shutting down, manual intervention required');
      process.exit(1);
    }
  }

  private scheduleRestart(): void {
    setTimeout(() => {
      this.logger.info('Initiating restart process');
      
      // In a PM2 environment, exit with code 0 to trigger restart
      // PM2 will automatically restart the process
      if (process.env.PM2_HOME || process.env.PM_ID) {
        this.logger.info('PM2 environment detected, exiting for restart');
        process.exit(0);
      } else {
        // For standalone mode, attempt manual restart
        this.attemptManualRestart();
      }
    }, this.config.restartDelay);
  }

  private attemptManualRestart(): void {
    this.logger.info('Attempting manual restart');
    
    try {
      // Clean up resources
      this.cleanup();
      
      // In a real scenario, you might use spawn to start a new process
      // For this implementation, we'll exit and rely on external process manager
      this.logger.info('Manual restart requires external process manager');
      process.exit(0);
      
    } catch (error) {
      this.logger.error('Manual restart failed', error);
      process.exit(1);
    }
  }

  private gracefulShutdown(signal: string): void {
    if (this.isShuttingDown) {
      this.logger.warn('Shutdown already in progress');
      return;
    }
    
    this.isShuttingDown = true;
    
    this.logger.info('Starting graceful shutdown', { signal });
    
    const crashReport = this.generateCrashReport(signal as any);
    this.saveCrashReport(crashReport);
    
    // Give the application time to cleanup
    const shutdownTimeout = setTimeout(() => {
      this.logger.error('Graceful shutdown timeout, forcing exit');
      process.exit(1);
    }, 30000); // 30 second timeout
    
    // Cleanup and exit
    this.cleanup()
      .then(() => {
        clearTimeout(shutdownTimeout);
        this.logger.info('Graceful shutdown completed');
        process.exit(0);
      })
      .catch((error) => {
        clearTimeout(shutdownTimeout);
        this.logger.error('Error during graceful shutdown', error);
        process.exit(1);
      });
  }

  private async cleanup(): Promise<void> {
    this.logger.info('Starting cleanup process');
    
    // Stop health checks
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
    }
    
    // Additional cleanup tasks can be added here
    // - Close database connections
    // - Save in-memory data
    // - Clear caches
    // - Stop background tasks
    
    this.logger.info('Cleanup completed');
  }

  private permanentShutdown(): void {
    this.logger.error('Permanent shutdown initiated due to excessive crashes');
    
    const report = this.generateCrashReport('manual', {
      error: new Error(`Permanent shutdown after ${this.crashCount} crashes`)
    });
    this.saveCrashReport(report);
    
    process.exit(1);
  }

  private startHealthChecks(): void {
    this.healthCheckInterval = setInterval(() => {
      this.performHealthCheck();
    }, this.config.healthCheckInterval);
  }

  private performHealthCheck(): void {
    try {
      this.checkMemoryUsage();
      this.checkUptime();
      
      // Additional health checks can be added here
      // - Database connectivity
      // - External service availability
      // - File system health
      
    } catch (error) {
      this.logger.error('Health check failed', error);
    }
  }

  private checkMemoryUsage(): void {
    const memoryUsage = process.memoryUsage();
    
    if (memoryUsage.heapUsed > this.config.memoryThreshold) {
      this.logger.warn('High memory usage detected', {
        heapUsed: Math.round(memoryUsage.heapUsed / 1024 / 1024),
        threshold: Math.round(this.config.memoryThreshold / 1024 / 1024),
        unit: 'MB'
      });
      
      // Force garbage collection if available
      if (global.gc) {
        global.gc();
        this.logger.info('Forced garbage collection triggered');
      }
    }
  }

  private checkUptime(): void {
    const uptime = process.uptime();
    const uptimeHours = uptime / 3600;
    
    // Log periodic uptime
    if (uptimeHours > 0 && uptimeHours % 24 === 0) {
      this.logger.info('Application uptime milestone', {
        uptime: `${Math.floor(uptimeHours)}h`,
        crashCount: this.crashCount
      });
    }
  }

  private setupRecoveryReset(): void {
    // Reset crash count periodically if system is stable
    setInterval(() => {
      if (this.crashCount > 0) {
        this.logger.info('Resetting crash count due to stable operation', {
          previousCount: this.crashCount,
          interval: this.config.resetInterval
        });
        this.crashCount = 0;
      }
    }, this.config.resetInterval);
  }

  // Public methods for application integration
  public updateApplicationState(state: Partial<typeof this.applicationState>): void {
    this.applicationState = { ...this.applicationState, ...state };
  }

  public manualCrashReport(reason: string, additionalData?: any): void {
    this.logger.warn('Manual crash report triggered', { reason, additionalData });
    
    const report = this.generateCrashReport('manual', {
      error: new Error(reason)
    });
    
    if (additionalData) {
      (report as any).additionalData = additionalData;
    }
    
    this.saveCrashReport(report);
  }

  public getCrashStatistics(): any {
    return {
      crashCount: this.crashCount,
      uptime: process.uptime(),
      startTime: this.startTime,
      memoryUsage: process.memoryUsage(),
      isShuttingDown: this.isShuttingDown,
      config: this.config
    };
  }

  public getRecentCrashReports(limit = 5): any[] {
    try {
      const files = fs.readdirSync(this.config.crashReportDir)
        .filter(file => file.startsWith('crash-') && file.endsWith('.json'))
        .map(file => ({
          name: file,
          path: path.join(this.config.crashReportDir, file),
          stats: fs.statSync(path.join(this.config.crashReportDir, file))
        }))
        .sort((a, b) => b.stats.mtime.getTime() - a.stats.mtime.getTime())
        .slice(0, limit);

      return files.map(file => {
        try {
          const content = fs.readFileSync(file.path, 'utf8');
          return JSON.parse(content);
        } catch (error) {
          this.logger.error('Failed to read crash report', { file: file.name, error });
          return null;
        }
      }).filter(Boolean);
      
    } catch (error) {
      this.logger.error('Failed to get recent crash reports', error);
      return [];
    }
  }

  public stop(): void {
    this.logger.info('Stopping crash recovery system');
    
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
    }
    
    // Remove process listeners
    process.removeAllListeners('uncaughtException');
    process.removeAllListeners('unhandledRejection');
    process.removeAllListeners('SIGTERM');
    process.removeAllListeners('SIGINT');
    process.removeAllListeners('warning');
  }
}

// Export singleton instance
export const crashRecovery = new CrashRecovery();
export { CrashReport, RecoveryConfig };