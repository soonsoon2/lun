#!/usr/bin/env python3
"""Retry failed v4 images."""
import json, base64, os, time
from pathlib import Path
import urllib.request

API_KEY = os.getenv("SAM_API_KEY", "sam-a906c4338fadbe872ac36c1bc2405f8fe2c1b2ab6fd5508a")
BASE_URL = "https://sam.soonsoon.ai"
OUT_DIR = Path(__file__).parent / "references-v4"

COMMON = (
    "Style: PREMIUM DEVELOPER TOOL UI inspired by Linear, Stripe Dashboard, Vercel, Raycast. "
    "Background: deep cool dark (#0a0a0f) with very subtle grid pattern overlay. "
    "Typography: pairs Inter sans-serif body with JetBrains Mono for code/data. "
    "Color palette: monochrome dark base + ONE accent color per agent: "
    "Kiro = soft violet (#a78bfa), Claude = warm amber (#f59e0b), "
    "Copilot = mint green (#4ade80). "
    "Subtle 1px borders, NO heavy shadows, slight neon glow on active elements only. "
    "Data-dense but elegant. Sharp corners with 6-8px radius. "
)

RETRIES = [
    {
        "name": "03-compare-mode-v4",
        "size": "1536x1024",
        "prompt": (
            "AI agent response comparison dashboard. "
            "Top: query bar showing input prompt in monospace, '3 agents compared'. "
            "Large consensus bar — horizontal segmented showing agreement (green) vs conflict (amber). "
            "Below: 3 vertical response columns with 1px accent-colored top borders, "
            "agent header (monospace name + model + time), full response text, small score indicators. "
            "Bottom: 'Recommendation' card with verdict. "
            f"{COMMON}"
            "Stripe-dashboard-for-AI feel. 1536x1024."
        ),
    },
    {
        "name": "05-hero-v4",
        "size": "1536x1024",
        "prompt": (
            "Hero landing page for 'lun' — multi-agent AI CLI tool. "
            "Center: stylized terminal-like rounded container showing sample chat output "
            "with monospace prompt '> lun \"compare REST vs GraphQL\"' and colored agent responses. "
            "Above: large bold tagline 'Multi-agent consensus, in your terminal.' "
            "Below: subtitle 'lun · v1.6.0' in monospace, primary CTA 'npm install lun -g'. "
            "Subtle grid background + soft glow halos behind terminal. "
            "Floating tiny UI badges (latency, token counts) around terminal. "
            f"{COMMON}"
            "Vercel/Linear-style landing. 1536x1024."
        ),
    },
]


def generate(name, size, prompt):
    print(f"→ {name}", flush=True)
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
    for attempt in range(3):
        try:
            with urllib.request.urlopen(req, timeout=180) as resp:
                data = json.loads(resp.read())
            if not data.get("ok"):
                print(f"  ✗ {data.get('detail', data)}")
                return
            img = base64.b64decode(data["output"]["images"][0]["data"])
            (OUT_DIR / f"{name}.png").write_bytes(img)
            print(f"  ✓ {len(img)//1024}KB")
            return
        except Exception as e:
            print(f"  attempt {attempt+1}: {e}")
            time.sleep(5)
    print(f"  ✗ all retries failed")


for ref in RETRIES:
    generate(**ref)
    time.sleep(2)
