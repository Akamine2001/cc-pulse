#!/usr/bin/env python3
"""
Database layer for article storage with vector embeddings

Uses SQLite to store articles and their embeddings.
Implements vector similarity search using cosine similarity.
"""

import sqlite3
import json
from pathlib import Path
from typing import List, Dict, Optional, Tuple
from datetime import datetime
import numpy as np


class ArticleDatabase:
    """
    Article database with vector embedding support

    Schema:
        articles (
            id TEXT PRIMARY KEY,
            title TEXT,
            summary TEXT,
            url TEXT UNIQUE,
            source_domain TEXT,
            tags TEXT,  -- JSON array
            vector BLOB,  -- numpy array as bytes
            created_at TEXT,
            updated_at TEXT
        )
    """

    def __init__(self, db_path: Optional[Path] = None):
        """
        Initialize database

        Args:
            db_path: Path to SQLite database file (default: ~/.cc-pulse/articles.db)
        """
        self.db_path = db_path or self._get_default_db_path()
        self.db_path.parent.mkdir(parents=True, exist_ok=True)
        self.conn = None
        self._init_db()

    def _get_default_db_path(self) -> Path:
        """Get default database path"""
        return Path.home() / '.cc-pulse' / 'articles.db'

    def _init_db(self):
        """Initialize database schema"""
        self.conn = sqlite3.connect(str(self.db_path))
        self.conn.execute('''
            CREATE TABLE IF NOT EXISTS articles (
                id TEXT PRIMARY KEY,
                title TEXT NOT NULL,
                summary TEXT,
                url TEXT NOT NULL,
                source_domain TEXT,
                tags TEXT,
                vector BLOB,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL,
                is_good INTEGER
            )
        ''')
        self.conn.execute('''
            CREATE INDEX IF NOT EXISTS idx_articles_created_at ON articles(created_at)
        ''')
        self.conn.commit()

    def insert_article(
        self,
        article_id: str,
        title: str,
        summary: str,
        url: str,
        source_domain: str,
        vector: np.ndarray,
        tags: Optional[List[str]] = None
    ) -> bool:
        """
        Insert article with embedding

        Args:
            article_id: Unique article ID (UUID)
            title: Article title
            summary: Article summary
            url: Article URL
            source_domain: Source domain
            vector: Embedding vector (768-dim numpy array)
            tags: Optional tags

        Returns:
            True if successful
        """
        now = datetime.utcnow().isoformat()
        tags_json = json.dumps(tags or [])
        vector_bytes = vector.tobytes()

        # Insert article (no upsert - each collection instance is unique)
        self.conn.execute('''
            INSERT INTO articles (
                id, title, summary, url, source_domain, tags, vector, created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        ''', (article_id, title, summary, url, source_domain, tags_json, vector_bytes, now, now))

        self.conn.commit()
        return True

    def get_article_by_id(self, article_id: str) -> Optional[Dict]:
        """Get article by ID"""
        cursor = self.conn.execute('''
            SELECT id, title, summary, url, source_domain, tags, vector, created_at, updated_at
            FROM articles
            WHERE id = ?
        ''', (article_id,))

        row = cursor.fetchone()
        if not row:
            return None

        return self._row_to_dict(row)

    def get_article_by_url(self, url: str) -> Optional[Dict]:
        """Get article by URL"""
        cursor = self.conn.execute('''
            SELECT id, title, summary, url, source_domain, tags, vector, created_at, updated_at
            FROM articles
            WHERE url = ?
        ''', (url,))

        row = cursor.fetchone()
        if not row:
            return None

        return self._row_to_dict(row)

    def search_similar(
        self,
        query_vector: np.ndarray,
        limit: int = 10,
        min_similarity: float = 0.5
    ) -> List[Tuple[Dict, float]]:
        """
        Search for similar articles using cosine similarity

        Args:
            query_vector: Query embedding vector
            limit: Maximum number of results
            min_similarity: Minimum similarity threshold (0.0 to 1.0)

        Returns:
            List of (article_dict, similarity_score) tuples, sorted by similarity descending
        """
        cursor = self.conn.execute('''
            SELECT id, title, summary, url, source_domain, tags, vector, created_at, updated_at
            FROM articles
        ''')

        results = []

        for row in cursor:
            article = self._row_to_dict(row)
            article_vector = article['vector']

            # Calculate cosine similarity
            similarity = self._cosine_similarity(query_vector, article_vector)

            if similarity >= min_similarity:
                # Remove vector from result (save memory)
                article_without_vector = {k: v for k, v in article.items() if k != 'vector'}
                results.append((article_without_vector, similarity))

        # Sort by similarity descending
        results.sort(key=lambda x: x[1], reverse=True)

        return results[:limit]

    def get_all_articles(self, limit: Optional[int] = None) -> List[Dict]:
        """Get all articles (without vectors)"""
        query = '''
            SELECT id, title, summary, url, source_domain, tags, created_at, updated_at
            FROM articles
            ORDER BY created_at DESC
        '''

        if limit:
            query += f' LIMIT {limit}'

        cursor = self.conn.execute(query)
        return [self._row_to_dict(row, include_vector=False) for row in cursor]

    def delete_article(self, article_id: str) -> bool:
        """Delete article by ID"""
        self.conn.execute('DELETE FROM articles WHERE id = ?', (article_id,))
        self.conn.commit()
        return True

    def get_stats(self) -> Dict:
        """Get database statistics"""
        cursor = self.conn.execute('SELECT COUNT(*) FROM articles')
        total_count = cursor.fetchone()[0]

        return {
            'total_articles': total_count,
            'db_path': str(self.db_path),
            'db_size_bytes': self.db_path.stat().st_size if self.db_path.exists() else 0
        }

    def _row_to_dict(self, row: tuple, include_vector: bool = True) -> Dict:
        """Convert database row to dictionary"""
        result = {
            'id': row[0],
            'title': row[1],
            'summary': row[2],
            'url': row[3],
            'source_domain': row[4],
            'tags': json.loads(row[5]) if len(row) > 5 and row[5] else [],
        }

        if include_vector and len(row) > 6 and row[6]:
            result['vector'] = np.frombuffer(row[6], dtype=np.float32)

        if len(row) > 7:
            result['created_at'] = row[7] if len(row) > 7 else None
            result['updated_at'] = row[8] if len(row) > 8 else None

        return result

    def _cosine_similarity(self, vec1: np.ndarray, vec2: np.ndarray) -> float:
        """Calculate cosine similarity"""
        dot_product = np.dot(vec1, vec2)
        norm_a = np.linalg.norm(vec1)
        norm_b = np.linalg.norm(vec2)

        if norm_a == 0 or norm_b == 0:
            return 0.0

        return float(dot_product / (norm_a * norm_b))

    def close(self):
        """Close database connection"""
        if self.conn:
            self.conn.close()
            self.conn = None


# Singleton instance
_article_db: Optional[ArticleDatabase] = None


def get_article_db() -> ArticleDatabase:
    """Get or create singleton article database"""
    global _article_db

    if _article_db is None:
        _article_db = ArticleDatabase()

    return _article_db
