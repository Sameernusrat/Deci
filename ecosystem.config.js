module.exports = {
  apps: [{
    name: 'deci-backend',
    script: './backend/node_modules/.bin/ts-node-dev',
    args: ['--respawn', '--transpile-only', 'src/server-enhanced.ts'],
    cwd: './backend',
    instances: 1, // Single instance for stability testing
    exec_mode: 'fork',
    
    // Auto-restart configuration
    autorestart: true,
    max_restarts: 10,
    min_uptime: '10s',
    restart_delay: 5000,
    
    // Memory management
    max_memory_restart: '1G',
    
    // Logging
    log_file: './logs/backend-combined.log',
    out_file: './logs/backend-out.log',
    error_file: './logs/backend-error.log',
    log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
    merge_logs: true,
    
    // Environment
    env: {
      NODE_ENV: 'development',
      PORT: 3001
    },
    
    env_production: {
      NODE_ENV: 'production',
      PORT: 3001
    },
    
    // Health monitoring
    health_check_grace_period: 3000,
    
    // Advanced settings
    kill_timeout: 5000,
    listen_timeout: 3000,
    
    // Custom monitoring
    monitoring: false, // We have our own stability test
    
    // Process title
    name: 'deci-backend-enhanced'
  }],
  
  // Deployment configuration (future use)
  deploy: {
    production: {
      user: 'deploy',
      host: 'localhost',
      ref: 'origin/main',
      repo: 'git@github.com:username/deci.git',
      path: '/var/www/deci',
      'post-deploy': 'npm install && npm run build && pm2 reload ecosystem.config.js --env production'
    }
  }
};