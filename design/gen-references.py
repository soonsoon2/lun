#!/usr/bin/env python3
"""Generate Lun UI/UX reference images via SAM API."""
import json
import base64
import os
import sys
import time
from pathlib import Path
import urllib.request

API_KEY = os.getenv("SAM_API_KEY", "sam-a906c4338fadbe872ac36c1bc2405f8fe2c1b2ab6fd5508a")
BASE_URL = "https://sam.soonsoon.ai"
OUT_DIR = Path(__file__).parent / "references"
OUT_DIR.mkdir(exist_ok=True)


def generate(name: str, size: str, prompt: str, model: str = "gemini-3.1-flash-image-preview"):
    print(f"→ {name} ({size}, {model})", flush=True)
    start = time.time()
    body = json.dumps({
        "model": model,
        "messages": [{"role": "user", "content": prompt}],
        "options": {"stream": False, "size": size},
    }).encode("utf-8")

    req = urllib.request.Request(
        f"{BASE_URL}/v1/generate",
        data=body,
        headers={"X-API-Key": API_KEY, "Content-Type": "application/json"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=180) as resp:
            data = json.loads(resp.read())
    except Exception as e:
        print(f"  ✗ {e}")
        return

    if not data.get("ok"):
        print(f"  ✗ {data.get('detail', data)}")
        return

    img = base64.b64decode(data["output"]["images"][0]["data"])
    out_png = OUT_DIR / f"{name}.png"
    out_png.write_bytes(img)
    cost = data.get("cost", {}).get("cost_usd", 0)
    elapsed = time.time() - start
    print(f"  ✓ {len(img)//1024}KB  ${cost:.4f}  {elapsed:.1f}s  → {out_png.name}", flush=True)


REFERENCES = [
    {
        "name": "01-round-table",
        "size": "1920x1080",
        "prompt": (
            "Modern dark mode AI chat application UI design, 'Round Table' discussion view. "
            "Top center: large moderator card labeled 'PM Moderator' in soft green glow with avatar circle. "
            "Below in horizontal row: 3 agent panel cards each with distinct colored borders "
            "(purple for Kiro, orange for Claude, green for Copilot). "
            "Each card shows agent name, avatar circle, message bubble with text excerpt, and a small timer like '4.2s'. "
            "Bottom: synthesis card summarizing the discussion. "
            "Background: deep navy black with subtle radial gradient. "
            "Glassmorphism cards with backdrop blur. Elegant Pretendard-style sans-serif typography. "
            "Generous spacing, premium feel. "
            "Inspired by Linear and Raycast aesthetics. "
            "Desktop application screenshot at 1920x1080."
        ),
    },
    {
        "name": "02-chat-mode",
        "size": "1920x1080",
        "prompt": (
            "Dark mode chat application interface, 'PM-led Chat' view. "
            "Right-aligned messages: user prompts in purple bubbles. "
            "Right side also: PM moderator responses in green-tinted bubbles with small 'Mod' badge. "
            "Left-aligned: specialist agent responses with colored avatars "
            "(purple Kiro, orange Claude, green Copilot). "
            "Left sidebar showing session history list and small agent settings panel. "
            "Subtle response time and model name shown in tiny gray text under each message. "
            "Background: very dark slate with subtle gradient mesh texture. "
            "Glassmorphism on cards. "
            "Inspired by modern Discord and Linear app aesthetics. "
            "Clean, minimal, premium. 1920x1080 desktop screenshot."
        ),
    },
    {
        "name": "03-compare-mode",
        "size": "1920x1080",
        "prompt": (
            "AI agent comparison dashboard, dark mode. "
            "Three vertical columns side-by-side, each showing one AI agent's full response (Kiro/Claude/Copilot) "
            "with distinct top border color matching agent identity. "
            "Header bar above showing consensus indicators: common points highlighted in green, "
            "divergent points highlighted in amber. "
            "Bottom voting bar visualization showing '2 of 3 agree on X'. "
            "Cost and response time badges per column corner. "
            "Modern professional dashboard look, deep blue-black background, "
            "sharp typography, clear visual hierarchy. "
            "1920x1080 desktop screenshot."
        ),
    },
    {
        "name": "04-mobile-chat",
        "size": "1080x1920",
        "prompt": (
            "Mobile chat application in dark mode showing AI multi-agent discussion. "
            "Top: app header with 'Lun' logo and status dot. "
            "Center: chat bubbles — user messages on right in purple, "
            "moderator messages on right with green 'Mod' badge, "
            "panelist responses on left with colored avatars (purple, orange, green). "
            "Each message shows agent name and tiny response time. "
            "Bottom: input bar with mode pills (Chat/Discuss/Ask) and agent selection chips. "
            "Smooth iOS aesthetic, Pretendard font, deep dark background. "
            "Vertical 9:16 portrait phone screenshot."
        ),
    },
    {
        "name": "05-onboarding",
        "size": "1920x1080",
        "prompt": (
            "Onboarding hero screen for an AI multi-agent CLI tool called 'Lun'. "
            "Center: large hero illustration of 5 minimalist geometric AI agent characters around a circular table — "
            "each agent is a soft rounded shape with distinct color (purple, orange, green, blue, pink) "
            "and small label below. "
            "Above the illustration: large bold title 'One question. Multiple minds.' "
            "Below: subtitle 'Set up your AI panel' and a single primary CTA button. "
            "Modern dark mode with soft glowing accents, glassmorphism, deep navy background. "
            "Inspired by Linear, Notion, and Raycast onboarding screens. "
            "Clean, premium, inviting. 1920x1080 desktop application screenshot."
        ),
    },
]


def main():
    print(f"Generating {len(REFERENCES)} reference images...\n")
    for ref in REFERENCES:
        generate(**ref)
        time.sleep(1)
    print(f"\nDone. Files at: {OUT_DIR}")


if __name__ == "__main__":
    main()
