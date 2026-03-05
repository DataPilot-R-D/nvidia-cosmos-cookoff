#!/bin/bash
# =============================================================================
# EC2 WebSocket Backend Setup Script
# =============================================================================
# Run this script on the EC2 instance to set up the WebSocket server
#
# Usage:
#   1. SSH into EC2: ssh -i ~/.ssh/isaac-sim-key.pem ubuntu@63.182.177.92
#   2. Copy-paste this script into the terminal
#   3. Or: scp this file to EC2 and run: bash setup_backend_ec2.sh
# =============================================================================

set -e  # Exit on error

echo "╔═══════════════════════════════════════════════════════════════╗"
echo "║       EC2 WebSocket Backend Setup                             ║"
echo "╚═══════════════════════════════════════════════════════════════╝"

# -----------------------------------------------------------------------------
# Step 1: Install Bun (if not present)
# -----------------------------------------------------------------------------
if command -v bun &> /dev/null; then
    echo "✅ Bun already installed: $(bun --version)"
else
    echo "📦 Installing Bun..."
    curl -fsSL https://bun.sh/install | bash
    export BUN_INSTALL="$HOME/.bun"
    export PATH="$BUN_INSTALL/bin:$PATH"
    echo "✅ Bun installed: $(bun --version)"
fi

# Ensure Bun is in PATH for this session
export BUN_INSTALL="$HOME/.bun"
export PATH="$BUN_INSTALL/bin:$PATH"

# -----------------------------------------------------------------------------
# Step 2: Create workspace directory
# -----------------------------------------------------------------------------
WORKSPACE_DIR="$HOME/dashboard-backend"
echo "📁 Creating workspace at: $WORKSPACE_DIR"
mkdir -p "$WORKSPACE_DIR"
cd "$WORKSPACE_DIR"

# -----------------------------------------------------------------------------
# Step 3: Check if code already exists (clone or update)
# -----------------------------------------------------------------------------
if [ -d "websocket-server" ]; then
    echo "📁 websocket-server directory exists"
    echo "   To update, you can:"
    echo "   - Delete and re-copy: rm -rf websocket-server"
    echo "   - Or use rsync from local machine"
else
    echo "📋 websocket-server directory not found"
    echo "   Please copy the code from your local machine using:"
    echo ""
    echo "   rsync -avz --exclude 'node_modules' --exclude '.env' \\"
    echo "     -e 'ssh -i ~/.ssh/isaac-sim-key.pem' \\"
    echo "     '/Users/piotrgerke/Dashboard Dp/apps/websocket-server/' \\"
    echo "     ubuntu@63.182.177.92:~/dashboard-backend/websocket-server/"
    echo ""
fi

# -----------------------------------------------------------------------------
# Step 4: Install dependencies (if package.json exists)
# -----------------------------------------------------------------------------
if [ -d "websocket-server" ] && [ -f "websocket-server/package.json" ]; then
    echo "📦 Installing dependencies..."
    cd websocket-server
    bun install
    echo "✅ Dependencies installed"

    # Create .env if not exists
    if [ ! -f ".env" ]; then
        echo "📝 Creating .env file..."
        cat > .env << 'EOF'
# Server Configuration
PORT=8080
NODE_ENV=production
LOG_LEVEL=info

# CORS Settings (allow your frontend)
WS_CORS_ORIGIN=http://localhost:3000,https://your-frontend-domain.com

# ROS Bridge Connection (localhost since ROS is on same machine)
ROS_BRIDGE_URL=ws://localhost:9090

# go2rtc WebRTC Server (localhost since running on same machine)
GO2RTC_URL=http://localhost:1984
EOF
        echo "✅ .env created - edit WS_CORS_ORIGIN for your frontend domain"
    fi
else
    echo "⚠️  websocket-server/package.json not found"
    echo "   Please copy the code first (see Step 3)"
fi

# -----------------------------------------------------------------------------
# Step 5: Setup systemd service (optional)
# -----------------------------------------------------------------------------
echo ""
echo "╔═══════════════════════════════════════════════════════════════╗"
echo "║       Optional: Setup as systemd service                      ║"
echo "╚═══════════════════════════════════════════════════════════════╝"
echo ""
echo "To run the backend as a service, create /etc/systemd/system/ws-backend.service:"
echo ""
cat << 'SYSTEMD'
[Unit]
Description=WebSocket Backend Server
After=network.target

[Service]
Type=simple
User=ubuntu
WorkingDirectory=/home/ubuntu/dashboard-backend/websocket-server
ExecStart=/home/ubuntu/.bun/bin/bun run src/index.ts
Restart=on-failure
RestartSec=10

[Install]
WantedBy=multi-user.target
SYSTEMD
echo ""
echo "Then run:"
echo "  sudo systemctl daemon-reload"
echo "  sudo systemctl enable ws-backend"
echo "  sudo systemctl start ws-backend"
echo ""

# -----------------------------------------------------------------------------
# Step 6: Quick start (manual)
# -----------------------------------------------------------------------------
echo "╔═══════════════════════════════════════════════════════════════╗"
echo "║       Quick Start (Manual)                                    ║"
echo "╚═══════════════════════════════════════════════════════════════╝"
echo ""
echo "To start the server manually in tmux:"
echo ""
echo "  tmux new -s ws-backend"
echo "  cd ~/dashboard-backend/websocket-server"
echo "  bun run src/index.ts"
echo "  # Detach: Ctrl+B, then D"
echo ""
echo "Re-attach later: tmux attach -t ws-backend"
echo ""

# -----------------------------------------------------------------------------
# Done
# -----------------------------------------------------------------------------
echo "╔═══════════════════════════════════════════════════════════════╗"
echo "║       Setup Complete!                                         ║"
echo "╚═══════════════════════════════════════════════════════════════╝"
echo ""
echo "Elastic IP: 63.182.177.92"
echo "WebSocket URL: ws://63.182.177.92:8080"
echo ""
echo "Don't forget to open port 8080 in EC2 Security Group!"
echo ""
