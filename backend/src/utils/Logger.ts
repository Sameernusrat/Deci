export enum LogLevel {
  DEBUG = 'DEBUG',
  INFO = 'INFO',
  WARN = 'WARN',
  ERROR = 'ERROR'
}

export interface LogContext {
  [key: string]: any;
}

export class Logger {
  private static instance: Logger;
  private context: string;

  constructor(context: string = 'DEFAULT') {
    this.context = context;
  }

  static getInstance(context: string = 'DEFAULT'): Logger {
    if (!Logger.instance) {
      Logger.instance = new Logger(context);
    }
    return Logger.instance;
  }

  private formatMessage(level: LogLevel, message: string, context?: LogContext): string {
    const timestamp = new Date().toISOString();
    const baseLog = `[${timestamp}] [${level}] [${this.context}] ${message}`;
    
    if (context && Object.keys(context).length > 0) {
      return `${baseLog} ${JSON.stringify(context)}`;
    }
    
    return baseLog;
  }

  debug(message: string, context?: LogContext): void {
    console.log(this.formatMessage(LogLevel.DEBUG, message, context));
  }

  info(message: string, context?: LogContext): void {
    console.log(this.formatMessage(LogLevel.INFO, message, context));
  }

  warn(message: string, context?: LogContext): void {
    console.warn(this.formatMessage(LogLevel.WARN, message, context));
  }

  error(message: string, error?: Error | any, context?: LogContext): void {
    const errorContext = {
      ...context,
      error: error instanceof Error ? {
        name: error.name,
        message: error.message,
        stack: error.stack
      } : error
    };
    console.error(this.formatMessage(LogLevel.ERROR, message, errorContext));
  }

  time(label: string): void {
    console.time(`[${this.context}] ${label}`);
  }

  timeEnd(label: string): void {
    console.timeEnd(`[${this.context}] ${label}`);
  }
}