import express from 'express';
import { BulletproofChatService } from '../services/BulletproofChatService';

const router = express.Router();
let chatService: BulletproofChatService;

router.post('/message', async (req, res) => {
  try {
    // Initialize ChatService lazily to avoid startup crashes
    if (!chatService) {
      console.log('Initializing BulletproofChatService...');
      chatService = new BulletproofChatService();
    }
    
    const { message, context } = req.body;
    
    if (!message || typeof message !== 'string') {
      return res.status(400).json({ error: 'Message is required and must be a string' });
    }

    const response = await chatService.processMessage(message, context);
    
    res.json({
      response: response.text,
      suggestions: response.suggestions,
      relatedTopics: response.relatedTopics,
      sources: response.sources || [],
      rag_used: response.rag_used || false
    });
  } catch (error) {
    console.error('Chat error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/topics', (req, res) => {
  try {
    if (!chatService) {
      chatService = new BulletproofChatService();
    }
    const topics = chatService.getAvailableTopics();
    res.json({ topics });
  } catch (error) {
    console.error('Topics error:', error);
    res.status(500).json({ error: 'Failed to get topics' });
  }
});

export default router;