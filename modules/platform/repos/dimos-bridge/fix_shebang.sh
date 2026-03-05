#!/bin/bash
# Fix shebang in ROS2 executables to use venv Python

INSTALL_DIR="$HOME/ros2_ws/install/dimos_vlm_bridge/bin"
PYTHON_PATH=$(which python3)

echo "Fixing shebang to use: $PYTHON_PATH"

for script in "$INSTALL_DIR"/*; do
    if [ -f "$script" ] && [ -x "$script" ]; then
        # Check if file has a shebang
        if head -1 "$script" | grep -q "^#!"; then
            echo "Fixing: $script"
            # Replace first line with correct Python path
            sed -i "1s|^#!.*|#!$PYTHON_PATH|" "$script"
        fi
    fi
done

echo "Done! Verify with:"
echo "head -1 $INSTALL_DIR/temporal_memory_node"
