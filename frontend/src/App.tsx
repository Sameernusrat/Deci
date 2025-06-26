import React, { useState } from 'react';
import './App.css';
import Header from './components/Header';
import Hero from './components/Hero';
import ChatInterface from './components/ChatInterface';
import InfoSections from './components/InfoSections';
import Footer from './components/Footer';

function App() {
  const [isChatOpen, setIsChatOpen] = useState(false);

  return (
    <div className="App">
      <Header />
      <Hero onStartChat={() => setIsChatOpen(true)} />
      <InfoSections />
      <Footer />
      {isChatOpen && (
        <ChatInterface onClose={() => setIsChatOpen(false)} />
      )}
    </div>
  );
}

export default App;