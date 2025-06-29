import React, { useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { User, Bot, Copy, ThumbsUp, ThumbsDown } from 'lucide-react';
import './ChatMessages.css';

interface Message {
  id: string;
  type: 'user' | 'assistant';
  content: string;
  timestamp: Date;
}

interface ChatMessagesProps {
  messages: Message[];
  isLoading: boolean;
}

const ChatMessages: React.FC<ChatMessagesProps> = ({ messages, isLoading }) => {
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isLoading]);

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
  };

  const renderFormattedText = (text: string) => {
    // Split text into lines and process each one
    const lines = text.split('\n');
    return lines.map((line, index) => {
      // Check if line is a heading (starts with **)
      if (line.trim().startsWith('**') && line.trim().endsWith('**')) {
        const headingText = line.trim().slice(2, -2); // Remove ** from both ends
        return (
          <div key={index} style={{ fontWeight: 'bold', marginTop: index > 0 ? '16px' : '0', marginBottom: '8px' }}>
            {headingText}
          </div>
        );
      }
      // Regular line
      return <div key={index}>{line || '\u00A0'}</div>; // Use non-breaking space for empty lines
    });
  };

  return (
    <div className="chat-messages">
      <div className="messages-container">
        <AnimatePresence initial={false}>
          {messages.map((message, index) => (
            <motion.div
              key={message.id}
              className={`message ${message.type}`}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, delay: index * 0.1 }}
              layout
            >
              <div className="message-avatar">
                {message.type === 'user' ? (
                  <div className="user-avatar">
                    <User size={16} />
                  </div>
                ) : (
                  <div className="assistant-avatar">
                    <Bot size={16} />
                  </div>
                )}
              </div>
              
              <div className="message-content">
                <div className="message-header">
                  <span className="message-sender">
                    {message.type === 'user' ? 'You' : 'Deci'}
                  </span>
                  <span className="message-time">
                    {message.timestamp.toLocaleTimeString([], { 
                      hour: '2-digit', 
                      minute: '2-digit' 
                    })}
                  </span>
                </div>
                
                <div className="message-text" style={{ whiteSpace: 'pre-wrap' }}>
                  {message.type === 'assistant' ? renderFormattedText(message.content) : message.content}
                </div>
                
                {message.type === 'assistant' && (
                  <div className="message-actions">
                    <motion.button
                      className="action-btn"
                      whileHover={{ scale: 1.05 }}
                      whileTap={{ scale: 0.95 }}
                      onClick={() => copyToClipboard(message.content)}
                    >
                      <Copy size={14} />
                      Copy
                    </motion.button>
                    <motion.button
                      className="action-btn"
                      whileHover={{ scale: 1.05 }}
                      whileTap={{ scale: 0.95 }}
                    >
                      <ThumbsUp size={14} />
                    </motion.button>
                    <motion.button
                      className="action-btn"
                      whileHover={{ scale: 1.05 }}
                      whileTap={{ scale: 0.95 }}
                    >
                      <ThumbsDown size={14} />
                    </motion.button>
                  </div>
                )}
              </div>
            </motion.div>
          ))}
        </AnimatePresence>
        
        {isLoading && (
          <motion.div
            className="message assistant"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4 }}
          >
            <div className="message-avatar">
              <div className="assistant-avatar">
                <Bot size={16} />
              </div>
            </div>
            
            <div className="message-content">
              <div className="message-header">
                <span className="message-sender">Deci</span>
              </div>
              
              <div className="typing-indicator">
                <div className="typing-dots">
                  <div className="dot"></div>
                  <div className="dot"></div>
                  <div className="dot"></div>
                </div>
                <span className="typing-text">Analyzing your request...</span>
              </div>
            </div>
          </motion.div>
        )}
        
        <div ref={messagesEndRef} />
      </div>
    </div>
  );
};

export default ChatMessages;