# go2rtc Setup

## Role In Architecture

go2rtc is the video proxy runtime between camera producers and browser consumers:

- Inputs: RTSP camera streams from simulators or real devices.
- Proxy/transcode layer: go2rtc normalizes and republishes streams.
- Outputs: low-latency WebRTC and MSE endpoints for dashboard playback.

In this repository it runs as a Docker service on `robot-network` and exposes:

- `1984`: go2rtc API + WebRTC + MSE access
- `8554`: go2rtc RTSP server

## Configure Camera Sources

Primary source is controlled by environment variable:

```bash
GO2RTC_RTSP_SOURCE=rtsp://localhost:8554/camera1
```

Default value if not provided:

```text
rtsp://localhost:8554/camera1
```

The configured source is mapped to stream id `camera1` in `infra/go2rtc/go2rtc.yaml`.

## Access Streams

After startup (`docker compose -f docker/docker-compose.yml up -d go2rtc`):

- API health: `http://localhost:1984/api`
- Web UI: `http://localhost:1984/`
- WebRTC stream: open stream `camera1` from the go2rtc UI/player endpoints
- MSE stream: available through go2rtc player endpoints for `camera1`

## Troubleshooting

- Healthcheck failing:
  - Verify container is running: `docker compose -f docker/docker-compose.yml ps go2rtc`
  - Check logs: `docker compose -f docker/docker-compose.yml logs go2rtc`
  - Confirm API is reachable: `curl -f http://localhost:1984/api`
- No video in WebRTC/MSE:
  - Validate `GO2RTC_RTSP_SOURCE` points to a reachable RTSP URL.
  - Confirm source stream is playable with an RTSP client.
  - Check firewall/port mapping for `1984` and `8554`.
- Stream resolves locally but not remotely:
  - Configure proper ICE/STUN/TURN candidates in `infra/go2rtc/go2rtc.yaml` for your network topology.
