const { ChatService } = require('./backend/src/services/ChatService.ts');

async function test() {
  try {
    console.log('Creating ChatService...');
    const chatService = new ChatService();
    
    console.log('Processing test message...');
    const response = await chatService.processMessage('hi');
    
    console.log('Response:', response);
  } catch (error) {
    console.error('Error:', error);
  }
}

test();