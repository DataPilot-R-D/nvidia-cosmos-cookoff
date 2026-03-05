# Suggested Presentation Flow (3 min demo video)

## Structure

### 0:00-0:20 - Hook (The Problem)

"In October 2025, $102 million in jewels were stolen from the Louvre in under 4 minutes. Only 39% of rooms had cameras. Guards weren't watching. What if an AI-powered autonomous robot had been patrolling?"

### 0:20-0:40 - Introduce SRAS

"SRAS - Security Robot Automation System. An autonomous security platform powered by NVIDIA Cosmos Reason2. It sees, reasons, acts, and keeps humans informed."

Show: system architecture diagram (5 layers)

### 0:40-1:10 - Module 1: Cosmos Benchmark + Prompting

"We started by benchmarking Cosmos Reason2 for surveillance. We tested 24 images and 3 videos, measuring detection, positioning, and reasoning capabilities."

Show: benchmark results table, key finding about reasoning mode

### 1:10-1:30 - Module 2: Person Detection + Positioning

"Cosmos detects people and maps their positions in real-time. Combined with our DimOS memory layer, the system tracks who was where and when."

Show: example detection output, spatial memory visualization

### 1:30-1:50 - Module 3: Multi-Robot Task Planning

"When a blind spot is detected, our Cosmos-powered planner generates tasks, scores priorities, and dispatches the nearest available robot - all autonomously."

Show: planner config, task flow diagram, multi-robot assignment

### 1:50-2:10 - Module 4: Task Execution

"The robot navigates via Nav2, inspects the area, and reports back. Multiple robots coordinate without conflicts."

Show: Nav2 execution, task lifecycle states

### 2:10-2:35 - Module 5: LoRA Smoke Detection (The Wow Factor)

"But what if intruders use smoke to hide? We extended Cosmos with a LoRA adapter trained on real thermal images. Zero-shot: 53%. With our adapter: 96.2%. 278MB. 20 minutes to train. $0.30."

Show: side-by-side thermal images, before/after accuracy numbers

### 2:35-2:50 - Dashboard + Human-Over-The-Loop

"Everything flows to our real-time dashboard. The operator sees alerts, video feeds, Cosmos reasoning, and robot positions. The system is autonomous - the human is over the loop, not in it."

Show: dashboard screenshots

### 2:50-3:00 - Close

"SRAS: Cosmos sees. Cosmos reasons. Robots act. Humans decide."

Show: architecture + results summary

## Key Numbers to Highlight

- 96.2% person detection through smoke (up from 53.3%)
- 278MB LoRA adapter, 20 min training, $0.30 cost
- 4/5 scene understanding benchmark score
- Multi-robot coordination with autonomous dispatch
- Human-Over-The-Loop (not in the loop)
- Real problem: $102M Louvre heist, 39% camera coverage
- $5.4B market by 2030

## Visual Assets Needed

- [ ] System architecture diagram (5 layers)
- [ ] Benchmark results table
- [ ] Thermal image comparison (smoke: zero-shot vs LoRA)
- [ ] Task planning flow diagram
- [ ] Dashboard screenshots
- [ ] Louvre heist photo/headline for hook
