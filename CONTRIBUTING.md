# Contributing

## Current posture
Nougat is still early-stage. Contributions are welcome, but the maintainer may prioritize architecture consistency and product direction over broad compatibility.

The project is MIT licensed. See `LICENSE` for the code license and `TRADEMARKS.md` for the project name and branding policy.

## Before you start
- Read the `README.md` first.
- Check `docs/open-source-readiness-plan.md` for the current repo-hardening work.
- Prefer focused pull requests over broad refactors.
- If a change affects auth, capture ingestion, operator routes, or markdown export, explain the behavioral impact clearly.

## Local development
Prerequisites:
- Node.js
- npm
- a Convex project if you need backend-backed flows

Install dependencies:

```bash
npm install
```

Start the backend dev process:

```bash
npm run dev
```

Start the web app:

```bash
npm run dev:web
```

Run tests:

```bash
npm test
```

Lint placeholder:

```bash
npm run lint
```

## Contribution guidelines
- Keep changes narrow and task-focused.
- Preserve existing behavior unless the PR explicitly changes behavior.
- Add or update tests when changing logic with clear input/output expectations.
- Document new environment variables, routes, or operational requirements.
- Avoid checking in local machine paths, personal metadata, or generated user-state artifacts.

## Pull requests
Include:
- what changed
- why it changed
- how you tested it
- screenshots for UI changes when relevant
- follow-up work that remains out of scope

If your change touches configuration or deployment behavior, call that out explicitly.

## Areas that need extra care
- auth and session handling
- operator/admin authorization
- capture endpoint contracts
- markdown export flows
- X OAuth and token refresh behavior
- extension/browser client behavior

## Communication
If you are planning a large architectural or product-shaping change, open an issue or start a discussion first before implementing it.
