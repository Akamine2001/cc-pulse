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
    echo "GitHub Client Script"
    echo ""
    echo "Usage:"
    echo "  $0 <command> <subcommand> [options]"
    echo ""
    echo "Commands:"
    echo "  issue              Issue操作"
    echo "  pr                 Pull Request操作"
    echo ""
    echo "Issue Subcommands:"
    echo "  list"
    echo "  get <number>"
    echo "  create -t <title> [-b <body>] [-l <labels>]"
    echo "  update <number> [-t <title>] [-b <body>] [-s <state>]"
    echo ""
    echo "PR Subcommands:"
    echo "  list"
    echo "  get <number>"
    echo "  diff <number>"
    echo "  checks <number>"
    echo "  create -t <title> [-b <body>] [-B <base>] [-H <head>]"
    echo "  review <number> <approve|request-changes|comment> [-b <body>]"
    echo "  close <number>"
    echo ""
    echo "Options:"
    echo "  -h, --help         Show this help message"
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
                *) show_help; exit 1;;
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
                create) create_pr "$@";;
                review) add_pr_review "$@";;
                close) close_pr "$@";;
                *) show_help; exit 1;;
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
