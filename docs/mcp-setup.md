# MCP Setup

## Scope

This repo uses MCP for development assistance only in this phase. It does not add runtime RAG, embeddings, pgvector, ingestion, or a product MCP server.

## Prerequisites

- Node.js and pnpm installed for the workspace.
- VS Code with Copilot support for the primary MCP client.
- Claude Code for the secondary MCP client.
- Network access to the configured MCP providers.

## MCP Servers

- OpenAI Docs
- GitHub
- Context7 `@upstash/context7-mcp@2.1.8`
- Playwright `@playwright/mcp@0.0.70`

## Files

- `.vscode/mcp.json` for VS Code and Copilot.
- `.mcp.json` for Claude Code project-scoped MCP servers.
- `.env.example` for optional local MCP secrets.
- `AGENTS.md` for repo-specific agent rules.
- `replit.md` for project context and source-of-truth notes.

## Environment Example

Copy `.env.example` to `.env` for local development if you need MCP credentials.

Only placeholder values belong in the repo. Do not commit real secrets.

## VS Code Setup

1. Install or enable the MCP client support in VS Code and Copilot.
2. Confirm `.vscode/mcp.json` contains OpenAI Docs, GitHub, Context7, and Playwright.
3. Use `GITHUB_MCP_PAT` only if GitHub access requires a personal token.
4. Use `CONTEXT7_API_KEY` only if your Context7 setup requires a key.
5. Restart VS Code after updating the MCP configuration.

## Claude Code Setup

1. Configure the same MCP servers in Claude Code.
2. Confirm `.mcp.json` contains the same server list as the VS Code setup.
3. Restart Claude Code after changes so the updated servers load.

## Verification

- Confirm the MCP clients show the four development servers.
- Confirm OpenAI Docs is used for OpenAI API and model guidance.
- Confirm Context7 is used for current library docs.
- Confirm GitHub and Playwright are available for repo and browser workflows.

## Secret Rules

- Never commit real API keys or tokens.
- Keep `.env.example` to placeholders only.
- Store any real values in local environment files that stay untracked.
