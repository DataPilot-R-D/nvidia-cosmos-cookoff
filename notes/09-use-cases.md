# Use Cases

## Primary: Museum / Gallery Security

### The Louvre Scenario

**Setup:** Museum with fixed CCTV cameras + autonomous patrol robot (Unitree Go2)

**Scenario Flow:**
1. Night time, museum closed
2. CCTV camera in Gallery X goes offline (or is obstructed)
3. System detects blind spot -> Cosmos reasons: "Camera feed lost in high-value gallery"
4. Task planner dispatches robot to inspect Gallery X
5. Robot navigates via Nav2, arrives at location
6. Robot camera captures scene -> Cosmos analyzes: "Window broken, person detected near display case"
7. Risk assessment: HIGH -> alert to operator dashboard
8. Operator sees: video feed + Cosmos reasoning + recommended actions
9. System already triggered alarm; operator confirms lockdown

**What SRAS would have prevented at Louvre:**
- Blind spot in Apollo Gallery -> detected in seconds (not minutes)
- Camera pointed wrong way -> robot provides mobile coverage
- Guards not watching -> autonomous response, human notified
- 8-minute response delay -> robotic response in under 60 seconds

## Secondary: Warehouse / Logistics Security

### Blind Spot Detection

**Setup:** Large warehouse with fixed CCTV grid + patrol robots

**Scenario:**
1. Camera #7 in aisle C gets obscured (box fell, spray paint, malfunction)
2. System detects coverage gap
3. Robot dispatched to aisle C to provide temporary coverage
4. Cosmos analyzes scene: "Camera lens obstructed, no people present, aisle clear"
5. Maintenance ticket generated, robot continues patrol

### Intruder in Smoke

**Setup:** Warehouse with thermal cameras + LoRA-equipped Cosmos

**Scenario:**
1. Intruder triggers smoke grenade to obscure theft
2. RGB cameras: blind
3. Thermal camera + LoRA adapter: "Person detected through heavy smoke, moving toward exit"
4. Robot intercepts path, alarm triggered
5. Evidence captured: thermal images + Cosmos reasoning log

## Tertiary: Data Center / Office

### After-Hours Anomaly

**Setup:** Office building, normal business hours monitoring + night patrol

**Scenario:**
1. After hours, motion sensor triggers in server room
2. Robot dispatched, Cosmos analyzes: "Person at server rack, no badge visible"
3. Cross-reference with access control: no authorized entry logged
4. Alert: CRITICAL -> security team notified with video + reasoning

## Market Context

- Global autonomous security robot market: $1.8B (2023) -> $5.4B by 2030
- One operator can manage dozens of robots
- Current robots are reactive; SRAS adds reasoning and autonomy
- Cosmos provides the "understanding" layer that current solutions lack
