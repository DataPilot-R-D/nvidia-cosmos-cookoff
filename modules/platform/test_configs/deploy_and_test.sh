#!/usr/bin/env bash
# deploy_and_test.sh — Deploy multi-robot planner+executor to isaac-sim-1 and run tests
#
# Usage:
#   ./deploy_and_test.sh deploy          — Clone repos, build, upload configs
#   ./deploy_and_test.sh launch          — Start planner+executor in tmux
#   ./deploy_and_test.sh test            — Run mock detection tests
#   ./deploy_and_test.sh integration     — Run 10 integration tests (~3-4min)
#   ./deploy_and_test.sh integration 1,2 — Run specific integration tests
#   ./deploy_and_test.sh verify          — Check topics and status
#   ./deploy_and_test.sh all             — Full pipeline: deploy + launch + verify
#   ./deploy_and_test.sh stop            — Kill planner+executor nodes
#
set -euo pipefail

INSTANCE="isaac-sim-1"
SSH_KEY="$HOME/.ssh/isaac-sim-1-key.pem"
SSH_HOST="ubuntu@63.182.177.92"
SSH_CMD="ssh -i $SSH_KEY $SSH_HOST"
SCP_CMD="scp -i $SSH_KEY"

ROS2_WS="/home/ubuntu/ros2_ws"
TEST_CONFIGS_DIR="$ROS2_WS/test_configs"
TMUX_SESSION="multi_robot_test"

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

# ── Helpers ───────────────────────────────────────────────────────────────────

log() { echo -e "\033[1;36m[$(date +%H:%M:%S)]\033[0m $*"; }
err() { echo -e "\033[1;31m[ERROR]\033[0m $*" >&2; }
ok()  { echo -e "\033[1;32m[OK]\033[0m $*"; }

ssh_run() {
    $SSH_CMD "$@"
}

# ── Step 1: Deploy ────────────────────────────────────────────────────────────

deploy() {
    log "Phase 1.1: Deploying code to $INSTANCE"

    # Check SSH connectivity
    log "Checking SSH connectivity..."
    if ! ssh_run "echo 'SSH OK'" >/dev/null 2>&1; then
        err "Cannot reach $INSTANCE via SSH"
        exit 1
    fi
    ok "SSH connection established"

    # Check disk space
    log "Checking disk space..."
    ssh_run "df -h / | tail -1"

    # Upload test configs first
    log "Uploading test configs..."
    ssh_run "mkdir -p $TEST_CONFIGS_DIR"
    $SCP_CMD "$SCRIPT_DIR/planner_multi_test.yaml" "$SSH_HOST:$TEST_CONFIGS_DIR/"
    $SCP_CMD "$SCRIPT_DIR/executor_multi_test.yaml" "$SSH_HOST:$TEST_CONFIGS_DIR/"
    $SCP_CMD "$SCRIPT_DIR/mock_detections.py" "$SSH_HOST:$TEST_CONFIGS_DIR/"
    ok "Test configs uploaded"

    # Rsync local repos (instance SSH key can't access GitHub planner/executor repos)
    PLANNER_SRC="$(dirname "$SCRIPT_DIR")/sras_ros2_robot_task_planner"
    EXECUTOR_SRC="$(dirname "$SCRIPT_DIR")/sras_ros2_robot_task_executor"

    log "Syncing planner from $PLANNER_SRC..."
    rsync -avz --delete --exclude='.git' --exclude='__pycache__' --exclude='*.pyc' \
        --exclude='.venv' --exclude='.pytest_cache' --exclude='node_modules' \
        -e "ssh -i $SSH_KEY" \
        "$PLANNER_SRC/" "$SSH_HOST:$ROS2_WS/src/sras_ros2_robot_task_planner/" 2>&1 | tail -3
    ok "Planner synced"

    log "Syncing executor from $EXECUTOR_SRC..."
    rsync -avz --delete --exclude='.git' --exclude='__pycache__' --exclude='*.pyc' \
        --exclude='.venv' --exclude='.pytest_cache' --exclude='node_modules' \
        -e "ssh -i $SSH_KEY" \
        "$EXECUTOR_SRC/" "$SSH_HOST:$ROS2_WS/src/sras_ros2_robot_task_executor/" 2>&1 | tail -3
    ok "Executor synced"

    # Build
    log "Building packages (colcon)..."
    ssh_run "source /opt/ros/humble/setup.bash && cd $ROS2_WS && colcon build --packages-select sras_robot_task_planner sras_robot_task_executor --symlink-install 2>&1"
    ok "Build complete"

    # Verify build artifacts
    log "Verifying build..."
    ssh_run "source /opt/ros/humble/setup.bash && source $ROS2_WS/install/setup.bash && ros2 pkg list | grep sras"
    ok "Deploy complete"
}

# ── Step 2: Launch ────────────────────────────────────────────────────────────

launch() {
    log "Phase 1.3: Launching planner + executor in tmux session '$TMUX_SESSION'"

    # Kill existing session if present
    ssh_run "tmux kill-session -t $TMUX_SESSION 2>/dev/null || true"

    # Create tmux session with planner
    ssh_run "tmux new-session -d -s $TMUX_SESSION -n planner"

    # Planner pane
    ssh_run "tmux send-keys -t $TMUX_SESSION:planner 'source /opt/ros/humble/setup.bash && source $ROS2_WS/install/setup.bash && ros2 launch sras_robot_task_planner robot_task_planner.launch.py config:=$TEST_CONFIGS_DIR/planner_multi_test.yaml' Enter"

    # Executor window
    ssh_run "tmux new-window -t $TMUX_SESSION -n executor"
    ssh_run "tmux send-keys -t $TMUX_SESSION:executor 'source /opt/ros/humble/setup.bash && source $ROS2_WS/install/setup.bash && ros2 launch sras_robot_task_executor robot_task_executor.launch.py config:=$TEST_CONFIGS_DIR/executor_multi_test.yaml' Enter"

    # Monitor window (for topic echoes)
    ssh_run "tmux new-window -t $TMUX_SESSION -n monitor"
    ssh_run "tmux send-keys -t $TMUX_SESSION:monitor 'source /opt/ros/humble/setup.bash && source $ROS2_WS/install/setup.bash' Enter"

    log "Waiting 5s for nodes to initialize..."
    sleep 5

    # Check if nodes are running
    log "Checking if nodes are alive..."
    ssh_run "source /opt/ros/humble/setup.bash && source $ROS2_WS/install/setup.bash && ros2 node list 2>/dev/null | grep -E 'planner|executor' || echo 'WARNING: Nodes not found in ros2 node list'"

    ok "Nodes launched in tmux session '$TMUX_SESSION'"
    log "Attach with: ssh $INSTANCE -t 'tmux attach -t $TMUX_SESSION'"
}

# ── Step 3: Test ──────────────────────────────────────────────────────────────

test_mock() {
    local test_name="${1:-all}"
    log "Phase 1.5: Running mock test '$test_name'"

    ssh_run "source /opt/ros/humble/setup.bash && source $ROS2_WS/install/setup.bash && cd $TEST_CONFIGS_DIR && python3 mock_detections.py $test_name 2>&1"
    ok "Mock test '$test_name' complete"
}

# ── Step 3b: Integration Tests ───────────────────────────────────────────────

integration() {
    local tests="${1:-all}"
    log "Phase 3: Running integration tests ($tests)"

    # Upload latest integration_tests.py
    log "Uploading integration_tests.py..."
    $SCP_CMD "$SCRIPT_DIR/integration_tests.py" "$SSH_HOST:$TEST_CONFIGS_DIR/"
    ok "Integration test script uploaded"

    # Ensure websocket-client is available (for Test 1)
    ssh_run "pip3 install --quiet websocket-client 2>/dev/null || true"

    log "Running integration tests (this may take 3-4 minutes)..."
    ssh_run "source /opt/ros/humble/setup.bash && source $ROS2_WS/install/setup.bash && cd $TEST_CONFIGS_DIR && python3 integration_tests.py $tests 2>&1"
    ok "Integration tests complete"
}

# ── Step 4: Verify ────────────────────────────────────────────────────────────

verify() {
    log "Phase 1.5: Verification checks"

    log "1. Checking active ROS2 nodes..."
    ssh_run "source /opt/ros/humble/setup.bash && source $ROS2_WS/install/setup.bash && ros2 node list 2>/dev/null" || true

    log "2. Checking task_requests topic (last 3 messages, 3s timeout)..."
    ssh_run "source /opt/ros/humble/setup.bash && source $ROS2_WS/install/setup.bash && timeout 3 ros2 topic echo /reasoning/task_requests std_msgs/msg/String --once 2>/dev/null" || log "  (no messages within timeout — expected if no mock published yet)"

    log "3. Checking task_status topic (3s timeout)..."
    ssh_run "source /opt/ros/humble/setup.bash && source $ROS2_WS/install/setup.bash && timeout 3 ros2 topic echo /robot/task_status std_msgs/msg/String --once 2>/dev/null" || log "  (no messages within timeout)"

    log "4. Checking planner state topic..."
    ssh_run "source /opt/ros/humble/setup.bash && source $ROS2_WS/install/setup.bash && timeout 3 ros2 topic echo /robot_task_planner_node/planner_state std_msgs/msg/String --once 2>/dev/null" || log "  (no messages within timeout)"

    log "5. Checking executor state topic..."
    ssh_run "source /opt/ros/humble/setup.bash && source $ROS2_WS/install/setup.bash && timeout 3 ros2 topic echo /robot_task_executor_node/executor_state std_msgs/msg/String --once 2>/dev/null" || log "  (no messages within timeout)"

    log "6. Topic list (filtered)..."
    ssh_run "source /opt/ros/humble/setup.bash && source $ROS2_WS/install/setup.bash && ros2 topic list 2>/dev/null | grep -E 'reasoning|robot|task|planner|executor|ui'" || true

    log "7. Checking robot odom topics..."
    ssh_run "source /opt/ros/humble/setup.bash && source $ROS2_WS/install/setup.bash && ros2 topic info /robot0/odom 2>/dev/null" || log "  /robot0/odom not available"
    ssh_run "source /opt/ros/humble/setup.bash && source $ROS2_WS/install/setup.bash && ros2 topic info /h1_0/odom 2>/dev/null" || log "  /h1_0/odom not available"

    ok "Verification complete"
}

# ── Stop ──────────────────────────────────────────────────────────────────────

stop() {
    log "Stopping planner + executor nodes..."
    ssh_run "tmux kill-session -t $TMUX_SESSION 2>/dev/null || true"
    ok "Tmux session '$TMUX_SESSION' killed"
}

# ── Main ──────────────────────────────────────────────────────────────────────

case "${1:-help}" in
    deploy)
        deploy
        ;;
    launch)
        launch
        ;;
    test)
        test_mock "${2:-all}"
        ;;
    integration)
        integration "${2:-all}"
        ;;
    verify)
        verify
        ;;
    all)
        deploy
        launch
        sleep 3
        verify
        log ""
        log "Nodes are running. Next steps:"
        log "  1. Run mock tests:       $0 test intruder"
        log "  2. Integration tests:    $0 integration [all|1|1,2,3]"
        log "  3. Verify results:       $0 verify"
        log "  4. Attach to tmux:       ssh $INSTANCE -t 'tmux attach -t $TMUX_SESSION'"
        log "  5. Stop nodes:           $0 stop"
        ;;
    stop)
        stop
        ;;
    help|*)
        echo "Usage: $0 {deploy|launch|test [name]|integration [tests]|verify|all|stop}"
        echo ""
        echo "Commands:"
        echo "  deploy       — Clone repos, build, upload configs to $INSTANCE"
        echo "  launch       — Start planner+executor in tmux on $INSTANCE"
        echo "  test         — Run mock detection tests (blindspot|intruder|detection|risk|cancel|all)"
        echo "  integration  — Run integration tests (all|1|1,2,3 — 10 tests, ~3-4min)"
        echo "  verify       — Check topics and node status"
        echo "  all          — Full pipeline: deploy + launch + verify"
        echo "  stop         — Kill planner+executor tmux session"
        ;;
esac
