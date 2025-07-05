import express from 'express';
import cors from 'cors';
import helmet from 'helmet';

// Diagnostic logging utility - logs everything but catches nothing
const diagLog = (step: string, data?: any) => {
  const timestamp = new Date().toISOString();
  console.log(`🔍 [${timestamp}] DIAG: ${step}`, data || '');
};

const diagError = (step: string, error: any) => {
  const timestamp = new Date().toISOString();
  console.error(`💥 [${timestamp}] ERROR: ${step}`, error);
  // Don't catch - let it crash!
};

console.log('🚀 Starting diagnostic server - will crash loudly to show real issues');

diagLog('STEP 1: Initializing Express app');
const app = express();
const PORT = process.env.PORT || 3001;

diagLog('STEP 2: Setting up basic middleware');
app.use((req, res, next) => {
  diagLog(`REQUEST: ${req.method} ${req.path}`, { body: req.body, ip: req.ip });
  next();
});

diagLog('STEP 3: Adding helmet');
app.use(helmet());

diagLog('STEP 4: Adding CORS');
app.use(cors());

diagLog('STEP 5: Adding JSON parser');
app.use(express.json({ limit: '10mb' }));

diagLog('STEP 6: Adding URL encoder');
app.use(express.urlencoded({ extended: true }));

diagLog('STEP 7: Setting up health endpoint');
app.get('/api/health', (req, res) => {
  diagLog('HEALTH: Endpoint called');
  
  diagLog('HEALTH: Creating response object');
  const response = {
    status: 'OK',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    memory: process.memoryUsage(),
    pid: process.pid
  };
  
  diagLog('HEALTH: Sending response', response);
  res.json(response);
  diagLog('HEALTH: Response sent successfully');
});

diagLog('STEP 8: Setting up chat endpoint');
app.post('/api/chat/message', async (req, res) => {
  diagLog('CHAT: Endpoint called');
  diagLog('CHAT: Request body', req.body);
  
  diagLog('CHAT: Extracting message from body');
  const { message } = req.body;
  
  diagLog('CHAT: Validating message', { message, type: typeof message });
  
  if (!message || typeof message !== 'string') {
    diagLog('CHAT: Invalid message, sending 400');
    return res.status(400).json({ error: 'Message is required and must be a string' });
  }

  diagLog('CHAT: About to require child_process');
  const { exec } = require('child_process');
  
  diagLog('CHAT: About to require util');
  const util = require('util');
  
  diagLog('CHAT: About to promisify exec');
  const execAsync = util.promisify(exec);
  
  diagLog('CHAT: About to escape question for shell');
  const escapedQuestion = message.replace(/'/g, "'\"'\"'");
  diagLog('CHAT: Escaped question', { original: message, escaped: escapedQuestion });
  
  diagLog('CHAT: About to construct RAG command');
  const command = `python3 /Users/sameernusrat/deci/rag_bridge.py '${escapedQuestion}'`;
  diagLog('CHAT: RAG command constructed', { command });
  
  diagLog('CHAT: About to execute RAG command');
  console.log('⚠️  CRITICAL: About to call execAsync - this is where crashes often happen');
  
  // NOW we know where it crashes - add targeted error handling
  let stdout, stderr;
  try {
    const result = await execAsync(command, {
      timeout: 30000,
      cwd: '/Users/sameernusrat/deci'
    });
    stdout = result.stdout;
    stderr = result.stderr;
    diagLog('CHAT: RAG command succeeded');
  } catch (error) {
    diagLog('CHAT: RAG command failed, but server will continue', error);
    // Return fallback response instead of crashing
    return res.json({
      response: `I apologize, but I'm having trouble accessing the knowledge base right now. However, I can help with general information about: ${message}`,
      suggestions: ['Tell me about EMI schemes', 'What are CSOP schemes?', 'How does capital gains tax work?'],
      relatedTopics: ['EMI Schemes', 'Tax Planning'],
      sources: [],
      rag_used: false,
      error: 'RAG service temporarily unavailable'
    });
  }
  
  diagLog('CHAT: RAG command completed');
  diagLog('CHAT: RAG stdout length', stdout.length);
  diagLog('CHAT: RAG stderr', stderr || 'none');
  
  diagLog('CHAT: About to parse RAG JSON');
  const ragResponse = JSON.parse(stdout);
  diagLog('CHAT: RAG JSON parsed successfully', Object.keys(ragResponse));
  
  diagLog('CHAT: Creating response object');
  const response = {
    response: ragResponse.answer || `Simple response to: ${message}`,
    suggestions: ['Tell me more', 'What are the next steps?', 'Any risks?'],
    relatedTopics: ['EMI Schemes', 'Tax Planning'],
    sources: ragResponse.sources || [],
    rag_used: ragResponse.rag_available || false,
    timestamp: new Date().toISOString()
  };
  
  diagLog('CHAT: About to send response');
  res.json(response);
  diagLog('CHAT: Response sent successfully');
});

diagLog('STEP 9: Setting up 404 handler');
app.use('*', (req, res) => {
  diagLog('404: Route not found', { url: req.url, method: req.method });
  res.status(404).json({ error: 'Route not found' });
});

diagLog('STEP 10: About to start server');
console.log('⚠️  CRITICAL: About to call app.listen() - this is another crash point');

const server = app.listen(PORT, () => {
  console.log('✅ SERVER STARTED SUCCESSFULLY');
  diagLog('SERVER: Listening on port', PORT);
  console.log(`🌐 Health: http://localhost:${PORT}/api/health`);
  console.log(`💬 Chat: curl -X POST http://localhost:${PORT}/api/chat/message -H "Content-Type: application/json" -d '{"message":"test"}'`);
});

diagLog('STEP 11: Setting up server error handler');
server.on('error', (error) => {
  console.error('💥 SERVER ERROR:', error);
  console.error('💥 SERVER ERROR STACK:', error.stack);
  process.exit(1); // Crash hard and fast
});

console.log('🔍 Diagnostic server setup complete - waiting for requests...');