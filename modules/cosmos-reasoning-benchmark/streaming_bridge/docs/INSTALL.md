# go2rtc + Streaming Bridge Install and Runbook

## 1. Install go2rtc Binary

1. Download the latest Linux binary from go2rtc GitHub Releases.
2. Install it to `/usr/local/bin/go2rtc` and make it executable.

```bash
sudo curl -fL -o /usr/local/bin/go2rtc \
  https://github.com/AlexxIT/go2rtc/releases/latest/download/go2rtc_linux_amd64
sudo chmod +x /usr/local/bin/go2rtc
/usr/local/bin/go2rtc -version
```

## 2. Install go2rtc Configuration

1. Create config directory:

```bash
sudo mkdir -p /etc/go2rtc
```

2. Copy template from this repo:

```bash
sudo cp streaming_bridge/config/go2rtc.yaml /etc/go2rtc/go2rtc.yaml
```

This template exposes:
- API/UI on `:1984`
- RTSP on `:8554`
- WebRTC signaling on `:8555`
- Streams: `front_camera`, `rear_camera`

## 3. ROS Image-to-RTSP Bridge

Run the ROS2 node that publishes RTSP feeds consumed by go2rtc:

```bash
ros2 launch sras_streaming_bridge streaming_bridge.launch.py
```

Default stream mapping:
- `front_camera` from `/camera/front/image_raw`
- `rear_camera` from `/camera/rear/image_raw`

## 4. Install systemd Service

A unit template is provided at `streaming_bridge/config/go2rtc.service`.

```bash
sudo cp streaming_bridge/config/go2rtc.service /etc/systemd/system/go2rtc.service
sudo systemctl daemon-reload
sudo systemctl enable --now go2rtc
sudo systemctl status go2rtc
```

## 5. Verification

1. Verify API:

```bash
curl -s http://localhost:1984/api/streams | jq .
```

2. Verify stream availability in go2rtc:

```bash
curl -s http://localhost:1984/api/streams/front_camera | jq .
curl -s http://localhost:1984/api/streams/rear_camera | jq .
```

3. Open WebRTC viewer in browser:

- `http://<host>:1984/`
- Select `front_camera` or `rear_camera`

4. Verify ROS bridge status:

```bash
ros2 topic echo /sras_streaming_bridge/stream_status
ros2 service call /sras_streaming_bridge/get_status std_srvs/srv/Trigger
```

## 6. Typical Operational Checks

- `journalctl -u go2rtc -f`
- Confirm ffmpeg processes exist for each stream.
- Confirm incoming ROS images are `bgr8` and match configured width/height.
