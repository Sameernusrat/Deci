import React from 'react';
import './Hero.css';

interface HeroProps {
  onStartChat: () => void;
}

const Hero: React.FC<HeroProps> = ({ onStartChat }) => {
  return (
    <section className="hero">
      <div className="container">
        <div className="hero-content">
          <h1>Expert UK Startup Equity Tax & Accounting Advice</h1>
          <p>
            Navigate EMI schemes, share options, and UK equity taxation with confidence. 
            Get personalized advice tailored to your startup's needs.
          </p>
          <div className="hero-buttons">
            <button className="btn btn-primary" onClick={onStartChat}>
              Ask a Question
            </button>
            <a href="#services" className="btn btn-secondary">
              Learn More
            </a>
          </div>
          <div className="hero-features">
            <div className="feature">
              <strong>EMI Schemes</strong>
              <span>Enterprise Management Incentives guidance</span>
            </div>
            <div className="feature">
              <strong>Share Options</strong>
              <span>CSOP, SAYE & Unapproved schemes</span>
            </div>
            <div className="feature">
              <strong>Tax Planning</strong>
              <span>Capital gains & income tax optimization</span>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};

export default Hero;