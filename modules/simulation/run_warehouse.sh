#!/bin/bash
set -euo pipefail

HEADLESS=false
ROS2=false
EXTRA_ARGS=()

for arg in "$@"; do
  case "$arg" in
    --headless)
      HEADLESS=true
      ;;
    --ros2)
      ROS2=true
      ;;
    *)
      EXTRA_ARGS+=("$arg")
      ;;
  esac
done

if [[ -n "${CONDA_DEFAULT_ENV:-}" ]]; then
  true
elif [[ -f "$HOME/miniconda3/bin/activate" ]]; then
  # shellcheck source=/dev/null
  source "$HOME/miniconda3/bin/activate" isaaclab || true
fi

if [[ -n "${ROS_DISTRO:-}" && -f "/opt/ros/${ROS_DISTRO}/setup.bash" ]]; then
  # shellcheck source=/dev/null
  source "/opt/ros/${ROS_DISTRO}/setup.bash"
fi

if [[ -f "go2_omniverse_ws/install/setup.bash" ]]; then
  # shellcheck source=/dev/null
  source "go2_omniverse_ws/install/setup.bash"
fi

CMD=(python warehouse_scene.py)

if [[ "$HEADLESS" == true ]]; then
  CMD+=(--headless)
fi
if [[ "$ROS2" == true ]]; then
  CMD+=(--ros2)
fi

CMD+=("${EXTRA_ARGS[@]}")

printf 'Running: %q ' "${CMD[@]}"
printf '\n'
"${CMD[@]}"
