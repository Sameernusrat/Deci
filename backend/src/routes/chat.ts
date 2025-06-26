import express from 'express';
import { ChatService } from '../services/ChatService';

const router = express.Router();
const chatService = new ChatService();

router.post('/message', async (req, res) => {
  try {
    const { message, context } = req.body;
    
    if (!message || typeof message !== 'string') {
      return res.status(400).json({ error: 'Message is required and must be a string' });
    }

    const response = await chatService.processMessage(message, context);
    
    res.json({
      response: response.text,
      suggestions: response.suggestions,
      relatedTopics: response.relatedTopics
    });
  } catch (error) {
    console.error('Chat error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/topics', (req, res) => {
  const topics = chatService.getAvailableTopics();
  res.json({ topics });
});

export default router;