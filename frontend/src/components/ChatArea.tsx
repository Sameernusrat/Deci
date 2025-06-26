import React, { useState, forwardRef, useImperativeHandle } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Plus } from 'lucide-react';
import WelcomeInterface from './WelcomeInterface';
import ChatMessages from './ChatMessages';
import ChatInput from './ChatInput';
import './ChatArea.css';

interface Message {
  id: string;
  type: 'user' | 'assistant';
  content: string;
  timestamp: Date;
}

export interface ChatAreaRef {
  handleNewChat: () => void;
}

const ChatArea = forwardRef<ChatAreaRef>((props, ref) => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const handleSendMessage = async (content: string) => {
    const userMessage: Message = {
      id: Date.now().toString(),
      type: 'user',
      content,
      timestamp: new Date(),
    };

    setMessages(prev => [...prev, userMessage]);
    setIsLoading(true);

    // Simulate AI response
    setTimeout(() => {
      const assistantMessage: Message = {
        id: (Date.now() + 1).toString(),
        type: 'assistant',
        content: `Thank you for your question about "${content}". This is a demo response showcasing the new ChatGPT-style interface. In the full version, I would provide detailed, personalized advice based on current UK regulations and best practices for equity compensation.`,
        timestamp: new Date(),
      };
      
      setMessages(prev => [...prev, assistantMessage]);
      setIsLoading(false);
    }, 1500);
  };

  const handleOptionSelect = (option: string, description: string) => {
    handleSendMessage(`${option}: ${description}`);
  };

  const handleNewChat = () => {
    setMessages([]);
    setIsLoading(false);
  };

  useImperativeHandle(ref, () => ({
    handleNewChat
  }));

  const showWelcome = messages.length === 0;

  return (
    <div className="chat-area">
      {/* Header with New Chat button */}
      {!showWelcome && (
        <motion.div 
          className="chat-header"
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
        >
          <div className="chat-header-content">
            <h2 className="chat-title">Equity Advisory Chat</h2>
            <motion.button
              className="new-chat-btn btn-secondary"
              onClick={handleNewChat}
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
            >
              <Plus size={16} />
              New Chat
            </motion.button>
          </div>
        </motion.div>
      )}

      <div className="chat-content">
        <AnimatePresence mode="wait">
          {showWelcome ? (
            <motion.div
              key="welcome"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              transition={{ duration: 0.5 }}
              className="welcome-container"
            >
              <WelcomeInterface onOptionSelect={handleOptionSelect} />
            </motion.div>
          ) : (
            <motion.div
              key="chat"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5 }}
              className="chat-container"
            >
              <ChatMessages messages={messages} isLoading={isLoading} />
            </motion.div>
          )}
        </AnimatePresence>
      </div>
      
      <div className="chat-input-container">
        <ChatInput 
          onSendMessage={handleSendMessage} 
          disabled={isLoading}
          placeholder={showWelcome ? "Ask about EMI schemes, share options, tax implications..." : "Continue the conversation..."}
        />
      </div>
    </div>
  );
});

ChatArea.displayName = 'ChatArea';

export default ChatArea;