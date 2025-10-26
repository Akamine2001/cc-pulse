#!/bin/bash
set -euo pipefail

# Local Feature Review Script
# Usage: bun run feature:local <ISSUE_NUMBER>

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Check arguments
if [ $# -eq 0 ]; then
  echo -e "${RED}❌ Error: Issue number is required${NC}"
  echo "Usage: bun run feature:local <ISSUE_NUMBER>"
  echo "Example: bun run feature:local 8"
  exit 1
fi

ISSUE_NUMBER=$1

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

echo -e "${GREEN}🚀 Starting local feature review${NC}"
echo -e "  Repository: ${GITHUB_REPOSITORY}"
echo -e "  Issue Number: ${ISSUE_NUMBER}"
echo ""

# Check if issue exists and get title
echo -e "${YELLOW}📥 Checking if issue exists...${NC}"
ISSUE_DATA=$(gh issue view "$ISSUE_NUMBER" --repo "$GITHUB_REPOSITORY" --json title 2>&1)

if [ $? -ne 0 ]; then
  echo -e "${RED}❌ Error: Failed to fetch issue #${ISSUE_NUMBER}${NC}"
  echo "Make sure Issue #${ISSUE_NUMBER} exists and you have access"
  echo ""
  echo "Error output:"
  echo "$ISSUE_DATA"
  exit 1
fi

ISSUE_TITLE=$(echo "$ISSUE_DATA" | jq -r '.title')

if [ -z "$ISSUE_TITLE" ] || [ "$ISSUE_TITLE" == "null" ]; then
  echo -e "${RED}❌ Error: Issue #${ISSUE_NUMBER} not found${NC}"
  exit 1
fi
echo -e "${GREEN}✅ Issue found: ${ISSUE_TITLE}${NC}"
echo ""

# Export environment variables
export GITHUB_REPOSITORY
export ISSUE_NUMBER
export LOCAL_MODE=true  # ローカルモード: mdファイルに保存

# Run feature reviewer
echo -e "${YELLOW}🤖 Starting issue analysis (Local Mode)...${NC}"
echo -e "${YELLOW}   (This may take several minutes)${NC}"
echo -e "${YELLOW}   Guidelines will be saved to tools/feature-reviewer/output/${NC}"
echo ""

# Execute review and output to both terminal and log.md (in mcp directory)
LOG_FILE="tools/feature-reviewer/mcp/log.md"
bun run tools/feature-reviewer/index.ts 2>&1 | tee "$LOG_FILE"

EXIT_CODE=${PIPESTATUS[0]}

# Check result
echo ""
if [ $EXIT_CODE -eq 0 ]; then
  echo -e "${GREEN}✅ Feature review completed successfully!${NC}"
  echo -e "  Log saved to: $LOG_FILE"
else
  echo -e "${RED}❌ Feature review failed with exit code: ${EXIT_CODE}${NC}"
  echo -e "  Check $LOG_FILE for details"
  exit $EXIT_CODE
fi
