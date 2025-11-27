#!/bin/bash
#
# GitHub Issue操作スクリプト (curl版)
# 使用方法: ./scripts/gh-issue.sh [操作] [オプション]
#
# 環境変数:
#   GITHUB_TOKEN - GitHub APIトークン（必須）
#   GITHUB_REPO  - リポジトリ (owner/repo形式、省略時はgitから取得)
#

set -e

# 色定義
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# GitHub API URL
GITHUB_API="https://api.github.com"

# リポジトリ情報を取得
get_repo_info() {
  if [ -n "$GITHUB_REPO" ]; then
    echo "$GITHUB_REPO"
    return
  fi

  # gitのremote URLから取得
  local remote_url
  remote_url=$(git remote get-url origin 2>/dev/null || echo "")

  if [ -z "$remote_url" ]; then
    echo -e "${RED}エラー: GITHUB_REPOを設定するか、gitリポジトリ内で実行してください${NC}" >&2
    exit 1
  fi

  # URLからowner/repoを抽出
  echo "$remote_url" | sed -E 's/.*[:/]([^/]+\/[^/]+)(\.git)?$/\1/' | sed 's/\.git$//'
}

# トークンチェック
check_token() {
  if [ -z "$GITHUB_TOKEN" ]; then
    echo -e "${RED}エラー: GITHUB_TOKEN環境変数を設定してください${NC}"
    echo "例: export GITHUB_TOKEN=ghp_xxxxxxxxxxxx"
    exit 1
  fi
}

# ヘルプ表示
show_help() {
  echo "GitHub Issue操作スクリプト (curl版)"
  echo ""
  echo "使用方法:"
  echo "  $0 <操作> [オプション]"
  echo ""
  echo "操作:"
  echo "  get <issue番号>    Issueを取得して表示"
  echo "  list               Issue一覧を表示"
  echo "  create             Issueを作成（未実装）"
  echo "  update             Issueを更新（未実装）"
  echo ""
  echo "環境変数:"
  echo "  GITHUB_TOKEN       GitHub APIトークン（必須）"
  echo "  GITHUB_REPO        リポジトリ (owner/repo形式、省略時はgitから取得)"
  echo ""
  echo "オプション:"
  echo "  -h, --help         このヘルプを表示"
  echo ""
  echo "例:"
  echo "  $0 get 123         Issue #123を取得"
  echo "  $0 list            Issue一覧を表示"
}

# Issueを取得
get_issue() {
  local issue_number="$1"

  if [ -z "$issue_number" ]; then
    echo -e "${RED}エラー: Issue番号を指定してください${NC}"
    echo "使用方法: $0 get <issue番号>"
    exit 1
  fi

  check_token
  local repo
  repo=$(get_repo_info)

  echo -e "${BLUE}Issue #${issue_number} を取得中... (${repo})${NC}"
  echo ""

  local response
  response=$(curl -s -H "Authorization: token $GITHUB_TOKEN" \
    -H "Accept: application/vnd.github.v3+json" \
    "${GITHUB_API}/repos/${repo}/issues/${issue_number}")

  # エラーチェック
  if echo "$response" | grep -q '"message"'; then
    local message
    message=$(echo "$response" | grep -o '"message":"[^"]*"' | cut -d'"' -f4)
    echo -e "${RED}エラー: $message${NC}"
    exit 1
  fi

  # 結果を整形して表示
  if command -v jq &> /dev/null; then
    local title state html_url body
    title=$(echo "$response" | jq -r '.title')
    state=$(echo "$response" | jq -r '.state')
    html_url=$(echo "$response" | jq -r '.html_url')

    echo -e "${GREEN}#${issue_number}${NC} ${title}"
    echo -e "${CYAN}状態:${NC} ${state}"
    echo -e "${CYAN}URL:${NC} ${html_url}"
    echo ""
    echo -e "${CYAN}本文:${NC}"
    echo "$response" | jq -r '.body // "（本文なし）"'
  else
    echo "$response"
    echo ""
    echo "(jqをインストールすると整形表示されます)"
  fi
}

# Issue一覧を取得
list_issues() {
  check_token
  local repo
  repo=$(get_repo_info)

  echo -e "${BLUE}Issue一覧を取得中... (${repo})${NC}"
  echo ""

  local response
  response=$(curl -s -H "Authorization: token $GITHUB_TOKEN" \
    -H "Accept: application/vnd.github.v3+json" \
    "${GITHUB_API}/repos/${repo}/issues?state=open&per_page=20")

  # エラーチェック
  if echo "$response" | grep -q '"message"'; then
    local message
    message=$(echo "$response" | grep -o '"message":"[^"]*"' | cut -d'"' -f4)
    echo -e "${RED}エラー: $message${NC}"
    exit 1
  fi

  # jqがあれば整形表示
  if command -v jq &> /dev/null; then
    echo "$response" | jq -r '.[] | "#\(.number)\t\(.state)\t\(.title)"' | while read -r line; do
      local num state title
      num=$(echo "$line" | cut -f1)
      state=$(echo "$line" | cut -f2)
      title=$(echo "$line" | cut -f3)
      echo -e "${GREEN}${num}${NC}\t${state}\t${title}"
    done
  else
    # jqなしの簡易表示
    echo "$response" | grep -o '"number":[0-9]*' | while read -r num; do
      echo "$num" | sed 's/"number":/Issue #/'
    done
    echo ""
    echo "(jqをインストールするとより詳細な一覧が表示されます)"
  fi
}

# メイン処理
main() {
  # 引数なしの場合はヘルプ表示
  if [ $# -eq 0 ]; then
    show_help
    exit 0
  fi

  local command="$1"
  shift

  case "$command" in
    get)
      get_issue "$@"
      ;;
    list)
      list_issues
      ;;
    create)
      echo -e "${YELLOW}create機能は未実装です${NC}"
      ;;
    update)
      echo -e "${YELLOW}update機能は未実装です${NC}"
      ;;
    -h|--help)
      show_help
      ;;
    *)
      echo -e "${RED}エラー: 不明な操作: $command${NC}"
      show_help
      exit 1
      ;;
  esac
}

main "$@"
