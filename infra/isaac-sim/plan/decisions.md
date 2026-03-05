# Decision Log

- Dev AMI strategy: Golden AMI (custom Ubuntu 22.04), not Marketplace (to allow g4/g5/g6 flexibility).
- Driver baseline: pin to NVIDIA driver recommended for Isaac Sim 5.1.x (e.g., 535.161.08 on Ubuntu 22.04).
- Instance types: dev `g6.2xlarge` (may adjust after quota approval); train list `g6e.2xlarge`, `g6e.4xlarge`, `g5.4xlarge`.
- Region: `eu-central-1`.
