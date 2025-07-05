import rateLimit from 'express-rate-limit';
import slowDown from 'express-slow-down';
import { Request, Response, NextFunction } from 'express';
import { Logger } from '../utils/Logger';

const logger = new Logger('Protection');

// Rate limiting - max 100 requests per minute per IP
export const rateLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 100, // limit each IP to 100 requests per windowMs
  message: {
    error: 'Too many requests from this IP, please try again later.',
    retryAfter: 60
  },
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req: Request, res: Response) => {
    logger.warn('Rate limit exceeded', { 
      ip: req.ip, 
      userAgent: req.get('User-Agent'),
      path: req.path 
    });
    res.status(429).json({
      error: 'Too many requests from this IP, please try again later.',
      retryAfter: 60,
      timestamp: new Date().toISOString()
    });
  },
  skip: (req: Request) => {
    // Skip rate limiting for health checks
    return req.path === '/api/health';
  }
});

// Slow down requests after 50 requests per minute
export const speedLimiter = slowDown({
  windowMs: 60 * 1000, // 1 minute
  delayAfter: 50, // allow 50 requests per minute at full-speed
  delayMs: 500, // add 500ms delay per request after delayAfter
  maxDelayMs: 10000, // maximum delay of 10 seconds
  skipFailedRequests: true,
  skipSuccessfulRequests: false
});

// Request size limits
export const requestSizeLimiter = (req: Request, res: Response, next: NextFunction) => {
  const maxSize = 1024 * 1024; // 1MB
  
  if (req.headers['content-length']) {
    const contentLength = parseInt(req.headers['content-length'], 10);
    if (contentLength > maxSize) {
      logger.warn('Request too large', { 
        ip: req.ip, 
        size: contentLength, 
        maxSize,
        path: req.path 
      });
      return res.status(413).json({
        error: 'Request entity too large',
        maxSize: '1MB',
        receivedSize: `${Math.round(contentLength / 1024)}KB`,
        timestamp: new Date().toISOString()
      });
    }
  }
  
  next();
};

// Request timeout middleware
export const requestTimeout = (timeoutMs: number = 30000) => {
  return (req: Request, res: Response, next: NextFunction) => {
    const timeout = setTimeout(() => {
      if (!res.headersSent) {
        logger.warn('Request timeout', { 
          ip: req.ip, 
          path: req.path,
          method: req.method,
          timeout: timeoutMs 
        });
        res.status(408).json({
          error: 'Request timeout',
          timeout: `${timeoutMs / 1000}s`,
          timestamp: new Date().toISOString()
        });
      }
    }, timeoutMs);

    res.on('finish', () => {
      clearTimeout(timeout);
    });

    res.on('close', () => {
      clearTimeout(timeout);
    });

    next();
  };
};

// Security headers middleware
export const securityHeaders = (req: Request, res: Response, next: NextFunction) => {
  // Prevent clickjacking
  res.setHeader('X-Frame-Options', 'DENY');
  
  // Prevent MIME type sniffing
  res.setHeader('X-Content-Type-Options', 'nosniff');
  
  // XSS Protection
  res.setHeader('X-XSS-Protection', '1; mode=block');
  
  // Referrer Policy
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  
  // Content Security Policy
  res.setHeader('Content-Security-Policy', "default-src 'self'");
  
  next();
};

// Input sanitization middleware
export const inputSanitizer = (req: Request, res: Response, next: NextFunction) => {
  if (req.body && typeof req.body === 'object') {
    // Sanitize string fields
    Object.keys(req.body).forEach(key => {
      if (typeof req.body[key] === 'string') {
        // Remove potentially dangerous characters
        req.body[key] = req.body[key]
          .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '') // Remove script tags
          .replace(/javascript:/gi, '') // Remove javascript: protocol
          .replace(/on\w+\s*=/gi, '') // Remove event handlers
          .trim();
      }
    });
  }
  
  next();
};

// Memory pressure monitoring
export const memoryMonitor = (req: Request, res: Response, next: NextFunction) => {
  const memUsage = process.memoryUsage();
  const memUsageMB = Math.round(memUsage.rss / 1024 / 1024);
  
  // Alert if memory usage is high
  if (memUsageMB > 500) {
    logger.warn('High memory usage detected', { 
      memoryMB: memUsageMB,
      heapUsed: Math.round(memUsage.heapUsed / 1024 / 1024),
      external: Math.round(memUsage.external / 1024 / 1024)
    });
  }
  
  // Reject requests if memory is critically high
  if (memUsageMB > 800) {
    logger.error('Critical memory usage - rejecting request', { 
      memoryMB: memUsageMB 
    });
    return res.status(503).json({
      error: 'Service temporarily unavailable due to high memory usage',
      timestamp: new Date().toISOString()
    });
  }
  
  // Add memory info to response headers (for monitoring)
  res.setHeader('X-Memory-Usage-MB', memUsageMB.toString());
  
  next();
};

// Request queue for handling bursts
class RequestQueue {
  private queue: Array<() => void> = [];
  private processing = 0;
  private maxConcurrent = 10;
  private maxQueue = 100;

  async process<T>(fn: () => Promise<T>): Promise<T> {
    return new Promise((resolve, reject) => {
      if (this.queue.length >= this.maxQueue) {
        reject(new Error('Request queue full'));
        return;
      }

      const processRequest = async () => {
        this.processing++;
        try {
          const result = await fn();
          resolve(result);
        } catch (error) {
          reject(error);
        } finally {
          this.processing--;
          this.processNext();
        }
      };

      if (this.processing < this.maxConcurrent) {
        processRequest();
      } else {
        this.queue.push(processRequest);
      }
    });
  }

  private processNext() {
    if (this.queue.length > 0 && this.processing < this.maxConcurrent) {
      const next = this.queue.shift();
      if (next) next();
    }
  }
}

const requestQueue = new RequestQueue();

export const queueMiddleware = (req: Request, res: Response, next: NextFunction) => {
  // Only queue expensive operations (chat requests)
  if (req.path === '/api/chat/message' && req.method === 'POST') {
    requestQueue.process(async () => {
      return new Promise<void>((resolve) => {
        res.on('finish', resolve);
        res.on('close', resolve);
        next();
      });
    }).catch((error) => {
      logger.error('Request queue error', error);
      if (!res.headersSent) {
        res.status(503).json({
          error: 'Service temporarily overloaded',
          timestamp: new Date().toISOString()
        });
      }
    });
  } else {
    next();
  }
};