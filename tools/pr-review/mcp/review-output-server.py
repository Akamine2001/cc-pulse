#!/usr/bin/env python3
"""
MCP Server for PR review output

Provides tools:
- format_review: Format and validate review data before submission
- submit_review: Submit the final review result
"""

import asyncio
from typing import Any, List, Dict, Optional
from mcp.server import Server
from mcp.types import Tool, TextContent
from pydantic import BaseModel, Field, field_validator


# Severity enum
class ReviewSeverity(str):
    CRITICAL = "critical"
    HIGH = "high"
    MEDIUM = "medium"
    LOW = "low"


# Line range model
class LineRange(BaseModel):
    start: int = Field(description="Start line number")
    end: int = Field(description="End line number")


# Individual review issue
class ReviewIssue(BaseModel):
    severity: str = Field(description="Issue severity: critical, high, medium, or low")
    category: str = Field(description="Issue category")
    description: str = Field(description="Issue description")
    file_path: Optional[str] = Field(default=None, description="File path")
    line_range: Optional[LineRange] = Field(default=None, description="Line range")
    impact: str = Field(description="Impact description")
    suggestion: str = Field(description="Suggested fix")

    @field_validator('severity')
    @classmethod
    def validate_severity(cls, v: str) -> str:
        valid = ['critical', 'high', 'medium', 'low']
        if v not in valid:
            raise ValueError(f"severity must be one of {valid}, got: {v}")
        return v


# Review statistics
class ReviewStats(BaseModel):
    total_issues: int = Field(description="Total number of issues")
    critical: int = Field(description="Number of critical issues")
    high: int = Field(description="Number of high severity issues")
    medium: int = Field(description="Number of medium severity issues")
    low: int = Field(description="Number of low severity issues")


# Tool input schemas
class FormatReviewInput(BaseModel):
    issues: List[ReviewIssue] = Field(description="List of review issues")
    summary: str = Field(description="Review summary (3-5 sentences)")
    stats: ReviewStats = Field(description="Review statistics")


class SubmitReviewInput(BaseModel):
    issues: List[ReviewIssue] = Field(description="List of review issues")
    summary: str = Field(description="Review summary (3-5 sentences)")
    stats: ReviewStats = Field(description="Review statistics")


# Create MCP server
app = Server("review-output")


@app.list_tools()
async def list_tools() -> list[Tool]:
    """List available tools"""
    return [
        Tool(
            name="format_review",
            description="Format and validate review data before submission. Call this with your review data to validate the format before calling submit_review.",
            inputSchema=FormatReviewInput.model_json_schema()
        ),
        Tool(
            name="submit_review",
            description="Submit the final review result. ONLY call this after format_review succeeds.",
            inputSchema=SubmitReviewInput.model_json_schema()
        )
    ]


@app.call_tool()
async def call_tool(name: str, arguments: Any) -> list[TextContent]:
    """Handle tool calls"""

    if name == "format_review":
        args = FormatReviewInput(**arguments)

        # Validate stats consistency
        actual_stats = {
            'total_issues': len(args.issues),
            'critical': sum(1 for i in args.issues if i.severity == 'critical'),
            'high': sum(1 for i in args.issues if i.severity == 'high'),
            'medium': sum(1 for i in args.issues if i.severity == 'medium'),
            'low': sum(1 for i in args.issues if i.severity == 'low')
        }

        stats_match = (
            actual_stats['total_issues'] == args.stats.total_issues and
            actual_stats['critical'] == args.stats.critical and
            actual_stats['high'] == args.stats.high and
            actual_stats['medium'] == args.stats.medium and
            actual_stats['low'] == args.stats.low
        )

        if not stats_match:
            return [TextContent(
                type="text",
                text=f"⚠️ Stats mismatch detected!\n\n"
                     f"Expected: {args.stats.model_dump()}\n"
                     f"Actual: {actual_stats}\n\n"
                     f"Please correct the stats and try again."
            )]

        # Validation passed
        return [TextContent(
            type="text",
            text=f"✅ Review data validated successfully!\n\n"
                 f"Formatted review ({len(args.issues)} issues):\n"
                 f"- Critical: {actual_stats['critical']}\n"
                 f"- High: {actual_stats['high']}\n"
                 f"- Medium: {actual_stats['medium']}\n"
                 f"- Low: {actual_stats['low']}\n\n"
                 f"✅ Validation passed! Now call submit_review with this exact data."
        )]

    elif name == "submit_review":
        args = SubmitReviewInput(**arguments)

        # Stats validation (same as format_review)
        actual_stats = {
            'total_issues': len(args.issues),
            'critical': sum(1 for i in args.issues if i.severity == 'critical'),
            'high': sum(1 for i in args.issues if i.severity == 'high'),
            'medium': sum(1 for i in args.issues if i.severity == 'medium'),
            'low': sum(1 for i in args.issues if i.severity == 'low')
        }

        # Return success message
        return [TextContent(
            type="text",
            text=f"✅ Review result submitted successfully.\n\n"
                 f"Total issues: {actual_stats['total_issues']}\n"
                 f"- Critical: {actual_stats['critical']}\n"
                 f"- High: {actual_stats['high']}\n"
                 f"- Medium: {actual_stats['medium']}\n"
                 f"- Low: {actual_stats['low']}"
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
