# AWS Isaac Sim - Instrukcja uruchomienia (dla agenta AI)

## Prereqs

- AWS CLI skonfigurowane lokalnie (`aws` w PATH)
- Klucz SSH: `~/IsaakAwS/isaac-sim-1-key.pem`
- Instance ID: `i-0da8f19d3053d21e6`
- Elastic IP: `63.182.177.92`
- SSH user: `ubuntu`

Zmienna referencyjna:

```
SSH_KEY=~/IsaakAwS/isaac-sim-1-key.pem
EC2_HOST=ubuntu@63.182.177.92
SSH_OPTS="-o StrictHostKeyChecking=no -o ConnectTimeout=20"
INSTANCE_ID=i-0da8f19d3053d21e6
```

---

## Krok 1: Uruchom instancje EC2

```bash
aws ec2 start-instances --instance-ids $INSTANCE_ID
```

Sprawdz czy status przeszedl na `running`:

```bash
aws ec2 wait instance-running --instance-ids $INSTANCE_ID
```

Timeout: ~60s. Po `instance-running` odczekaj dodatkowe **15 sekund** na inicjalizacje SSH daemon.

Weryfikacja:

```bash
aws ec2 describe-instances --instance-ids $INSTANCE_ID \
  --query 'Reservations[0].Instances[0].[State.Name,PublicIpAddress]' --output text
```

Oczekiwany wynik: `running  63.182.177.92`

---

## Krok 2: Test SSH + sprawdzenie GPU

```bash
ssh -i $SSH_KEY $SSH_OPTS $EC2_HOST "echo 'SSH OK' && nvidia-smi --query-gpu=name,memory.used,memory.total --format=csv,noheader"
```

Oczekiwany wynik:

```
SSH OK
NVIDIA L4, 0 MiB, 23034 MiB
```

Jesli GPU uzywa >0 MiB, sprawdz czy cos juz dziala:

```bash
ssh -i $SSH_KEY $SSH_OPTS $EC2_HOST "tmux list-sessions 2>/dev/null; ps aux | grep -E '(isaac|python|bun)' | grep -v grep"
```

---

## Krok 3: Utworz sesje DCV (zdalny pulpit)

```bash
ssh -i $SSH_KEY $SSH_OPTS $EC2_HOST "sudo dcv create-session myses --owner ubuntu"
```

DCV jest dostepny na `https://63.182.177.92:8443` po utworzeniu sesji. Ta sesja jest opcjonalna dla agenta - potrzebna tylko do wizualnego podgladu Isaac Sim.

---

## Krok 4: Uruchom Isaac Sim

```bash
ssh -i $SSH_KEY $SSH_OPTS $EC2_HOST \
  "tmux new-session -d -s isaac-sim '~/go2_omniverse/run_sim_custom.sh'"
```

**UWAGA: Isaac Sim potrzebuje 3-5 minut na pelna inicjalizacje.**

Podczas ladowania w logach pojawia sie wielokrotnie:

```
Raycaster attribute 'attach_yaw_only' property will be deprecated...
```

To normalne - oznacza ladowanie sensorow robota.

Monitorowanie postepow:

```bash
ssh -i $SSH_KEY $SSH_OPTS $EC2_HOST "tmux capture-pane -t isaac-sim -p | tail -10"
```

Sprawdzenie czy ROS 2 topics sa juz dostepne (oznacza pelna gotowosc):

```bash
ssh -i $SSH_KEY $SSH_OPTS $EC2_HOST \
  "source /opt/ros/humble/setup.bash && ros2 topic list 2>/dev/null | head -10"
```

Oczekiwane topiki (gotowosc):

```
/robot0/cmd_vel
/robot0/front_cam/rgb
/robot0/imu
/robot0/odom
/robot0/point_cloud2_L1
/scan
```

Jesli brak topikow - czekaj jeszcze 60s i powtorz.

GPU po zaladowaniu Isaac Sim: **~5-6 GB VRAM**.

---

## Krok 5: Uruchom Vision LLM (LM Studio)

```bash
ssh -i $SSH_KEY $SSH_OPTS $EC2_HOST \
  "tmux new-session -d -s vision-llm 'bash -l -c \"lms server start && sleep 2 && lms load zai-org/glm-4.6v-flash && echo MODEL_LOADED && sleep infinity\"'"
```

Weryfikacja po 15-20s:

```bash
ssh -i $SSH_KEY $SSH_OPTS $EC2_HOST "tmux capture-pane -t vision-llm -p | tail -5"
```

Oczekiwany wynik w logach: `Model loaded successfully` lub `MODEL_LOADED`.

Port LM Studio: `127.0.0.1:1234` (tylko localhost, nie wystawiony na zewnatrz).

GPU po zaladowaniu modelu: **+8 GB VRAM** (lacznie ~14 GB).

---

## Krok 6: Uruchom ROS stack (Nav2 + SLAM + rosbridge + sensory)

**WAZNE: Isaac Sim MUSI byc w pelni zaladowany (topiki ROS 2 widoczne) zanim uruchomisz ten krok.**

```bash
ssh -i $SSH_KEY $SSH_OPTS $EC2_HOST "tmux new-session -d -s ros-stack 'bash -c \"conda deactivate 2>/dev/null; source /opt/ros/humble/setup.bash && source ~/ros2_ws/install/setup.bash && ros2 launch sras_bringup go2_stack.launch.py use_sim_time:=false map:=/home/ubuntu/maps/office_map.yaml nav2_params:=/home/ubuntu/go2_nav2/config/nav2_params.yaml pointcloud_in:=/robot0/point_cloud2_L1 scan_out:=/scan cmd_vel_in:=/cmd_vel cmd_vel_robot:=/robot0/cmd_vel camera_rgb:=/robot0/front_cam/rgb pointcloud_throttled:=/robot0/point_cloud2_L1_throttled camera_throttled:=/robot0/front_cam/rgb_throttled posegraph_file:=/home/ubuntu/maps/office_posegraph slam_deserialize_delay_s:=5.0 openai_base_url:=http://localhost:1234/v1 openai_api_key:=lmstudio openai_model:=zai-org/glm-4.6v-flash\"'"
```

Weryfikacja po 15-20s:

```bash
ssh -i $SSH_KEY $SSH_OPTS $EC2_HOST "tmux capture-pane -t ros-stack -p | tail -15"
```

Oczekiwane w logach:

- `Resizing costmap to XXX X YYY` - Nav2 planner zaladowal mape
- `Finished serializing Mapper` - SLAM zaladowal posegraph
- `process has finished cleanly` - skrypt deserializacji zakonczony

Port rosbridge: **0.0.0.0:9090** (WebSocket).

---

## Krok 7: Uruchom WebSocket Server (Bun)

```bash
ssh -i $SSH_KEY $SSH_OPTS $EC2_HOST \
  "tmux new-session -d -s ws-backend 'bash -l -c \"export PATH=/home/ubuntu/.bun/bin:\$PATH && cd /home/ubuntu/dashboard-backend/websocket-server && bun run src/index.ts\"'"
```

Weryfikacja po 5-10s:

```bash
ssh -i $SSH_KEY $SSH_OPTS $EC2_HOST "tmux capture-pane -t ws-backend -p | tail -10"
```

Oczekiwane w logach:

```
Received rosbridge publish topic: "/robot0/odom"
Received rosbridge publish topic: "/scan"
Received rosbridge publish topic: "/robot0/front_cam/rgb"
```

Health check z lokalnej maszyny:

```bash
curl -s http://63.182.177.92:8080/health
```

Oczekiwany wynik:

```json
{"status":"healthy","timestamp":...,"uptime":...,"connectedClients":0,"runtime":"bun"}
```

Port: **0.0.0.0:8080** (Socket.IO + HTTP API).

---

## Krok 8: Weryfikacja calego stacku

### Szybka weryfikacja (jedno polecenie):

```bash
ssh -i $SSH_KEY $SSH_OPTS $EC2_HOST \
  "echo '=== Tmux Sessions ===' && tmux list-sessions && echo '' && echo '=== Ports ===' && ss -tlnp | grep -E '(8080|9090|1984|1234|8443)' && echo '' && echo '=== GPU ===' && nvidia-smi --query-gpu=name,memory.used,memory.total,utilization.gpu,temperature.gpu --format=csv"
```

### Oczekiwany wynik pelnego stacku:

**4 sesje tmux:**

```
isaac-sim    - Isaac Sim (symulacja robota)
vision-llm   - LM Studio z modelem glm-4.6v-flash
ros-stack    - Nav2 + SLAM + rosbridge + sensory
ws-backend   - Bun WebSocket Server
```

**5 portow nasluchujacych:**

```
1234  - LM Studio (localhost only, Vision LLM API)
1984  - go2rtc (WebRTC video streaming)
8080  - Bun WebSocket Server (Socket.IO)
8443  - DCV (zdalny pulpit)
9090  - rosbridge_server (ROS 2 WebSocket bridge)
```

**GPU:**

```
NVIDIA L4, ~14100 MiB / 23034 MiB, 30-40%, 50-55C
```

### Health check z zewnatrz:

```bash
curl -s http://63.182.177.92:8080/health | python3 -m json.tool
```

---

## Kolejnosc uruchamiania (WAZNE)

```
1. EC2 start          (aws ec2 start-instances)
2. DCV session        (sudo dcv create-session)  [opcjonalne]
3. Isaac Sim          (tmux: isaac-sim)           [czekaj 3-5 min na pelny start]
4. Vision LLM        (tmux: vision-llm)          [czekaj 15-20s na model load]
5. ROS stack          (tmux: ros-stack)           [WYMAGA: Isaac Sim gotowy]
6. WS Backend         (tmux: ws-backend)          [WYMAGA: rosbridge na :9090]
```

Zaleznosci:

- Krok 5 (ROS stack) **musi** czekac na krok 3 (Isaac Sim) - ROS 2 topics musza byc dostepne
- Krok 6 (WS Backend) **musi** czekac na krok 5 (ROS stack) - rosbridge musi nasluchiwac na :9090
- Krok 4 (Vision LLM) jest **niezalezny** - moze byc uruchomiony rownolegle z oczekiwaniem na Isaac Sim

---

## Rozwiazywanie problemow

### Isaac Sim nie startuje

```bash
ssh -i $SSH_KEY $SSH_OPTS $EC2_HOST "tmux capture-pane -t isaac-sim -p -S -200 | grep -i error"
```

### Brak ROS topikow po 5 minutach

```bash
ssh -i $SSH_KEY $SSH_OPTS $EC2_HOST "source /opt/ros/humble/setup.bash && ros2 topic list && ros2 node list"
```

### WebSocket server nie laczy sie z rosbridge

```bash
ssh -i $SSH_KEY $SSH_OPTS $EC2_HOST "ss -tlnp | grep 9090"
```

Jesli port 9090 nie nasluchuje - ros-stack nie uruchomil sie poprawnie.

### GPU OOM

```bash
ssh -i $SSH_KEY $SSH_OPTS $EC2_HOST "nvidia-smi"
```

L4 ma 23 GB VRAM. Isaac Sim + Vision LLM = ~14 GB. Jesli >20 GB - problem.

### Restart pojedynczego komponentu

```bash
# Zamknij sesje
ssh -i $SSH_KEY $SSH_OPTS $EC2_HOST "tmux kill-session -t <nazwa>"
# Uruchom ponownie (odpowiednia komenda z krokow 4-7)
```

---

## Zatrzymanie stacku

Kolejnosc: odwrotna do uruchamiania.

```bash
# 1. Zamknij WS backend
ssh -i $SSH_KEY $SSH_OPTS $EC2_HOST "tmux kill-session -t ws-backend"

# 2. Zamknij ROS stack
ssh -i $SSH_KEY $SSH_OPTS $EC2_HOST "tmux kill-session -t ros-stack"

# 3. Zamknij Vision LLM
ssh -i $SSH_KEY $SSH_OPTS $EC2_HOST "tmux kill-session -t vision-llm"

# 4. Zamknij Isaac Sim
ssh -i $SSH_KEY $SSH_OPTS $EC2_HOST "tmux kill-session -t isaac-sim"

# 5. Zatrzymaj instancje EC2
aws ec2 stop-instances --instance-ids $INSTANCE_ID
```

Lub jednym poleceniem (wszystko na raz):

```bash
ssh -i $SSH_KEY $SSH_OPTS $EC2_HOST "tmux kill-server" && aws ec2 stop-instances --instance-ids $INSTANCE_ID
```
