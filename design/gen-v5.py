#!/usr/bin/env python3
"""Lun UI/UX v5 — refined developer-tool with restrained hero accents."""
import json, base64, os, time
from pathlib import Path
import urllib.request

API_KEY = os.getenv("SAM_API_KEY", "sam-a906c4338fadbe872ac36c1bc2405f8fe2c1b2ab6fd5508a")
BASE_URL = "https://sam.soonsoon.ai"
OUT_DIR = Path(__file__).parent / "references-v5"
OUT_DIR.mkdir(exist_ok=True)


def generate(name, size, prompt, attempts=3):
    print(f"→ {name} ({size})", flush=True)
    start = time.time()
    body = json.dumps({
        "model": "gpt-image-2",
        "messages": [{"role": "user", "content": prompt}],
        "options": {"stream": False, "size": size},
    }).encode("utf-8")
    req = urllib.request.Request(
        f"{BASE_URL}/v1/generate", data=body,
        headers={"X-API-Key": API_KEY, "Content-Type": "application/json"},
        method="POST",
    )
    for attempt in range(attempts):
        try:
            with urllib.request.urlopen(req, timeout=180) as resp:
                data = json.loads(resp.read())
            if not data.get("ok"):
                print(f"  ✗ {data.get('detail', data)}")
                return
            img = base64.b64decode(data["output"]["images"][0]["data"])
            (OUT_DIR / f"{name}.png").write_bytes(img)
            print(f"  ✓ {len(img)//1024}KB  {time.time()-start:.1f}s")
            return
        except Exception as e:
            print(f"  attempt {attempt+1}: {e}")
            time.sleep(5)
    print(f"  ✗ failed after {attempts} attempts")


COMMON = (
    "Style: PREMIUM developer tool inspired by Linear, Stripe Dashboard, Vercel. "
    "Background: deep cool dark #0a0a0f with very subtle grid (barely visible). "
    "Typography rules: SANS-SERIF (Inter) for body text, JetBrains Mono ONLY for: "
    "agent identifiers, model names, latency numbers, token counts, timestamps. "
    "Color palette: monochrome dark + ONE accent per agent: "
    "kiro=violet #a78bfa, claude=amber #f59e0b, copilot=mint #4ade80. "
    "1px sharp borders, 6-8px radius, NO drop shadows, "
    "subtle glow only on active/focused elements. "
    "Tight rhythm, vertical alignment, controlled spacing. "
    "Premium, technical, controlled — Linear quality. "
)

REFERENCES = [
    {
        "name": "01-round-table-v5",
        "size": "1536x1024",
        "prompt": (
            "AI multi-agent discussion app, 'Discussion' mode, refined developer tool aesthetic. "
            "Top header: thin bar with 'lun' wordmark + breadcrumb 'Discussion / Round 2', "
            "right side has command palette hint '⌘K' and user avatar. "
            "Main area: timeline-style discussion view. "
            "Round 1 section: PM moderator card at top with monospace agent ID 'pm/claude' in violet, "
            "moderator's question in clean sans-serif. "
            "Below: 3 agent response cards horizontally. "
            "Each card: subtle 1px border, top-left has monospace agent label (kiro / claude / copilot) "
            "in their accent color, response text in clean sans-serif paragraph, "
            "footer row has monospace metadata 'sonnet · 4.2s · 340tk' in muted gray. "
            "PM synthesis card below — slightly elevated visual weight, violet accent. "
            "Right sidebar (220px): COLLAPSED status panel showing only active agent dot + small chart, "
            "everything else minimized. "
            f"{COMMON}"
            "Linear-quality desktop UI 1536x1024."
        ),
    },
    {
        "name": "02-chat-mode-v5",
        "size": "1536x1024",
        "prompt": (
            "AI chat dev tool, PM-led mode. Linear/Raycast-inspired. "
            "Top header: minimal 'lun' wordmark, breadcrumb, command palette '⌘K'. "
            "Left sidebar (220px): clean session list with monospace timestamps. "
            "Main chat: clean message stream. "
            "User messages: right-aligned, NO bubble — just clean text with thin violet vertical line on right. "
            "PM responses: left-aligned with 'pm/claude' monospace label in violet, then sans-serif response. "
            "Specialist responses: monospace prefix like 'kiro/auto >' in agent color, "
            "then sans-serif response text below. "
            "Footer per message: monospace metadata 'haiku · 1.2s · 340tk' very subtle gray. "
            "Bottom: COMMAND-PALETTE-STYLE input — sharp rectangular box with monospace '> ' prompt, "
            "agent chip selector inline, mode pills (chat/discuss/ask). "
            "NOT a chat bubble UI — looks like a terminal evolved. "
            f"{COMMON}"
            "1536x1024."
        ),
    },
    {
        "name": "03-compare-mode-v5",
        "size": "1536x1024",
        "prompt": (
            "AI comparison dashboard. Refined Stripe-dashboard aesthetic. "
            "Top: query bar with monospace prompt + status row. "
            "Below query: prominent consensus visualization — large segmented bar with "
            "green agreement segments, amber conflict segments, count badges. "
            "Main: 3 vertical comparison columns with STRONG 1px dividers between them and "
            "2-3px solid accent top borders (violet/amber/mint). "
            "Each column: agent header (BOLD agent name in mono + smaller model/time/tokens), "
            "well-formatted response with clear paragraph hierarchy, "
            "small consensus indicator dots showing which points agree. "
            "Bottom: 'Recommendation' card with elevated visual weight — "
            "single bold sentence verdict + reasoning. "
            "Right side: small horizontal bar chart 'response time comparison'. "
            f"{COMMON}"
            "Stripe-dashboard-for-AI vibe. 1536x1024."
        ),
    },
    {
        "name": "04-mobile-chat-v5",
        "size": "1024x1536",
        "prompt": (
            "Mobile dev tool, AI multi-agent chat. Vertical phone screen. "
            "Top: minimal status bar with 'lun' wordmark + connection status dot. "
            "Center: clean message list with monospace agent prefixes. "
            "User messages: right-aligned with thin violet right-border line, no bubble fill. "
            "PM messages: left side with 'pm/claude' monospace prefix in violet, sans-serif text. "
            "Specialist messages: left side with prefix like 'kiro/auto >' in agent color. "
            "Each message has subtle metadata footer (monospace, gray). "
            "DIFFERENTIATED hierarchy: PM messages have a subtle background tint, "
            "specialists are flat, user messages are alignment-only. "
            "Bottom: COMMAND-STYLE input — slim rectangular bar with monospace prompt '> ', "
            "small mode toggle and agent chip selector. NOT a chat bubble UI. "
            f"{COMMON}"
            "Linear mobile feel, 1024x1536."
        ),
    },
    {
        "name": "05-hero-v5",
        "size": "1536x1024",
        "prompt": (
            "Hero landing page for 'lun' multi-agent AI CLI. Premium developer-focused. "
            "Center stage: prominent terminal-like rounded card with sharp 1px border showing "
            "real-looking lun output: '> lun \"REST vs GraphQL\"' in monospace, "
            "then 3 agent responses each prefixed with monospace agent name in their accent color "
            "(kiro / claude / copilot), with realistic response excerpts. "
            "Right side of terminal: tiny floating UI BADGES (clean 1px bordered chips) — "
            "'sonnet · 1.2s', '340tk', '$0.012' showing data flow. "
            "Bottom-right of terminal: small 3D glassmorphic character (subtle, NOT decorative) "
            "as a tiny mascot representing the lun agent. "
            "Above terminal: bold tagline 'Multi-agent consensus, in your terminal.' (clean sans-serif). "
            "Below: monospace 'lun · v1.6.0' subtitle, then primary CTA button "
            "with monospace text 'npm install -g lun'. "
            "Background: deep dark #0a0a0f, very subtle grid pattern, NO decorative glow blobs. "
            "Slight ambient lighting only on the terminal card edges. "
            f"{COMMON}"
            "Looks like Vercel/Linear landing page, NOT a startup hero. 1536x1024."
        ),
    },
]


def main():
    print(f"Generating {len(REFERENCES)} v5 images (refined developer-tool)...\n")
    for ref in REFERENCES:
        generate(**ref)
        time.sleep(2)
    print(f"\nDone. Files at: {OUT_DIR}")


if __name__ == "__main__":
    main()
