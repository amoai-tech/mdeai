#!/usr/bin/env bash
# Bisection script to find which test creates unwanted files/state
# Usage: ./find-polluter.sh <file_or_dir_to_check> <test_pattern>
# Example: ./find-polluter.sh '.git' 'src/**/*.test.ts'

set -e

if [ $# -ne 2 ]; then
  echo "Usage: $0 <file_to_check> <test_pattern>"
  echo "Example: $0 '.git' 'src/**/*.test.ts'"
  exit 1
fi

POLLUTION_CHECK="$1"
TEST_PATTERN="$2"

echo "🔍 Searching for test that creates: $POLLUTION_CHECK"
echo "Test pattern: $TEST_PATTERN"
echo ""

# Expand the caller's glob with bash's globstar so nested tests are discovered
# reliably. nullglob makes a no-match pattern expand to zero files.
TEST_PATTERN="${TEST_PATTERN#./}"
shopt -s globstar nullglob
TEST_FILES=( $TEST_PATTERN )
TOTAL=${#TEST_FILES[@]}

echo "Found $TOTAL test files"
echo ""

if [ -e "$POLLUTION_CHECK" ]; then
  echo "❌ Pollution already exists before the polluter search: $POLLUTION_CHECK" >&2
  echo "   Remove or isolate the pre-existing pollution, then rerun." >&2
  exit 2
fi

COUNT=0
for TEST_FILE in "${TEST_FILES[@]}"; do
  COUNT=$((COUNT + 1))

  echo "[$COUNT/$TOTAL] Testing: $TEST_FILE"

  # Run the test. Preserve runner failures so syntax/environment errors are not
  # misreported as a clean polluter search.
  set +e
  npm test -- "$TEST_FILE" > /dev/null 2>&1
  TEST_STATUS=$?
  set -e

  # Check if pollution appeared
  if [ -e "$POLLUTION_CHECK" ]; then
    echo ""
    echo "🎯 FOUND POLLUTER!"
    echo "   Test: $TEST_FILE"
    echo "   Created: $POLLUTION_CHECK"
    echo ""
    echo "Pollution details:"
    ls -la "$POLLUTION_CHECK"
    echo ""
    echo "To investigate:"
    echo "  npm test $TEST_FILE    # Run just this test"
    echo "  cat $TEST_FILE         # Review test code"
    exit 1
  fi

  if [ "$TEST_STATUS" -ne 0 ]; then
    echo "❌ Test runner failed for: $TEST_FILE (exit $TEST_STATUS)" >&2
    exit "$TEST_STATUS"
  fi
done

echo ""
echo "✅ No polluter found - all tests clean!"
exit 0
