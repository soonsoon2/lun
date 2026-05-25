#!/bin/bash
# Generate Lun UI/UX reference images via SAM gpt-image-2
set -e

API_KEY="${SAM_API_KEY:-sam-a906c4338fadbe872ac36c1bc2405f8fe2c1b2ab6fd5508a}"
OUT_DIR="$(dirname "$0")/references"
mkdir -p "$OUT_DIR"

generate() {
  local name="$1"
  local size="$2"
  local prompt="$3"
  local model="${4:-gemini-3.1-flash-image-preview}"

  echo "→ Generating $name ($size, $model)..."
  local START=$(date +%s)

  curl -s -X POST "https://sam.soonsoon.ai/v1/generate" \
    -H "X-API-Key: $API_KEY" \
    -H "Content-Type: application/json" \
    -d "$(python3 -c "
import json
print(json.dumps({
  'model': '$model',
  'messages': [{'role': 'user', 'content': '''$prompt'''}],
  'options': {'stream': False, 'size': '$size'}
}))")" \
    --max-time 120 > "$OUT_DIR/$name.json"

  python3 <<EOF
import json, base64
from pathlib import Path
with open("$OUT_DIR/$name.json") as f: d = json.load(f)
if not d.get('ok'):
    print(f"  ✗ FAIL: {d.get('detail', d)}")
    exit(1)
img = base64.b64decode(d['output']['images'][0]['data'])
Path("$OUT_DIR/$name.png").write_bytes(img)
cost = d.get('cost', {}).get('cost_usd', 0)
print(f"  ✓ {len(img)//1024}KB  \${cost:.4f}")
EOF
}

# 1. Round Table view — Discuss mode hero shot
generate "01-round-table" "1920x1080" \
"Modern dark mode AI chat application UI design, 'Round Table' discussion view. Top center: large moderator card labeled 'PM Moderator' in soft green glow with avatar. Below in horizontal row: 3 agent panel cards each with distinct colored borders (purple for Kiro, orange for Claude, green for Copilot), each card showing agent name, avatar circle, message bubble with text excerpt, and a small timer '4.2s'. Bottom: synthesis card. Background: deep navy black with subtle gradient. Glassmorphism effect on cards with backdrop blur. Elegant Pretendard-style typography. Clean spacing. 1920x1080 desktop screenshot."

# 2. Chat mode (PM-led conversation)
generate "02-chat-mode" "1920x1080" \
"Modern dark mode chat app, 'PM-led Chat' view. Right-aligned messages: user prompts in purple bubbles, PM moderator responses in green-tinted bubbles with Mod badge. Left-aligned: specialist agent responses with their colored avatars (purple Kiro, orange Claude, green Copilot). Sidebar on left showing session history, agent settings panel. Subtle status indicators: response time, model name in tiny text. Background: very dark slate with gradient mesh. Glassmorphism cards. Inspired by modern Discord and Linear app aesthetics. 1920x1080."

# 3. Compare mode (side-by-side)
generate "03-compare-mode" "1920x1080" \
"AI comparison dashboard, dark mode. Three vertical columns side-by-side, each showing one AI agent's full response (Kiro/Claude/Copilot) with distinct top border color. Header bar above with consensus indicators showing common points highlighted in green and divergent points highlighted in amber. Bottom: voting bar visualization '2 of 3 agree on X'. Cost and time badges per column. Modern professional dashboard, deep blue-black background, sharp typography. 1920x1080."

# 4. Mobile chat view (vertical)
generate "04-mobile-chat" "1080x1920" \
"Mobile chat app in dark mode showing AI multi-agent discussion. Top: app header 'Lun' with status dot. Center: chat bubbles flowing — user messages on right (purple), moderator messages on right with green Mod badge, panelist responses on left with colored avatars. Bottom: input bar with mode pills (Chat/Discuss/Ask) and agent selection chips. Smooth modern iOS aesthetic, Pretendard font. Vertical 9:16 portrait."

# 5. Onboarding / First Run
generate "05-onboarding" "1920x1080" \
"Onboarding screen for an AI agent CLI tool called 'Lun'. Center: hero illustration of multiple AI agent characters around a circular table — each character is a minimalist geometric shape with a distinct color (purple, orange, green, blue, pink) and small label. Above: large title 'One question. Multiple minds.' Below: subtitle 'Set up your AI panel'. Modern dark mode with soft glowing accents, glassmorphism, deep navy background. Inspired by Linear, Notion, and Raycast onboarding aesthetics. 1920x1080."

echo ""
echo "Done. References at: $OUT_DIR"
ls -la "$OUT_DIR"/*.png 2>/dev/null
