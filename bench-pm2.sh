#!/bin/bash
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

echo "Quick run: '$PROMPT'"
echo "----------------------------------------"
bench "copilot gpt-5.4-mini"      "copilot -p '$PROMPT' -s --model gpt-5.4-mini"
bench "copilot claude-haiku-4.5"  "copilot -p '$PROMPT' -s --model claude-haiku-4.5"
bench "kiro gpt-4.1-nano"         "kiro-cli chat --no-interactive --wrap never --trust-all-tools --model gpt-4.1-nano '$PROMPT'"
bench "kiro glm-4.7-flash"        "kiro-cli chat --no-interactive --wrap never --trust-all-tools --model glm-4.7-flash '$PROMPT'"
