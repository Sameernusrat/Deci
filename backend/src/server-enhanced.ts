import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { Logger } from './utils/Logger';
import { BulletproofChatService } from './services/BulletproofChatService';

// Initialize logger
const logger = new Logger('EnhancedServer');

// Global error handlers
process.on('uncaughtException', (error) => {
  logger.error('Uncaught Exception - Server will continue running', error);
  // Don't exit - keep server running
});

process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled Rejection - Server will continue running', reason, { promise });
  // Don't exit - keep server running
});

const app = express();
const PORT = process.env.PORT || 3001;

// Initialize services
let chatService: BulletproofChatService | null = null;
let serviceInitialized = false;
let initializationAttempts = 0;
const MAX_INIT_ATTEMPTS = 3;

// Initialize chat service with retries
const initializeChatService = async (): Promise<void> => {
  if (serviceInitialized || initializationAttempts >= MAX_INIT_ATTEMPTS) {
    return;
  }

  initializationAttempts++;
  logger.info(`Initializing chat service (attempt ${initializationAttempts}/${MAX_INIT_ATTEMPTS})`);

  try {
    chatService = new BulletproofChatService();
    serviceInitialized = true;
    logger.info('Chat service initialized successfully');
  } catch (error: any) {
    logger.error(`Chat service initialization failed (attempt ${initializationAttempts})`, error);
    
    if (initializationAttempts >= MAX_INIT_ATTEMPTS) {
      logger.error('Max initialization attempts reached - service will run in degraded mode');
    } else {
      // Retry after delay
      setTimeout(() => {
        initializeChatService();
      }, 5000 * initializationAttempts);
    }
  }
};

// Middleware setup with error handling
try {
  logger.info('Setting up middleware...');
  
  // Request logging middleware
  app.use((req, res, next) => {
    const startTime = Date.now();
    logger.debug(`${req.method} ${req.path}`, { 
      body: req.body ? Object.keys(req.body) : undefined,
      query: Object.keys(req.query).length > 0 ? req.query : undefined,
      ip: req.ip
    });
    
    // Log response time
    res.on('finish', () => {
      const duration = Date.now() - startTime;
      logger.debug(`${req.method} ${req.path} completed`, {
        status: res.statusCode,
        duration: `${duration}ms`
      });
    });
    
    next();
  });
  
  app.use(helmet());
  app.use(cors());
  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true }));
  
  logger.info('Middleware setup complete');
} catch (error) {
  logger.error('Middleware setup failed', error);
  process.exit(1);
}

// Health endpoint - bulletproof
app.get('/api/health', async (req, res) => {
  try {
    logger.debug('Health check requested');
    
    const healthData = {
      status: 'OK',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      memory: process.memoryUsage(),
      pid: process.pid,
      services: {
        chatService: serviceInitialized,
        initializationAttempts,
        ...(chatService ? { serviceHealth: chatService.getServiceHealth() } : {})
      }
    };
    
    logger.debug('Health check successful');
    res.json(healthData);
  } catch (error) {
    logger.error('Health check failed', error);
    res.status(500).json({ 
      status: 'ERROR', 
      error: 'Health check failed',
      timestamp: new Date().toISOString()
    });
  }
});

// Chat message endpoint with comprehensive error handling
app.post('/api/chat/message', async (req, res) => {
  try {
    logger.info('Chat message endpoint called');
    
    // Validate request
    const { message, context } = req.body;
    
    if (!message || typeof message !== 'string') {
      logger.warn('Invalid message format', { messageType: typeof message });
      return res.status(400).json({ 
        error: 'Message is required and must be a string',
        timestamp: new Date().toISOString()
      });
    }

    if (message.length > 10000) {
      logger.warn('Message too long', { messageLength: message.length });
      return res.status(400).json({ 
        error: 'Message is too long (max 10000 characters)',
        timestamp: new Date().toISOString()
      });
    }

    // Initialize chat service if needed
    if (!serviceInitialized && initializationAttempts < MAX_INIT_ATTEMPTS) {
      logger.info('Chat service not initialized, attempting initialization...');
      await initializeChatService();
    }

    // Handle chat request
    if (serviceInitialized && chatService) {
      try {
        logger.time('chatProcessing');
        const response = await chatService.processMessage(message, context);
        logger.timeEnd('chatProcessing');
        
        const result = {
          response: response.text,
          suggestions: response.suggestions,
          relatedTopics: response.relatedTopics,
          sources: response.sources || [],
          rag_used: response.rag_used || false,
          service_health: response.service_health,
          timestamp: new Date().toISOString()
        };
        
        logger.info('Chat response generated successfully', {
          responseLength: response.text.length,
          ragUsed: response.rag_used,
          sourcesCount: response.sources?.length || 0
        });
        
        res.json(result);
        
      } catch (processingError: any) {
        logger.error('Chat processing error', processingError);
        
        // Return graceful error response
        res.json({
          response: `I apologize, but I encountered an issue processing your message. However, I can still help with general equity and tax questions.

**I specialize in:**
• EMI schemes and eligibility
• Share option schemes (CSOP, SAYE, Unapproved)  
• Capital gains tax on shares
• Income tax implications
• Business Asset Disposal Relief
• Tax planning strategies

Please try rephrasing your question or ask something more specific.`,
          suggestions: [
            'Tell me about EMI schemes',
            'What are the different share option schemes?',
            'How is capital gains tax calculated?'
          ],
          relatedTopics: ['EMI Schemes', 'Share Options', 'Capital Gains Tax', 'Tax Planning'],
          sources: [],
          rag_used: false,
          error: 'Processing temporarily unavailable',
          timestamp: new Date().toISOString()
        });
      }
    } else {
      // Service unavailable - return helpful fallback
      logger.warn('Chat service unavailable, returning fallback response');
      
      res.json({
        response: `The AI chat service is currently initializing. I can still provide general information about equity compensation:

**Key UK Equity Schemes:**
• **EMI (Enterprise Management Incentives)** - Most tax-efficient for qualifying companies
• **CSOP (Company Share Option Plan)** - Broader eligibility, moderate tax benefits  
• **SAYE (Save As You Earn)** - All-employee scheme with savings requirement
• **Unapproved Options** - Maximum flexibility, immediate tax implications

**Next Steps:**
1. Try your question again in a moment
2. Ask about specific schemes you're interested in
3. Contact support if issues persist

The system will automatically recover when services are ready.`,
        suggestions: [
          'Tell me about EMI scheme eligibility',
          'What are CSOP scheme benefits?',
          'How does SAYE work?'
        ],
        relatedTopics: ['EMI Schemes', 'CSOP Schemes', 'SAYE Schemes', 'Tax Planning'],
        sources: [],
        rag_used: false,
        service_status: 'initializing',
        timestamp: new Date().toISOString()
      });
    }
    
  } catch (error: any) {
    logger.error('Chat endpoint error', error);
    res.status(500).json({ 
      error: 'Chat service temporarily unavailable',
      timestamp: new Date().toISOString()
    });
  }
});

// Topics endpoint
app.get('/api/chat/topics', (req, res) => {
  try {
    logger.debug('Topics endpoint called');
    
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
    
    res.json({ 
      topics,
      serviceStatus: serviceInitialized ? 'ready' : 'initializing',
      timestamp: new Date().toISOString()
    });
    
    logger.debug('Topics sent successfully', { count: topics.length });
    
  } catch (error) {
    logger.error('Topics endpoint error', error);
    res.status(500).json({ 
      error: 'Topics service temporarily unavailable',
      timestamp: new Date().toISOString()
    });
  }
});

// Service management endpoints
app.get('/api/admin/service-health', (req, res) => {
  try {
    if (chatService) {
      res.json({
        ...chatService.getServiceHealth(),
        serverUptime: process.uptime(),
        timestamp: new Date().toISOString()
      });
    } else {
      res.json({
        initialized: false,
        serverUptime: process.uptime(),
        timestamp: new Date().toISOString()
      });
    }
  } catch (error) {
    logger.error('Service health endpoint error', error);
    res.status(500).json({ error: 'Service health check failed' });
  }
});

app.post('/api/admin/reset-circuits', (req, res) => {
  try {
    if (chatService) {
      chatService.resetCircuitBreakers();
      logger.info('Circuit breakers reset via admin endpoint');
      res.json({ success: true, message: 'Circuit breakers reset' });
    } else {
      res.status(503).json({ error: 'Chat service not available' });
    }
  } catch (error) {
    logger.error('Reset circuits endpoint error', error);
    res.status(500).json({ error: 'Failed to reset circuit breakers' });
  }
});

// Global error handler
app.use((error: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  logger.error('Express error handler triggered', error, { 
    url: req.url, 
    method: req.method,
    body: req.body
  });
  
  if (!res.headersSent) {
    res.status(500).json({
      error: 'Internal server error',
      timestamp: new Date().toISOString()
    });
  }
});

// 404 handler
app.use('*', (req, res) => {
  logger.warn('Route not found', { url: req.url, method: req.method });
  res.status(404).json({
    error: 'Route not found',
    timestamp: new Date().toISOString()
  });
});

// Server startup with proper error handling
const startServer = async (): Promise<void> => {
  try {
    logger.info('Starting enhanced server...', { port: PORT });
    
    const server = app.listen(PORT, () => {
      logger.info(`Enhanced server successfully started on port ${PORT}`);
      logger.info('Server is ready to accept connections');
      
      // Initialize chat service after server starts
      initializeChatService();
    });
    
    server.on('error', (error: any) => {
      logger.error('Server error', error);
      
      if (error.code === 'EADDRINUSE') {
        logger.error(`Port ${PORT} is already in use`);
        process.exit(1);
      }
    });
    
    // Graceful shutdown
    const gracefulShutdown = (signal: string) => {
      logger.info(`Received ${signal}, shutting down gracefully...`);
      
      server.close(() => {
        logger.info('Server closed successfully');
        process.exit(0);
      });
      
      // Force close after 10 seconds
      setTimeout(() => {
        logger.error('Force closing server');
        process.exit(1);
      }, 10000);
    };
    
    process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
    process.on('SIGINT', () => gracefulShutdown('SIGINT'));
    
  } catch (error) {
    logger.error('Failed to start server', error);
    process.exit(1);
  }
};

// Start the server
startServer().catch((error) => {
  logger.error('Server startup failed', error);
  process.exit(1);
});

export default app;