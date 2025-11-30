#!/bin/bash
#
# GitHub Client Script
#

set -e

SCRIPT_DIR=$(dirname "$0")
source "${SCRIPT_DIR}/github/common.sh"
source "${SCRIPT_DIR}/github/issue.sh"
source "${SCRIPT_DIR}/github/pr.sh"

# ヘルプ表示
show_help() {
    echo "GitHubクライアントスクリプト"
    echo ""
    echo "使用方法:"
    echo "  $0 <コマンド> <サブコマンド> [オプション]"
    echo ""
    echo "コマンド:"
    echo "  issue              Issue操作"
    echo "  pr                 Pull Request操作"
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
    echo "  $0 issue list"
    echo "  $0 pr get 123"
    echo "  $0 issue create -t \"新規機能\" -b \"機能の詳細\""
}

main() {
    if ! command -v jq &> /dev/null; then
        echo -e "${RED}エラー: jqがインストールされていません${NC}" >&2
        exit 1
    fi

    if [ $# -eq 0 ]; then
        show_help
        exit 0
    fi

    local command="$1"
    shift

    case "$command" in
        issue)
            local subcommand="$1"
            shift
            case "$subcommand" in
                list) list_issues "$@";;
                get) get_issue "$@";;
                create) create_issue "$@";;
                update) update_issue "$@";;
                -h|--help) show_issue_help;;
                *)
                    if [[ -z "$subcommand" ]]; then
                        show_issue_help
                    else
                        echo -e "${RED}エラー: 不明なサブコマンド: $subcommand${NC}" >&2
                        show_issue_help
                    fi
                    exit 1
                    ;;
            esac
            ;;
        pr)
            local subcommand="$1"
            shift
            case "$subcommand" in
                list) list_prs "$@";;
                get) get_pr "$@";;
                diff) pr_diff "$@";;
                checks) pr_checks "$@";;
                comments) pr_comments "$@";;
                create) create_pr "$@";;
                review) add_pr_review "$@";;
                close) close_pr "$@";;
                -h|--help) show_pr_help;;
                *)
                    if [[ -z "$subcommand" ]]; then
                        show_pr_help
                    else
                        echo -e "${RED}エラー: 不明なサブコマンド: $subcommand${NC}" >&2
                        show_pr_help
                    fi
                    exit 1
                    ;;
            esac
            ;;
        -h|--help)
            show_help
            ;;
        *)
            echo -e "${RED}エラー: 不明なコマンド: $command${NC}" >&2
            show_help
            exit 1
            ;;
    esac
}

main "$@"
