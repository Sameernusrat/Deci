import React from 'react';
import './Footer.css';

const Footer: React.FC = () => {
  return (
    <footer className="footer" id="contact">
      <div className="container">
        <div className="footer-content">
          <div className="footer-section">
            <h3>Deci</h3>
            <p>Expert UK startup equity tax and accounting advice tailored to your needs.</p>
          </div>
          <div className="footer-section">
            <h4>Services</h4>
            <ul>
              <li>EMI Scheme Setup & Management</li>
              <li>Share Option Valuations</li>
              <li>Tax Planning & Compliance</li>
              <li>Equity Accounting</li>
            </ul>
          </div>
          <div className="footer-section">
            <h4>Resources</h4>
            <ul>
              <li>EMI Eligibility Guide</li>
              <li>Tax Calculator</li>
              <li>Latest HMRC Updates</li>
              <li>Case Studies</li>
            </ul>
          </div>
          <div className="footer-section">
            <h4>Contact</h4>
            <p>Ready to optimize your equity strategy?</p>
            <p>Email: hello@deci.co.uk</p>
            <p>Phone: +44 20 1234 5678</p>
          </div>
        </div>
        <div className="footer-bottom">
          <p>&copy; 2024 Deci. All rights reserved. | Privacy Policy | Terms of Service</p>
          <p className="disclaimer">
            This website provides general information only and does not constitute professional advice. 
            Always consult with qualified advisors for your specific circumstances.
          </p>
        </div>
      </div>
    </footer>
  );
};

export default Footer;