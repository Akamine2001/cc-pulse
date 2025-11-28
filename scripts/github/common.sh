#!/bin/bash
#
# GitHub Client - Common Functions
#

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

# API呼び出し共通関数
# usage: call_api <method> <endpoint> [data]
call_api() {
    local method="$1"
    local endpoint="$2"
    local data="$3"

    local token
    token=$(get_token)
    if [ -z "$token" ]; then
        echo -e "${RED}エラー: GH_TOKENまたはGITHUB_TOKEN環境変数を設定してください${NC}" >&2
        return 1
    fi

    local repo
    repo=$(get_repo_info)
    local url="${GITHUB_API}/repos/${repo}${endpoint}"

    local args=(-s -H "Authorization: token $token" -H "Accept: application/vnd.github.v3+json")

    if [ "$method" == "GET_DIFF" ]; then
        args=(-s -H "Authorization: token $token" -H "Accept: application/vnd.github.v3.diff")
        method="GET"
    fi

    if [ -n "$data" ]; then
        args+=(-d "$data")
    fi

    local response
    response=$(curl -X "$method" "${args[@]}" "$url")

    if echo "$response" | jq -e '.message' &>/dev/null; then
        local message
        message=$(echo "$response" | jq -r '.message')
        echo -e "${RED}APIエラー: $message${NC}" >&2
        return 1
    fi

    echo "$response"
}
