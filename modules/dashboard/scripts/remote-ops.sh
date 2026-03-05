#!/bin/bash
#
# Remote Operations Script for ROS2 Backend on AWS EC2
# Usage: ./remote-ops.sh <command> [options]
#
# Commands:
#   restart    - Kill ws-backend tmux session and start new one
#   logs       - Show last 50 lines from ws-backend tmux session
#   status     - Check if ws-backend tmux session exists
#   attach     - Show command to manually attach to tmux session
#   health     - Check if server is responding (HTTP health check)
#

set -e

# Configuration
SSH_KEY="$HOME/IsaakAwS/isaac-sim-1-key.pem"
EC2_HOST="ubuntu@63.182.177.92"
SSH_OPTS="-o StrictHostKeyChecking=no -o ConnectTimeout=10"
TMUX_SESSION="ws-backend"
BACKEND_DIR="/home/ubuntu/dashboard-backend/websocket-server"
BACKEND_CMD="export PATH=/home/ubuntu/.bun/bin:\$PATH && bun run src/index.ts"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

ssh_cmd() {
    ssh -i "$SSH_KEY" $SSH_OPTS "$EC2_HOST" "$@"
}

print_status() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

print_success() {
    echo -e "${GREEN}[OK]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

cmd_restart() {
    print_status "Restarting ws-backend on EC2..."

    ssh_cmd "
        # Kill existing session if exists
        tmux kill-session -t $TMUX_SESSION 2>/dev/null || true

        # Start new session with backend
        cd $BACKEND_DIR && \
        tmux new-session -d -s $TMUX_SESSION '$BACKEND_CMD'

        # Verify session started
        if tmux has-session -t $TMUX_SESSION 2>/dev/null; then
            echo 'SUCCESS: ws-backend session started'
            sleep 2
            tmux capture-pane -t $TMUX_SESSION -p | tail -10
        else
            echo 'FAILED: Could not start ws-backend session'
            exit 1
        fi
    "

    print_success "Backend restarted successfully"
}

cmd_logs() {
    local lines=${1:-50}
    print_status "Fetching last $lines lines from ws-backend..."

    ssh_cmd "
        if tmux has-session -t $TMUX_SESSION 2>/dev/null; then
            tmux capture-pane -t $TMUX_SESSION -p -S -$lines
        else
            echo 'ERROR: Session $TMUX_SESSION does not exist'
            exit 1
        fi
    "
}

cmd_status() {
    print_status "Checking ws-backend status..."

    ssh_cmd "
        echo '=== TMUX Session ==='
        if tmux has-session -t $TMUX_SESSION 2>/dev/null; then
            echo 'Status: RUNNING'
            echo 'Session: $TMUX_SESSION'
            tmux list-sessions | grep $TMUX_SESSION
        else
            echo 'Status: NOT RUNNING'
        fi

        echo ''
        echo '=== Process Check ==='
        pgrep -a bun | head -5 || echo 'No bun processes found'

        echo ''
        echo '=== Port 8080 ==='
        ss -tlnp | grep :8080 || echo 'Port 8080 not listening'
    "
}

cmd_attach() {
    echo ""
    print_warning "Claude cannot interactively attach to tmux sessions."
    echo ""
    echo "Run this command in your terminal to attach:"
    echo ""
    echo -e "${GREEN}ssh -i \"$SSH_KEY\" $EC2_HOST -t 'tmux attach-session -t $TMUX_SESSION'${NC}"
    echo ""
    echo "To detach from tmux: press Ctrl+B, then D"
    echo ""
}

cmd_health() {
    print_status "Checking server health..."

    # Check if server responds on port 8080
    if curl -s --connect-timeout 5 "http://63.182.177.92:8080/health" > /dev/null 2>&1; then
        print_success "Server is healthy (HTTP 200 on /health)"
    else
        # Try socket connection
        if nc -z -w5 63.182.177.92 8080 2>/dev/null; then
            print_warning "Port 8080 is open but /health endpoint not responding"
        else
            print_error "Server not responding on port 8080"
        fi
    fi
}

cmd_help() {
    echo "Remote Operations for ROS2 Backend"
    echo ""
    echo "Usage: $0 <command> [options]"
    echo ""
    echo "Commands:"
    echo "  restart     Kill ws-backend tmux session and start new one"
    echo "  logs [N]    Show last N lines (default: 50) from ws-backend"
    echo "  status      Check if ws-backend tmux session exists"
    echo "  attach      Show command to manually attach to tmux"
    echo "  health      Check if server is responding"
    echo "  help        Show this help message"
    echo ""
    echo "Configuration:"
    echo "  SSH Key:    $SSH_KEY"
    echo "  EC2 Host:   $EC2_HOST"
    echo "  Tmux:       $TMUX_SESSION"
    echo "  Backend:    $BACKEND_DIR"
}

# Main
case "${1:-help}" in
    restart)
        cmd_restart
        ;;
    logs)
        cmd_logs "${2:-50}"
        ;;
    status)
        cmd_status
        ;;
    attach)
        cmd_attach
        ;;
    health)
        cmd_health
        ;;
    help|--help|-h)
        cmd_help
        ;;
    *)
        print_error "Unknown command: $1"
        echo ""
        cmd_help
        exit 1
        ;;
esac
