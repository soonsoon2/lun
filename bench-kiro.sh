#!/bin/bash
# Benchmark all Kiro models
PROMPT="안녕하세요"

bench() {
  local model="$1"
  local START=$(date +%s%N)
  local OUT=$(kiro-cli chat --no-interactive --wrap never --trust-all-tools --model "$model" "$PROMPT" 2>&1)
  local END=$(date +%s%N)
  local MS=$(( (END - START) / 1000000 ))
  local hasError=$(echo "$OUT" | grep -i "error\|does not exist" | head -1)
  if [ -n "$hasError" ]; then
    printf "  %-25s %5d ms  ERROR\n" "$model" "$MS"
  else
    printf "  %-25s %5d ms  OK\n" "$model" "$MS"
  fi
}

echo "Kiro models — prompt: '$PROMPT'"
echo "----------------------------------------"
bench "auto"
bench "claude-haiku-4.5"
bench "claude-sonnet-4"
bench "claude-sonnet-4.5"
bench "claude-sonnet-4.6"
bench "claude-opus-4.5"
bench "claude-opus-4.6"
bench "claude-opus-4.7"
bench "deepseek-3.2"
bench "minimax-m2.1"
bench "minimax-m2.5"
bench "glm-5"
bench "qwen3-coder-next"
