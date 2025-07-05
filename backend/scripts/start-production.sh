#!/bin/bash

# Deci Backend Production Startup Script
# Enhanced with pre-flight checks and hardening

set -euo pipefail

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
MIN_NODE_VERSION="16.0.0"
MIN_MEMORY_GB=2
MIN_DISK_GB=5
REQUIRED_PORTS=(3001 11434)
LOG_DIR="./logs"
PID_FILE="./pids/backend.pid"

echo -e "${BLUE}🚀 Deci Backend Production Startup${NC}"
echo "=================================="

# Function to print colored output
log_info() { echo -e "${GREEN}✅ $1${NC}"; }
log_warn() { echo -e "${YELLOW}⚠️  $1${NC}"; }
log_error() { echo -e "${RED}❌ $1${NC}"; }
log_step() { echo -e "${BLUE}🔄 $1${NC}"; }

# Function to check command exists
check_command() {
    if ! command -v "$1" &> /dev/null; then
        log_error "$1 is not installed or not in PATH"
        return 1
    fi
    return 0
}

# Function to compare versions
version_gte() {
    printf '%s\n%s\n' "$2" "$1" | sort -V -C
}

# Function to check disk space
check_disk_space() {
    local required_gb=$1
    local available_kb
    
    if [[ "$OSTYPE" == "darwin"* ]]; then
        # macOS
        available_kb=$(df . | awk 'NR==2 {print $4}')
    else
        # Linux
        available_kb=$(df . | awk 'NR==2 {print $4}')
    fi
    
    local available_gb=$((available_kb / 1024 / 1024))
    
    if [ "$available_gb" -lt "$required_gb" ]; then
        log_error "Insufficient disk space. Required: ${required_gb}GB, Available: ${available_gb}GB"
        return 1
    fi
    
    log_info "Disk space OK: ${available_gb}GB available"
    return 0
}

# Function to check memory
check_memory() {
    local required_gb=$1
    local available_gb
    
    if [[ "$OSTYPE" == "darwin"* ]]; then
        # macOS - get total physical memory
        local total_bytes=$(sysctl -n hw.memsize)
        available_gb=$((total_bytes / 1024 / 1024 / 1024))
    else
        # Linux
        available_gb=$(free -g | awk 'NR==2{print $2}')
    fi
    
    if [ "$available_gb" -lt "$required_gb" ]; then
        log_error "Insufficient memory. Required: ${required_gb}GB, Available: ${available_gb}GB"
        return 1
    fi
    
    log_info "Memory OK: ${available_gb}GB available"
    return 0
}

# Function to check port availability
check_port() {
    local port=$1
    
    if lsof -i ":$port" &> /dev/null; then
        log_warn "Port $port is already in use"
        
        # Ask if we should kill existing process
        echo -n "Kill existing process on port $port? [y/N]: "
        read -r response
        if [[ "$response" =~ ^[Yy]$ ]]; then
            local pid=$(lsof -ti ":$port")
            if [ -n "$pid" ]; then
                kill -9 "$pid" 2>/dev/null || true
                sleep 2
                if lsof -i ":$port" &> /dev/null; then
                    log_error "Failed to kill process on port $port"
                    return 1
                else
                    log_info "Killed process on port $port"
                fi
            fi
        else
            log_error "Port $port is required but in use"
            return 1
        fi
    else
        log_info "Port $port is available"
    fi
    
    return 0
}

# Function to setup directories
setup_directories() {
    log_step "Setting up directories..."
    
    mkdir -p "$LOG_DIR"
    mkdir -p "$(dirname "$PID_FILE")"
    mkdir -p "./tmp"
    mkdir -p "./backups"
    
    # Set proper permissions
    chmod 755 "$LOG_DIR"
    chmod 755 "./tmp"
    
    log_info "Directories created successfully"
}

# Function to check Node.js version
check_node_version() {
    log_step "Checking Node.js version..."
    
    if ! check_command "node"; then
        log_error "Node.js is not installed"
        return 1
    fi
    
    local node_version=$(node --version | cut -d'v' -f2)
    
    if ! version_gte "$node_version" "$MIN_NODE_VERSION"; then
        log_error "Node.js version $node_version is too old. Required: $MIN_NODE_VERSION+"
        return 1
    fi
    
    log_info "Node.js version OK: $node_version"
    return 0
}

# Function to check dependencies
check_dependencies() {
    log_step "Checking dependencies..."
    
    # Check if node_modules exists
    if [ ! -d "node_modules" ]; then
        log_warn "node_modules not found. Running npm install..."
        npm install --production
    fi
    
    # Check if build exists
    if [ ! -d "dist" ]; then
        log_warn "dist directory not found. Building application..."
        npm run build
    fi
    
    # Verify critical files exist
    local critical_files=(
        "dist/server-enhanced.js"
        "package.json"
        "ecosystem.config.js"
    )
    
    for file in "${critical_files[@]}"; do
        if [ ! -f "$file" ]; then
            log_error "Critical file missing: $file"
            return 1
        fi
    done
    
    log_info "All dependencies OK"
    return 0
}

# Function to check external services
check_external_services() {
    log_step "Checking external services..."
    
    # Check Ollama service
    if curl -s -f "http://localhost:11434/api/tags" > /dev/null 2>&1; then
        log_info "Ollama service is running"
    else
        log_warn "Ollama service is not responding. Application will run in degraded mode."
    fi
    
    # Check if we can write to log directory
    if touch "$LOG_DIR/test.log" 2>/dev/null; then
        rm -f "$LOG_DIR/test.log"
        log_info "Log directory is writable"
    else
        log_error "Cannot write to log directory: $LOG_DIR"
        return 1
    fi
    
    return 0
}

# Function to create environment file
create_env_file() {
    log_step "Creating environment configuration..."
    
    cat > .env.production << EOF
NODE_ENV=production
PORT=3001
LOG_LEVEL=info
MAX_MEMORY=800
PM2_CLUSTER_MODE=true
PM2_INSTANCE_COUNT=2
OLLAMA_BASE_URL=http://localhost:11434
ENABLE_MONITORING=true
ENABLE_MEMORY_SAFEGUARDS=true
EOF
    
    log_info "Environment file created"
}

# Function to pre-flight checks
run_preflight_checks() {
    log_step "Running pre-flight checks..."
    
    local checks=(
        "check_node_version"
        "check_memory $MIN_MEMORY_GB"
        "check_disk_space $MIN_DISK_GB"
        "check_dependencies"
        "check_external_services"
        "setup_directories"
        "create_env_file"
    )
    
    for check in "${checks[@]}"; do
        if ! eval "$check"; then
            log_error "Pre-flight check failed: $check"
            exit 1
        fi
    done
    
    # Check required ports
    for port in "${REQUIRED_PORTS[@]}"; do
        if ! check_port "$port"; then
            log_error "Port check failed for port: $port"
            exit 1
        fi
    done
    
    log_info "All pre-flight checks passed!"
}

# Function to start PM2
start_pm2() {
    log_step "Starting PM2 cluster..."
    
    # Check if PM2 is installed
    if ! check_command "pm2"; then
        log_warn "PM2 not found. Installing globally..."
        npm install -g pm2
    fi
    
    # Stop any existing instances
    pm2 delete deci-backend 2>/dev/null || true
    
    # Start with ecosystem config
    NODE_OPTIONS="--expose-gc --max-old-space-size=1024" pm2 start ecosystem.config.js --env production
    
    # Save PM2 configuration
    pm2 save
    
    # Setup PM2 startup script
    pm2 startup
    
    log_info "PM2 cluster started successfully"
}

# Function to verify deployment
verify_deployment() {
    log_step "Verifying deployment..."
    
    # Wait for service to start
    sleep 5
    
    # Check PM2 status
    if ! pm2 list | grep -q "deci-backend"; then
        log_error "PM2 process not found"
        return 1
    fi
    
    # Check if service responds
    local max_attempts=30
    local attempt=1
    
    while [ $attempt -le $max_attempts ]; do
        if curl -s -f "http://localhost:3001/api/health" > /dev/null 2>&1; then
            log_info "Health check passed"
            break
        fi
        
        log_warn "Health check failed (attempt $attempt/$max_attempts). Retrying..."
        sleep 2
        ((attempt++))
    done
    
    if [ $attempt -gt $max_attempts ]; then
        log_error "Service failed to start properly"
        return 1
    fi
    
    # Get detailed health info
    local health_response=$(curl -s "http://localhost:3001/api/health" 2>/dev/null || echo "null")
    echo "Health check response: $health_response"
    
    log_info "Deployment verification successful!"
    return 0
}

# Function to show status
show_status() {
    echo
    echo -e "${BLUE}📊 Deployment Status${NC}"
    echo "==================="
    
    # PM2 status
    pm2 list
    
    # Memory usage
    echo
    echo "Memory Usage:"
    pm2 monit --lines 5
    
    # Service URLs
    echo
    echo -e "${GREEN}🌐 Service URLs:${NC}"
    echo "  Health Check: http://localhost:3001/api/health"
    echo "  Monitoring:   http://localhost:3001/monitoring-dashboard.html"
    echo "  Chat API:     http://localhost:3001/api/chat/message"
    
    # Logs
    echo
    echo -e "${BLUE}📝 Log Files:${NC}"
    echo "  Combined: $LOG_DIR/pm2-combined.log"
    echo "  Error:    $LOG_DIR/pm2-error.log"
    echo "  App:      $LOG_DIR/combined-$(date +%Y-%m-%d).log"
    
    # Quick commands
    echo
    echo -e "${BLUE}🛠️  Quick Commands:${NC}"
    echo "  pm2 logs deci-backend     # View logs"
    echo "  pm2 monit                 # Monitor processes"
    echo "  pm2 restart deci-backend  # Restart service"
    echo "  pm2 stop deci-backend     # Stop service"
}

# Main execution
main() {
    # Check if running as root (not recommended)
    if [ "$EUID" -eq 0 ]; then
        log_warn "Running as root is not recommended for production"
        echo -n "Continue anyway? [y/N]: "
        read -r response
        if [[ ! "$response" =~ ^[Yy]$ ]]; then
            log_error "Aborted by user"
            exit 1
        fi
    fi
    
    # Run all checks and start services
    run_preflight_checks
    start_pm2
    verify_deployment
    show_status
    
    echo
    log_info "🎉 Production deployment completed successfully!"
    echo
    echo -e "${GREEN}Your Deci backend is now running in production mode with:${NC}"
    echo "  ✅ 2 clustered instances"
    echo "  ✅ Memory safeguards enabled"
    echo "  ✅ Advanced logging"
    echo "  ✅ Health monitoring"
    echo "  ✅ Auto-restart on failures"
    echo
    echo -e "${BLUE}Monitor your deployment:${NC}"
    echo "  pm2 monit"
    echo
}

# Trap for cleanup on exit
trap 'log_warn "Script interrupted"' INT TERM

# Run main function
main "$@"