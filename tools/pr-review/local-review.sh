#!/bin/bash
set -euo pipefail

# Local PR Review Script
# Usage: bun run review:local <PR_NUMBER>

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Check arguments
if [ $# -eq 0 ]; then
  echo -e "${RED}❌ Error: PR number is required${NC}"
  echo "Usage: bun run review:local <PR_NUMBER>"
  echo "Example: bun run review:local 8"
  exit 1
fi

PR_NUMBER=$1

# Check required commands
if ! command -v gh &> /dev/null; then
  echo -e "${RED}❌ Error: GitHub CLI (gh) is not installed${NC}"
  echo "Install: brew install gh"
  exit 1
fi

# Check required environment variables
if [ -z "${CLAUDE_CODE_OAUTH_TOKEN:-}" ]; then
  echo -e "${RED}❌ Error: CLAUDE_CODE_OAUTH_TOKEN is not set${NC}"
  echo "Please set CLAUDE_CODE_OAUTH_TOKEN in your environment"
  exit 1
fi

if [ -z "${GITHUB_TOKEN:-}" ]; then
  echo -e "${RED}❌ Error: GITHUB_TOKEN is not set${NC}"
  echo "Please set GITHUB_TOKEN in your environment"
  exit 1
fi

# Get repository info from git remote
REPO_URL=$(git config --get remote.origin.url)
# Support both standard github.com and custom SSH hosts (e.g., github-personal)
if [[ $REPO_URL =~ (github\.com|github-[^:]+):([^/]+)/([^/.]+) ]]; then
  OWNER="${BASH_REMATCH[2]}"
  REPO="${BASH_REMATCH[3]}"
  GITHUB_REPOSITORY="$OWNER/$REPO"
elif [[ $REPO_URL =~ github\.com/([^/]+)/([^/.]+) ]]; then
  # HTTPS format
  OWNER="${BASH_REMATCH[1]}"
  REPO="${BASH_REMATCH[2]}"
  GITHUB_REPOSITORY="$OWNER/$REPO"
else
  echo -e "${RED}❌ Error: Could not parse repository from git remote${NC}"
  echo "  Remote URL: $REPO_URL"
  exit 1
fi

echo -e "${GREEN}🚀 Starting local PR review${NC}"
echo -e "  Repository: ${GITHUB_REPOSITORY}"
echo -e "  PR Number: ${PR_NUMBER}"
echo ""

# Fetch PR diff
echo -e "${YELLOW}📥 Fetching PR diff...${NC}"
if ! gh pr diff "$PR_NUMBER" > pr-diff.txt 2>&1; then
  echo -e "${RED}❌ Error: Failed to fetch PR diff${NC}"
  echo "Make sure PR #${PR_NUMBER} exists and you have access"
  exit 1
fi

DIFF_SIZE=$(wc -l < pr-diff.txt | tr -d ' ')
echo -e "${GREEN}✅ Fetched PR diff (${DIFF_SIZE} lines)${NC}"
echo ""

# Get PR author
PR_AUTHOR=$(gh pr view "$PR_NUMBER" --json author --jq '.author.login' 2>/dev/null || echo "$OWNER")

# Export environment variables
export GITHUB_REPOSITORY
export PR_NUMBER
export PR_AUTHOR

# Run review
echo -e "${YELLOW}🤖 Starting PR review...${NC}"
echo ""

# Execute review and output to both terminal and log.md (in mcp directory)
LOG_FILE="tools/pr-review/mcp/log.md"
bun run tools/pr-review/index.ts 2>&1 | tee "$LOG_FILE"

EXIT_CODE=${PIPESTATUS[0]}

# Cleanup
rm -f pr-diff.txt

# Check result
echo ""
if [ $EXIT_CODE -eq 0 ]; then
  echo -e "${GREEN}✅ Review completed successfully!${NC}"
  echo -e "  Log saved to: $LOG_FILE"
else
  echo -e "${RED}❌ Review failed with exit code: ${EXIT_CODE}${NC}"
  echo -e "  Check $LOG_FILE for details"
  exit $EXIT_CODE
fi
