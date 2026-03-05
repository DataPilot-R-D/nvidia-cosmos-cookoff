FROM nvcr.io/nvidia/cuda:12.2.0-runtime-ubuntu22.04

ENV DEBIAN_FRONTEND=noninteractive

# GStreamer + NVENC plugins
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 python3-pip python3-gi \
    gstreamer1.0-tools \
    gstreamer1.0-plugins-base \
    gstreamer1.0-plugins-good \
    gstreamer1.0-plugins-bad \
    gstreamer1.0-rtsp \
    gir1.2-gst-rtsp-server-1.0 \
    libgstreamer1.0-dev \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY requirements.txt .
RUN pip3 install --no-cache-dir -r requirements.txt

COPY . .

EXPOSE 8557

ENTRYPOINT ["python3", "exporter.py"]
CMD ["--port", "8557"]
