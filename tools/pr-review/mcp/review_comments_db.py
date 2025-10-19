#!/usr/bin/env python3
"""
Review Comments Database

PR自動レビューのコメント管理用DB
既存Conversationのembeddingを保存・検索
"""

import sqlite3
import json
import sys
import traceback
from pathlib import Path
from typing import List, Dict, Optional, Tuple
from datetime import datetime
import numpy as np


class ReviewCommentsDatabase:
    """
    レビューコメント管理DB

    Schema:
        review_comments (
            comment_id INTEGER PRIMARY KEY,  -- GitHub comment ID
            file_path TEXT NOT NULL,
            line INTEGER,
            category TEXT NOT NULL,
            severity TEXT NOT NULL,
            description TEXT NOT NULL,
            original_comment TEXT NOT NULL,  -- コメント全文
            vector BLOB NOT NULL,            -- 768-dim embedding
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
        )
    """

    def __init__(self, db_path: Optional[Path] = None):
        """
        Initialize database

        Args:
            db_path: Path to SQLite database file (default: .pr-review-comments.db)
        """
        self.db_path = db_path or Path('.pr-review-comments.db')
        self.conn = None
        self._init_db()

    def _init_db(self):
        """Initialize database schema"""
        self.conn = sqlite3.connect(str(self.db_path))
        self.conn.execute('''
            CREATE TABLE IF NOT EXISTS review_comments (
                comment_id INTEGER PRIMARY KEY,
                file_path TEXT NOT NULL,
                line INTEGER,
                category TEXT NOT NULL,
                severity TEXT NOT NULL,
                description TEXT NOT NULL,
                original_comment TEXT NOT NULL,
                vector BLOB NOT NULL,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            )
        ''')
        self.conn.execute('''
            CREATE INDEX IF NOT EXISTS idx_file_path ON review_comments(file_path)
        ''')
        self.conn.execute('''
            CREATE INDEX IF NOT EXISTS idx_created_at ON review_comments(created_at)
        ''')
        self.conn.commit()

    def needs_update(self, comment_id: int, updated_at: str) -> bool:
        """
        Check if comment needs embedding update

        Args:
            comment_id: GitHub comment ID
            updated_at: Updated timestamp from GitHub

        Returns:
            True if comment doesn't exist or has been updated
        """
        cursor = self.conn.execute('''
            SELECT updated_at FROM review_comments WHERE comment_id = ?
        ''', (comment_id,))

        row = cursor.fetchone()
        if not row:
            return True  # Comment doesn't exist, needs insert

        return row[0] != updated_at  # Compare timestamps

    def upsert_comment(
        self,
        comment_id: int,
        file_path: str,
        line: Optional[int],
        category: str,
        severity: str,
        description: str,
        original_comment: str,
        vector: np.ndarray,
        created_at: str,
        updated_at: str
    ) -> bool:
        """
        Insert or update review comment

        Args:
            comment_id: GitHub comment ID
            file_path: File path
            line: Line number (nullable)
            category: Issue category
            severity: Severity level
            description: Issue description
            original_comment: Full comment text
            vector: Embedding vector (768-dim numpy array)
            created_at: Created timestamp
            updated_at: Updated timestamp

        Returns:
            True if successful
        """
        vector_bytes = vector.tobytes()

        try:
            self.conn.execute('''
                INSERT INTO review_comments
                (comment_id, file_path, line, category, severity, description,
                 original_comment, vector, created_at, updated_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(comment_id) DO UPDATE SET
                    file_path = excluded.file_path,
                    line = excluded.line,
                    category = excluded.category,
                    severity = excluded.severity,
                    description = excluded.description,
                    original_comment = excluded.original_comment,
                    vector = excluded.vector,
                    updated_at = excluded.updated_at
            ''', (
                comment_id, file_path, line, category, severity, description,
                original_comment, vector_bytes, created_at, updated_at
            ))
            self.conn.commit()
            return True
        except Exception as e:
            print(f"❌ Failed to upsert comment {comment_id}", file=sys.stderr)
            print(f"   Error: {e}", file=sys.stderr)
            print(f"   Traceback: {traceback.format_exc()}", file=sys.stderr)
            return False

    def search_similar_in_file(
        self,
        file_path: str,
        query_vector: np.ndarray,
        limit: int = 5
    ) -> List[Tuple[Dict, float]]:
        """
        Search for similar comments within the same file

        Args:
            file_path: Target file path
            query_vector: Query embedding vector
            limit: Maximum number of results

        Returns:
            List of (comment_dict, similarity_score) tuples, sorted by similarity descending
        """
        # 同じファイル内のコメントのみ取得
        cursor = self.conn.execute('''
            SELECT comment_id, file_path, line, category, severity,
                   description, original_comment, vector, created_at, updated_at
            FROM review_comments
            WHERE file_path = ?
        ''', (file_path,))

        results = []

        for row in cursor:
            comment = self._row_to_dict(row)
            comment_vector = comment['vector']

            # Calculate cosine similarity
            similarity = self._cosine_similarity(query_vector, comment_vector)

            # Remove vector from result (save memory)
            comment_without_vector = {k: v for k, v in comment.items() if k != 'vector'}
            results.append((comment_without_vector, similarity))

        # Sort by similarity descending
        results.sort(key=lambda x: x[1], reverse=True)

        return results[:limit]

    def cleanup_deleted_comments(self, existing_comment_ids: List[int]) -> int:
        """
        Delete comments that no longer exist on GitHub

        Args:
            existing_comment_ids: List of comment IDs that still exist on GitHub

        Returns:
            Number of deleted comments
        """
        if not existing_comment_ids:
            # Don't delete everything if list is empty
            return 0

        placeholders = ','.join('?' * len(existing_comment_ids))
        cursor = self.conn.execute(f'''
            DELETE FROM review_comments
            WHERE comment_id NOT IN ({placeholders})
        ''', existing_comment_ids)
        self.conn.commit()
        return cursor.rowcount

    def get_all_comments(self) -> List[Dict]:
        """Get all comments (without vectors)"""
        cursor = self.conn.execute('''
            SELECT comment_id, file_path, line, category, severity,
                   description, original_comment, NULL as vector, created_at, updated_at
            FROM review_comments
            ORDER BY created_at DESC
        ''')
        return [self._row_to_dict(row, include_vector=False) for row in cursor]

    def _row_to_dict(self, row: tuple, include_vector: bool = True) -> Dict:
        """Convert database row to dictionary"""
        result = {
            'comment_id': row[0],
            'file_path': row[1],
            'line': row[2],
            'category': row[3],
            'severity': row[4],
            'description': row[5],
            'original_comment': row[6],
            'created_at': row[8],
            'updated_at': row[9]
        }

        if include_vector and len(row) > 7 and row[7]:
            result['vector'] = np.frombuffer(row[7], dtype=np.float32)

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
_review_db: Optional[ReviewCommentsDatabase] = None


def get_review_comments_db(db_path: Optional[Path] = None) -> ReviewCommentsDatabase:
    """Get singleton ReviewCommentsDatabase instance"""
    global _review_db
    if _review_db is None:
        _review_db = ReviewCommentsDatabase(db_path)
    return _review_db
