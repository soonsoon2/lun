#!/bin/bash
# Test all agents with a simple prompt
PROMPT="What is 2+2? Reply in one short sentence."

bench() {
  local label="$1"
  local cmd="$2"
  echo "─── $label ───"
  local START=$(date +%s%N)
  local OUT=$(eval "$cmd" 2>&1 | head -8)
  local END=$(date +%s%N)
  local MS=$(( (END - START) / 1000000 ))
  echo "$OUT" | head -3
  echo "[${MS}ms]"
  echo ""
}

bench "kiro auto"          "kiro-cli chat --no-interactive --wrap never --trust-all-tools '$PROMPT'"
bench "claude sonnet"      "claude -p '$PROMPT' --model sonnet"
bench "claude opus"        "claude -p '$PROMPT' --model opus"
bench "claude haiku"       "claude -p '$PROMPT' --model haiku"
bench "copilot auto"       "copilot -p '$PROMPT' -s"
bench "gemini 2.5-flash"   "gemini -p '$PROMPT' -y -m gemini-2.5-flash"
bench "codex gpt-5.5"      "codex exec '$PROMPT' -m gpt-5.5"
bench "codex o4-mini"      "codex exec '$PROMPT' -m o4-mini"
