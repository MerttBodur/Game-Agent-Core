# MCP Usage Guide

This guide explains how to use the MCP setup in this repo and what you need to provide locally.

## What MCP Does Here

MCP is development tooling for AI agents. It does not change the app runtime by itself.

In this repo, MCP gives your agent access to:

- OpenAI Docs: current OpenAI API, model, embeddings, structured output, and RAG guidance.
- Context7: current docs for libraries such as React, Vite, Express, Drizzle, Zod, Orval, and Tailwind.
- GitHub: repository, issue, pull request, and code review context through GitHub MCP.
- Playwright: browser automation for checking frontend flows.

RAG is still implemented in the application code later. MCP only helps the agent build it correctly.

## Files In This Repo

- `.vscode/mcp.json`: VS Code / Copilot MCP configuration.
- `.mcp.json`: Claude Code project MCP configuration.
- `AGENTS.md`: project rules for AI agents.
- `.env.example`: optional local MCP credential placeholders.
- `docs/mcp-setup.md`: setup reference.
- `docs/mcp-usage-guide.md`: this usage guide.

## What You Need To Have Installed

- VS Code with Copilot/Agent Mode support.
- Node.js available in PATH.
- Network access.
- Optional: Claude Code if you want to use `.mcp.json`.

You do not need Codex CLI for this setup.

## What You Need To Fill In

Most of the setup works without editing repo files.

Optional local file:

```bash
.env
```

Create it only if a provider asks for credentials. Do not commit it.

Use this shape:

```bash
GITHUB_MCP_PAT=
CONTEXT7_API_KEY=
```

### `GITHUB_MCP_PAT`

Usually you should not need this in VS Code, because GitHub MCP can authenticate through Copilot/GitHub OAuth.

Fill this only if:

- VS Code cannot authenticate GitHub MCP automatically.
- Your client explicitly asks for a personal access token.

Minimum useful permissions depend on your GitHub account and repo needs. For this repo, read-only repo access is enough unless you want the agent to create issues, comments, branches, or pull requests.

Never put this token in:

- `.vscode/mcp.json`
- `.mcp.json`
- `AGENTS.md`
- any committed file

### `CONTEXT7_API_KEY`

Usually optional.

Fill this only if your Context7 usage requires account-based features or higher limits.

Leave it empty until Context7 explicitly asks for it.

## How To Use In VS Code

1. Open this repo in VS Code.
2. Make sure `.vscode/mcp.json` exists.
3. Restart VS Code.
4. Open Command Palette.
5. Run:

```text
MCP: List Servers
```

You should see:

- `openaiDeveloperDocs`
- `github`
- `context7`
- `playwright`

If VS Code asks to approve workspace MCP servers, approve them for this repo.

## How To Use With Claude Code

1. Open Claude Code in this repo root.
2. Make sure `.mcp.json` exists.
3. Run:

```text
/mcp
```

You should see the same four servers.

Claude Code may ask you to approve project-scoped MCP servers. Approve only after confirming the file contents match this repo's `.mcp.json`.

## How To Ask The Agent To Use MCP

Be explicit. Tell the agent which MCP source to use.

For OpenAI/RAG work:

```text
Use OpenAI Docs MCP. Find the current embeddings API guidance and design the RAG ingestion flow for this repo.
```

For library docs:

```text
Use Context7. Check the current Drizzle PostgreSQL docs before changing the schema.
```

For GitHub work:

```text
Use GitHub MCP. Summarize the open PRs and identify anything related to RAG or MCP setup.
```

For frontend/browser checks:

```text
Use Playwright MCP. Open the local frontend and verify the analyzer form can be filled and submitted.
```

For this specific project:

```text
Read replit.md first. Then use OpenAI Docs MCP and Context7 to plan the RAG system for this repo. Ask me before choosing vector storage, embedding model, or ingestion scope.
```

## Which MCP To Use For Which Task

Use OpenAI Docs when the task involves:

- OpenAI API calls
- embeddings
- model choice
- structured outputs
- RAG prompting
- tool calling

Use Context7 when the task involves:

- React
- Vite
- Express
- Drizzle
- PostgreSQL
- Zod
- Orval
- Tailwind

Use GitHub when the task involves:

- PR review
- issue triage
- repository history
- comments
- CI checks

Use Playwright when the task involves:

- verifying UI behavior
- checking layout in browser
- testing frontend flows
- reproducing browser-only bugs

## What MCP Does Not Do

MCP does not automatically:

- create the RAG database schema
- create embeddings
- run migrations
- seed the tool catalog
- change the app's API
- deploy anything

Those require normal code changes in this repo.

## Current Project Rule

The current app is not truly RAG-backed yet. It currently uses:

- hard-coded tool catalog in `artifacts/api-server/src/lib/gameDevTools.ts`
- rule scoring in `artifacts/api-server/src/lib/advisorEngine.ts`
- OpenAI narrative generation
- PostgreSQL session storage

When building RAG later, the agent should ask before deciding:

- vector store strategy
- embedding model
- chunk schema
- seed/ingestion source
- retrieval ranking strategy
- whether to keep rule scoring, replace it, or combine it with retrieval

## Troubleshooting

### MCP server does not appear

- Restart VS Code or Claude Code.
- Validate JSON syntax in `.vscode/mcp.json` or `.mcp.json`.
- Confirm Node.js is in PATH.
- Confirm network access.

### `npx` server does not start

- Run `node -v`.
- Run `npx -v`.
- Check that Windows can execute `cmd /c npx`.
- Check antivirus/firewall restrictions.

### GitHub MCP asks for auth

- Prefer VS Code OAuth/Copilot auth.
- Use `GITHUB_MCP_PAT` only as fallback.
- Keep the token in `.env` or your local user environment, not in repo config.

### Playwright MCP cannot inspect the app

- Start the frontend dev server first.
- Make sure the app URL is reachable.
- Then ask the agent to use Playwright MCP against that URL.

## Security Rules

- Never commit `.env`.
- Never paste tokens into MCP JSON files.
- Never commit access tokens, API keys, or bearer headers.
- Prefer OAuth flows over long-lived PATs.
- If a token is accidentally committed, revoke it immediately.
