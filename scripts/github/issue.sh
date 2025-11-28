#!/bin/bash
#
# GitHub Client - Issue Functions
#

# Issue一覧を取得
list_issues() {
  echo -e "${BLUE}Issue一覧を取得中... ($(get_repo_info))${NC}"
  echo ""

  local response
  response=$(call_api "GET" "/issues?state=open&per_page=20")

  if [ -z "$response" ]; then
    return 1
  fi

  # 整形表示
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
}

# Issueの詳細を取得
get_issue() {
  local issue_number="$1"

  if [ -z "$issue_number" ]; then
    echo -e "${RED}エラー: Issue番号を指定してください${NC}" >&2
    return 1
  fi

  echo -e "${BLUE}Issue #${issue_number} を取得中... ($(get_repo_info))${NC}"
  echo ""

  local response
  response=$(call_api "GET" "/issues/${issue_number}")

  if [ -z "$response" ]; then
    return 1
  fi

  # 整形表示
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
        echo -e "${RED}エラー: 不明なオプション: $1${NC}" >&2
        return 1
        ;;
    esac
  done

  if [ -z "$title" ]; then
    echo -e "${RED}エラー: タイトル(-t)は必須です${NC}" >&2
    return 1
  fi

  echo -e "${BLUE}Issueを作成中... ($(get_repo_info))${NC}"

  # JSONペイロード作成
  local payload
  payload=$(jq -n \
    --arg title "$title" \
    --arg body "$body" \
    '{title: $title, body: $body}')

  if [ -n "$labels" ]; then
    payload=$(echo "$payload" | jq --arg labels "$labels" '.labels = ($labels | split(",") | map(gsub("^\\s+|\\s+$"; "")))')
  fi

  local response
  response=$(call_api "POST" "/issues" "$payload")

  if [ -z "$response" ]; then
    return 1
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
    echo -e "${RED}エラー: Issue番号を指定してください${NC}" >&2
    return 1
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
        echo -e "${RED}エラー: 不明なオプション: $1${NC}" >&2
        return 1
        ;;
    esac
  done

  if [ -z "$title" ] && [ -z "$body" ] && [ -z "$state" ]; then
    echo -e "${RED}エラー: 更新する項目を指定してください${NC}" >&2
    return 1
  fi

  echo -e "${BLUE}Issue #${issue_number} を更新中... ($(get_repo_info))${NC}"

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
  response=$(call_api "PATCH" "/issues/${issue_number}" "$payload")

  if [ -z "$response" ]; then
    return 1
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
