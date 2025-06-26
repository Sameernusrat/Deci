import React, { useState, useRef } from 'react';
import { motion } from 'framer-motion';
import { Send, Paperclip, Mic } from 'lucide-react';
import './ChatInput.css';

interface ChatInputProps {
  onSendMessage: (message: string) => void;
  disabled?: boolean;
  placeholder?: string;
}

const ChatInput: React.FC<ChatInputProps> = ({ 
  onSendMessage, 
  disabled = false, 
  placeholder = "Type your message..." 
}) => {
  const [input, setInput] = useState('');
  const [isFocused, setIsFocused] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (input.trim() && !disabled) {
      onSendMessage(input.trim());
      setInput('');
      if (textareaRef.current) {
        textareaRef.current.style.height = 'auto';
      }
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e);
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(e.target.value);
    
    // Auto-resize textarea
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 120)}px`;
    }
  };

  return (
    <div className="chat-input-wrapper">
      <motion.form
        className={`chat-input-form ${isFocused ? 'focused' : ''} ${disabled ? 'disabled' : ''}`}
        onSubmit={handleSubmit}
        animate={{ 
          borderColor: isFocused ? 'var(--accent-color)' : 'var(--border-color)',
          boxShadow: isFocused ? 'var(--shadow-md)' : 'var(--shadow-sm)'
        }}
        transition={{ duration: 0.2 }}
      >
        <div className="input-actions-left">
          <motion.button
            type="button"
            className="action-btn"
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            disabled={disabled}
          >
            <Paperclip size={18} />
          </motion.button>
        </div>

        <div className="input-container">
          <textarea
            ref={textareaRef}
            value={input}
            onChange={handleInputChange}
            onKeyPress={handleKeyPress}
            onFocus={() => setIsFocused(true)}
            onBlur={() => setIsFocused(false)}
            placeholder={placeholder}
            disabled={disabled}
            rows={1}
            className="chat-textarea"
          />
        </div>

        <div className="input-actions-right">
          <motion.button
            type="button"
            className="action-btn"
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            disabled={disabled}
          >
            <Mic size={18} />
          </motion.button>
          
          <motion.button
            type="submit"
            className={`send-btn ${input.trim() ? 'active' : ''}`}
            whileHover={{ scale: input.trim() ? 1.05 : 1 }}
            whileTap={{ scale: input.trim() ? 0.95 : 1 }}
            disabled={disabled || !input.trim()}
          >
            <Send size={18} />
          </motion.button>
        </div>
      </motion.form>
      
      <div className="input-footer">
        <p className="input-hint">
          Press <kbd>Enter</kbd> to send, <kbd>Shift + Enter</kbd> for new line
        </p>
      </div>
    </div>
  );
};

export default ChatInput;