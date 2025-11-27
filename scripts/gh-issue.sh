#!/bin/bash
#
# GitHub Issue操作スクリプト
# 使用方法: ./scripts/gh-issue.sh [操作] [オプション]
#

set -e

# 色定義
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# ヘルプ表示
show_help() {
  echo "GitHub Issue操作スクリプト"
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

  echo -e "${BLUE}Issue #${issue_number} を取得中...${NC}"
  echo ""

  gh issue view "$issue_number"
}

# Issue一覧を取得
list_issues() {
  echo -e "${BLUE}Issue一覧を取得中...${NC}"
  echo ""

  gh issue list --limit 20
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
