#!/bin/bash
#
# GitHub Client - Actions Functions
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

# Workflow Run一覧を取得
list_runs() {
    if _check_for_help "$@"; then
        echo "使用方法: $0 actions list [-w <workflow名>] [-b <ブランチ>] [-n <件数>]"
        return 0
    fi

    local workflow="" branch="" limit=10

    while [[ $# -gt 0 ]]; do
        case "$1" in
            -w|--workflow) workflow="$2"; shift 2;;
            -b|--branch) branch="$2"; shift 2;;
            -n|--limit) limit="$2"; shift 2;;
            *) shift;;
        esac
    done

    echo -e "${BLUE}Workflow Run一覧を取得中... ($(get_repo_info))${NC}"
    echo ""

    local query="per_page=${limit}"
    [ -n "$workflow" ] && query="${query}&workflow_id=${workflow}"
    [ -n "$branch" ] && query="${query}&branch=${branch}"

    local response
    response=$(call_api "GET" "/actions/runs?${query}")

    if [ -z "$response" ]; then
        return 1
    fi

    local count
    count=$(echo "$response" | jq '.total_count')

    if [ "$count" -eq 0 ]; then
        echo -e "${YELLOW}Workflow Runが見つかりません${NC}"
        return
    fi

    printf "${GRAY}%-12s %-20s %-12s %-10s %s${NC}\n" "Run ID" "Workflow" "Status" "結論" "ブランチ"
    echo "--------------------------------------------------------------------------------"
    echo "$response" | jq -r '.workflow_runs[] | "\(.id)\t\(.name)\t\(.status)\t\(.conclusion // "N/A")\t\(.head_branch)"' | while IFS=$'\t' read -r id name status conclusion branch; do
        local status_icon
        case "$conclusion" in
            "success") status_icon="${GREEN}✓${NC}";;
            "failure") status_icon="${RED}✗${NC}";;
            "cancelled") status_icon="${YELLOW}⊘${NC}";;
            *) status_icon="${GRAY}○${NC}";;
        esac
        printf "%s %-12s %-20s %-12s %-10s %s\n" "$status_icon" "$id" "${name:0:18}" "$status" "$conclusion" "$branch"
    done
}

# 特定のWorkflow Runの詳細を取得
get_run() {
    if _check_for_help "$@"; then
        echo "使用方法: $0 actions get <run_id>"
        return 0
    fi

    local run_id="$1"
    if [ -z "$run_id" ]; then
        echo -e "${RED}エラー: Run IDを指定してください${NC}" >&2
        return 1
    fi

    echo -e "${BLUE}Workflow Run #${run_id} を取得中... ($(get_repo_info))${NC}"
    echo ""

    local response
    response=$(call_api "GET" "/actions/runs/${run_id}")

    if [ -z "$response" ]; then
        return 1
    fi

    local name status conclusion branch created_at html_url
    name=$(echo "$response" | jq -r '.name')
    status=$(echo "$response" | jq -r '.status')
    conclusion=$(echo "$response" | jq -r '.conclusion // "N/A"')
    branch=$(echo "$response" | jq -r '.head_branch')
    created_at=$(echo "$response" | jq -r '.created_at')
    html_url=$(echo "$response" | jq -r '.html_url')

    echo -e "${GREEN}Run #${run_id}${NC} ${name}"
    echo "----------------------------------------------"
    echo -e "${CYAN}ステータス:${NC}   ${status}"
    echo -e "${CYAN}結論:${NC}         ${conclusion}"
    echo -e "${CYAN}ブランチ:${NC}     ${branch}"
    echo -e "${CYAN}作成日:${NC}       ${created_at}"
    echo -e "${CYAN}URL:${NC}          ${html_url}"
}

# Workflow RunのJobsを取得
get_jobs() {
    if _check_for_help "$@"; then
        echo "使用方法: $0 actions jobs <run_id>"
        return 0
    fi

    local run_id="$1"
    if [ -z "$run_id" ]; then
        echo -e "${RED}エラー: Run IDを指定してください${NC}" >&2
        return 1
    fi

    echo -e "${BLUE}Run #${run_id} のJobs一覧を取得中... ($(get_repo_info))${NC}"
    echo ""

    local response
    response=$(call_api "GET" "/actions/runs/${run_id}/jobs")

    if [ -z "$response" ]; then
        return 1
    fi

    local count
    count=$(echo "$response" | jq '.total_count')

    if [ "$count" -eq 0 ]; then
        echo -e "${YELLOW}Jobsが見つかりません${NC}"
        return
    fi

    echo "$response" | jq -r '.jobs[] | "----------------------------------------------\n\u001b[32mJob:\u001b[0m \(.name)\n\u001b[36mID:\u001b[0m \(.id)\n\u001b[36mステータス:\u001b[0m \(.status)\n\u001b[36m結論:\u001b[0m \(.conclusion // "N/A")\n"'
}

# Workflow RunのLogsをダウンロード
get_logs() {
    if _check_for_help "$@"; then
        echo "使用方法: $0 actions logs <run_id>"
        return 0
    fi

    local run_id="$1"
    if [ -z "$run_id" ]; then
        echo -e "${RED}エラー: Run IDを指定してください${NC}" >&2
        return 1
    fi

    echo -e "${BLUE}Run #${run_id} のログを取得中... ($(get_repo_info))${NC}"
    echo ""

    local token repo
    token=$(get_token)
    repo=$(get_repo_info)

    # ログURLを取得（リダイレクト先）
    local log_url header_response
    header_response=$(curl -s -I -H "Authorization: token $token" \
        -H "Accept: application/vnd.github.v3+json" \
        "https://api.github.com/repos/${repo}/actions/runs/${run_id}/logs" 2>&1)

    log_url=$(echo "$header_response" | grep -i "^location:" | sed 's/location: //i' | tr -d '\r')

    if [ -z "$log_url" ]; then
        echo -e "${YELLOW}⚠️ ログURLを取得できませんでした。ジョブステップ情報を表示します。${NC}"
        echo ""
        _show_job_steps "$run_id"
        return 0
    fi

    # ZIPをダウンロードして展開
    local temp_dir="/tmp/actions-logs-${run_id}"
    mkdir -p "$temp_dir"

    echo "ダウンロード中..."
    if ! curl -sL --max-time 30 "$log_url" -o "${temp_dir}/logs.zip" 2>/dev/null; then
        echo -e "${YELLOW}⚠️ ログのダウンロードに失敗しました（ネットワーク制限の可能性）${NC}"
        echo -e "${GRAY}リダイレクト先: ${log_url:0:60}...${NC}"
        echo ""
        echo -e "${BLUE}代わりにジョブステップ情報を表示します:${NC}"
        echo ""
        _show_job_steps "$run_id"
        return 0
    fi

    # ZIPファイルの検証
    if [ ! -s "${temp_dir}/logs.zip" ] || ! file "${temp_dir}/logs.zip" | grep -q "Zip archive"; then
        echo -e "${YELLOW}⚠️ ダウンロードしたファイルが無効です${NC}"
        echo ""
        echo -e "${BLUE}代わりにジョブステップ情報を表示します:${NC}"
        echo ""
        _show_job_steps "$run_id"
        return 0
    fi

    echo "展開中..."
    unzip -q -o "${temp_dir}/logs.zip" -d "$temp_dir"

    echo ""
    echo -e "${GREEN}ログファイル:${NC}"
    ls -la "$temp_dir"/*.txt 2>/dev/null || echo "テキストログが見つかりません"

    echo ""
    echo -e "${CYAN}ログディレクトリ:${NC} ${temp_dir}"
    echo ""

    # 最初のログファイルの内容を表示（code-review jobを優先）
    local log_file
    log_file=$(ls "$temp_dir"/*code-review*.txt 2>/dev/null | head -1)
    if [ -z "$log_file" ]; then
        log_file=$(ls "$temp_dir"/*.txt 2>/dev/null | head -1)
    fi

    if [ -n "$log_file" ]; then
        echo -e "${CYAN}=== $(basename "$log_file") ===${NC}"
        echo ""
        cat "$log_file"
    fi
}

# ジョブのステップ情報を表示（フォールバック用）
_show_job_steps() {
    local run_id="$1"

    # ジョブ一覧を取得
    local jobs_response
    jobs_response=$(call_api "GET" "/actions/runs/${run_id}/jobs")

    if [ -z "$jobs_response" ]; then
        echo -e "${RED}ジョブ情報の取得に失敗しました${NC}"
        return 1
    fi

    # 各ジョブのステップを表示
    echo "$jobs_response" | jq -r '.jobs[] | "----------------------------------------------\n\u001b[32mJob:\u001b[0m \(.name)\n\u001b[36mステータス:\u001b[0m \(.status) (\(.conclusion // "running"))\n\n\u001b[33mステップ:\u001b[0m"'

    echo "$jobs_response" | jq -r '.jobs[].steps[] | "  [\(.conclusion // "running" | if . == "success" then "✓" elif . == "failure" then "✗" elif . == "skipped" then "⏭" else "○" end)] \(.name)"'

    echo ""
    echo -e "${CYAN}詳細ログはGitHubで確認:${NC}"
    local html_url
    html_url=$(call_api "GET" "/actions/runs/${run_id}" | jq -r '.html_url')
    echo "$html_url"
}

# PRに関連するWorkflow Runsを取得
pr_runs() {
    if _check_for_help "$@"; then
        echo "使用方法: $0 actions pr-runs <pr_number>"
        return 0
    fi

    local pr_number="$1"
    if [ -z "$pr_number" ]; then
        echo -e "${RED}エラー: PR番号を指定してください${NC}" >&2
        return 1
    fi

    echo -e "${BLUE}PR #${pr_number} に関連するWorkflow Runsを取得中... ($(get_repo_info))${NC}"
    echo ""

    # PRのhead branchを取得
    local pr_response head_branch
    pr_response=$(call_api "GET" "/pulls/${pr_number}")
    head_branch=$(echo "$pr_response" | jq -r '.head.ref')

    if [ -z "$head_branch" ] || [ "$head_branch" == "null" ]; then
        echo -e "${RED}エラー: PRのブランチを取得できませんでした${NC}" >&2
        return 1
    fi

    echo -e "${CYAN}ブランチ:${NC} ${head_branch}"
    echo ""

    # ブランチに関連するrunsを取得
    local response
    response=$(call_api "GET" "/actions/runs?branch=${head_branch}&per_page=10")

    if [ -z "$response" ]; then
        return 1
    fi

    local count
    count=$(echo "$response" | jq '.total_count')

    if [ "$count" -eq 0 ]; then
        echo -e "${YELLOW}Workflow Runが見つかりません${NC}"
        return
    fi

    printf "${GRAY}%-12s %-25s %-12s %-10s${NC}\n" "Run ID" "Workflow" "Status" "結論"
    echo "--------------------------------------------------------------"
    echo "$response" | jq -r '.workflow_runs[] | "\(.id)\t\(.name)\t\(.status)\t\(.conclusion // "N/A")"' | while IFS=$'\t' read -r id name status conclusion; do
        local status_icon
        case "$conclusion" in
            "success") status_icon="${GREEN}✓${NC}";;
            "failure") status_icon="${RED}✗${NC}";;
            "cancelled") status_icon="${YELLOW}⊘${NC}";;
            *) status_icon="${GRAY}○${NC}";;
        esac
        printf "%s %-12s %-25s %-12s %-10s\n" "$status_icon" "$id" "${name:0:23}" "$status" "$conclusion"
    done
}

show_actions_help() {
    echo "使用方法: $0 actions <サブコマンド> [オプション]"
    echo ""
    echo "サブコマンド:"
    echo "  list [-w <workflow>] [-b <branch>] [-n <件数>]"
    echo "                                Workflow Run一覧を表示"
    echo "  get <run_id>                  Workflow Run詳細を表示"
    echo "  jobs <run_id>                 Workflow RunのJobs一覧を表示"
    echo "  logs <run_id>                 Workflow Runのログを取得"
    echo "  pr-runs <pr_number>           PRに関連するWorkflow Runsを表示"
}
