#!/usr/bin/env python3
"""Lun UI/UX v4 — developer-tool aesthetic (Linear/Stripe/Raycast inspired)."""
import json, base64, os, time
from pathlib import Path
import urllib.request

API_KEY = os.getenv("SAM_API_KEY", "sam-a906c4338fadbe872ac36c1bc2405f8fe2c1b2ab6fd5508a")
BASE_URL = "https://sam.soonsoon.ai"
OUT_DIR = Path(__file__).parent / "references-v4"
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
    "Style: PREMIUM DEVELOPER TOOL UI inspired by Linear, Stripe Dashboard, Vercel, Raycast. "
    "Background: deep cool dark (#0a0a0f) with very subtle grid pattern overlay. "
    "Typography: pairs Inter sans-serif body with JetBrains Mono for code/data. "
    "Color palette: monochrome dark base + ONE accent color per agent: "
    "Kiro = soft violet (#a78bfa), Claude = warm amber (#f59e0b), "
    "Copilot = mint green (#4ade80), Gemini = sky blue (#60a5fa), Codex = rose (#fb7185). "
    "Subtle 1px borders, NO heavy shadows, slight neon glow on active elements only. "
    "Data-dense but elegant: token counters, response time charts, status pills. "
    "Use technical hex codes, latency numbers, monospace timestamps as visual elements. "
    "Sharp corners with 6-8px radius, tight spacing rhythm, vertical alignment. "
    "Premium, controlled, NOT playful or cartoonish. "
)

REFERENCES = [
    {
        "name": "01-round-table-v4",
        "size": "1536x1024",
        "prompt": (
            "AI multi-agent discussion app, 'Discussion' mode. Developer tool aesthetic. "
            "Top header bar with 'lun' wordmark in monospace, breadcrumb 'Discussion / Round 2', "
            "status pills showing 'PM: Claude', '3 agents', '12.3s elapsed'. "
            "Main area: vertical timeline view with rounds. "
            "Round 1 section: PM moderator card (with small violet 'PM' badge in monospace) "
            "containing the question, then 3 agent response cards stacked below "
            "with monospace agent labels (kiro, claude, copilot) and accent color borders. "
            "Each card shows response text + footer with response time, token count, model name in monospace. "
            "Round 2 section partially visible below. "
            "Right side: thin sidebar with agent status indicators and a tiny latency chart. "
            f"{COMMON}"
            "1536x1024, looks like a serious developer tool."
        ),
    },
    {
        "name": "02-chat-mode-v4",
        "size": "1536x1024",
        "prompt": (
            "AI chat dev tool, PM-led mode. Linear/Vercel inspired dark UI. "
            "Top: minimal header with 'lun' monospace logo, command palette hint '⌘K', user avatar. "
            "Left sidebar (220px): session list with timestamps in monospace, agent connection status indicators "
            "(small dots showing online/offline). "
            "Main chat: clean message list. "
            "User messages aligned right with subtle 1px violet border, no fill. "
            "PM responses aligned left/center with accent color line and 'pm/claude' monospace label. "
            "Specialist responses inline with small monospace agent prefix like 'kiro@auto >' before text. "
            "Each message has a micro footer line showing 'sonnet · 1.2s · 340tk'. "
            "Bottom: floating command-style input bar with mode toggle (Chat / Discuss / Ask) and inline agent chips. "
            f"{COMMON}"
            "Sharp, technical, fast. 1536x1024."
        ),
    },
    {
        "name": "03-compare-mode-v4",
        "size": "1536x1024",
        "prompt": (
            "AI agent response comparison view, dashboard style. "
            "Top: query bar showing the input prompt in monospace, status row with 'comparing 3 agents'. "
            "Below: large consensus visualization — horizontal segmented bar with green segments for "
            "agreement points, amber for conflicts, with point counts ('3 agreed · 2 conflicts'). "
            "Main grid: 3 vertical response columns side-by-side with sharp 1px accent-colored top borders. "
            "Each column has agent header (monospace name + model + time + tokens), full response text, "
            "and a small score chart at bottom (response quality indicators). "
            "Right side: bottom right shows a small bar chart 'response time comparison'. "
            "Bottom: bold 'Recommendation' card synthesizing the verdict. "
            f"{COMMON}"
            "Looks like Stripe dashboard for AI. 1536x1024."
        ),
    },
    {
        "name": "04-mobile-chat-v4",
        "size": "1024x1536",
        "prompt": (
            "Mobile dev tool app showing AI multi-agent chat. Vertical phone screen. "
            "Top: thin status bar with 'lun' wordmark and connection dot. "
            "Center: clean chat list with monospace agent prefixes. "
            "User messages: right-aligned, thin violet border, no fill, monospace timestamp. "
            "PM messages: subtle teal accent line on left with 'pm >' prefix, white text, "
            "monospace footer 'claude · 1.2s · 340tk'. "
            "Specialist messages: each prefixed with monospace agent name in their accent color "
            "('kiro >', 'claude >', 'copilot >'), text in regular sans-serif. "
            "Bottom: minimal input with mode dropdown and Send button. "
            f"{COMMON}"
            "Looks like a serious mobile dev tool, not a casual chat app. 1024x1536."
        ),
    },
    {
        "name": "05-hero-v4",
        "size": "1536x1024",
        "prompt": (
            "Hero/landing page for 'lun' — multi-agent AI CLI tool. Developer-focused. "
            "Center: stylized terminal-like rounded container showing a sample lun chat interaction "
            "with monospace text output: '> lun \"compare REST vs GraphQL\"' "
            "followed by colored agent responses (each with monospace prefix and accent color stripe). "
            "Above the terminal: large bold tagline 'Multi-agent consensus, in your terminal.' "
            "Below tagline: subtitle 'lun · v1.6.0' in monospace, then primary CTA 'npm install lun -g'. "
            "Background: deep cool dark with subtle grid + soft glow halos behind the terminal. "
            "Tiny floating UI elements (latency badges, token counters) around the terminal "
            "to suggest active data flow. "
            f"{COMMON}"
            "Looks like Vercel/Linear/Stripe landing page. 1536x1024."
        ),
    },
]


def main():
    print(f"Generating {len(REFERENCES)} v4 images (developer-tool aesthetic)...\n")
    for ref in REFERENCES:
        generate(**ref)
        time.sleep(1)
    print(f"\nDone. Files at: {OUT_DIR}")


if __name__ == "__main__":
    main()
