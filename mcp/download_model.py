#!/usr/bin/env python3
"""
EmbeddingGemma Q4モデルのダウンロード処理

Usage:
    python download_model.py [--model-dir PATH]

環境変数:
    CC_PULSE_MODEL_DIR: モデル保存先（デフォルト: ~/.cc-pulse/models/）
"""

import sys
import os
from pathlib import Path
from typing import Optional
from huggingface_hub import snapshot_download


def get_model_dir() -> Path:
    """モデル保存先ディレクトリを取得"""
    # 環境変数から取得（優先）
    env_dir = os.getenv('CC_PULSE_MODEL_DIR')
    if env_dir:
        return Path(env_dir)

    # デフォルト: ~/.cc-pulse/models/
    return Path.home() / '.cc-pulse' / 'models'


def check_model_exists(model_dir: Path) -> bool:
    """モデルが既にダウンロード済みかチェック"""
    q4_onnx = model_dir / 'embeddinggemma-q4' / 'onnx' / 'model_q4.onnx'
    q4_data = model_dir / 'embeddinggemma-q4' / 'onnx' / 'model_q4.onnx_data'

    return q4_onnx.exists() and q4_data.exists()


def download_embeddinggemma_q4(model_dir: Path, force: bool = False) -> bool:
    """
    EmbeddingGemma Q4モデルをダウンロード

    Args:
        model_dir: モデル保存先ディレクトリ
        force: 既存モデルを上書きするか

    Returns:
        True: ダウンロード成功, False: スキップまたは失敗
    """
    MODEL_ID = "onnx-community/embeddinggemma-300m-ONNX"
    target_dir = model_dir / 'embeddinggemma-q4'

    # 既存チェック
    if not force and check_model_exists(model_dir):
        print(f"✅ モデルは既にダウンロード済みです: {target_dir}")
        return True

    print("=" * 70)
    print("📥 EmbeddingGemma Q4モデルをダウンロード中...")
    print("=" * 70)
    print(f"  モデルID: {MODEL_ID}")
    print(f"  保存先:   {target_dir}")
    print(f"  サイズ:   約188MB")
    print()

    try:
        # ディレクトリ作成
        target_dir.mkdir(parents=True, exist_ok=True)

        # Q4モデルのみダウンロード
        print("ダウンロード開始...")
        snapshot_download(
            repo_id=MODEL_ID,
            cache_dir=model_dir,
            local_dir=target_dir,
            allow_patterns=[
                "onnx/model_q4.onnx",
                "onnx/model_q4.onnx_data",
                "*.json",
                "tokenizer*",
                "*.txt"
            ],
        )

        print()
        print("=" * 70)
        print("✅ ダウンロード完了！")
        print("=" * 70)
        print(f"  モデルパス: {target_dir}")
        print()

        # 検証
        if check_model_exists(model_dir):
            print("✅ モデルファイルの存在を確認しました")
            return True
        else:
            print("⚠️  警告: モデルファイルが見つかりません")
            return False

    except Exception as e:
        print()
        print("=" * 70)
        print("❌ ダウンロード中にエラーが発生しました")
        print("=" * 70)
        print(f"エラー: {e}")
        print()
        print("トラブルシューティング:")
        print("  1. インターネット接続を確認してください")
        print("  2. ディスク容量（約200MB以上）を確認してください")
        print("  3. 再度実行してみてください: python download_model.py")
        print()
        return False


def main():
    """メイン処理"""
    import argparse

    parser = argparse.ArgumentParser(
        description='EmbeddingGemma Q4モデルのダウンロード'
    )
    parser.add_argument(
        '--model-dir',
        type=Path,
        help='モデル保存先ディレクトリ（デフォルト: ~/.cc-pulse/models/）'
    )
    parser.add_argument(
        '--force',
        action='store_true',
        help='既存モデルを上書きする'
    )

    args = parser.parse_args()

    # モデル保存先
    model_dir = args.model_dir or get_model_dir()

    print(f"モデル保存先: {model_dir}")
    print()

    # ダウンロード実行
    success = download_embeddinggemma_q4(model_dir, force=args.force)

    if success:
        sys.exit(0)
    else:
        sys.exit(1)


if __name__ == "__main__":
    main()
