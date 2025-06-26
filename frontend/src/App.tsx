import React, { useState, useRef } from 'react';
import { motion } from 'framer-motion';
import './App.css';
import Sidebar from './components/Sidebar';
import ChatArea from './components/ChatArea';
import { ThemeProvider } from './contexts/ThemeContext';

function App() {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const chatAreaRef = useRef<{ handleNewChat: () => void }>(null);

  const handleNewChat = () => {
    chatAreaRef.current?.handleNewChat();
  };

  return (
    <ThemeProvider>
      <div className="app">
        <Sidebar 
          collapsed={sidebarCollapsed} 
          onToggle={() => setSidebarCollapsed(!sidebarCollapsed)}
          onNewChat={handleNewChat}
        />
        <motion.main 
          className={`main-content ${sidebarCollapsed ? 'sidebar-collapsed' : ''}`}
          layout
          transition={{ duration: 0.3, ease: "easeInOut" }}
        >
          <ChatArea ref={chatAreaRef} />
        </motion.main>
      </div>
    </ThemeProvider>
  );
}

export default App;