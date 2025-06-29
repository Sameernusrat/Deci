import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Menu, 
  X, 
  FolderOpen, 
  Users, 
  BarChart3, 
  Settings, 
  Sun, 
  Moon,
  MessageCircle,
  Clock,
  Sparkles,
  Plus
} from 'lucide-react';
import { useTheme } from '../contexts/ThemeContext';
import './Sidebar.css';

interface SidebarProps {
  collapsed: boolean;
  onToggle: () => void;
  onNewChat?: () => void;
}

const Sidebar: React.FC<SidebarProps> = ({ collapsed, onToggle, onNewChat }) => {
  const { theme, toggleTheme } = useTheme();

  const navItems = [
    { icon: FolderOpen, label: 'Library', active: false },
    { icon: Users, label: 'Teams', active: false },
    { icon: BarChart3, label: 'Usage', active: false },
    { icon: Settings, label: 'Settings', active: false },
  ];

  const recentActivity = [
    { title: 'EMI Valuation for TechCorp', time: '2 hours ago', type: 'valuation' },
    { title: 'Share Option Tax Calculation', time: '1 day ago', type: 'tax' },
    { title: 'Corporation Tax Deduction', time: '3 days ago', type: 'deduction' },
    { title: 'ERS Filing Assistance', time: '1 week ago', type: 'filing' },
  ];

  const nextActions = [
    'Review pending valuations',
    'Update tax calculations',
    'Generate compliance reports',
    'Schedule team meeting'
  ];

  return (
    <>
      {/* Mobile Overlay */}
      <AnimatePresence>
        {!collapsed && (
          <motion.div
            className="sidebar-overlay"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onToggle}
          />
        )}
      </AnimatePresence>

      <motion.aside
        className={`sidebar ${collapsed ? 'collapsed' : ''}`}
        initial={false}
        animate={{ width: collapsed ? 80 : 280 }}
        transition={{ duration: 0.3, ease: "easeInOut" }}
      >
        {/* Header */}
        <div className="sidebar-header">
          <motion.div 
            className="logo-section"
            animate={{ opacity: collapsed ? 0 : 1 }}
            transition={{ duration: 0.2 }}
          >
            <div className="logo">
              <img src="/logo.svg" alt="Deci" className="logo-icon" />
              {!collapsed && <span className="logo-text gradient-text">Deci</span>}
            </div>
          </motion.div>
          
          <button className="toggle-btn btn-ghost" onClick={onToggle}>
            {collapsed ? <Menu size={20} /> : <X size={20} />}
          </button>
        </div>

        {/* New Chat Button */}
        <div className="sidebar-section">
          <motion.button
            className="new-chat-sidebar-btn"
            onClick={onNewChat}
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
          >
            <Plus size={20} />
            <AnimatePresence>
              {!collapsed && (
                <motion.span
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -10 }}
                  transition={{ duration: 0.2 }}
                >
                  New Chat
                </motion.span>
              )}
            </AnimatePresence>
          </motion.button>
        </div>

        {/* Navigation */}
        <nav className="sidebar-nav">
          {navItems.map((item, index) => (
            <motion.button
              key={item.label}
              className={`nav-item ${item.active ? 'active' : ''}`}
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
            >
              <item.icon size={20} />
              <AnimatePresence>
                {!collapsed && (
                  <motion.span
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -10 }}
                    transition={{ duration: 0.2 }}
                  >
                    {item.label}
                  </motion.span>
                )}
              </AnimatePresence>
            </motion.button>
          ))}
        </nav>

        {/* Recent Activity */}
        <AnimatePresence>
          {!collapsed && (
            <motion.div
              className="sidebar-section"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 20 }}
              transition={{ duration: 0.3, delay: 0.1 }}
            >
              <div className="section-header">
                <Clock size={16} />
                <span>Recent Activity</span>
              </div>
              <div className="activity-list">
                {recentActivity.map((activity, index) => (
                  <motion.div
                    key={index}
                    className="activity-item"
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ duration: 0.2, delay: index * 0.05 }}
                    whileHover={{ backgroundColor: 'var(--tertiary-bg)' }}
                  >
                    <div className={`activity-type ${activity.type}`}>
                      <MessageCircle size={12} />
                    </div>
                    <div className="activity-content">
                      <div className="activity-title">{activity.title}</div>
                      <div className="activity-time">{activity.time}</div>
                    </div>
                  </motion.div>
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Suggested Next Actions */}
        <AnimatePresence>
          {!collapsed && (
            <motion.div
              className="sidebar-section"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 20 }}
              transition={{ duration: 0.3, delay: 0.2 }}
            >
              <div className="section-header">
                <Sparkles size={16} />
                <span>Suggested Actions</span>
              </div>
              <div className="actions-list">
                {nextActions.map((action, index) => (
                  <motion.button
                    key={index}
                    className="action-item"
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ duration: 0.2, delay: index * 0.05 }}
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                  >
                    {action}
                  </motion.button>
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Footer */}
        <div className="sidebar-footer">
          <motion.button
            className="theme-toggle btn-ghost"
            onClick={toggleTheme}
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
          >
            {theme === 'light' ? <Moon size={20} /> : <Sun size={20} />}
            <AnimatePresence>
              {!collapsed && (
                <motion.span
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -10 }}
                  transition={{ duration: 0.2 }}
                >
                  {theme === 'light' ? 'Dark Mode' : 'Light Mode'}
                </motion.span>
              )}
            </AnimatePresence>
          </motion.button>
        </div>
      </motion.aside>
    </>
  );
};

export default Sidebar;