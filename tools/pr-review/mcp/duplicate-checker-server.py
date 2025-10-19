#!/usr/bin/env python3
"""
MCP Server for duplicate review issue detection

Provides tools:
- check_duplicate_issue: Check if a review issue is duplicate of existing conversations
- initialize_comments_db: Initialize database with existing GitHub comments
"""

import sys
import asyncio
import traceback
from typing import Any, List, Dict
from pathlib import Path
from mcp.server import Server
from mcp.types import Tool, TextContent
from pydantic import BaseModel, Field

# Import from cc-pulse's embedding module
project_root = Path(__file__).parent.parent.parent.parent
sys.path.insert(0, str(project_root / 'mcp'))
from embedding import get_embedding_generator

# Import review comments DB
from review_comments_db import get_review_comments_db


# Tool input schemas
class CheckDuplicateInput(BaseModel):
    file_path: str = Field(description="File path of the issue")
    description: str = Field(description="Description of the issue to check")
    line: int | None = Field(default=None, description="Line number (optional)")


class InitializeDbInput(BaseModel):
    comments: List[Dict[str, Any]] = Field(description="List of existing GitHub comments")


# Create MCP server
app = Server("duplicate-checker")


@app.list_tools()
async def list_tools() -> list[Tool]:
    """List available tools"""
    return [
        Tool(
            name="check_duplicate_issue",
            description=(
                "Check if a review issue is duplicate of existing conversations in the SAME FILE. "
                "Returns similar issues sorted by similarity score. "
                "Similarity >= 0.8: High risk of duplication. "
                "Similarity < 0.8: Use your judgment to determine if it's a duplicate."
            ),
            inputSchema=CheckDuplicateInput.model_json_schema()
        ),
        Tool(
            name="initialize_comments_db",
            description="Initialize review comments database with existing GitHub comments. Call this once before starting review.",
            inputSchema=InitializeDbInput.model_json_schema()
        )
    ]


@app.call_tool()
async def call_tool(name: str, arguments: Any) -> list[TextContent]:
    """Handle tool calls"""

    if name == "check_duplicate_issue":
        args = CheckDuplicateInput(**arguments)

        # Generate embedding for the issue description
        generator = get_embedding_generator()
        query_vector = generator.generate_embedding(args.description)

        # Search for similar issues in the same file
        db = get_review_comments_db()
        similar_issues = db.search_similar_in_file(
            file_path=args.file_path,
            query_vector=query_vector,
            limit=5
        )

        if not similar_issues:
            return [TextContent(
                type="text",
                text=f"✅ No similar issues found in {args.file_path}. This appears to be a new issue."
            )]

        # Format results
        output = f"## Similar issues in {args.file_path}\n\n"
        has_high_similarity = False

        for i, (issue, similarity) in enumerate(similar_issues, 1):
            is_high = similarity >= 0.8
            if is_high:
                has_high_similarity = True
                marker = "⚠️ **HIGH SIMILARITY**"
            else:
                marker = "ℹ️"

            output += f"{i}. {marker} **Similarity: {similarity:.3f}**\n"
            output += f"   - **Line**: {issue['line']}\n"
            output += f"   - **Category**: [{issue['severity']}] {issue['category']}\n"
            output += f"   - **Description**: {issue['description'][:100]}...\n"
            output += f"   - **Original Comment**:\n```\n{issue['original_comment'][:200]}...\n```\n\n"

        if has_high_similarity:
            output += "\n⚠️ **Warning**: One or more existing issues have similarity >= 0.8. This new issue might be a duplicate. Please review carefully before including it in your review.\n"
        else:
            output += "\nℹ️ All similarities are below 0.8. Please use your judgment to determine if any of these are duplicates.\n"

        return [TextContent(type="text", text=output)]

    elif name == "initialize_comments_db":
        args = InitializeDbInput(**arguments)

        db = get_review_comments_db()
        generator = get_embedding_generator()

        success_count = 0
        skipped_count = 0
        for comment in args.comments:
            try:
                comment_id = comment['comment_id']
                updated_at = comment['updated_at']

                # Check if update is needed (差分更新)
                if not db.needs_update(comment_id, updated_at):
                    skipped_count += 1
                    continue

                # Generate embedding for description (更新が必要な場合のみ)
                vector = generator.generate_embedding(comment['description'])

                # Upsert to database
                db.upsert_comment(
                    comment_id=comment_id,
                    file_path=comment['file_path'],
                    line=comment.get('line'),
                    category=comment['category'],
                    severity=comment['severity'],
                    description=comment['description'],
                    original_comment=comment['original_comment'],
                    vector=vector,
                    created_at=comment['created_at'],
                    updated_at=updated_at
                )
                success_count += 1
            except Exception as e:
                comment_id = comment.get('comment_id', 'unknown')
                print(f"❌ Failed to process comment {comment_id}", file=sys.stderr)
                print(f"   Comment data: file={comment.get('file_path')}, line={comment.get('line')}", file=sys.stderr)
                print(f"   Error: {e}", file=sys.stderr)
                print(f"   Traceback: {traceback.format_exc()}", file=sys.stderr)

        # Cleanup deleted comments
        existing_ids = [c['comment_id'] for c in args.comments]
        deleted_count = db.cleanup_deleted_comments(existing_ids)

        return [TextContent(
            type="text",
            text=f"✅ Initialized review comments DB: {success_count} comments processed, {skipped_count} skipped (no update needed), {deleted_count} deleted"
        )]

    else:
        raise ValueError(f"Unknown tool: {name}")


async def main():
    """Run MCP server"""
    from mcp.server.stdio import stdio_server

    async with stdio_server() as (read_stream, write_stream):
        await app.run(
            read_stream,
            write_stream,
            app.create_initialization_options()
        )


if __name__ == "__main__":
    asyncio.run(main())
