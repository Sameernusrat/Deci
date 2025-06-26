import React from 'react';
import { motion } from 'framer-motion';
import { 
  Calculator, 
  FileText, 
  TrendingUp, 
  DollarSign, 
  MessageCircle, 
  PlusCircle,
  Info
} from 'lucide-react';
import './WelcomeInterface.css';

interface WelcomeInterfaceProps {
  onOptionSelect: (option: string, description: string) => void;
}

const WelcomeInterface: React.FC<WelcomeInterfaceProps> = ({ onOptionSelect }) => {
  const options = [
    {
      id: 'accounting-valuation',
      title: 'Generate an Accounting Valuation',
      description: 'For calculating share-based payments under IFRS 2, FRS 102, UK GAAP, or US GAAP',
      icon: Calculator,
      gradient: 'from-blue-500 to-blue-600',
      color: 'text-blue-600'
    },
    {
      id: 'tax-valuation',
      title: 'Generate a Tax Valuation',
      description: 'For determining market value of shares (e.g., EMI, 409A)',
      icon: FileText,
      gradient: 'from-emerald-500 to-emerald-600',
      color: 'text-emerald-600'
    },
    {
      id: 'securities-transactions',
      title: 'Report Securities Transactions',
      description: 'For UK ERS or US IRS filings (Forms 3921/3922)',
      icon: TrendingUp,
      gradient: 'from-purple-500 to-purple-600',
      color: 'text-purple-600'
    },
    {
      id: 'tax-deduction',
      title: 'Calculate Corporation Tax Deduction',
      description: 'For allowable tax deductions on employee equity in UK or US',
      icon: DollarSign,
      gradient: 'from-amber-500 to-amber-600',
      color: 'text-amber-600'
    },
    {
      id: 'general-question',
      title: 'Ask a General Equity Question',
      description: 'Ask the AI about tax, accounting, or legal requirements for equity compensation',
      icon: MessageCircle,
      gradient: 'from-rose-500 to-rose-600',
      color: 'text-rose-600'
    },
    {
      id: 'other',
      title: 'Other — Describe Your Need',
      description: 'Freeform input; user explains their goal and the system routes accordingly',
      icon: PlusCircle,
      gradient: 'from-slate-500 to-slate-600',
      color: 'text-slate-600'
    }
  ];

  const containerVariants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: {
        staggerChildren: 0.1,
        delayChildren: 0.2
      }
    }
  };

  const itemVariants = {
    hidden: { opacity: 0, y: 20 },
    visible: { opacity: 1, y: 0 }
  };

  return (
    <div className="welcome-interface">
      <motion.div
        className="welcome-header"
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, ease: "easeOut" }}
      >
        <div className="welcome-icon">
          <img src="/logo.svg" alt="Deci" className="welcome-logo" />
        </div>
        <h1 className="welcome-title">
          Welcome to <span className="gradient-text">Deci</span>
        </h1>
        <p className="welcome-subtitle">
          What can our Equity Advisor help you with today?
        </p>
      </motion.div>

      <motion.div
        className="options-grid"
        variants={containerVariants}
        initial="hidden"
        animate="visible"
      >
        {options.map((option, index) => (
          <motion.button
            key={option.id}
            className="option-card"
            variants={itemVariants}
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={() => onOptionSelect(option.title, option.description)}
          >
            <div className="option-header">
              <div className={`option-icon ${option.color}`}>
                <option.icon size={24} />
              </div>
              <div className="info-icon">
                <Info size={16} />
                <div className="tooltip">
                  {option.description}
                </div>
              </div>
            </div>
            
            <div className="option-content">
              <h3 className="option-title">{option.title}</h3>
              <p className="option-description">{option.description}</p>
            </div>
            
            <div className="option-footer">
              <span className="option-cta">Get Started</span>
              <motion.div 
                className="option-arrow"
                whileHover={{ x: 4 }}
                transition={{ duration: 0.2 }}
              >
                →
              </motion.div>
            </div>
          </motion.button>
        ))}
      </motion.div>

      <motion.div
        className="welcome-footer"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.6, delay: 0.8 }}
      >
        <p className="footer-text">
          Or start typing your question below to get personalized assistance
        </p>
      </motion.div>
    </div>
  );
};

export default WelcomeInterface;