#!/usr/bin/env python3
"""
MCP Server for article similarity search with EmbeddingGemma

Provides tools:
- search_similar: Search for similar articles using semantic similarity
"""

import sys
import asyncio
from typing import Any
from mcp.server import Server
from mcp.types import Tool, TextContent
from pydantic import BaseModel, Field

from embedding import get_embedding_generator
from db import get_article_db


# Tool input schema
class SearchSimilarInput(BaseModel):
    query_text: str = Field(description="Query text for similarity search")
    limit: int = Field(default=5, description="Maximum number of results")
    min_similarity: float = Field(default=0.5, description="Minimum similarity threshold (0.0-1.0)")


# Create MCP server
app = Server("embedding")


@app.list_tools()
async def list_tools() -> list[Tool]:
    """List available tools"""
    return [
        Tool(
            name="search_similar",
            description="Search for similar articles using semantic similarity. Returns top N similar articles with similarity scores.",
            inputSchema=SearchSimilarInput.model_json_schema()
        )
    ]


@app.call_tool()
async def call_tool(name: str, arguments: Any) -> list[TextContent]:
    """Handle tool calls"""

    if name == "search_similar":
        # Search for similar articles
        args = SearchSimilarInput(**arguments)

        # Generate query embedding
        generator = get_embedding_generator()
        query_vector = generator.generate_embedding(args.query_text)

        # Search database
        db = get_article_db()
        results = db.search_similar(
            query_vector=query_vector,
            limit=args.limit,
            min_similarity=args.min_similarity
        )

        if not results:
            return [TextContent(
                type="text",
                text=f"No similar articles found (min_similarity: {args.min_similarity})"
            )]

        # Format results
        output = f"Found {len(results)} similar articles:\n\n"
        for i, (article, similarity) in enumerate(results, 1):
            output += f"{i}. [{similarity:.3f}] {article['title']}\n"
            output += f"   URL: {article['url']}\n"
            output += f"   Summary: {article['summary'][:100]}...\n\n"

        return [TextContent(type="text", text=output)]

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
