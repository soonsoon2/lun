#!/usr/bin/env python3
"""Lun UI/UX v2 — unified 3D glassmorphic character style."""
import json, base64, os, time
from pathlib import Path
import urllib.request

API_KEY = os.getenv("SAM_API_KEY", "sam-a906c4338fadbe872ac36c1bc2405f8fe2c1b2ab6fd5508a")
BASE_URL = "https://sam.soonsoon.ai"
OUT_DIR = Path(__file__).parent / "references-v2"
OUT_DIR.mkdir(exist_ok=True)

# Shared style guide for consistency
STYLE_GUIDE = (
    "Style: 3D glassmorphic minimalist characters as agent avatars (rounded translucent blobs with soft inner glow). "
    "Each agent has a distinct color: Kiro purple, Claude orange, Copilot green, Gemini blue, Codex pink. "
    "Background: deep navy black with subtle radial gradient and soft particle bokeh. "
    "Cards: glassmorphism with backdrop blur and thin colored borders. "
    "Typography: clean modern sans-serif (like Pretendard/Inter). "
    "Premium, polished, inspired by Linear, Raycast, and Apple visionOS aesthetics. "
    "Smooth gradients, soft shadows, generous spacing."
)


def generate(name, size, prompt, model="gpt-image-2"):
    print(f"→ {name} ({size})", flush=True)
    start = time.time()
    body = json.dumps({
        "model": model,
        "messages": [{"role": "user", "content": prompt}],
        "options": {"stream": False, "size": size},
    }).encode("utf-8")
    req = urllib.request.Request(
        f"{BASE_URL}/v1/generate", data=body,
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
    out = OUT_DIR / f"{name}.png"
    out.write_bytes(img)
    print(f"  ✓ {len(img)//1024}KB  {time.time()-start:.1f}s", flush=True)


REFERENCES = [
    {
        "name": "01-round-table-v2",
        "size": "1536x1024",
        "prompt": (
            "AI multi-agent discussion app UI in 'Round Table' mode. "
            "Center stage at top: large prominent moderator card with a 3D green glass character (the PM). "
            "Below in a curved arc: 3 panelist cards each containing a small 3D glass character avatar "
            "(purple Kiro, orange Claude, green Copilot) with sample text response and tiny timestamp. "
            "Each card has subtle colored border matching its character. "
            "PM card is visually larger and elevated to show hierarchy. "
            "Bottom: a clean synthesis result card with bullet points. "
            f"{STYLE_GUIDE} "
            "1536x1024 desktop UI screenshot."
        ),
    },
    {
        "name": "02-chat-mode-v2",
        "size": "1536x1024",
        "prompt": (
            "AI chat app in PM-led mode. Clean simple two-column layout (no busy sidebars). "
            "Left side: minimal session history list. "
            "Right main area: vertical chat flow. "
            "User messages on right in purple bubbles. "
            "PM (moderator) responses on right with a 3D green glass character avatar and 'Mod' tag. "
            "Specialist agents (purple Kiro, orange Claude) on left with their 3D glass character avatars. "
            "Each agent's avatar is a small rounded translucent blob, no faces. "
            "Subtle response time and model name in tiny gray text. "
            "Bottom: minimal floating input bar with mode pills (Chat / Discuss / Ask). "
            f"{STYLE_GUIDE} "
            "Desktop 1536x1024 screenshot."
        ),
    },
    {
        "name": "03-compare-mode-v2",
        "size": "1536x1024",
        "prompt": (
            "AI comparison view, 3 vertical cards side-by-side. "
            "Each card has a 3D glass character at top (purple Kiro / orange Claude / green Copilot) "
            "and a clean text response below. Generous whitespace. "
            "Above: simple consensus indicator showing common points in green tags, differences in amber tags. "
            "Below: clean voting bar '2 of 3 agree' visualization. "
            "Minimalist, NOT crowded. Lots of breathing room. "
            f"{STYLE_GUIDE} "
            "1536x1024 desktop screenshot."
        ),
    },
    {
        "name": "04-mobile-chat-v2",
        "size": "1024x1536",
        "prompt": (
            "Mobile AI multi-agent chat app, dark mode, vertical phone screen. "
            "Top: minimal header with 'Lun' wordmark. "
            "Center: chat bubbles with 3D glass character avatars next to each message. "
            "User: right-side purple bubble. "
            "Moderator (PM): right-side green bubble with green glass character. "
            "Panelists: left-side bubbles with their colored glass characters (purple, orange). "
            "Bottom: slim floating input bar with subtle mode toggle. "
            "Lots of whitespace, premium iOS-inspired design. "
            f"{STYLE_GUIDE} "
            "Vertical phone screenshot 1024x1536."
        ),
    },
    {
        "name": "05-hero-v2",
        "size": "1536x1024",
        "prompt": (
            "Hero/onboarding screen for 'Lun' multi-agent AI tool. "
            "Center: 5 distinct 3D glass characters arranged around an elegant circular table viewed slightly from above. "
            "Each character has unique color and shape (purple Kiro, orange Claude, green Copilot, blue Gemini, pink Codex). "
            "Above the scene: bold large title 'One question. Multiple minds.' "
            "Below: subtitle 'Set up your AI panel' and a single primary CTA button labeled 'Get started'. "
            "Soft glowing connection lines between the characters suggesting communication. "
            f"{STYLE_GUIDE} "
            "1536x1024 desktop screenshot, polished, inviting."
        ),
    },
]


def main():
    print(f"Generating {len(REFERENCES)} v2 images (unified 3D glass style)...\n")
    for ref in REFERENCES:
        generate(**ref)
        time.sleep(1)
    print(f"\nDone. Files at: {OUT_DIR}")


if __name__ == "__main__":
    main()
