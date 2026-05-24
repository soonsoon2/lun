#!/bin/bash
# Benchmark PM agent candidates with simple greeting
PROMPT="안녕"

bench() {
  local label="$1"
  local cmd="$2"
  local START=$(date +%s%N)
  eval "$cmd" > /dev/null 2>&1
  local END=$(date +%s%N)
  local MS=$(( (END - START) / 1000000 ))
  printf "%-40s %5d ms\n" "$label" "$MS"
}

echo "Single prompt: '$PROMPT'"
echo "----------------------------------------"

bench "claude haiku"            "claude -p '$PROMPT' --model haiku"
bench "claude sonnet"           "claude -p '$PROMPT' --model sonnet"
bench "kiro auto"               "kiro-cli chat --no-interactive --wrap never --trust-all-tools '$PROMPT'"
bench "kiro claude-haiku-4.5"   "kiro-cli chat --no-interactive --wrap never --trust-all-tools --model claude-haiku-4.5 '$PROMPT'"
bench "kiro glm-5"              "kiro-cli chat --no-interactive --wrap never --trust-all-tools --model glm-5 '$PROMPT'"
bench "gemini 2.5-flash"        "gemini -p '$PROMPT' -y -m gemini-2.5-flash"
bench "gemini 2.5-flash-lite"   "gemini -p '$PROMPT' -y -m gemini-2.5-flash-lite"
bench "gemini 3-flash-preview"  "gemini -p '$PROMPT' -y -m gemini-3-flash-preview"
bench "copilot claude-haiku-4.5" "copilot -p '$PROMPT' -s --model claude-haiku-4.5"
bench "copilot gpt-5.4-mini"    "copilot -p '$PROMPT' -s --model gpt-5.4-mini"
