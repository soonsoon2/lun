#!/usr/bin/env python3
"""Lun UI/UX v3 — hybrid: 3D for hero, simple letter avatars for chat."""
import json, base64, os, time
from pathlib import Path
import urllib.request

API_KEY = os.getenv("SAM_API_KEY", "sam-a906c4338fadbe872ac36c1bc2405f8fe2c1b2ab6fd5508a")
BASE_URL = "https://sam.soonsoon.ai"
OUT_DIR = Path(__file__).parent / "references-v3"
OUT_DIR.mkdir(exist_ok=True)


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


COMMON = (
    "Background: deep navy black (#0a0a0e) with subtle radial gradient and very faint particle bokeh. "
    "Typography: clean modern sans-serif (Pretendard/Inter style), high contrast white text. "
    "Premium aesthetic inspired by Linear, Raycast, Apple visionOS. "
    "Generous spacing, smooth gradients, soft shadows. "
)

REFERENCES = [
    {
        "name": "01-round-table-v3",
        "size": "1536x1024",
        "prompt": (
            "AI multi-agent discussion app, 'Round Table' mode. "
            "Top center hero area: ONE large prominent 3D glassmorphic green character (the PM Moderator) "
            "with a clear elevated glass stage beneath it and 'PM Moderator' label below. "
            "Below the PM, in horizontal row: 3 SIMPLE rectangular agent cards (NOT 3D blobs). "
            "Each card has: a small circular letter avatar (capital letter 'K', 'C', 'Co') with solid "
            "colored background (purple/orange/green), agent name in bold, sample response text excerpt, "
            "tiny response time badge ('4.2s'). "
            "Cards have subtle colored border matching the agent (purple, orange, green). "
            "Bottom: clean synthesis summary card with icon + bullet points. "
            f"{COMMON}"
            "Strong contrast between the 3D PM character and the flat panel cards. Desktop UI 1536x1024."
        ),
    },
    {
        "name": "02-chat-mode-v3",
        "size": "1536x1024",
        "prompt": (
            "AI chat app PM-led mode, premium dark UI. "
            "Simple two-column layout. "
            "Left sidebar (narrow): just session history list with timestamps. "
            "Main area: vertical chat flow with HIGH CONTRAST bubbles. "
            "User messages on right: solid purple bubbles with white text. "
            "PM moderator on right: solid teal-green bubbles with white text and small green 'Mod' badge. "
            "Specialist agents on left: dark gray cards with bold colored letter avatars "
            "(circle with 'K' on purple bg, 'C' on orange bg, 'Co' on green bg). "
            "Each message has tiny gray response time text below. "
            "Bottom: minimal floating input bar with mode pills (Chat / Discuss / Ask). "
            f"{COMMON}"
            "NO 3D characters in chat — letter avatars only. Desktop 1536x1024."
        ),
    },
    {
        "name": "03-compare-mode-v3",
        "size": "1536x1024",
        "prompt": (
            "AI comparison view, 3 vertical cards side-by-side, BOLD color differentiation. "
            "Each card has: STRONG colored top border (3px solid purple/orange/green), "
            "circular letter avatar at top (K/C/Co), agent name, response text. "
            "Top section: LARGE consensus visualization — horizontal bar showing 'Consensus' "
            "with green checkmark agreement points and amber warning conflict points. "
            "Cards have generous breathing room, NO crowded text. "
            "Bottom: prominent 'Recommendation' card summarizing the verdict. "
            f"{COMMON}"
            "Minimalist, scannable, desktop 1536x1024."
        ),
    },
    {
        "name": "04-mobile-chat-v3",
        "size": "1024x1536",
        "prompt": (
            "Mobile AI chat app, vertical phone screen, dark mode. "
            "Top: minimal header with 'Lun' wordmark and small status dot. "
            "Center: chat bubbles with HIGH CONTRAST. "
            "User: right-aligned solid purple bubble. "
            "PM: right-aligned solid teal-green bubble with white 'Mod' tag. "
            "Panelists: left-aligned dark cards with circular letter avatars "
            "('K' purple, 'C' orange, 'Co' green). "
            "Each bubble shows agent name + tiny response time. "
            "Bottom: slim floating tab bar with 3 mode pills only (Chat / Discuss / Ask) — "
            "NO chip overflow. "
            f"{COMMON}"
            "Premium iOS feel, lots of whitespace. Vertical phone 1024x1536."
        ),
    },
    {
        "name": "05-hero-v3",
        "size": "1536x1024",
        "prompt": (
            "Hero/onboarding screen for 'Lun' multi-agent AI tool. "
            "Center stage: 5 distinct 3D glass characters arranged elegantly around a glowing circular platform "
            "viewed slightly from above and front. "
            "Each character is a unique blob shape with vivid color: "
            "tall purple (Kiro), squat orange (Claude), rounded green (Copilot), "
            "tall blue (Gemini), small pink (Codex). "
            "Soft glowing connection lines between characters. "
            "Above scene: bold large title 'One question. Multiple minds.' (centered, white). "
            "Below: subtitle 'Set up your AI panel' and prominent CTA button 'Get started' in violet. "
            "NO overlapping labels — clean composition. "
            f"{COMMON}"
            "Polished, inviting, 1536x1024 desktop."
        ),
    },
]


def main():
    print(f"Generating {len(REFERENCES)} v3 images (hybrid style)...\n")
    for ref in REFERENCES:
        generate(**ref)
        time.sleep(1)
    print(f"\nDone. Files at: {OUT_DIR}")


if __name__ == "__main__":
    main()
