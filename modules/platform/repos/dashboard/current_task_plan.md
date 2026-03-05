# EC2 Elastic IP Migration - COMPLETE

## ✅ Phase 1: Elastic IP Assigned

| Property             | Value                        |
| -------------------- | ---------------------------- |
| **Instance ID**      | `i-0da8f19d3053d21e6`        |
| **Instance Name**    | `isaac-sim-1`                |
| **NEW Elastic IP**   | **`63.182.177.92`**          |
| **Old IP (INVALID)** | ~~`54.93.179.211`~~          |
| **Allocation ID**    | `eipalloc-027cfac324d78ee6e` |
| **Association ID**   | `eipassoc-003c8afce8b9ebd65` |

> ⚠️ **WARNING**: All connections using old IP `54.93.179.211` are now broken!

---

## 📋 Phase 2: Migration Checklist

### 1. SSH Connection (New Command)

```bash
ssh -i ~/.ssh/isaac-sim-key.pem ubuntu@63.182.177.92
```

### 2. Copy WebSocket Server to EC2

From your **local Mac**, run:

```bash
rsync -avz --exclude 'node_modules' --exclude '.env' --exclude 'data' \
  -e 'ssh -i ~/.ssh/isaac-sim-key.pem' \
  '/Users/piotrgerke/Dashboard Dp/apps/websocket-server/' \
  ubuntu@63.182.177.92:~/dashboard-backend/websocket-server/
```

### 3. Run Setup Script on EC2

SSH into EC2 and run:

```bash
# Install Bun
curl -fsSL https://bun.sh/install | bash
export PATH="$HOME/.bun/bin:$PATH"

# Navigate and install
cd ~/dashboard-backend/websocket-server
bun install

# Create production .env
cat > .env << 'EOF'
PORT=8080
NODE_ENV=production
LOG_LEVEL=info
WS_CORS_ORIGIN=http://localhost:3000,https://your-domain.com
ROS_BRIDGE_URL=ws://localhost:9090
GO2RTC_URL=http://localhost:1984
EOF

# Start in tmux
tmux new -s ws-backend
bun run src/index.ts
# Detach: Ctrl+B, D
```

### 4. Open Port 8080 in Security Group

**AWS Console** or CLI:

```bash
aws ec2 authorize-security-group-ingress \
  --group-id <YOUR_SECURITY_GROUP_ID> \
  --protocol tcp \
  --port 8080 \
  --cidr 0.0.0.0/0
```

### 5. Update Frontend Configuration

Edit `apps/web-client/.env.local`:

```env
# WebSocket Backend (on EC2)
NEXT_PUBLIC_WS_URL=ws://63.182.177.92:8080

# ROS Bridge (via EC2 WebSocket server proxying)
NEXT_PUBLIC_ROSBRIDGE_URL=ws://63.182.177.92:9090
```

---

## 🔄 Files Already Updated

| File                                   | Change                                     |
| -------------------------------------- | ------------------------------------------ |
| `apps/websocket-server/.env`           | ROS_BRIDGE_URL, GO2RTC_URL → 63.182.177.92 |
| `~/.claude/skills/map-transfer-ec2.md` | EC2_IP → 63.182.177.92                     |
| `scripts/setup_backend_ec2.sh`         | NEW - Setup script for EC2                 |

---

## 🎯 Service URLs (After Migration)

| Service              | URL                                                    |
| -------------------- | ------------------------------------------------------ |
| **SSH**              | `ssh -i ~/.ssh/isaac-sim-key.pem ubuntu@63.182.177.92` |
| **WebSocket Server** | `ws://63.182.177.92:8080`                              |
| **ROS Bridge**       | `ws://63.182.177.92:9090`                              |
| **go2rtc API**       | `http://63.182.177.92:1984`                            |
| **go2rtc WebRTC**    | `http://63.182.177.92:8554`                            |

---

## ✅ Verification Steps

After completing migration:

1. **Test SSH:**

   ```bash
   ssh -i ~/.ssh/isaac-sim-key.pem ubuntu@63.182.177.92 "echo 'SSH works!'"
   ```

2. **Test WebSocket (curl):**

   ```bash
   curl -v http://63.182.177.92:8080/health
   ```

3. **Test from Browser:**
   - Open web-client at localhost:3000
   - Check DevTools → Network → WS for connection to 63.182.177.92:8080

---

## 💰 Cost Note

Elastic IPs are **FREE** while associated with a running instance.
If you stop the instance, the IP incurs a small hourly charge (~$0.005/hour).

To release (only if no longer needed):

```bash
aws ec2 release-address --allocation-id eipalloc-027cfac324d78ee6e
```
