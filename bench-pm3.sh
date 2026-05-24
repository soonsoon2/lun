#!/bin/bash
PROMPT="안녕하세요"

bench() {
  local label="$1"
  local cmd="$2"
  local START=$(date +%s%N)
  local OUT=$(eval "$cmd" 2>&1)
  local END=$(date +%s%N)
  local MS=$(( (END - START) / 1000000 ))
  local hasError=$(echo "$OUT" | grep -i "error\|does not exist" | head -1)
  if [ -n "$hasError" ]; then
    printf "%-45s %5d ms  ERROR\n" "$label" "$MS"
  else
    printf "%-45s %5d ms  OK\n" "$label" "$MS"
  fi
}

echo "PM benchmark: '$PROMPT'"
echo "------------------------------------------------"
bench "claude sonnet"                    "claude -p '$PROMPT' --model sonnet"
bench "claude haiku"                     "claude -p '$PROMPT' --model haiku"
bench "kiro auto"                        "kiro-cli chat --no-interactive --wrap never --trust-all-tools '$PROMPT'"
bench "kiro claude-haiku-4.5"            "kiro-cli chat --no-interactive --wrap never --trust-all-tools --model claude-haiku-4.5 '$PROMPT'"
bench "kiro deepseek-3.2"                "kiro-cli chat --no-interactive --wrap never --trust-all-tools --model deepseek-3.2 '$PROMPT'"
bench "kiro minimax-m2.5"                "kiro-cli chat --no-interactive --wrap never --trust-all-tools --model minimax-m2.5 '$PROMPT'"
bench "kiro qwen3-coder-next"            "kiro-cli chat --no-interactive --wrap never --trust-all-tools --model qwen3-coder-next '$PROMPT'"
