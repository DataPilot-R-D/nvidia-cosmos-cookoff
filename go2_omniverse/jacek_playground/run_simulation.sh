#!/bin/bash
# Run Louvre Simulation with Isaac Sim
# This script launches the main simulation with CCTV cameras and robot sensors

cd "$(dirname "$0")"

echo "=========================================="
echo "Louvre Simulation - Isaac Sim"
echo "=========================================="
echo ""
echo "Starting Isaac Sim..."
echo "Press Ctrl+C to stop"
echo ""

/opt/IsaacSim/python.sh luvr_simulation.py
