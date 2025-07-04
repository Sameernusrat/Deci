#!/bin/bash

# Health Check Monitor - System-Level Auto-Recovery
# Checks backend health every minute and auto-restarts if needed

LOG_FILE="/Users/sameernusrat/deci/logs/health-monitor.log"
ALERT_FILE="/Users/sameernusrat/deci/logs/health-alerts.log" 
BACKEND_URL="http://localhost:3001/api/health"
MAX_FAILURES=3
FAILURE_COUNT=0
RECOVERY_LOG="/Users/sameernusrat/deci/logs/recovery.log"

# Ensure log directory exists
mkdir -p "/Users/sameernusrat/deci/logs"

log() {
    local level=$1
    local message=$2
    local timestamp=$(date '+%Y-%m-%d %H:%M:%S')
    echo "[$timestamp] [$level] $message" | tee -a "$LOG_FILE"
    
    if [ "$level" = "ALERT" ] || [ "$level" = "ERROR" ]; then
        echo "[$timestamp] [$level] $message" >> "$ALERT_FILE"
    fi
}

check_backend_health() {
    local response=$(curl -s -w "HTTPSTATUS:%{http_code}" --max-time 10 "$BACKEND_URL" 2>/dev/null)
    local status=$(echo "$response" | tr -d '\n' | sed -E 's/.*HTTPSTATUS:([0-9]{3})$/\1/')
    
    if [ "$status" = "200" ]; then
        local body=$(echo "$response" | sed -E 's/HTTPSTATUS\:[0-9]{3}$//')
        local server_status=$(echo "$body" | jq -r '.status' 2>/dev/null)
        local uptime=$(echo "$body" | jq -r '.uptime' 2>/dev/null)
        local memory_mb=$(echo "$body" | jq -r '.memory.rss / 1024 / 1024 | floor' 2>/dev/null)
        
        if [ "$server_status" = "OK" ]; then
            log "SUCCESS" "Backend healthy - Uptime: ${uptime}s, Memory: ${memory_mb}MB"
            FAILURE_COUNT=0
            return 0
        else
            log "ERROR" "Backend unhealthy - Status: $server_status"
            return 1
        fi
    else
        log "ERROR" "Backend unreachable - HTTP status: $status"
        return 1
    fi
}

restart_backend() {
    log "ALERT" "Attempting backend restart (failure count: $FAILURE_COUNT)"
    echo "[$timestamp] Starting recovery attempt $FAILURE_COUNT" >> "$RECOVERY_LOG"
    
    # Kill existing backend processes
    pkill -f "ts-node.*server-enhanced" 2>/dev/null || true
    sleep 3
    
    # Kill processes on port 3001
    lsof -ti:3001 | xargs kill -9 2>/dev/null || true
    sleep 2
    
    # Start backend
    cd /Users/sameernusrat/deci/backend
    npm run dev > ../logs/auto-recovery-backend.log 2>&1 &
    local backend_pid=$!
    
    # Wait up to 30 seconds for startup
    local attempts=0
    while [ $attempts -lt 15 ]; do
        sleep 2
        if curl -s "$BACKEND_URL" > /dev/null 2>&1; then
            log "SUCCESS" "Backend restarted successfully (PID: $backend_pid)"
            echo "[$timestamp] Recovery successful - PID: $backend_pid" >> "$RECOVERY_LOG"
            return 0
        fi
        attempts=$((attempts + 1))
    done
    
    log "ERROR" "Backend restart failed after 30 seconds"
    echo "[$timestamp] Recovery failed" >> "$RECOVERY_LOG"
    return 1
}

check_ollama() {
    if curl -s http://localhost:11434/api/tags > /dev/null 2>&1; then
        log "INFO" "Ollama service is running"
        return 0
    else
        log "WARNING" "Ollama service is down - attempting restart"
        
        # Try to start Ollama (assuming it's installed via Homebrew or similar)
        if command -v ollama &> /dev/null; then
            ollama serve > /dev/null 2>&1 &
            sleep 5
            
            if curl -s http://localhost:11434/api/tags > /dev/null 2>&1; then
                log "SUCCESS" "Ollama restarted successfully"
                return 0
            fi
        fi
        
        log "ERROR" "Failed to restart Ollama - RAG will use fallback mode"
        return 1
    fi
}

send_alert() {
    local message=$1
    local timestamp=$(date '+%Y-%m-%d %H:%M:%S')
    
    # Log to alerts file
    echo "[$timestamp] CRITICAL ALERT: $message" >> "$ALERT_FILE"
    
    # Could add email/Slack notifications here
    log "ALERT" "CRITICAL: $message"
    
    # Create alert file for external monitoring
    echo "CRITICAL BACKEND FAILURE: $message" > "/Users/sameernusrat/deci/logs/ALERT_ACTIVE"
}

clear_alert() {
    rm -f "/Users/sameernusrat/deci/logs/ALERT_ACTIVE" 2>/dev/null
    log "INFO" "Alert cleared - system recovered"
}

main() {
    log "INFO" "Health check monitor starting..."
    
    # Check backend health
    if check_backend_health; then
        clear_alert
    else
        FAILURE_COUNT=$((FAILURE_COUNT + 1))
        log "WARNING" "Backend health check failed (count: $FAILURE_COUNT/$MAX_FAILURES)"
        
        if [ $FAILURE_COUNT -ge $MAX_FAILURES ]; then
            send_alert "Backend failed $MAX_FAILURES consecutive health checks"
            
            if restart_backend; then
                FAILURE_COUNT=0
                clear_alert
                log "SUCCESS" "Auto-recovery completed successfully"
            else
                send_alert "Auto-recovery failed - manual intervention required"
            fi
        fi
    fi
    
    # Also check Ollama as a bonus
    check_ollama
    
    log "INFO" "Health check completed"
}

# Run the main function
main

# If running continuously (for testing)
if [ "$1" = "--continuous" ]; then
    log "INFO" "Running in continuous mode (every 60 seconds)..."
    while true; do
        sleep 60
        main
    done
fi