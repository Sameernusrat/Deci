#!/bin/bash

# Backup and Restore Script for Deci Backend
# Quick recovery and disaster management

set -euo pipefail

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# Configuration
BACKUP_DIR="./backups"
LOGS_DIR="./logs"
DATA_DIR="./data"
CONFIG_DIR="./config"
RESTORE_POINT_FILE="$BACKUP_DIR/latest_restore_point.json"
MAX_BACKUPS=10

# Functions
log_info() { echo -e "${GREEN}✅ $1${NC}"; }
log_warn() { echo -e "${YELLOW}⚠️  $1${NC}"; }
log_error() { echo -e "${RED}❌ $1${NC}"; }
log_step() { echo -e "${BLUE}🔄 $1${NC}"; }

# Create backup
create_backup() {
    local backup_name="${1:-auto-$(date +%Y%m%d-%H%M%S)}"
    local backup_path="$BACKUP_DIR/$backup_name"
    
    log_step "Creating backup: $backup_name"
    
    # Create backup directory
    mkdir -p "$backup_path"
    
    # Backup application files
    log_step "Backing up application files..."
    
    # Core application
    [ -d "dist" ] && cp -r dist "$backup_path/"
    [ -f "package.json" ] && cp package.json "$backup_path/"
    [ -f "package-lock.json" ] && cp package-lock.json "$backup_path/"
    [ -f "ecosystem.config.js" ] && cp ecosystem.config.js "$backup_path/"
    
    # Configuration files
    [ -d "$CONFIG_DIR" ] && cp -r "$CONFIG_DIR" "$backup_path/"
    [ -f ".env" ] && cp .env "$backup_path/"
    [ -f ".env.production" ] && cp .env.production "$backup_path/"
    
    # Data files (if any)
    [ -d "$DATA_DIR" ] && cp -r "$DATA_DIR" "$backup_path/"
    
    # PM2 configuration
    log_step "Backing up PM2 configuration..."
    pm2 save 2>/dev/null || true
    [ -f ~/.pm2/dump.pm2 ] && cp ~/.pm2/dump.pm2 "$backup_path/"
    
    # System state
    log_step "Capturing system state..."
    
    # PM2 process list
    pm2 jlist > "$backup_path/pm2_processes.json" 2>/dev/null || echo "[]" > "$backup_path/pm2_processes.json"
    
    # System information
    cat > "$backup_path/system_info.json" << EOF
{
  "timestamp": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "hostname": "$(hostname)",
  "node_version": "$(node --version 2>/dev/null || echo 'unknown')",
  "npm_version": "$(npm --version 2>/dev/null || echo 'unknown')",
  "pm2_version": "$(pm2 --version 2>/dev/null || echo 'unknown')",
  "os_info": "$(uname -a 2>/dev/null || echo 'unknown')",
  "memory_usage": $(free -m 2>/dev/null | awk 'NR==2{printf "{\"total\":%s,\"used\":%s,\"free\":%s}", $2,$3,$4}' || echo '{}'),
  "disk_usage": "$(df -h . 2>/dev/null | awk 'NR==2{print $5}' || echo 'unknown')",
  "git_commit": "$(git rev-parse HEAD 2>/dev/null || echo 'unknown')",
  "git_branch": "$(git branch --show-current 2>/dev/null || echo 'unknown')",
  "backup_size": "$(du -sh "$backup_path" 2>/dev/null | cut -f1 || echo 'unknown')"
}
EOF
    
    # Health check snapshot
    log_step "Capturing health status..."
    if curl -s -f "http://localhost:3001/api/health" > "$backup_path/health_snapshot.json" 2>/dev/null; then
        log_info "Health snapshot captured"
    else
        echo '{"status":"unavailable","timestamp":"'$(date -u +%Y-%m-%dT%H:%M:%SZ)'"}' > "$backup_path/health_snapshot.json"
    fi
    
    # Create backup manifest
    cat > "$backup_path/manifest.json" << EOF
{
  "backup_name": "$backup_name",
  "created_at": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "backup_type": "full",
  "components": {
    "application": true,
    "configuration": true,
    "pm2_state": true,
    "system_info": true,
    "health_snapshot": true
  },
  "restore_instructions": "Use './scripts/backup-restore.sh restore $backup_name' to restore this backup"
}
EOF
    
    # Update latest restore point
    echo "{\"latest_backup\":\"$backup_name\",\"path\":\"$backup_path\",\"created_at\":\"$(date -u +%Y-%m-%dT%H:%M:%SZ)\"}" > "$RESTORE_POINT_FILE"
    
    # Cleanup old backups
    cleanup_old_backups
    
    local backup_size=$(du -sh "$backup_path" 2>/dev/null | cut -f1 || echo "unknown")
    log_info "Backup created successfully: $backup_path ($backup_size)"
    
    return 0
}

# Quick backup (essential files only)
create_quick_backup() {
    local backup_name="quick-$(date +%Y%m%d-%H%M%S)"
    local backup_path="$BACKUP_DIR/$backup_name"
    
    log_step "Creating quick backup: $backup_name"
    
    mkdir -p "$backup_path"
    
    # Essential files only
    [ -f "package.json" ] && cp package.json "$backup_path/"
    [ -f "ecosystem.config.js" ] && cp ecosystem.config.js "$backup_path/"
    [ -f ".env.production" ] && cp .env.production "$backup_path/"
    
    # PM2 state
    pm2 save 2>/dev/null || true
    [ -f ~/.pm2/dump.pm2 ] && cp ~/.pm2/dump.pm2 "$backup_path/"
    
    # Minimal manifest
    cat > "$backup_path/manifest.json" << EOF
{
  "backup_name": "$backup_name",
  "created_at": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "backup_type": "quick",
  "components": {
    "configuration": true,
    "pm2_state": true
  }
}
EOF
    
    log_info "Quick backup created: $backup_path"
}

# Restore from backup
restore_backup() {
    local backup_name="$1"
    local backup_path="$BACKUP_DIR/$backup_name"
    
    if [ ! -d "$backup_path" ]; then
        log_error "Backup not found: $backup_path"
        return 1
    fi
    
    log_step "Restoring from backup: $backup_name"
    
    # Verify backup integrity
    if [ ! -f "$backup_path/manifest.json" ]; then
        log_error "Invalid backup: manifest.json not found"
        return 1
    fi
    
    # Create pre-restore backup
    log_step "Creating pre-restore backup..."
    create_quick_backup
    
    # Stop services
    log_step "Stopping services..."
    pm2 delete all 2>/dev/null || true
    
    # Restore application files
    log_step "Restoring application files..."
    
    [ -d "$backup_path/dist" ] && cp -r "$backup_path/dist" .
    [ -f "$backup_path/package.json" ] && cp "$backup_path/package.json" .
    [ -f "$backup_path/package-lock.json" ] && cp "$backup_path/package-lock.json" .
    [ -f "$backup_path/ecosystem.config.js" ] && cp "$backup_path/ecosystem.config.js" .
    
    # Restore configuration
    [ -d "$backup_path/config" ] && cp -r "$backup_path/config" .
    [ -f "$backup_path/.env" ] && cp "$backup_path/.env" .
    [ -f "$backup_path/.env.production" ] && cp "$backup_path/.env.production" .
    
    # Restore data
    [ -d "$backup_path/data" ] && cp -r "$backup_path/data" .
    
    # Restore PM2 configuration
    log_step "Restoring PM2 configuration..."
    if [ -f "$backup_path/dump.pm2" ]; then
        cp "$backup_path/dump.pm2" ~/.pm2/
        pm2 resurrect
    else
        log_warn "PM2 dump not found, starting with default configuration"
        NODE_OPTIONS="--expose-gc --max-old-space-size=1024" pm2 start ecosystem.config.js --env production
    fi
    
    # Wait for services to start
    log_step "Waiting for services to start..."
    sleep 10
    
    # Verify restore
    if curl -s -f "http://localhost:3001/api/health" > /dev/null 2>&1; then
        log_info "Restore completed successfully"
        
        # Update restore point
        echo "{\"restored_from\":\"$backup_name\",\"restored_at\":\"$(date -u +%Y-%m-%dT%H:%M:%SZ)\"}" > "$RESTORE_POINT_FILE"
        
        return 0
    else
        log_error "Restore failed - service not responding"
        return 1
    fi
}

# List available backups
list_backups() {
    log_step "Available backups:"
    
    if [ ! -d "$BACKUP_DIR" ] || [ -z "$(ls -A "$BACKUP_DIR" 2>/dev/null)" ]; then
        log_warn "No backups found"
        return 0
    fi
    
    echo
    printf "%-20s %-20s %-10s %-30s\n" "NAME" "CREATED" "TYPE" "SIZE"
    echo "--------------------------------------------------------------------------------"
    
    for backup_dir in "$BACKUP_DIR"/*; do
        if [ -d "$backup_dir" ]; then
            local backup_name=$(basename "$backup_dir")
            local manifest_file="$backup_dir/manifest.json"
            
            if [ -f "$manifest_file" ]; then
                local created_at=$(jq -r '.created_at // "unknown"' "$manifest_file" 2>/dev/null || echo "unknown")
                local backup_type=$(jq -r '.backup_type // "unknown"' "$manifest_file" 2>/dev/null || echo "unknown")
                local size=$(du -sh "$backup_dir" 2>/dev/null | cut -f1 || echo "unknown")
                
                printf "%-20s %-20s %-10s %-30s\n" "$backup_name" "$created_at" "$backup_type" "$size"
            else
                local size=$(du -sh "$backup_dir" 2>/dev/null | cut -f1 || echo "unknown")
                printf "%-20s %-20s %-10s %-30s\n" "$backup_name" "unknown" "legacy" "$size"
            fi
        fi
    done
    
    echo
    
    # Show latest restore point
    if [ -f "$RESTORE_POINT_FILE" ]; then
        local latest_info=$(cat "$RESTORE_POINT_FILE" 2>/dev/null || echo "{}")
        local latest_backup=$(echo "$latest_info" | jq -r '.latest_backup // "none"' 2>/dev/null || echo "none")
        local restored_from=$(echo "$latest_info" | jq -r '.restored_from // "none"' 2>/dev/null || echo "none")
        
        echo "Latest backup: $latest_backup"
        [ "$restored_from" != "none" ] && echo "Last restored from: $restored_from"
    fi
}

# Cleanup old backups
cleanup_old_backups() {
    log_step "Cleaning up old backups..."
    
    local backup_count=$(find "$BACKUP_DIR" -maxdepth 1 -type d -name "*-*" | wc -l)
    
    if [ "$backup_count" -gt "$MAX_BACKUPS" ]; then
        local to_remove=$((backup_count - MAX_BACKUPS))
        
        find "$BACKUP_DIR" -maxdepth 1 -type d -name "*-*" -printf '%T@ %p\n' | \
        sort -n | \
        head -n "$to_remove" | \
        cut -d' ' -f2- | \
        xargs rm -rf
        
        log_info "Removed $to_remove old backup(s)"
    fi
}

# Verify backup
verify_backup() {
    local backup_name="$1"
    local backup_path="$BACKUP_DIR/$backup_name"
    
    if [ ! -d "$backup_path" ]; then
        log_error "Backup not found: $backup_path"
        return 1
    fi
    
    log_step "Verifying backup: $backup_name"
    
    local issues=0
    
    # Check manifest
    if [ ! -f "$backup_path/manifest.json" ]; then
        log_error "Missing manifest.json"
        ((issues++))
    else
        log_info "Manifest found"
    fi
    
    # Check essential files
    local essential_files=("package.json")
    for file in "${essential_files[@]}"; do
        if [ -f "$backup_path/$file" ]; then
            log_info "$file found"
        else
            log_warn "$file missing"
        fi
    done
    
    # Check backup size
    local backup_size_kb=$(du -sk "$backup_path" 2>/dev/null | cut -f1 || echo "0")
    if [ "$backup_size_kb" -lt 100 ]; then
        log_warn "Backup seems unusually small (< 100KB)"
    else
        log_info "Backup size OK ($(du -sh "$backup_path" | cut -f1))"
    fi
    
    if [ "$issues" -eq 0 ]; then
        log_info "Backup verification passed"
        return 0
    else
        log_error "Backup verification failed ($issues issues)"
        return 1
    fi
}

# Emergency restore (last known good state)
emergency_restore() {
    log_step "Initiating emergency restore..."
    
    if [ ! -f "$RESTORE_POINT_FILE" ]; then
        log_error "No restore point found"
        return 1
    fi
    
    local latest_backup=$(jq -r '.latest_backup // ""' "$RESTORE_POINT_FILE" 2>/dev/null || echo "")
    
    if [ -z "$latest_backup" ]; then
        log_error "No latest backup information found"
        return 1
    fi
    
    log_info "Emergency restoring from: $latest_backup"
    restore_backup "$latest_backup"
}

# Show help
show_help() {
    echo "Backup and Restore Script for Deci Backend"
    echo "Usage: $0 <command> [arguments]"
    echo
    echo "Commands:"
    echo "  backup [name]         - Create full backup (optional custom name)"
    echo "  quick-backup          - Create quick backup (config only)"
    echo "  restore <name>        - Restore from specific backup"
    echo "  emergency-restore     - Restore from latest backup"
    echo "  list                  - List available backups"
    echo "  verify <name>         - Verify backup integrity"
    echo "  cleanup               - Remove old backups"
    echo "  help                  - Show this help"
    echo
    echo "Examples:"
    echo "  $0 backup                    # Create auto-named backup"
    echo "  $0 backup pre-upgrade        # Create named backup"
    echo "  $0 restore auto-20240101-120000"
    echo "  $0 emergency-restore"
}

# Main execution
main() {
    # Ensure backup directory exists
    mkdir -p "$BACKUP_DIR"
    
    case "${1:-help}" in
        "backup")
            create_backup "${2:-}"
            ;;
        "quick-backup")
            create_quick_backup
            ;;
        "restore")
            if [ -z "${2:-}" ]; then
                log_error "Backup name required for restore"
                echo "Usage: $0 restore <backup_name>"
                list_backups
                exit 1
            fi
            restore_backup "$2"
            ;;
        "emergency-restore")
            emergency_restore
            ;;
        "list")
            list_backups
            ;;
        "verify")
            if [ -z "${2:-}" ]; then
                log_error "Backup name required for verify"
                echo "Usage: $0 verify <backup_name>"
                exit 1
            fi
            verify_backup "$2"
            ;;
        "cleanup")
            cleanup_old_backups
            ;;
        "help"|*)
            show_help
            ;;
    esac
}

# Execute main function
main "$@"