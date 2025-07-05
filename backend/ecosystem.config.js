module.exports = {
  apps: [
    {
      name: 'deci-backend',
      script: './dist/server-enhanced.js',
      instances: 2,
      exec_mode: 'cluster',
      
      // Performance & Memory
      node_args: '--expose-gc --max-old-space-size=1024',
      max_memory_restart: '800M',
      kill_timeout: 10000,
      listen_timeout: 10000,
      
      // Environment
      env: {
        NODE_ENV: 'production',
        PORT: 3001,
        LOG_LEVEL: 'info'
      },
      env_development: {
        NODE_ENV: 'development', 
        PORT: 3001,
        LOG_LEVEL: 'debug'
      },
      
      // Monitoring
      min_uptime: '10s',
      max_restarts: 10,
      
      // Logs
      log_file: './logs/pm2-combined.log',
      out_file: './logs/pm2-out.log',
      error_file: './logs/pm2-error.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      merge_logs: true,
      
      // Restart strategy
      watch: false,
      ignore_watch: ['node_modules', 'logs', '*.log'],
      restart_delay: 5000,
      
      // Health monitoring
      health_check_grace_period: 5000,
      health_check_fatal_timeout: 10000,
      
      // Load balancing
      instance_var: 'INSTANCE_ID',
      
      // Advanced settings
      treekill: true,
      pmx: true,
      automation: false,
      
      // Custom restart conditions
      cron_restart: '0 2 * * *', // Restart daily at 2 AM
      
      // Source map support
      source_map_support: true,
      
      // Graceful shutdown
      shutdown_with_message: true,
      wait_ready: true,
      
      // Custom env variables for cluster
      env_cluster: {
        PM2_CLUSTER_MODE: 'true',
        PM2_INSTANCE_COUNT: 2
      }
    }
  ],
  
  // Deployment configuration
  deploy: {
    production: {
      user: 'deployer',
      host: ['production-server'],
      ref: 'origin/main',
      repo: 'git@github.com:your-org/deci.git',
      path: '/var/www/deci-backend',
      'post-deploy': 'npm install && npm run build && pm2 startOrRestart ecosystem.config.js --env production',
      'pre-setup': 'apt update && apt install nodejs npm -y'
    },
    
    staging: {
      user: 'deployer', 
      host: ['staging-server'],
      ref: 'origin/develop',
      repo: 'git@github.com:your-org/deci.git',
      path: '/var/www/deci-backend-staging',
      'post-deploy': 'npm install && npm run build && pm2 startOrRestart ecosystem.config.js --env development'
    }
  }
};