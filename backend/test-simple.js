const express = require('express');
const app = express();

app.use(express.json());

app.get('/api/health', (req, res) => {
  res.json({ status: 'OK', timestamp: new Date().toISOString() });
});

app.post('/api/chat/message', (req, res) => {
  console.log('Chat endpoint called with:', req.body);
  try {
    res.json({
      response: "Test response",
      suggestions: [],
      relatedTopics: [],
      sources: [],
      rag_used: false
    });
  } catch (error) {
    console.error('Error in chat endpoint:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

const PORT = 3001;
app.listen(PORT, () => {
  console.log(`Simple test server running on port ${PORT}`);
});