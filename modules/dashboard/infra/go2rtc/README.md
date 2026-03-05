# go2rtc Runtime

This directory contains the runtime setup for `go2rtc`, used as the video proxy layer between camera RTSP sources and browser-friendly outputs.

## Files

- `go2rtc.yaml` - go2rtc runtime configuration.
- `Dockerfile` - image wrapper based on the official `alexxit/go2rtc` image.

## Deploy

From project root:

```bash
docker compose -f docker/docker-compose.yml up -d go2rtc
```

For development overrides:

```bash
docker compose -f docker/docker-compose.yml -f docker/docker-compose.dev.yml up -d go2rtc
```

## Configuration

Set `GO2RTC_RTSP_SOURCE` to override the default RTSP camera URL:

```bash
export GO2RTC_RTSP_SOURCE="rtsp://localhost:8554/camera1"
```

The stream is exposed as `camera1` and can be consumed through go2rtc WebRTC/MSE endpoints on port `1984`.
