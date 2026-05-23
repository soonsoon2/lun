#!/bin/bash
# Lun chat test scenarios
TESTS=(
  "안녕"
  "1+1은?"
  "Python에서 list comprehension 예제 보여줘"
)

for test in "${TESTS[@]}"; do
  echo ""
  echo "================================"
  echo "TEST: $test"
  echo "================================"
  START=$(date +%s)
  printf "%s\n/quit\n" "$test" | lun chat 2>&1 | tail -30
  echo "[TIME: $(($(date +%s) - START))s]"
done
