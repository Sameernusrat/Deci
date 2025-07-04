#!/usr/bin/env node

const { spawn, exec } = require('child_process');
const fs = require('fs');
const path = require('path');

class ServerManager {
  constructor() {
    this.processes = new Map();
    this.config = {
      frontend: {
        name: 'frontend',
        port: 3000,
        command: 'npm',
        args: ['start'],
        cwd: path.join(__dirname, 'frontend'),
        env: { ...process.env, PORT: '3000' }
      },
      backend: {
        name: 'backend', 
        port: 3001,
        command: 'npm',
        args: ['run', 'dev'],
        cwd: path.join(__dirname, 'backend'),
        env: process.env,
        healthCheck: 'http://localhost:3001/api/health'
      }
    };
    this.maxRestarts = 5;
    this.restartDelay = 2000;
    this.healthCheckInterval = 30000; // 30 seconds
    this.isShuttingDown = false;
  }

  async killPortProcesses(port) {
    return new Promise((resolve) => {
      exec(`lsof -ti:${port} | xargs kill -9 2>/dev/null || true`, () => {
        setTimeout(resolve, 1000); // Wait 1s for port to be freed
      });
    });
  }

  async isPortFree(port) {
    return new Promise((resolve) => {
      exec(`lsof -i:${port}`, (error) => {
        resolve(error !== null); // Port is free if lsof returns error
      });
    });
  }

  async waitForPort(port, timeout = 10000) {
    const startTime = Date.now();
    while (Date.now() - startTime < timeout) {
      if (!(await this.isPortFree(port))) {
        return true; // Port is now occupied
      }
      await new Promise(resolve => setTimeout(resolve, 500));
    }
    return false;
  }

  async startProcess(name) {
    const config = this.config[name];
    if (!config) {
      console.error(`❌ Unknown process: ${name}`);
      return false;
    }

    // Kill any existing processes on the port
    console.log(`🧹 Cleaning up port ${config.port}...`);
    await this.killPortProcesses(config.port);

    // Ensure port is free
    if (!(await this.isPortFree(config.port))) {
      console.error(`❌ Port ${config.port} still occupied after cleanup`);
      return false;
    }

    console.log(`🚀 Starting ${name} on port ${config.port}...`);
    
    const process = spawn(config.command, config.args, {
      cwd: config.cwd,
      env: config.env,
      stdio: ['ignore', 'pipe', 'pipe']
    });

    // Store process info
    this.processes.set(name, {
      process,
      config,
      restarts: 0,
      lastRestart: Date.now(),
      status: 'starting'
    });

    // Handle process output
    process.stdout.on('data', (data) => {
      const output = data.toString();
      console.log(`[${name}] ${output.trim()}`);
      
      // Detect when server is ready
      if (output.includes('ready in') || output.includes('Server running on port')) {
        const processInfo = this.processes.get(name);
        if (processInfo) {
          processInfo.status = 'running';
          console.log(`✅ ${name} is ready on port ${config.port}`);
        }
      }
    });

    process.stderr.on('data', (data) => {
      const error = data.toString();
      if (!error.includes('DeprecationWarning') && !error.includes('ExperimentalWarning')) {
        console.error(`[${name}] ERROR: ${error.trim()}`);
      }
    });

    process.on('close', (code) => {
      console.log(`[${name}] Process exited with code ${code}`);
      const processInfo = this.processes.get(name);
      if (processInfo) {
        processInfo.status = 'stopped';
        if (!this.isShuttingDown) {
          this.handleProcessExit(name, code);
        }
      }
    });

    process.on('error', (error) => {
      console.error(`[${name}] Process error:`, error);
      const processInfo = this.processes.get(name);
      if (processInfo) {
        processInfo.status = 'error';
      }
    });

    // Wait for process to start
    const started = await this.waitForPort(config.port);
    if (started) {
      console.log(`✅ ${name} started successfully`);
      return true;
    } else {
      console.error(`❌ ${name} failed to start within timeout`);
      this.killProcess(name);
      return false;
    }
  }

  async handleProcessExit(name, code) {
    const processInfo = this.processes.get(name);
    if (!processInfo) return;

    processInfo.restarts++;
    
    if (processInfo.restarts >= this.maxRestarts) {
      console.error(`❌ ${name} exceeded max restarts (${this.maxRestarts}). Giving up.`);
      return;
    }

    console.log(`🔄 Restarting ${name} (attempt ${processInfo.restarts}/${this.maxRestarts})...`);
    
    setTimeout(async () => {
      if (!this.isShuttingDown) {
        await this.startProcess(name);
      }
    }, this.restartDelay);
  }

  killProcess(name) {
    const processInfo = this.processes.get(name);
    if (processInfo && processInfo.process) {
      processInfo.process.kill('SIGTERM');
      setTimeout(() => {
        if (processInfo.process && !processInfo.process.killed) {
          processInfo.process.kill('SIGKILL');
        }
      }, 5000);
    }
  }

  async startHealthCheck() {
    setInterval(async () => {
      if (this.isShuttingDown) return;

      for (const [name, processInfo] of this.processes) {
        if (processInfo.status === 'running') {
          const portFree = await this.isPortFree(processInfo.config.port);
          if (portFree) {
            console.log(`⚠️ ${name} port ${processInfo.config.port} is not responding`);
            processInfo.status = 'unhealthy';
            this.killProcess(name);
            setTimeout(() => this.startProcess(name), 2000);
          }
        }
      }
    }, this.healthCheckInterval);
  }

  async start() {
    console.log('🌟 Starting Deci Server Manager...');
    
    // Start processes in sequence (backend first, then frontend)
    const backendStarted = await this.startProcess('backend');
    await new Promise(resolve => setTimeout(resolve, 2000)); // Wait 2s between starts
    
    const frontendStarted = await this.startProcess('frontend');

    if (backendStarted && frontendStarted) {
      console.log('🎉 All servers started successfully!');
      console.log('📋 Server status:');
      console.log('   • Frontend: http://localhost:3000');
      console.log('   • Backend:  http://localhost:3001');
      console.log('   • Logs: Use Ctrl+C to stop all servers');
      
      // Start health monitoring
      this.startHealthCheck();
      
      return true;
    } else {
      console.error('❌ Failed to start some servers');
      await this.stop();
      return false;
    }
  }

  async stop() {
    console.log('🛑 Shutting down servers...');
    this.isShuttingDown = true;
    
    for (const [name] of this.processes) {
      console.log(`Stopping ${name}...`);
      this.killProcess(name);
    }
    
    // Clean up ports
    await this.killPortProcesses(3000);
    await this.killPortProcesses(3001);
    
    console.log('✅ All servers stopped');
    process.exit(0);
  }

  status() {
    console.log('📊 Server Status:');
    for (const [name, processInfo] of this.processes) {
      const uptime = Math.floor((Date.now() - processInfo.lastRestart) / 1000);
      console.log(`   • ${name}: ${processInfo.status} (${uptime}s uptime, ${processInfo.restarts} restarts)`);
    }
  }
}

// Handle CLI usage
if (require.main === module) {
  const manager = new ServerManager();
  
  process.on('SIGINT', () => manager.stop());
  process.on('SIGTERM', () => manager.stop());
  
  const command = process.argv[2];
  
  switch (command) {
    case 'start':
      manager.start();
      break;
    case 'stop':
      manager.stop();
      break;
    case 'status':
      manager.status();
      break;
    case 'restart':
      manager.stop().then(() => {
        setTimeout(() => manager.start(), 2000);
      });
      break;
    default:
      console.log('Usage: node server-manager.js [start|stop|status|restart]');
      console.log('Default action is start if no command provided');
      manager.start();
  }
}

module.exports = ServerManager;