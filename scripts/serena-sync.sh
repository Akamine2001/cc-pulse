#!/bin/bash
# cc-pulse: Serena Context Auto-Sync Script
# This script automatically syncs .serena directory to GitHub Releases
# Triggered by ClaudeCode SessionStart hook

set -e

# プロジェクトディレクトリを検出
PROJECT_DIR="${CLAUDE_PROJECT_DIR:-$(pwd)}"

# .serenaディレクトリが存在する場合のみ同期
if [ -d "${PROJECT_DIR}/.serena" ]; then
  {
    echo "[$(date)] Starting Serena context sync for cc-pulse..."

    # GitHubユーザー名を取得
    USERNAME=$(cd "${PROJECT_DIR}" && git config user.name 2>/dev/null || echo "${USER}")
    TAG="serena-${USERNAME}"

    # 一時ファイル作成
    TEMP_FILE="/tmp/serena-${USERNAME}-$(date +%s).tar.gz"

    # エラー時・終了時に一時ファイルを確実にクリーンアップ
    trap 'rm -f "${TEMP_FILE}"' EXIT ERR

    # .serenaディレクトリ全体をアーカイブ
    echo "[$(date)] Creating archive: ${TEMP_FILE}"
    tar -czf "${TEMP_FILE}" -C "${PROJECT_DIR}" .serena

    # GitHub CLIでRelease更新
    cd "${PROJECT_DIR}"
    REPO_URL=$(git config --get remote.origin.url | sed 's/.*://;s/.git$//')

    if gh release view "${TAG}" &>/dev/null; then
      # 既存Releaseを更新
      echo "[$(date)] Updating existing release: ${TAG}"
      gh release upload "${TAG}" "${TEMP_FILE}" \
        --clobber \
        -R "${REPO_URL}"
    else
      # 新規Release作成
      echo "[$(date)] Creating new release: ${TAG}"
      gh release create "${TAG}" \
        --title "${USERNAME}'s Serena Context" \
        --notes "Auto-synced Serena context for cc-pulse project (Updated: $(date))" \
        "${TEMP_FILE}" \
        -R "${REPO_URL}"
    fi

    # クリーンアップ
    rm -f "${TEMP_FILE}"

    echo "[$(date)] Serena sync completed successfully"
  } >> ~/.claude/serena-sync.log 2>&1 &
else
  # .serenaが存在しない場合はログのみ
  {
    echo "[$(date)] No .serena directory found in ${PROJECT_DIR}, skipping sync"
  } >> ~/.claude/serena-sync.log 2>&1
fi
