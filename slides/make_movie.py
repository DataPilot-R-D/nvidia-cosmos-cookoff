#!/usr/bin/env python3
"""
SRAS Presentation Movie Pipeline v2
1. Generate audio from SRT narration via OpenAI TTS
2. Record the actual animated presentation via Playwright (real transitions!)
3. Combine: scale video to match audio duration, mix together
"""

import os
import re
import subprocess
import time
from pathlib import Path
from openai import OpenAI

# ─── Config ─────────────────────────────────────────────────────────────────
DIST_DIR    = Path(__file__).parent / "dist"
SRT_FILE    = DIST_DIR / "narration.srt"
OUT_DIR     = Path(__file__).parent / "movie_build"
AUDIO_FILE  = OUT_DIR / "narration.mp3"
OUTPUT_FILE = Path(__file__).parent / "sras-presentation.mp4"

PRESENTATION_URL = "https://datapilot-nvidia-hackathon.netlify.app"

# Slide durations (seconds) — must sum to match SRT total
SLIDE_DURATIONS = [5, 20, 20, 10, 20, 25, 20, 10, 25, 15, 13]  # 183s (SRT ends at 3:03)

TTS_VOICE = "onyx"
TTS_MODEL = "tts-1-hd"


# ─── SRT parsing ────────────────────────────────────────────────────────────
def srt_to_seconds(ts: str) -> float:
    h, m, rest = ts.split(":")
    s, ms = rest.split(",")
    return int(h) * 3600 + int(m) * 60 + int(s) + int(ms) / 1000.0


def parse_srt(srt_path: Path):
    blocks = srt_path.read_text(encoding="utf-8").strip().split("\n\n")
    segments = []
    for block in blocks:
        lines = block.strip().split("\n")
        if len(lines) < 3:
            continue
        start, end = lines[1].split(" --> ")
        text = " ".join(l.strip() for l in lines[2:])
        segments.append({
            "start": srt_to_seconds(start.strip()),
            "end":   srt_to_seconds(end.strip()),
            "text":  text,
        })
    return segments


def extract_text(segments) -> str:
    return " ".join(s["text"] for s in segments)


# ─── Step 1: Generate audio ──────────────────────────────────────────────────
def generate_audio(text: str, out_path: Path) -> float:
    print(f"🎤 Generating TTS audio ({len(text.split())} words)...")
    client = OpenAI(api_key=os.environ["OPENAI_API_KEY"])
    response = client.audio.speech.create(
        model=TTS_MODEL,
        voice=TTS_VOICE,
        input=text,
        response_format="mp3",
    )
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_bytes(response.content)
    # measure actual duration
    result = subprocess.run(
        ["ffprobe", "-v", "quiet", "-show_entries", "format=duration",
         "-of", "default=noprint_wrappers=1:nokey=1", str(out_path)],
        capture_output=True, text=True
    )
    duration = float(result.stdout.strip())
    size_kb = out_path.stat().st_size // 1024
    print(f"✅ Audio: {duration:.1f}s  ({size_kb} KB)  → {out_path.name}")
    return duration


def get_audio_duration(path: Path) -> float:
    r = subprocess.run(
        ["ffprobe", "-v", "quiet", "-show_entries", "format=duration",
         "-of", "default=noprint_wrappers=1:nokey=1", str(path)],
        capture_output=True, text=True
    )
    return float(r.stdout.strip())


# ─── Step 2: Patch presentation timing to match audio ───────────────────────
def patch_presentation_timing(js_path: Path, audio_duration: float):
    """
    Scale all slideTiming values so that their sum matches audio_duration.
    """
    total_slide_time = sum(SLIDE_DURATIONS)
    scale = audio_duration / total_slide_time
    new_durations = [round(d * scale * 1000) for d in SLIDE_DURATIONS]

    print(f"⏱  Audio: {audio_duration:.1f}s  |  Slide sum: {total_slide_time}s  |  Scale: {scale:.3f}")

    content = js_path.read_text()
    # Extract current slideTiming block and replace totals
    # Pattern: { total: NNNNN, fragments: N }
    pattern = re.compile(r'\{\s*total:\s*\d+,\s*fragments:\s*(\d+)\s*\}')
    matches = list(pattern.finditer(content))

    if len(matches) != len(new_durations):
        print(f"⚠️  Expected {len(new_durations)} timing entries, found {len(matches)} — skipping patch")
        return

    result = content
    offset = 0
    for i, m in enumerate(matches):
        frags = m.group(1)
        new_str = f'{{ total: {new_durations[i]}, fragments: {frags} }}'
        start = m.start() + offset
        end   = m.end()   + offset
        result = result[:start] + new_str + result[end:]
        offset += len(new_str) - (m.end() - m.start())

    js_path.write_text(result)
    print(f"✅ Patched {len(new_durations)} slide timings")


# ─── Step 3: Deploy patched presentation ────────────────────────────────────
def deploy_to_netlify(project_dir: Path):
    print("🚀 Deploying updated presentation to Netlify...")
    result = subprocess.run(
        ["netlify", "deploy", "--dir=slides/dist", "--prod", "--message", "video: timing sync + CSS fixes"],
        cwd=str(project_dir),
        capture_output=True, text=True
    )
    if result.returncode != 0:
        print(result.stderr[-1000:])
        raise RuntimeError("Netlify deploy failed")
    print("✅ Deployed")


# ─── Step 4: Record browser video ───────────────────────────────────────────
def record_browser_video(duration: float, out_dir: Path) -> Path:
    from playwright.sync_api import sync_playwright

    out_dir.mkdir(parents=True, exist_ok=True)
    video_path = None

    print(f"🎬 Recording browser presentation ({duration:.0f}s)...")
    print(f"   URL: {PRESENTATION_URL}?auto")

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True, args=["--no-sandbox"])
        context = browser.new_context(
            viewport={"width": 1920, "height": 1080},
            record_video_dir=str(out_dir),
            record_video_size={"width": 1920, "height": 1080},
        )
        page = context.new_page()
        page.goto(f"{PRESENTATION_URL}?auto", wait_until="networkidle", timeout=30000)

        # Wait for full presentation to play through
        wait_s = duration + 5  # small buffer
        print(f"   Waiting {wait_s:.0f}s for presentation to complete...")
        time.sleep(wait_s)

        page.close()
        context.close()
        browser.close()

    # Find the recorded webm file
    videos = list(out_dir.glob("*.webm"))
    if not videos:
        raise RuntimeError("No video file recorded by Playwright")
    video_path = sorted(videos)[-1]
    print(f"✅ Browser video: {video_path.name} ({video_path.stat().st_size // 1024} KB)")
    return video_path


# ─── Step 5: Combine video + audio ──────────────────────────────────────────
def combine(video_path: Path, audio_path: Path, out_path: Path, audio_duration: float):
    print("🎞  Combining video + audio with ffmpeg...")
    cmd = [
        "ffmpeg", "-y",
        "-i", str(video_path),
        "-i", str(audio_path),
        "-c:v", "libx264", "-preset", "medium", "-crf", "18",
        "-c:a", "aac", "-b:a", "192k",
        "-pix_fmt", "yuv420p",
        "-vf", "scale=1920:1080:force_original_aspect_ratio=decrease,pad=1920:1080:(ow-iw)/2:(oh-ih)/2",
        "-shortest",
        str(out_path),
    ]
    result = subprocess.run(cmd, capture_output=True, text=True)
    if result.returncode != 0:
        print(result.stderr[-2000:])
        raise RuntimeError("ffmpeg failed")
    size_mb = out_path.stat().st_size / 1024 / 1024
    print(f"✅ Output: {out_path}  ({size_mb:.1f} MB)")


# ─── Main ────────────────────────────────────────────────────────────────────
if __name__ == "__main__":
    project_dir = Path(__file__).parent.parent  # nvidia-hackathon-demo/
    js_path = DIST_DIR / "presentation.js"

    print("=== SRAS Presentation Movie Pipeline v2 ===\n")

    # 1. Audio
    if not AUDIO_FILE.exists():
        segments = parse_srt(SRT_FILE)
        text = extract_text(segments)
        audio_duration = generate_audio(text, AUDIO_FILE)
    else:
        audio_duration = get_audio_duration(AUDIO_FILE)
        print(f"⏭  Audio cache: {audio_duration:.1f}s  → {AUDIO_FILE.name}")

    # 2. Patch timing
    patch_presentation_timing(js_path, audio_duration)

    # 3. Deploy updated presentation
    deploy_to_netlify(project_dir)
    print("   Waiting 10s for CDN propagation...")
    time.sleep(10)

    # 4. Record
    video_dir = OUT_DIR / "browser_recording"
    raw_video = record_browser_video(audio_duration, video_dir)

    # 5. Combine
    combine(raw_video, AUDIO_FILE, OUTPUT_FILE, audio_duration)

    print(f"\n🚀 Done! → {OUTPUT_FILE}")
