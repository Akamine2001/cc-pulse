#!/usr/bin/env python3
"""
Batch embedding processor for articles

Reads articles from JSON file and saves embeddings to database
"""

import sys
import json
import hashlib
from pathlib import Path
from typing import List, Dict

from embedding import get_embedding_generator
from db import get_article_db


def generate_article_id(url: str) -> str:
    """Generate unique article ID from URL"""
    return hashlib.sha256(url.encode('utf-8')).hexdigest()[:16]


def process_articles(articles: List[Dict]) -> Dict:
    """
    Process articles: generate embeddings and save to database

    Args:
        articles: List of article dictionaries with summary field

    Returns:
        Processing statistics
    """
    generator = get_embedding_generator()
    db = get_article_db()

    success_count = 0
    error_count = 0
    errors = []

    for i, article in enumerate(articles, 1):
        try:
            # Use article ID from JSON (UUID)
            article_id = article.get('id')
            if not article_id:
                print(f"  [{i}/{len(articles)}] Skipped (no ID): {article['title'][:40]}...")
                continue

            # Generate embedding from summary
            summary = article.get('summary', '')
            if not summary:
                print(f"  [{i}/{len(articles)}] Skipped (no summary): {article['title'][:40]}...")
                continue

            vector = generator.generate_embedding(summary)

            # Save to database
            db.insert_article(
                article_id=article_id,
                title=article['title'],
                summary=summary,
                url=article['url'],
                source_domain=article.get('source_domain', ''),
                vector=vector,
                tags=article.get('key_points', [])[:5]  # Use first 5 key points as tags
            )

            print(f"  [{i}/{len(articles)}] ✓ {article['title'][:40]}...")
            success_count += 1

        except Exception as e:
            error_count += 1
            error_msg = f"Error processing {article.get('url', 'unknown')}: {e}"
            errors.append(error_msg)
            print(f"  [{i}/{len(articles)}] ✗ {error_msg}")

    return {
        'success': success_count,
        'errors': error_count,
        'error_messages': errors
    }


def main():
    """Main entry point"""
    if len(sys.argv) < 2:
        print("Usage: python batch_embed.py <json_file_path>")
        sys.exit(1)

    json_path = Path(sys.argv[1])

    if not json_path.exists():
        print(f"Error: JSON file not found: {json_path}")
        sys.exit(1)

    print(f"📥 Loading articles from {json_path}...")

    try:
        with open(json_path, 'r', encoding='utf-8') as f:
            data = json.load(f)

        articles = data.get('news', [])

        if not articles:
            print("No articles found in JSON file")
            sys.exit(0)

        print(f"Found {len(articles)} articles\n")
        print("🔧 Processing articles...")

        stats = process_articles(articles)

        print(f"\n{'='*70}")
        print("✅ Processing complete")
        print(f"{'='*70}")
        print(f"  Success: {stats['success']}")
        print(f"  Errors: {stats['errors']}")

        if stats['error_messages']:
            print(f"\n⚠️  Error details:")
            for err in stats['error_messages']:
                print(f"  - {err}")

        # Output stats as JSON for TypeScript to read
        print(f"\nSTATS_JSON:{json.dumps(stats)}")

    except Exception as e:
        print(f"Fatal error: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)


if __name__ == "__main__":
    main()
