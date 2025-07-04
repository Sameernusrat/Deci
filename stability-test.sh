#!/bin/bash

# 24-Hour Backend Stability Test
# Tests health endpoint every 5 minutes, chat endpoint every 30 minutes

LOG_FILE="stability.log"
HEALTH_URL="http://localhost:3001/api/health"
CHAT_URL="http://localhost:3001/api/chat/message"
CHAT_PAYLOAD='{"message":"Stability test - what are EMI schemes?"}'

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
    echo "[$timestamp] [$level] $message" | tee -a "$LOG_FILE"
    
    # Color output to console
    case $level in
        "ERROR")   echo -e "${RED}[$timestamp] [$level] $message${NC}" ;;
        "SUCCESS") echo -e "${GREEN}[$timestamp] [$level] $message${NC}" ;;
        "WARNING") echo -e "${YELLOW}[$timestamp] [$level] $message${NC}" ;;
        "INFO")    echo -e "${BLUE}[$timestamp] [$level] $message${NC}" ;;
    esac
}

test_health() {
    local response=$(curl -s -w "HTTPSTATUS:%{http_code}" "$HEALTH_URL" 2>/dev/null)
    local body=$(echo "$response" | sed -E 's/HTTPSTATUS\:[0-9]{3}$//')
    local status=$(echo "$response" | tr -d '\n' | sed -E 's/.*HTTPSTATUS:([0-9]{3})$/\1/')
    
    if [ "$status" -eq 200 ]; then
        local server_status=$(echo "$body" | jq -r '.status' 2>/dev/null)
        if [ "$server_status" == "OK" ]; then
            log "SUCCESS" "Health check passed - Server status: OK"
            return 0
        else
            log "ERROR" "Health check failed - Server status: $server_status"
            return 1
        fi
    else
        log "ERROR" "Health check failed - HTTP status: $status"
        return 1
    fi
}

test_chat() {
    local start_time=$(date +%s)
    local response=$(curl -s -w "HTTPSTATUS:%{http_code}" -X POST -H "Content-Type: application/json" -d "$CHAT_PAYLOAD" "$CHAT_URL" 2>/dev/null)
    local end_time=$(date +%s)
    local duration=$((end_time - start_time))
    
    local body=$(echo "$response" | sed -E 's/HTTPSTATUS\:[0-9]{3}$//')
    local status=$(echo "$response" | tr -d '\n' | sed -E 's/.*HTTPSTATUS:([0-9]{3})$/\1/')
    
    if [ "$status" -eq 200 ]; then
        local response_text=$(echo "$body" | jq -r '.response' 2>/dev/null)
        local response_length=${#response_text}
        local rag_used=$(echo "$body" | jq -r '.rag_used' 2>/dev/null)
        
        if [ "$response_length" -gt 50 ]; then
            log "SUCCESS" "Chat test passed - Response: ${response_length} chars, RAG: $rag_used, Duration: ${duration}s"
            return 0
        else
            log "ERROR" "Chat test failed - Response too short: $response_length chars"
            log "ERROR" "Chat response: $response_text"
            return 1
        fi
    else
        log "ERROR" "Chat test failed - HTTP status: $status"
        return 1
    fi
}

check_server_resources() {
    # Check if backend process is running
    local backend_pid=$(pgrep -f "ts-node.*server-enhanced")
    if [ -n "$backend_pid" ]; then
        # Get memory usage in MB
        local memory_mb=$(ps -o rss= -p "$backend_pid" | awk '{print int($1/1024)}')
        # Get CPU usage
        local cpu_percent=$(ps -o %cpu= -p "$backend_pid" | awk '{print $1}')
        log "INFO" "Backend resources - PID: $backend_pid, Memory: ${memory_mb}MB, CPU: ${cpu_percent}%"
        
        # Alert if memory usage is too high (>1GB)
        if [ "$memory_mb" -gt 1024 ]; then
            log "WARNING" "High memory usage detected: ${memory_mb}MB"
        fi
    else
        log "ERROR" "Backend process not found!"
        return 1
    fi
}

cleanup() {
    log "INFO" "Stability test interrupted. Cleaning up..."
    exit 0
}

# Trap Ctrl+C
trap cleanup SIGINT SIGTERM

# Start stability test
log "INFO" "Starting 24-hour backend stability test"
log "INFO" "Health checks every 5 minutes, Chat tests every 30 minutes"
log "INFO" "Press Ctrl+C to stop"

# Initialize counters
health_passed=0
health_failed=0
chat_passed=0
chat_failed=0
iteration=0

start_time=$(date +%s)

while true; do
    iteration=$((iteration + 1))
    current_time=$(date +%s)
    elapsed_hours=$(( (current_time - start_time) / 3600 ))
    
    log "INFO" "=== Iteration $iteration (${elapsed_hours}h elapsed) ==="
    
    # Always test health
    if test_health; then
        health_passed=$((health_passed + 1))
    else
        health_failed=$((health_failed + 1))
    fi
    
    # Test chat every 6th iteration (30 minutes)
    if [ $((iteration % 6)) -eq 0 ]; then
        if test_chat; then
            chat_passed=$((chat_passed + 1))
        else
            chat_failed=$((chat_failed + 1))
        fi
    fi
    
    # Check resources every 12th iteration (1 hour)
    if [ $((iteration % 12)) -eq 0 ]; then
        check_server_resources
    fi
    
    # Print summary every hour
    if [ $((iteration % 12)) -eq 0 ]; then
        total_health=$((health_passed + health_failed))
        total_chat=$((chat_passed + chat_failed))
        health_success_rate=$(( total_health > 0 ? health_passed * 100 / total_health : 0 ))
        chat_success_rate=$(( total_chat > 0 ? chat_passed * 100 / total_chat : 0 ))
        
        log "INFO" "HOURLY SUMMARY - Health: $health_passed/$total_health (${health_success_rate}%), Chat: $chat_passed/$total_chat (${chat_success_rate}%)"
    fi
    
    # Stop after 24 hours
    if [ "$elapsed_hours" -ge 24 ]; then
        log "INFO" "24-hour test completed successfully!"
        break
    fi
    
    # Wait 5 minutes
    log "INFO" "Waiting 5 minutes for next check..."
    sleep 300
done

# Final summary
total_health=$((health_passed + health_failed))
total_chat=$((chat_passed + chat_failed))
health_success_rate=$(( total_health > 0 ? health_passed * 100 / total_health : 0 ))
chat_success_rate=$(( total_chat > 0 ? chat_passed * 100 / total_chat : 0 ))

log "INFO" "=== FINAL 24-HOUR SUMMARY ==="
log "INFO" "Health tests: $health_passed passed, $health_failed failed (${health_success_rate}% success)"
log "INFO" "Chat tests: $chat_passed passed, $chat_failed failed (${chat_success_rate}% success)"

if [ "$health_failed" -eq 0 ] && [ "$chat_failed" -eq 0 ]; then
    log "SUCCESS" "🎉 BACKEND PASSED 24-HOUR STABILITY TEST!"
    exit 0
else
    log "ERROR" "❌ Backend failed stability test"
    exit 1
fi