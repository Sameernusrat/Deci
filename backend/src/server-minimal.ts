import express from 'express';
import cors from 'cors';
import helmet from 'helmet';

// Bulletproof logging utility
const log = (level: 'INFO' | 'ERROR' | 'WARN', message: string, data?: any) => {
  const timestamp = new Date().toISOString();
  const logEntry = `[${timestamp}] [${level}] ${message}`;
  
  if (level === 'ERROR') {
    console.error(logEntry, data || '');
  } else if (level === 'WARN') {
    console.warn(logEntry, data || '');
  } else {
    console.log(logEntry, data || '');
  }
};

// Global error handlers
process.on('uncaughtException', (error) => {
  log('ERROR', 'Uncaught Exception', error);
  // Don't exit - keep server running
});

process.on('unhandledRejection', (reason, promise) => {
  log('ERROR', 'Unhandled Rejection', { reason, promise });
  // Don't exit - keep server running
});

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware with error handling
try {
  log('INFO', 'Setting up middleware...');
  
  app.use((req, res, next) => {
    log('INFO', `${req.method} ${req.path}`, { body: req.body, query: req.query });
    next();
  });
  
  app.use(helmet());
  app.use(cors());
  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true }));
  
  log('INFO', 'Middleware setup complete');
} catch (error) {
  log('ERROR', 'Middleware setup failed', error);
  process.exit(1);
}

// Health endpoint - bulletproof
app.get('/api/health', (req, res) => {
  try {
    log('INFO', 'Health check requested');
    const healthData = {
      status: 'OK',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      memory: process.memoryUsage(),
      pid: process.pid
    };
    
    log('INFO', 'Health check successful', healthData);
    res.json(healthData);
  } catch (error) {
    log('ERROR', 'Health check failed', error);
    res.status(500).json({ 
      status: 'ERROR', 
      error: 'Health check failed',
      timestamp: new Date().toISOString()
    });
  }
});

// Minimal chat endpoint - no external dependencies
app.post('/api/chat/message', (req, res) => {
  try {
    log('INFO', 'Chat message requested', req.body);
    
    const { message } = req.body;
    
    if (!message || typeof message !== 'string') {
      log('WARN', 'Invalid message format', req.body);
      return res.status(400).json({ 
        error: 'Message is required and must be a string' 
      });
    }

    // Simple response without any external dependencies
    const response = {
      response: `Hi! I received your message: "${message}". The system is working! I can help you with equity compensation questions.`,
      suggestions: [
        'Tell me about EMI schemes',
        'What are CSOP schemes?',
        'How does capital gains tax work?'
      ],
      relatedTopics: [
        'EMI Schemes',
        'CSOP Schemes', 
        'Capital Gains Tax',
        'Share Valuations'
      ],
      sources: [],
      rag_used: false,
      timestamp: new Date().toISOString()
    };
    
    log('INFO', 'Chat response generated', { messageLength: message.length });
    res.json(response);
    
  } catch (error) {
    log('ERROR', 'Chat endpoint error', error);
    res.status(500).json({ 
      error: 'Chat service temporarily unavailable',
      timestamp: new Date().toISOString()
    });
  }
});

// Topics endpoint
app.get('/api/chat/topics', (req, res) => {
  try {
    log('INFO', 'Topics requested');
    
    const topics = [
      'EMI Schemes',
      'Share Options',
      'Capital Gains Tax',
      'Income Tax on Shares',
      'Business Asset Disposal Relief',
      'CSOP Schemes',
      'SAYE Schemes',
      'Unapproved Options',
      'Share Valuations',
      'Tax Planning'
    ];
    
    res.json({ topics });
    log('INFO', 'Topics sent', { count: topics.length });
    
  } catch (error) {
    log('ERROR', 'Topics endpoint error', error);
    res.status(500).json({ 
      error: 'Topics service temporarily unavailable' 
    });
  }
});

// Catch-all error handler
app.use((error: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  log('ERROR', 'Express error handler', { error, url: req.url, method: req.method });
  
  if (!res.headersSent) {
    res.status(500).json({
      error: 'Internal server error',
      timestamp: new Date().toISOString()
    });
  }
});

// 404 handler
app.use('*', (req, res) => {
  log('WARN', 'Route not found', { url: req.url, method: req.method });
  res.status(404).json({
    error: 'Route not found',
    timestamp: new Date().toISOString()
  });
});

// Start server with proper error handling
const startServer = async () => {
  try {
    log('INFO', 'Starting server...', { port: PORT });
    
    const server = app.listen(PORT, () => {
      log('INFO', `Server successfully started on port ${PORT}`);
      log('INFO', 'Server is ready to accept connections');
    });
    
    server.on('error', (error: any) => {
      log('ERROR', 'Server error', error);
      
      if (error.code === 'EADDRINUSE') {
        log('ERROR', `Port ${PORT} is already in use`);
        process.exit(1);
      }
    });
    
    // Graceful shutdown
    const gracefulShutdown = (signal: string) => {
      log('INFO', `Received ${signal}, shutting down gracefully...`);
      
      server.close(() => {
        log('INFO', 'Server closed successfully');
        process.exit(0);
      });
      
      // Force close after 10 seconds
      setTimeout(() => {
        log('ERROR', 'Force closing server');
        process.exit(1);
      }, 10000);
    };
    
    process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
    process.on('SIGINT', () => gracefulShutdown('SIGINT'));
    
  } catch (error) {
    log('ERROR', 'Failed to start server', error);
    process.exit(1);
  }
};

// Start the server
startServer().catch((error) => {
  log('ERROR', 'Server startup failed', error);
  process.exit(1);
});

export default app;