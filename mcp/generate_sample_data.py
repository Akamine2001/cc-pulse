#!/usr/bin/env python3
"""
Generate sample news data for testing cc-pulse

Creates sample JSON files and SQLite database entries with embeddings
for development and testing purposes.
"""

import sys
import json
import uuid
from pathlib import Path
from datetime import datetime, timedelta
from typing import List, Dict

from embedding import get_embedding_generator
from db import get_article_db


# Sample Japanese news articles about AI/ML
SAMPLE_ARTICLES = [
    {
        "title": "Google、新型AIモデル「Gemini 2.5 Pro」を発表",
        "summary": "Googleは最新の大規模言語モデル「Gemini 2.5 Pro」を発表しました。このモデルは前世代と比較して推論能力が大幅に向上し、複雑なコーディングタスクやデータ分析において高い性能を示しています。特に長文コンテキストの理解力が強化され、最大100万トークンまで対応可能となりました。",
        "key_points": [
            "推論能力の大幅向上",
            "100万トークンのコンテキスト対応",
            "コーディングとデータ分析に特化"
        ],
        "url": "https://example.com/gemini-2-5-pro-announcement",
        "source_domain": "example.com",
        "original_language": "ja",
        "published_at": None,
        "thumbnail_url": None
    },
    {
        "title": "OpenAI、GPT-5の開発を正式に発表",
        "summary": "OpenAIは次世代の言語モデルGPT-5の開発を正式に発表しました。GPT-5は推論能力、数学的問題解決、プログラミング支援において飛躍的な進化を遂げるとされています。また、マルチモーダル機能が強化され、画像、音声、動画の理解と生成が統合されます。",
        "key_points": [
            "推論能力と数学的問題解決の向上",
            "マルチモーダル機能の強化",
            "2026年初頭のリリース予定"
        ],
        "url": "https://example.com/gpt5-announcement",
        "source_domain": "example.com",
        "original_language": "ja",
        "published_at": None,
        "thumbnail_url": None
    },
    {
        "title": "Anthropic、Claude 4の新機能「プロジェクトメモリ」を公開",
        "summary": "Anthropicは対話型AI「Claude」の最新版で、プロジェクト全体のコンテキストを記憶する「プロジェクトメモリ」機能を追加しました。この機能により、開発者は過去の会話履歴や設定を保持したまま、長期的なプロジェクトで効率的にClaudeを活用できます。",
        "key_points": [
            "長期プロジェクト向けメモリ機能",
            "コンテキストの自動保持",
            "開発効率の大幅向上"
        ],
        "url": "https://example.com/claude-project-memory",
        "source_domain": "example.com",
        "original_language": "ja",
        "published_at": None,
        "thumbnail_url": None
    },
    {
        "title": "Meta、オープンソースAIモデル「Llama 4」をリリース",
        "summary": "Metaは最新のオープンソース大規模言語モデル「Llama 4」を公開しました。Llama 4は商用利用が可能で、企業や研究者が独自のAIアプリケーションを構築できます。性能面ではGPT-4に匹敵し、特に多言語対応とコード生成において優れた結果を示しています。",
        "key_points": [
            "完全オープンソースで商用利用可能",
            "GPT-4レベルの性能",
            "多言語対応とコード生成に強み"
        ],
        "url": "https://example.com/llama4-release",
        "source_domain": "example.com",
        "original_language": "ja",
        "published_at": None,
        "thumbnail_url": None
    },
    {
        "title": "日本のAIスタートアップ、医療診断支援システムで臨床試験開始",
        "summary": "東京に拠点を置くAIスタートアップが開発した医療診断支援システムが、国内の大学病院で臨床試験を開始しました。このシステムは画像診断と患者データの分析により、医師の診断精度を向上させることを目的としています。初期段階の試験では95%以上の精度が確認されています。",
        "key_points": [
            "国内大学病院で臨床試験開始",
            "画像診断と患者データ分析を統合",
            "95%以上の診断精度"
        ],
        "url": "https://example.com/japan-ai-medical-diagnosis",
        "source_domain": "example.com",
        "original_language": "ja",
        "published_at": None,
        "thumbnail_url": None
    },
    {
        "title": "NVIDIA、AI専用チップ「H200」の量産開始を発表",
        "summary": "NVIDIAは次世代AI専用チップ「H200」の量産開始を発表しました。H200は前世代のH100と比較して、推論速度が2倍、消費電力効率が30%向上しています。大規模言語モデルのトレーニングと推論において、業界最高水準の性能を提供します。",
        "key_points": [
            "推論速度2倍、電力効率30%向上",
            "大規模言語モデルに最適化",
            "2025年後半から出荷開始"
        ],
        "url": "https://example.com/nvidia-h200-announcement",
        "source_domain": "example.com",
        "original_language": "ja",
        "published_at": None,
        "thumbnail_url": None
    },
    {
        "title": "MicrosoftとOpenAI、企業向けAIソリューション「GPT Enterprise」を発表",
        "summary": "MicrosoftとOpenAIは共同で、企業向けAIソリューション「GPT Enterprise」を発表しました。このサービスは、企業の機密データを保護しながら、カスタマイズされたAIアシスタントを構築できます。Azure上で動作し、既存の企業システムとシームレスに統合可能です。",
        "key_points": [
            "企業データの完全保護",
            "カスタマイズ可能なAIアシスタント",
            "Azure統合でシームレスな導入"
        ],
        "url": "https://example.com/gpt-enterprise-launch",
        "source_domain": "example.com",
        "original_language": "ja",
        "published_at": None,
        "thumbnail_url": None
    },
    {
        "title": "AI生成コンテンツの透明性を求める国際的な規制案が提出",
        "summary": "EUと米国の規制当局が共同で、AI生成コンテンツに透明性を求める規制案を提出しました。この案では、AIが生成したテキスト、画像、動画に明示的なラベル付けを義務化し、消費者が人間とAIを区別できるようにすることを目指しています。",
        "key_points": [
            "AI生成コンテンツへのラベル義務化",
            "EUと米国が共同提案",
            "2026年施行予定"
        ],
        "url": "https://example.com/ai-content-transparency-regulation",
        "source_domain": "example.com",
        "original_language": "ja",
        "published_at": None,
        "thumbnail_url": None
    },
    {
        "title": "AI研究者ら、大規模言語モデルの「幻覚」問題に新手法で対処",
        "summary": "スタンフォード大学とMITの研究チームが、大規模言語モデルの「幻覚」（事実に基づかない情報生成）問題を大幅に削減する新手法を発表しました。この手法は、モデルの内部表現を分析し、信頼度の低い出力を検出して修正します。実験では幻覚率を70%削減できました。",
        "key_points": [
            "幻覚率を70%削減",
            "内部表現分析による信頼度検出",
            "スタンフォード大学とMITの共同研究"
        ],
        "url": "https://example.com/llm-hallucination-reduction",
        "source_domain": "example.com",
        "original_language": "ja",
        "published_at": None,
        "thumbnail_url": None
    },
    {
        "title": "GitHub Copilot、マルチファイル編集機能を追加",
        "summary": "GitHubはAIペアプログラミングツール「Copilot」に、複数ファイルにまたがるコード編集機能を追加しました。この機能により、開発者は自然言語で複雑なリファクタリングを指示でき、Copilotが関連する全てのファイルを自動的に更新します。",
        "key_points": [
            "マルチファイル編集対応",
            "自然言語による複雑なリファクタリング",
            "関連ファイルの自動更新"
        ],
        "url": "https://example.com/github-copilot-multifile",
        "source_domain": "example.com",
        "original_language": "ja",
        "published_at": None,
        "thumbnail_url": None
    },
    {
        "title": "AI翻訳技術、リアルタイム会議通訳で人間レベルに到達",
        "summary": "Google翻訳とDeepLが共同開発したリアルタイム会議通訳システムが、プロの通訳者と同等の精度に到達したことが報告されました。このシステムは、話者の意図やニュアンスを保持しながら、20言語以上に対応します。ビデオ会議ツールへの統合も進んでいます。",
        "key_points": [
            "プロ通訳者レベルの精度",
            "20言語以上対応",
            "ビデオ会議ツールへの統合"
        ],
        "url": "https://example.com/ai-realtime-interpretation",
        "source_domain": "example.com",
        "original_language": "ja",
        "published_at": None,
        "thumbnail_url": None
    },
    {
        "title": "自動運転技術、AIによる異常気象対応能力が向上",
        "summary": "Teslaと日本の自動車メーカーが共同開発した自動運転システムが、豪雨や濃霧などの異常気象下での走行精度を大幅に向上させました。新しいAIアルゴリズムは、複数のセンサーデータを統合し、視界不良時でも安全な走行を実現します。",
        "key_points": [
            "異常気象下での走行精度向上",
            "複数センサーデータの統合",
            "Teslaと日本メーカーの共同開発"
        ],
        "url": "https://example.com/autonomous-driving-weather",
        "source_domain": "example.com",
        "original_language": "ja",
        "published_at": None,
        "thumbnail_url": None
    },
    {
        "title": "AI創薬プラットフォーム、新薬候補の発見期間を90%短縮",
        "summary": "英国のバイオテック企業が開発したAI創薬プラットフォームが、新薬候補の発見期間を従来の10年から1年に短縮することに成功しました。このプラットフォームは、分子構造の予測と薬効シミュレーションを自動化し、創薬プロセスを劇的に効率化します。",
        "key_points": [
            "創薬期間を90%短縮",
            "分子構造予測と薬効シミュレーション",
            "英国バイオテック企業が開発"
        ],
        "url": "https://example.com/ai-drug-discovery-platform",
        "source_domain": "example.com",
        "original_language": "ja",
        "published_at": None,
        "thumbnail_url": None
    },
    {
        "title": "AIアシスタント、感情認識機能で顧客サポートを強化",
        "summary": "Amazonは顧客サポート向けAIアシスタントに、音声とテキストから感情を認識する機能を追加しました。この機能により、顧客の感情状態に応じた適切な対応が可能となり、顧客満足度が35%向上しています。プライバシー保護にも配慮した設計です。",
        "key_points": [
            "音声とテキストから感情認識",
            "顧客満足度35%向上",
            "プライバシー保護設計"
        ],
        "url": "https://example.com/ai-assistant-emotion-recognition",
        "source_domain": "example.com",
        "original_language": "ja",
        "published_at": None,
        "thumbnail_url": None
    },
    {
        "title": "量子コンピューターとAIの融合、最適化問題で新記録",
        "summary": "IBMとGoogleの研究チームが、量子コンピューターと機械学習を組み合わせた新しいアルゴリズムを開発し、複雑な最適化問題を従来の1000分の1の時間で解決することに成功しました。この技術は物流、金融、創薬などの分野での応用が期待されています。",
        "key_points": [
            "計算時間を1000分の1に短縮",
            "量子コンピューターとMLの融合",
            "物流・金融・創薬への応用"
        ],
        "url": "https://example.com/quantum-ai-optimization",
        "source_domain": "example.com",
        "original_language": "ja",
        "published_at": None,
        "thumbnail_url": None
    }
]


def generate_daily_news_data(
    date_offset_days: int,
    article_indices: List[int],
    keywords: List[str]
) -> Dict:
    """
    Generate a single daily news data JSON file

    Args:
        date_offset_days: Days to subtract from current date
        article_indices: Indices of articles to include from SAMPLE_ARTICLES
        keywords: Keywords used for this collection

    Returns:
        Daily news data dictionary
    """
    now = datetime.now()
    fetched_at = now - timedelta(days=date_offset_days)

    # Generate articles with UUIDs
    articles = []
    for idx in article_indices:
        if idx >= len(SAMPLE_ARTICLES):
            continue

        article = SAMPLE_ARTICLES[idx].copy()
        article['id'] = str(uuid.uuid4())
        article['is_duplicate'] = False
        article['fetched_at'] = fetched_at.isoformat()

        # Set published_at to a few hours before fetched_at
        published_at = fetched_at - timedelta(hours=(idx % 12 + 1))
        article['published_at'] = published_at.isoformat()

        articles.append(article)

    # Create daily news data structure
    data = {
        'date': fetched_at.strftime('%Y-%m-%d'),
        'fetched_at': fetched_at.isoformat(),
        'keywords': keywords,
        'count': len(articles),
        'news': articles,
        'stats': {
            'total_collected': len(articles),
            'unique_articles': len(articles),
            'duplicate_removed': 0,
            'iterations': 1,
            'duration_ms': 5000
        },
        'errors': []
    }

    return data


def save_to_json(data: Dict, output_dir: Path) -> str:
    """
    Save daily news data to JSON file

    Args:
        data: Daily news data
        output_dir: Output directory path

    Returns:
        Path to saved JSON file
    """
    # Create filename: YYYY-MM-DD_HHMMSS.json
    fetched_dt = datetime.fromisoformat(data['fetched_at'])
    date_str = fetched_dt.strftime('%Y-%m-%d')
    time_str = fetched_dt.strftime('%H%M%S')
    filename = f"{date_str}_{time_str}.json"

    filepath = output_dir / filename

    with open(filepath, 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, indent=2)

    return str(filepath)


def save_to_database(articles: List[Dict]) -> int:
    """
    Save articles with embeddings to SQLite database

    Args:
        articles: List of article dictionaries

    Returns:
        Number of articles saved
    """
    generator = get_embedding_generator()
    db = get_article_db()

    saved_count = 0

    for i, article in enumerate(articles, 1):
        try:
            # Generate embedding from summary
            summary = article.get('summary', '')
            if not summary:
                print(f"  [{i}/{len(articles)}] Skipped (no summary): {article['title'][:40]}...")
                continue

            vector = generator.generate_embedding(summary)

            # Save to database
            db.insert_article(
                article_id=article['id'],
                title=article['title'],
                summary=summary,
                url=article['url'],
                source_domain=article.get('source_domain', ''),
                vector=vector,
                tags=article.get('key_points', [])[:5]
            )

            print(f"  [{i}/{len(articles)}] Saved: {article['title'][:50]}...")
            saved_count += 1

        except Exception as e:
            print(f"  [{i}/{len(articles)}] Error: {e}")

    return saved_count


def update_feedback_samples(articles: List[Dict]) -> None:
    """
    Update some articles with sample is_good values

    Args:
        articles: List of article dictionaries with IDs
    """
    db = get_article_db()

    # Set sample feedback values
    # First article: Good
    if len(articles) > 0:
        db.db.prepare('UPDATE articles SET is_good = ? WHERE id = ?').run(1, articles[0]['id'])
        print(f"  Set feedback 'good' for: {articles[0]['title'][:50]}...")

    # Second article: Bad
    if len(articles) > 1:
        db.db.prepare('UPDATE articles SET is_good = ? WHERE id = ?').run(0, articles[1]['id'])
        print(f"  Set feedback 'bad' for: {articles[1]['title'][:50]}...")

    # Rest: No feedback (NULL)
    print(f"  Remaining {len(articles) - 2} articles have no feedback (NULL)")


def main():
    """Main entry point"""
    import os
    from pathlib import Path

    # Determine output directory
    output_dir = Path.home() / '.local' / 'share' / 'cc-pulse' / 'news'

    # Allow override via environment variable
    if 'CC_PULSE_DATA_DIR' in os.environ:
        output_dir = Path(os.environ['CC_PULSE_DATA_DIR']) / 'news'

    # Create directory if it doesn't exist
    output_dir.mkdir(parents=True, exist_ok=True)

    print("=" * 70)
    print("Sample Data Generator for cc-pulse")
    print("=" * 70)
    print(f"Output directory: {output_dir}\n")

    # Generate 3 collections with different dates and articles
    collections = [
        {
            'date_offset_days': 2,
            'article_indices': [0, 1, 2, 3, 4, 5, 6],
            'keywords': ['AI', 'Machine Learning', 'Claude']
        },
        {
            'date_offset_days': 1,
            'article_indices': [7, 8, 9, 10, 11],
            'keywords': ['AI', '自動運転', '量子コンピューター']
        },
        {
            'date_offset_days': 0,
            'article_indices': [12, 13, 14],
            'keywords': ['AI', 'LLM', 'Gemini']
        }
    ]

    all_articles = []

    # Generate JSON files
    print("Generating JSON files...\n")
    for i, collection in enumerate(collections, 1):
        data = generate_daily_news_data(
            collection['date_offset_days'],
            collection['article_indices'],
            collection['keywords']
        )

        filepath = save_to_json(data, output_dir)
        print(f"[{i}/{len(collections)}] Created: {filepath}")
        print(f"            Articles: {len(data['news'])}")
        print(f"            Keywords: {', '.join(data['keywords'])}\n")

        # Collect all articles for database insertion
        all_articles.extend(data['news'])

    # Save to database with embeddings
    print("Generating embeddings and saving to database...\n")
    saved_count = save_to_database(all_articles)

    print(f"\nSaved {saved_count}/{len(all_articles)} articles to database")

    # Update some articles with sample feedback
    print("\nSetting sample feedback values...\n")
    update_feedback_samples(all_articles)

    # Summary
    print("\n" + "=" * 70)
    print("Sample data generation complete!")
    print("=" * 70)
    print(f"JSON files created: {len(collections)}")
    print(f"Total articles: {len(all_articles)}")
    print(f"Database entries: {saved_count}")
    print(f"\nOutput directory: {output_dir}")
    print("\nNext steps:")
    print("  1. Start web server: bun run dev serve")
    print("  2. Open browser: http://localhost:5775")
    print("=" * 70)


if __name__ == "__main__":
    main()
