#!/bin/bash

# Production Startup Script for Deci
# Ensures clean startup of all services with PM2 management

set -e # Exit on any error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

log() {
    local level=$1
    local message=$2
    local timestamp=$(date '+%Y-%m-%d %H:%M:%S')
    
    case $level in
        "ERROR")   echo -e "${RED}[$timestamp] [ERROR] $message${NC}" ;;
        "SUCCESS") echo -e "${GREEN}[$timestamp] [SUCCESS] $message${NC}" ;;
        "WARNING") echo -e "${YELLOW}[$timestamp] [WARNING] $message${NC}" ;;
        "INFO")    echo -e "${BLUE}[$timestamp] [INFO] $message${NC}" ;;
    esac
}

cleanup_processes() {
    log "INFO" "Cleaning up existing processes..."
    
    # Kill any existing ts-node processes
    pkill -f "ts-node.*server" 2>/dev/null || true
    pkill -f "vite" 2>/dev/null || true
    
    # Stop PM2 processes
    npx pm2 stop all 2>/dev/null || true
    npx pm2 delete all 2>/dev/null || true
    
    # Kill any processes on our ports
    lsof -ti:3000,3001 | xargs kill -9 2>/dev/null || true
    
    sleep 2
    log "SUCCESS" "Cleanup completed"
}

check_dependencies() {
    log "INFO" "Checking dependencies..."
    
    # Check Node.js
    if ! command -v node &> /dev/null; then
        log "ERROR" "Node.js is not installed"
        exit 1
    fi
    
    # Check npm
    if ! command -v npm &> /dev/null; then
        log "ERROR" "npm is not installed"
        exit 1
    fi
    
    # Check Python3 for RAG
    if ! command -v python3 &> /dev/null; then
        log "ERROR" "Python3 is not installed (required for RAG system)"
        exit 1
    fi
    
    # Check if Ollama is running
    if ! curl -s http://localhost:11434/api/tags > /dev/null 2>&1; then
        log "WARNING" "Ollama is not running - RAG will use fallback mode"
    else
        log "SUCCESS" "Ollama is running and accessible"
    fi
    
    log "SUCCESS" "Dependencies check completed"
}

setup_directories() {
    log "INFO" "Setting up directories..."
    
    # Create logs directory
    mkdir -p logs
    
    # Ensure permissions
    chmod 755 logs
    
    log "SUCCESS" "Directories setup completed"
}

start_backend() {
    log "INFO" "Starting backend with PM2..."
    
    # Start backend with PM2
    npx pm2 start ecosystem.config.js
    
    # Wait for backend to be ready
    local max_attempts=30
    local attempt=1
    
    while [ $attempt -le $max_attempts ]; do
        if curl -s http://localhost:3001/api/health > /dev/null 2>&1; then
            log "SUCCESS" "Backend is ready and responding"
            break
        fi
        
        log "INFO" "Waiting for backend to start... (attempt $attempt/$max_attempts)"
        sleep 2
        attempt=$((attempt + 1))
    done
    
    if [ $attempt -gt $max_attempts ]; then
        log "ERROR" "Backend failed to start within expected time"
        exit 1
    fi
    
    # Show PM2 status
    npx pm2 list
}

start_frontend() {
    log "INFO" "Starting frontend..."
    
    # Start frontend in background
    cd frontend
    npm start > ../logs/frontend.log 2>&1 &
    local frontend_pid=$!
    cd ..
    
    # Wait for frontend to be ready
    local max_attempts=15
    local attempt=1
    
    while [ $attempt -le $max_attempts ]; do
        if curl -s http://localhost:3000 > /dev/null 2>&1; then
            log "SUCCESS" "Frontend is ready and responding"
            echo "$frontend_pid" > logs/frontend.pid
            break
        fi
        
        log "INFO" "Waiting for frontend to start... (attempt $attempt/$max_attempts)"
        sleep 2
        attempt=$((attempt + 1))
    done
    
    if [ $attempt -gt $max_attempts ]; then
        log "ERROR" "Frontend failed to start within expected time"
        exit 1
    fi
}

verify_services() {
    log "INFO" "Verifying all services..."
    
    # Test backend health
    local health_response=$(curl -s http://localhost:3001/api/health | jq -r '.status' 2>/dev/null)
    if [ "$health_response" != "OK" ]; then
        log "ERROR" "Backend health check failed"
        exit 1
    fi
    
    # Test backend chat endpoint
    local chat_response=$(curl -s http://localhost:3001/api/chat/message -X POST -H "Content-Type: application/json" -d '{"message":"production startup test"}' | jq -r '.response' 2>/dev/null)
    if [ ${#chat_response} -lt 50 ]; then
        log "ERROR" "Backend chat endpoint failed"
        exit 1
    fi
    
    # Test frontend
    if ! curl -s http://localhost:3000 > /dev/null 2>&1; then
        log "ERROR" "Frontend is not accessible"
        exit 1
    fi
    
    log "SUCCESS" "All services verified and working"
}

show_status() {
    log "INFO" "=== PRODUCTION SERVICES STATUS ==="
    echo ""
    echo -e "${GREEN}✅ Backend (PM2 managed):${NC} http://localhost:3001"
    echo -e "${GREEN}✅ Frontend:${NC} http://localhost:3000"
    echo ""
    echo -e "${BLUE}Management Commands:${NC}"
    echo "  • PM2 Status:     npx pm2 status"
    echo "  • PM2 Logs:       npx pm2 logs"
    echo "  • PM2 Restart:    npx pm2 restart deci-backend"
    echo "  • PM2 Stop:       npx pm2 stop deci-backend"
    echo "  • Frontend Logs:  tail -f logs/frontend.log"
    echo ""
    echo -e "${BLUE}Monitoring:${NC}"
    echo "  • Stability Test: ./stability-test.sh > stability.log 2>&1 &"
    echo "  • PM2 Monitor:    npx pm2 monit"
    echo ""
    echo -e "${GREEN}🚀 Production environment ready!${NC}"
}

# Main execution
main() {
    log "INFO" "Starting Deci production environment..."
    
    cleanup_processes
    check_dependencies
    setup_directories
    start_backend
    start_frontend
    verify_services
    show_status
    
    log "SUCCESS" "Production startup completed successfully!"
}

# Handle interruption
trap 'log "INFO" "Startup interrupted"; exit 1' INT TERM

# Run main function
main "$@"