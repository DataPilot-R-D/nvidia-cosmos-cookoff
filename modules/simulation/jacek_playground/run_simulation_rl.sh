#!/bin/bash
# Run Louvre Simulation with RL-controlled Go2 Robot
# This script launches the simulation with reinforcement learning controller

cd "$(dirname "$0")"

echo "=========================================="
echo "Louvre Simulation - RL Go2 Robot"
echo "=========================================="
echo ""
echo "Starting Isaac Sim with RL controller..."
echo "Press Ctrl+C to stop"
echo ""

# Add parent directory to PYTHONPATH for imports
export PYTHONPATH="$(dirname $(pwd)):$PYTHONPATH"

# Run with IsaacLab python
python luvr_simulation_rl.py --num_envs 1
