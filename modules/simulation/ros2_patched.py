# PATCHED VERSION - FPS fix
# Original: update_period=0.1 (10 FPS)
# Patched:  update_period=0.033 (30 FPS)

import re

with open("/home/ubuntu/go2_omniverse/ros2.py", "r") as f:
    content = f.read()

# Fix camera update_period: 0.1 -> 0.033 (30 FPS)
content = re.sub(
    r"update_period=0\.1,",
    "update_period=0.033,  # PATCHED: 30 FPS (was 0.1 = 10 FPS)",
    content
)

with open("/home/ubuntu/go2_omniverse/ros2.py", "w") as f:
    f.write(content)

print("ros2.py patched: update_period changed to 0.033 (30 FPS)")
