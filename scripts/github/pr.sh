#!/bin/bash
#
# GitHub Client - Pull Request Functions
#

set -e

_check_for_help() {
    for arg in "$@"; do
        if [[ "$arg" == "-h" || "$arg" == "--help" ]]; then
            return 0
        fi
    done
    return 1
}

# PR一覧を取得
list_prs() {
    if _check_for_help "$@"; then
        echo "使用方法: $0 pr list"
        return 0
    fi
    echo -e "${BLUE}PR一覧を取得中... ($(get_repo_info))${NC}"
    echo ""

    local response
    response=$(call_api "GET" "/pulls?state=open")

    if [ -z "$response" ]; then
        return 1
    fi

    local count
    count=$(echo "$response" | jq 'length')

    if [ "$count" -eq 0 ]; then
      echo -e "${YELLOW}オープンなPRはありません${NC}"
      return
    fi

    printf "${GRAY}%-6s %-10s %s${NC}\n" "#" "状態" "タイトル"
    echo "----------------------------------------------"
    echo "$response" | jq -r '.[] | "\(.number)\t\(.state)\t\(.title)"' | while IFS=$'\t' read -r num state title; do
      printf "${GREEN}#%-5s${NC} %-10s %s\n" "$num" "$state" "$title"
    done
}

# PRの詳細を取得
get_pr() {
    if _check_for_help "$@"; then
        echo "使用方法: $0 pr get <PR番号>"
        return 0
    fi
    local pr_number="$1"
    if [ -z "$pr_number" ]; then
        echo -e "${RED}エラー: PR番号を指定してください${NC}" >&2
        return 1
    fi

    echo -e "${BLUE}PR #${pr_number} を取得中... ($(get_repo_info))${NC}"
    echo ""

    local pr_response reviews_response
    pr_response=$(call_api "GET" "/pulls/${pr_number}")
    reviews_response=$(call_api "GET" "/pulls/${pr_number}/reviews")

    if [ -z "$pr_response" ]; then
        return 1
    fi

    local title state author created_at branch_info html_url body
    title=$(echo "$pr_response" | jq -r '.title')
    state=$(echo "$pr_response" | jq -r '.state')
    author=$(echo "$pr_response" | jq -r '.user.login')
    created_at=$(echo "$pr_response" | jq -r '.created_at')
    branch_info="$(echo "$pr_response" | jq -r '.head.ref') → $(echo "$pr_response" | jq -r '.base.ref')"
    html_url=$(echo "$pr_response" | jq -r '.html_url')
    body=$(echo "$pr_response" | jq -r '.body // "（本文なし）"')

    local approved_count pending_count
    approved_count=$(echo "$reviews_response" | jq -r '[.[] | select(.state == "APPROVED")] | length')
    pending_count=$(echo "$reviews_response" | jq -r '[.[] | select(.state == "PENDING")] | length')

    echo -e "${GREEN}#${pr_number}${NC} ${title}"
    echo "----------------------------------------------"
    echo -e "${CYAN}状態:${NC}       ${state}"
    echo -e "${CYAN}作成者:${NC}     ${author}"
    echo -e "${CYAN}作成日:${NC}     ${created_at}"
    echo -e "${CYAN}ブランチ:${NC}   ${branch_info}"
    echo -e "${CYAN}レビュー:${NC}   approved (${approved_count}), pending (${pending_count})"
    echo -e "${CYAN}URL:${NC}        ${html_url}"
    echo ""
    echo -e "${CYAN}本文:${NC}"
    echo "----------------------------------------------"
    echo "$body"
}

# PRの差分を表示
pr_diff() {
    if _check_for_help "$@"; then
        echo "使用方法: $0 pr diff <PR番号>"
        return 0
    fi
    local pr_number="$1"
    if [ -z "$pr_number" ]; then
        echo -e "${RED}エラー: PR番号を指定してください${NC}" >&2
        return 1
    fi

    call_api "GET_DIFF" "/pulls/${pr_number}"
}

# PRのチェック状況を表示
pr_checks() {
    if _check_for_help "$@"; then
        echo "使用方法: $0 pr checks <PR番号>"
        return 0
    fi
    local pr_number="$1"
    if [ -z "$pr_number" ]; then
        echo -e "${RED}エラー: PR番号を指定してください${NC}" >&2
        return 1
    fi

    local pr_response
    pr_response=$(call_api "GET" "/pulls/${pr_number}")
    if [ -z "$pr_response" ]; then return 1; fi

    local ref
    ref=$(echo "$pr_response" | jq -r '.head.sha')
    if [ -z "$ref" ] || [ "$ref" == "null" ]; then
        echo -e "${RED}エラー: PRからコミットSHAを取得できませんでした${NC}" >&2
        return 1
    fi

    local response
    response=$(call_api "GET" "/commits/${ref}/check-runs")
    if [ -z "$response" ]; then return 1; fi

    if ! echo "$response" | jq -e . > /dev/null 2>&1; then
        echo -e "${RED}Error: Invalid JSON response from API${NC}" >&2
        return 1
    fi

    if [ "$(echo "$response" | jq -r '.total_count')" -eq 0 ]; then
        echo -e "${YELLOW}このPRにはチェックがありません${NC}"
        return
    fi

    echo "----------------------------------------------"
    echo "$response" | jq -r '.check_runs[] | select(.name != "claude-code-pulse-on-comment")' | while IFS= read -r row; do
        local name conclusion status
        name=$(echo "$row" | jq -r '.name')
        conclusion=$(echo "$row" | jq -r '.conclusion')
        status=$(echo "$row" | jq -r '.status')

        local icon
        case "$conclusion" in
            "success") icon="✓" ;;
            "failure") icon="✗" ;;
            *)         icon="◯" ;;
        esac

        printf "%-2s %-20s %-10s\n" "$icon" "$name" "$conclusion"
    done
}

# PRを新規作成
create_pr() {
    if _check_for_help "$@"; then
        echo "使用方法: $0 pr create -t <タイトル> [-b <本文>] [-B <ベース>] [-H <ヘッド>]"
        return 0
    fi
    local title="" body="" base="main" head
    head=$(git branch --show-current)

    while [[ $# -gt 0 ]]; do
        case "$1" in
            -t|--title) title="$2"; shift 2;;
            -b|--body) body="$2"; shift 2;;
            -B|--base) base="$2"; shift 2;;
            -H|--head) head="$2"; shift 2;;
            *) echo -e "${RED}エラー: 不明なオプション: $1${NC}" >&2; return 1;;
        esac
    done

    if [ -z "$title" ]; then
        echo -e "${RED}エラー: タイトル(-t)は必須です${NC}" >&2
        return 1
    fi

    echo -e "${BLUE}PRを作成中... ($(get_repo_info))${NC}"

    local payload
    payload=$(jq -n --arg title "$title" --arg body "$body" --arg head "$head" --arg base "$base" \
        '{title: $title, body: $body, head: $head, base: $base}')

    local response
    response=$(call_api "POST" "/pulls" "$payload")

    if [ -z "$response" ]; then
        return 1
    fi

    local new_number new_url
    new_number=$(echo "$response" | jq -r '.number')
    new_url=$(echo "$response" | jq -r '.html_url')

    echo ""
    echo -e "${GREEN}PR #${new_number} を作成しました${NC}"
    echo -e "${CYAN}URL:${NC} ${new_url}"
}

# PRにレビューを追加
add_pr_review() {
    if _check_for_help "$@"; then
        echo "使用方法: $0 pr review <PR番号> <approve|request-changes|comment> [-b <本文>]"
        return 0
    fi
    local pr_number="$1" event="$2" body=""
    shift 2

    if [ -z "$pr_number" ] || [ -z "$event" ]; then
        echo -e "${RED}エラー: PR番号とイベントを指定してください${NC}" >&2
        return 1
    fi

    if [[ "$event" != "approve" && "$event" != "request-changes" && "$event" != "comment" ]]; then
        echo -e "${RED}エラー: 不正なイベントです。'approve', 'request-changes', 'comment'のいずれかを指定してください${NC}" >&2
        return 1
    fi

    event_upper=$(echo "$event" | tr '[:lower:]' '[:upper:]' | sed 's/-/_/g')

    while [[ $# -gt 0 ]]; do
        case "$1" in
            -b|--body) body="$2"; shift 2;;
            *) echo -e "${RED}エラー: 不明なオプション: $1${NC}" >&2; return 1;;
        esac
    done

    if [ "$event" == "request-changes" ] && [ -z "$body" ]; then
        echo -e "${RED}エラー: request-changesイベントではコメント(-b)は必須です${NC}" >&2
        return 1
    fi

    local payload
    payload=$(jq -n --arg body "$body" --arg event "$event_upper" \
        '{body: $body, event: $event}')

    call_api "POST" "/pulls/${pr_number}/reviews" "$payload" > /dev/null

    echo -e "${GREEN}PR #${pr_number} にレビューを追加しました${NC}"
}

# PRのレビューコメントを取得
pr_comments() {
    if _check_for_help "$@"; then
        echo "使用方法: $0 pr comments <PR番号>"
        return 0
    fi
    local pr_number="$1"
    if [ -z "$pr_number" ]; then
        echo -e "${RED}エラー: PR番号を指定してください${NC}" >&2
        return 1
    fi

    echo -e "${BLUE}PR #${pr_number} のコメントを取得中... ($(get_repo_info))${NC}"
    echo ""

    # レビューコメント（コード行へのコメント）を取得
    local review_comments
    review_comments=$(call_api "GET" "/pulls/${pr_number}/comments")

    # 一般的なIssueコメント（PR全体へのコメント）も取得
    local issue_comments
    issue_comments=$(call_api "GET" "/issues/${pr_number}/comments")

    local review_count issue_count
    review_count=$(echo "$review_comments" | jq 'length')
    issue_count=$(echo "$issue_comments" | jq 'length')

    if [ "$review_count" -eq 0 ] && [ "$issue_count" -eq 0 ]; then
        echo -e "${YELLOW}このPRにはコメントがありません${NC}"
        return
    fi

    # コード行へのレビューコメントを表示
    if [ "$review_count" -gt 0 ]; then
        echo -e "${CYAN}=== レビューコメント (コード行) ===${NC}"
        echo ""
        echo "$review_comments" | jq -r '.[] | "---\n\u001b[32m作成者:\u001b[0m \(.user.login)\n\u001b[36m日時:\u001b[0m \(.created_at)\n\u001b[36mファイル:\u001b[0m \(.path):\(.line // .original_line // "N/A")\n\n\(.body)\n"'
    fi

    # PR全体へのコメントを表示
    if [ "$issue_count" -gt 0 ]; then
        echo -e "${CYAN}=== 一般コメント (PR全体) ===${NC}"
        echo ""
        echo "$issue_comments" | jq -r '.[] | "---\n\u001b[32m作成者:\u001b[0m \(.user.login)\n\u001b[36m日時:\u001b[0m \(.created_at)\n\n\(.body)\n"'
    fi
}

# PRをクローズ
close_pr() {
    if _check_for_help "$@"; then
        echo "使用方法: $0 pr close <PR番号>"
        return 0
    fi
    local pr_number="$1"
    if [ -z "$pr_number" ]; then
        echo -e "${RED}エラー: PR番号を指定してください${NC}" >&2
        return 1
    fi

    local payload
    payload=$(jq -n --arg state "closed" '{state: $state}')

    call_api "PATCH" "/pulls/${pr_number}" "$payload" > /dev/null

    echo -e "${GREEN}PR #${pr_number} をクローズしました${NC}"
}

show_pr_help() {
    echo "使用方法: $0 pr <サブコマンド> [オプション]"
    echo ""
    echo "サブコマンド:"
    echo "  list                          オープンなPR一覧を表示"
    echo "  get <番号>                    PR詳細を表示"
    echo "  diff <番号>                   変更差分を表示"
    echo "  checks <番号>                 CI/CDステータス確認"
    echo "  comments <番号>               PRコメント一覧を表示"
    echo "  create -t <タイトル> [-b <本文>] [-B <ベース>] [-H <ヘッド>]"
    echo "                                PRを新規作成"
    echo "  review <番号> <approve|request-changes|comment> [-b <コメント>]"
    echo "                                レビュー追加"
    echo "  close <番号>                  PRをクローズ"
}
