#!/bin/bash
#
# GitHub Issue管理スクリプト
# 使用方法: ./scripts/github-issues.sh [操作] [オプション]
#
# 環境変数:
#   GH_TOKEN     - GitHub APIトークン（優先）
#   GITHUB_TOKEN - GitHub APIトークン（GH_TOKENがない場合に使用）
#   GITHUB_REPO  - リポジトリ (owner/repo形式、省略時はgitから取得)
#

set -e

# 色定義
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
GRAY='\033[0;90m'
NC='\033[0m' # No Color

# GitHub API URL
GITHUB_API="https://api.github.com"

# トークンを取得（GH_TOKEN優先、なければGITHUB_TOKEN）
get_token() {
  if [ -n "$GH_TOKEN" ]; then
    echo "$GH_TOKEN"
  elif [ -n "$GITHUB_TOKEN" ]; then
    echo "$GITHUB_TOKEN"
  else
    echo ""
  fi
}

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
  local token
  token=$(get_token)
  if [ -z "$token" ]; then
    echo -e "${RED}エラー: GH_TOKENまたはGITHUB_TOKEN環境変数を設定してください${NC}"
    echo "例: export GH_TOKEN=ghp_xxxxxxxxxxxx"
    exit 1
  fi
}

# ヘルプ表示
show_help() {
  echo "GitHub Issue管理スクリプト"
  echo ""
  echo "使用方法:"
  echo "  $0 <操作> [オプション]"
  echo ""
  echo "操作:"
  echo "  list                          Issue一覧を表示"
  echo "  get <issue番号>               Issueの詳細を表示"
  echo "  create -t <タイトル> [-b <本文>] [-l <ラベル>]"
  echo "                                Issueを新規作成"
  echo "  update <issue番号> [-t <タイトル>] [-b <本文>] [-s <状態>]"
  echo "                                Issueを更新"
  echo ""
  echo "環境変数:"
  echo "  GH_TOKEN           GitHub APIトークン（優先）"
  echo "  GITHUB_TOKEN       GitHub APIトークン（GH_TOKENがない場合）"
  echo "  GITHUB_REPO        リポジトリ (owner/repo形式、省略時はgitから取得)"
  echo ""
  echo "オプション:"
  echo "  -h, --help         このヘルプを表示"
  echo ""
  echo "例:"
  echo "  $0 list                           Issue一覧を表示"
  echo "  $0 get 123                        Issue #123の詳細を表示"
  echo "  $0 create -t \"バグ修正\" -b \"詳細説明\"  新規Issue作成"
  echo "  $0 update 123 -s closed           Issue #123をクローズ"
  echo "  $0 update 123 -t \"新しいタイトル\"     タイトルを更新"
}

# Issue一覧を取得
list_issues() {
  check_token
  local token repo
  token=$(get_token)
  repo=$(get_repo_info)

  echo -e "${BLUE}Issue一覧を取得中... (${repo})${NC}"
  echo ""

  local response
  response=$(curl -s -H "Authorization: token $token" \
    -H "Accept: application/vnd.github.v3+json" \
    "${GITHUB_API}/repos/${repo}/issues?state=open&per_page=20")

  # エラーチェック
  if echo "$response" | jq -e '.message' &>/dev/null; then
    local message
    message=$(echo "$response" | jq -r '.message')
    echo -e "${RED}エラー: $message${NC}"
    exit 1
  fi

  # 整形表示
  if command -v jq &> /dev/null; then
    local count
    count=$(echo "$response" | jq 'length')

    if [ "$count" -eq 0 ]; then
      echo -e "${YELLOW}オープンなIssueはありません${NC}"
      return
    fi

    printf "${GRAY}%-6s %-10s %s${NC}\n" "#" "状態" "タイトル"
    echo "----------------------------------------------"
    echo "$response" | jq -r '.[] | "\(.number)\t\(.state)\t\(.title)"' | while IFS=$'\t' read -r num state title; do
      printf "${GREEN}#%-5s${NC} %-10s %s\n" "$num" "$state" "$title"
    done
  else
    echo "$response"
    echo ""
    echo -e "${YELLOW}(jqをインストールすると整形表示されます)${NC}"
  fi
}

# Issueの詳細を取得
get_issue() {
  local issue_number="$1"

  if [ -z "$issue_number" ]; then
    echo -e "${RED}エラー: Issue番号を指定してください${NC}"
    echo "使用方法: $0 get <issue番号>"
    exit 1
  fi

  check_token
  local token repo
  token=$(get_token)
  repo=$(get_repo_info)

  echo -e "${BLUE}Issue #${issue_number} を取得中... (${repo})${NC}"
  echo ""

  local response
  response=$(curl -s -H "Authorization: token $token" \
    -H "Accept: application/vnd.github.v3+json" \
    "${GITHUB_API}/repos/${repo}/issues/${issue_number}")

  # エラーチェック
  if echo "$response" | jq -e '.message' &>/dev/null; then
    local message
    message=$(echo "$response" | jq -r '.message')
    echo -e "${RED}エラー: $message${NC}"
    exit 1
  fi

  # 整形表示
  if command -v jq &> /dev/null; then
    local title state html_url created_at author labels
    title=$(echo "$response" | jq -r '.title')
    state=$(echo "$response" | jq -r '.state')
    html_url=$(echo "$response" | jq -r '.html_url')
    created_at=$(echo "$response" | jq -r '.created_at')
    author=$(echo "$response" | jq -r '.user.login')
    labels=$(echo "$response" | jq -r '[.labels[].name] | join(", ") // ""')

    echo -e "${GREEN}#${issue_number}${NC} ${title}"
    echo "----------------------------------------------"
    echo -e "${CYAN}状態:${NC}     ${state}"
    echo -e "${CYAN}作成者:${NC}   ${author}"
    echo -e "${CYAN}作成日:${NC}   ${created_at}"
    [ -n "$labels" ] && echo -e "${CYAN}ラベル:${NC}   ${labels}"
    echo -e "${CYAN}URL:${NC}      ${html_url}"
    echo ""
    echo -e "${CYAN}本文:${NC}"
    echo "----------------------------------------------"
    echo "$response" | jq -r '.body // "（本文なし）"'
  else
    echo "$response"
    echo ""
    echo -e "${YELLOW}(jqをインストールすると整形表示されます)${NC}"
  fi
}

# Issueを新規作成
create_issue() {
  local title=""
  local body=""
  local labels=""

  # オプション解析
  while [[ $# -gt 0 ]]; do
    case "$1" in
      -t|--title)
        title="$2"
        shift 2
        ;;
      -b|--body)
        body="$2"
        shift 2
        ;;
      -l|--labels)
        labels="$2"
        shift 2
        ;;
      *)
        echo -e "${RED}エラー: 不明なオプション: $1${NC}"
        exit 1
        ;;
    esac
  done

  if [ -z "$title" ]; then
    echo -e "${RED}エラー: タイトル(-t)は必須です${NC}"
    echo "使用方法: $0 create -t <タイトル> [-b <本文>] [-l <ラベル>]"
    exit 1
  fi

  check_token
  local token repo
  token=$(get_token)
  repo=$(get_repo_info)

  echo -e "${BLUE}Issueを作成中... (${repo})${NC}"

  # JSONペイロード作成
  local payload
  payload=$(jq -n \
    --arg title "$title" \
    --arg body "$body" \
    '{title: $title, body: $body}')

  # ラベルがあれば追加
  if [ -n "$labels" ]; then
    payload=$(echo "$payload" | jq --arg labels "$labels" '.labels = ($labels | split(",") | map(gsub("^\\s+|\\s+$"; "")))')
  fi

  local response
  response=$(curl -s -X POST \
    -H "Authorization: token $token" \
    -H "Accept: application/vnd.github.v3+json" \
    -d "$payload" \
    "${GITHUB_API}/repos/${repo}/issues")

  # エラーチェック
  if echo "$response" | jq -e '.message' &>/dev/null; then
    local message
    message=$(echo "$response" | jq -r '.message')
    echo -e "${RED}エラー: $message${NC}"
    exit 1
  fi

  # 成功
  local new_number new_url
  new_number=$(echo "$response" | jq -r '.number')
  new_url=$(echo "$response" | jq -r '.html_url')

  echo ""
  echo -e "${GREEN}Issue #${new_number} を作成しました${NC}"
  echo -e "${CYAN}URL:${NC} ${new_url}"
}

# Issueを更新
update_issue() {
  local issue_number="$1"
  shift

  if [ -z "$issue_number" ]; then
    echo -e "${RED}エラー: Issue番号を指定してください${NC}"
    echo "使用方法: $0 update <issue番号> [-t <タイトル>] [-b <本文>] [-s <状態>]"
    exit 1
  fi

  local title=""
  local body=""
  local state=""

  # オプション解析
  while [[ $# -gt 0 ]]; do
    case "$1" in
      -t|--title)
        title="$2"
        shift 2
        ;;
      -b|--body)
        body="$2"
        shift 2
        ;;
      -s|--state)
        state="$2"
        shift 2
        ;;
      *)
        echo -e "${RED}エラー: 不明なオプション: $1${NC}"
        exit 1
        ;;
    esac
  done

  if [ -z "$title" ] && [ -z "$body" ] && [ -z "$state" ]; then
    echo -e "${RED}エラー: 更新する項目を指定してください${NC}"
    echo "使用方法: $0 update <issue番号> [-t <タイトル>] [-b <本文>] [-s <状態>]"
    echo ""
    echo "状態(-s)の値: open, closed"
    exit 1
  fi

  check_token
  local token repo
  token=$(get_token)
  repo=$(get_repo_info)

  echo -e "${BLUE}Issue #${issue_number} を更新中... (${repo})${NC}"

  # JSONペイロード作成
  local payload="{}"

  if [ -n "$title" ]; then
    payload=$(echo "$payload" | jq --arg title "$title" '. + {title: $title}')
  fi
  if [ -n "$body" ]; then
    payload=$(echo "$payload" | jq --arg body "$body" '. + {body: $body}')
  fi
  if [ -n "$state" ]; then
    payload=$(echo "$payload" | jq --arg state "$state" '. + {state: $state}')
  fi

  local response
  response=$(curl -s -X PATCH \
    -H "Authorization: token $token" \
    -H "Accept: application/vnd.github.v3+json" \
    -d "$payload" \
    "${GITHUB_API}/repos/${repo}/issues/${issue_number}")

  # エラーチェック
  if echo "$response" | jq -e '.message' &>/dev/null; then
    local message
    message=$(echo "$response" | jq -r '.message')
    echo -e "${RED}エラー: $message${NC}"
    exit 1
  fi

  # 成功
  local updated_title updated_state updated_url
  updated_title=$(echo "$response" | jq -r '.title')
  updated_state=$(echo "$response" | jq -r '.state')
  updated_url=$(echo "$response" | jq -r '.html_url')

  echo ""
  echo -e "${GREEN}Issue #${issue_number} を更新しました${NC}"
  echo -e "${CYAN}タイトル:${NC} ${updated_title}"
  echo -e "${CYAN}状態:${NC}     ${updated_state}"
  echo -e "${CYAN}URL:${NC}      ${updated_url}"
}

# メイン処理
main() {
  # jqチェック
  if ! command -v jq &> /dev/null; then
    echo -e "${RED}エラー: jqがインストールされていません${NC}"
    echo "インストール方法:"
    echo "  macOS: brew install jq"
    echo "  Ubuntu: apt install jq"
    exit 1
  fi

  # 引数なしの場合はヘルプ表示
  if [ $# -eq 0 ]; then
    show_help
    exit 0
  fi

  local command="$1"
  shift

  case "$command" in
    list)
      list_issues
      ;;
    get)
      get_issue "$@"
      ;;
    create)
      create_issue "$@"
      ;;
    update)
      update_issue "$@"
      ;;
    -h|--help)
      show_help
      ;;
    *)
      echo -e "${RED}エラー: 不明な操作: $command${NC}"
      echo ""
      show_help
      exit 1
      ;;
  esac
}

main "$@"
