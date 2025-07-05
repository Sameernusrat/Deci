#!/bin/bash

# Blue-Green Deployment Script for Deci Backend
# Zero-downtime deployment with rollback capability

set -euo pipefail

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# Configuration
BLUE_PORT=3001
GREEN_PORT=3002
HEALTH_CHECK_URL_BLUE="http://localhost:$BLUE_PORT/api/health"
HEALTH_CHECK_URL_GREEN="http://localhost:$GREEN_PORT/api/health"
BACKUP_DIR="./backups"
DEPLOYMENT_TIMEOUT=300 # 5 minutes
HEALTH_CHECK_RETRIES=10

# State files
CURRENT_STATE_FILE="$BACKUP_DIR/current_deployment.state"
DEPLOYMENT_LOG="$BACKUP_DIR/deployment-$(date +%Y%m%d-%H%M%S).log"

# Functions
log_info() { echo -e "${GREEN}✅ $1${NC}" | tee -a "$DEPLOYMENT_LOG"; }
log_warn() { echo -e "${YELLOW}⚠️  $1${NC}" | tee -a "$DEPLOYMENT_LOG"; }
log_error() { echo -e "${RED}❌ $1${NC}" | tee -a "$DEPLOYMENT_LOG"; }
log_step() { echo -e "${BLUE}🔄 $1${NC}" | tee -a "$DEPLOYMENT_LOG"; }

# Initialize deployment
init_deployment() {
    log_step "Initializing blue-green deployment..."
    
    mkdir -p "$BACKUP_DIR"
    mkdir -p "$(dirname "$CURRENT_STATE_FILE")"
    
    # Create deployment log
    echo "Blue-Green Deployment Log - $(date)" > "$DEPLOYMENT_LOG"
    echo "========================================" >> "$DEPLOYMENT_LOG"
    
    log_info "Deployment initialized"
}

# Get current active environment
get_current_environment() {
    if [ -f "$CURRENT_STATE_FILE" ]; then
        cat "$CURRENT_STATE_FILE"
    else
        echo "blue" # Default to blue
    fi
}

# Set current environment
set_current_environment() {
    echo "$1" > "$CURRENT_STATE_FILE"
}

# Health check function
health_check() {
    local url="$1"
    local retries="$2"
    local attempt=1
    
    log_step "Performing health check: $url"
    
    while [ $attempt -le $retries ]; do
        if curl -s -f "$url" > /dev/null 2>&1; then
            local response=$(curl -s "$url" 2>/dev/null)
            if echo "$response" | grep -q '"status":"OK"'; then
                log_info "Health check passed (attempt $attempt)"
                return 0
            fi
        fi
        
        log_warn "Health check failed (attempt $attempt/$retries)"
        sleep 3
        ((attempt++))
    done
    
    log_error "Health check failed after $retries attempts"
    return 1
}

# Create backup
create_backup() {
    log_step "Creating backup before deployment..."
    
    local backup_timestamp=$(date +%Y%m%d-%H%M%S)
    local backup_path="$BACKUP_DIR/backup-$backup_timestamp"
    
    mkdir -p "$backup_path"
    
    # Backup current deployment
    cp -r dist "$backup_path/" 2>/dev/null || true
    cp package.json "$backup_path/" 2>/dev/null || true
    cp ecosystem.config.js "$backup_path/" 2>/dev/null || true
    cp -r logs "$backup_path/" 2>/dev/null || true
    
    # Backup PM2 configuration
    pm2 save
    cp ~/.pm2/dump.pm2 "$backup_path/" 2>/dev/null || true
    
    # Create backup manifest
    cat > "$backup_path/manifest.json" << EOF
{
  "timestamp": "$backup_timestamp",
  "environment": "$(get_current_environment)",
  "node_version": "$(node --version)",
  "pm2_processes": $(pm2 jlist 2>/dev/null || echo "[]"),
  "git_commit": "$(git rev-parse HEAD 2>/dev/null || echo 'unknown')",
  "git_branch": "$(git branch --show-current 2>/dev/null || echo 'unknown')"
}
EOF
    
    echo "$backup_path" > "$BACKUP_DIR/latest_backup.path"
    log_info "Backup created: $backup_path"
}

# Deploy to environment
deploy_to_environment() {
    local target_env="$1"
    local target_port="$2"
    
    log_step "Deploying to $target_env environment (port $target_port)..."
    
    # Build the application
    log_step "Building application..."
    npm run build
    
    # Create environment-specific ecosystem config
    local ecosystem_file="ecosystem.$target_env.config.js"
    
    cat > "$ecosystem_file" << EOF
module.exports = {
  apps: [{
    name: 'deci-backend-$target_env',
    script: './dist/server-enhanced.js',
    instances: 2,
    exec_mode: 'cluster',
    node_args: '--expose-gc --max-old-space-size=1024',
    max_memory_restart: '800M',
    env: {
      NODE_ENV: 'production',
      PORT: $target_port,
      LOG_LEVEL: 'info',
      DEPLOYMENT_ENV: '$target_env'
    },
    log_file: './logs/pm2-$target_env-combined.log',
    out_file: './logs/pm2-$target_env-out.log',
    error_file: './logs/pm2-$target_env-error.log',
    merge_logs: true,
    kill_timeout: 10000,
    listen_timeout: 10000,
    restart_delay: 5000
  }]
};
EOF
    
    # Stop existing processes on target environment
    pm2 delete "deci-backend-$target_env" 2>/dev/null || true
    
    # Start new deployment
    NODE_OPTIONS="--expose-gc --max-old-space-size=1024" pm2 start "$ecosystem_file"
    
    # Wait for startup
    sleep 10
    
    # Verify deployment
    local health_url="http://localhost:$target_port/api/health"
    if health_check "$health_url" "$HEALTH_CHECK_RETRIES"; then
        log_info "$target_env environment deployed successfully"
        return 0
    else
        log_error "$target_env environment deployment failed"
        return 1
    fi
}

# Switch traffic
switch_traffic() {
    local new_env="$1"
    local new_port="$2"
    
    log_step "Switching traffic to $new_env environment..."
    
    # In a real production environment, this would update load balancer configuration
    # For this demo, we'll update the main PM2 configuration
    
    # Stop the old main process
    pm2 delete deci-backend 2>/dev/null || true
    
    # Create new main ecosystem config pointing to new environment
    cat > ecosystem.main.config.js << EOF
module.exports = {
  apps: [{
    name: 'deci-backend',
    script: './dist/server-enhanced.js',
    instances: 2,
    exec_mode: 'cluster',
    node_args: '--expose-gc --max-old-space-size=1024',
    max_memory_restart: '800M',
    env: {
      NODE_ENV: 'production',
      PORT: 3001,
      LOG_LEVEL: 'info',
      DEPLOYMENT_ENV: '$new_env'
    },
    log_file: './logs/pm2-combined.log',
    out_file: './logs/pm2-out.log',
    error_file: './logs/pm2-error.log'
  }]
};
EOF
    
    # Start main process
    NODE_OPTIONS="--expose-gc --max-old-space-size=1024" pm2 start ecosystem.main.config.js
    
    # Update current state
    set_current_environment "$new_env"
    
    # Final health check
    if health_check "$HEALTH_CHECK_URL_BLUE" 3; then
        log_info "Traffic switched successfully to $new_env environment"
        return 0
    else
        log_error "Traffic switch failed"
        return 1
    fi
}

# Cleanup old environment
cleanup_old_environment() {
    local old_env="$1"
    
    log_step "Cleaning up $old_env environment..."
    
    # Stop old environment processes
    pm2 delete "deci-backend-$old_env" 2>/dev/null || true
    
    # Clean up old log files (keep last 5 deployments)
    find "$BACKUP_DIR" -name "backup-*" -type d | sort -r | tail -n +6 | xargs rm -rf 2>/dev/null || true
    
    log_info "$old_env environment cleaned up"
}

# Rollback function
rollback() {
    log_step "Initiating rollback..."
    
    local latest_backup_path
    if [ -f "$BACKUP_DIR/latest_backup.path" ]; then
        latest_backup_path=$(cat "$BACKUP_DIR/latest_backup.path")
    else
        log_error "No backup found for rollback"
        return 1
    fi
    
    if [ ! -d "$latest_backup_path" ]; then
        log_error "Backup directory not found: $latest_backup_path"
        return 1
    fi
    
    log_step "Rolling back to: $latest_backup_path"
    
    # Stop current processes
    pm2 delete deci-backend 2>/dev/null || true
    pm2 delete deci-backend-blue 2>/dev/null || true
    pm2 delete deci-backend-green 2>/dev/null || true
    
    # Restore files
    cp -r "$latest_backup_path/dist" . 2>/dev/null || true
    cp "$latest_backup_path/package.json" . 2>/dev/null || true
    cp "$latest_backup_path/ecosystem.config.js" . 2>/dev/null || true
    
    # Restore PM2 configuration
    if [ -f "$latest_backup_path/dump.pm2" ]; then
        cp "$latest_backup_path/dump.pm2" ~/.pm2/
        pm2 resurrect
    else
        # Fallback: start with basic configuration
        NODE_OPTIONS="--expose-gc --max-old-space-size=1024" pm2 start ecosystem.config.js --env production
    fi
    
    # Verify rollback
    sleep 10
    if health_check "$HEALTH_CHECK_URL_BLUE" 5; then
        log_info "Rollback completed successfully"
        return 0
    else
        log_error "Rollback failed"
        return 1
    fi
}

# Show deployment status
show_status() {
    echo
    echo -e "${BLUE}📊 Blue-Green Deployment Status${NC}"
    echo "=================================="
    
    local current_env=$(get_current_environment)
    echo "Current Environment: $current_env"
    echo "Deployment Log: $DEPLOYMENT_LOG"
    echo
    
    # PM2 status
    echo "PM2 Processes:"
    pm2 list
    
    echo
    echo "Health Status:"
    if curl -s -f "$HEALTH_CHECK_URL_BLUE" > /dev/null 2>&1; then
        echo -e "  Blue (3001):  ${GREEN}✅ Healthy${NC}"
    else
        echo -e "  Blue (3001):  ${RED}❌ Down${NC}"
    fi
    
    if curl -s -f "$HEALTH_CHECK_URL_GREEN" > /dev/null 2>&1; then
        echo -e "  Green (3002): ${GREEN}✅ Healthy${NC}"
    else
        echo -e "  Green (3002): ${RED}❌ Down${NC}"
    fi
}

# Main deployment function
deploy() {
    local current_env=$(get_current_environment)
    local target_env
    local target_port
    
    if [ "$current_env" = "blue" ]; then
        target_env="green"
        target_port="$GREEN_PORT"
    else
        target_env="blue"
        target_port="$BLUE_PORT"
    fi
    
    log_info "Starting blue-green deployment"
    log_info "Current environment: $current_env"
    log_info "Target environment: $target_env"
    
    # Create backup
    create_backup
    
    # Deploy to target environment
    if ! deploy_to_environment "$target_env" "$target_port"; then
        log_error "Deployment to $target_env failed"
        return 1
    fi
    
    # Switch traffic
    if ! switch_traffic "$target_env" "$target_port"; then
        log_error "Traffic switch failed, attempting rollback..."
        rollback
        return 1
    fi
    
    # Cleanup old environment
    cleanup_old_environment "$current_env"
    
    log_info "Blue-green deployment completed successfully!"
    show_status
}

# Parse command line arguments
case "${1:-deploy}" in
    "deploy")
        init_deployment
        deploy
        ;;
    "rollback")
        init_deployment
        rollback
        ;;
    "status")
        show_status
        ;;
    "cleanup")
        log_step "Cleaning up all environments..."
        pm2 delete all 2>/dev/null || true
        rm -rf "$BACKUP_DIR"/*.state 2>/dev/null || true
        log_info "Cleanup completed"
        ;;
    *)
        echo "Usage: $0 {deploy|rollback|status|cleanup}"
        echo
        echo "Commands:"
        echo "  deploy   - Perform blue-green deployment"
        echo "  rollback - Rollback to previous deployment"
        echo "  status   - Show current deployment status"
        echo "  cleanup  - Clean up all environments"
        exit 1
        ;;
esac