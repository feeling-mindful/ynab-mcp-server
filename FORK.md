# This fork

This repository is a fork of [calebl/ynab-mcp-server](https://github.com/calebl/ynab-mcp-server).
It runs the same tools as a Next.js app on Vercel and lets you sign in with
YNAB. `README.md` is upstream's and describes upstream's ways to run the server
(local stdio, self-hosted HTTP, Cloudflare Worker); this file covers what the
fork adds.

## What the fork adds

- **A Vercel deployment** (`app/`, `lib/`, `vercel.json`, `next.config.mjs`,
  `tsconfig.next.json`): the MCP endpoint at `/mcp`, plus the OAuth endpoints
  claude.ai needs.
- **Sign in with YNAB**: each request acts with the signed-in user's own YNAB
  token. Only the YNAB user in `ALLOWED_YNAB_USER_ID` is let in.
- **Writes are off by default**: tools that change YNAB are hidden unless
  `YNAB_ALLOW_WRITES=true`. Upstream's `YNAB_READ_ONLY=true` still turns them
  off when both are set.
- **More tools** (`src/fork/tools/`): accounts, payees, payee locations,
  categories and category groups, scheduled transactions, money movements,
  plan settings and the user.
- **Strict names** (`src/fork/policy.ts`): upstream picks the best fuzzy match
  for a name. Here a partial name is refused with the near misses listed,
  because an agent may write unattended. A name is also accepted in the ID
  fields of `ynab_create_transaction`, `ynab_update_transaction`,
  `ynab_get_transactions`, `ynab_move_money` and `ynab_update_category_budget`.
- **Last-used plan by default**: with no plan given and neither `YNAB_PLAN_ID`
  nor `YNAB_BUDGET_ID` set, tools use the plan you opened most recently.

These apply to the Vercel endpoint only. The stdio and self-hosted HTTP entry
points (`src/index.ts`, `src/http.ts`) are upstream's and serve upstream's
tools with upstream's behaviour.

## How the fork is laid out

Upstream files are kept exactly as upstream has them, so a sync is a plain
merge. Everything the fork owns lives where upstream has no files:

| Path | Purpose |
| --- | --- |
| `app/`, `lib/` | The Next.js app and its OAuth code |
| `src/fork/` | Fork tools, the fork registry and the fork policy |
| `src/tests/fork/` | Tests for all of the above |
| `FORK.md`, `vercel.json`, `next.config.mjs`, `tsconfig.next.json` | Fork docs and config |

`src/fork/registry.ts` registers upstream's tools (`registerAll` from
`src/registry.ts`) and then the fork's. To add a fork tool, put it in
`src/fork/tools/`, list it in `forkTools`, and mark `writes: true` if it changes
YNAB.

## Syncing with upstream

```bash
git fetch origin            # origin = calebl/ynab-mcp-server
git merge origin/main
```

Conflicts are expected only in the few files both sides edit:

- `package.json`: keep upstream's version, then re-add the fork's lines (the
  `dev`, `build:next`, `start:next` and `typecheck:next` scripts; `mcp-handler`,
  `next`, `react`, `react-dom` and the two `@types/react*` packages).
- `package-lock.json`: take upstream's, then run `npm install`.
- `.github/workflows/test.yml`: keep `workflow_dispatch`, the
  `typecheck:next` step and the `ci` job.
- `.gitignore`: keep the block under `# Fork`.

If a merge conflicts anywhere else, the fork has edited an upstream file. Move
that change into `src/fork/` and take upstream's file.

After a merge, run:

```bash
npm install
npm run typecheck && npm run typecheck:next
npm run test:run
npm run build:next
```

## Deploy on Vercel

1. Connect this repo to a Vercel project (`vercel link` or the Vercel dashboard).
2. For claude.ai, create a YNAB OAuth application (YNAB → Account Settings →
   Developer Settings → New OAuth Application) with the redirect URI
   `https://<your-app>.vercel.app/ynab/callback`.
3. Set these environment variables in Vercel:
   - `MCP_PUBLIC_URL`: the public base URL, e.g. `https://<your-app>.vercel.app` (no trailing slash).
   - `OAUTH_SIGNING_SECRET`: at least 32 random characters. It signs and encrypts every token; rotating it signs out every client.
   - `YNAB_OAUTH_CLIENT_ID` and `YNAB_OAUTH_CLIENT_SECRET`: from the YNAB OAuth application.
   - `ALLOWED_YNAB_USER_ID`: the one YNAB user id allowed to sign in. Sign in once and the refusal page shows it.
   - `YNAB_ALLOW_WRITES`: (optional) set to `true` to expose tools that change YNAB. Off by default, so the server is read-only.
   - `YNAB_PLAN_ID`: (optional) default plan used when a tool is not given one. `YNAB_BUDGET_ID` still works.
   - `MCP_API_KEY` and `YNAB_API_TOKEN`: (optional) only for clients that can only send a fixed bearer. They send `Authorization: Bearer <MCP_API_KEY>`, and the server acts with the `YNAB_API_TOKEN` personal access token. Leave both unset to accept YNAB sign-in only.
4. Deploy. The endpoint is `https://<your-app>.vercel.app/mcp` (Streamable HTTP).

`vercel.json` installs with `npm ci --ignore-scripts` and builds with
`next build`, so Vercel does not run upstream's `prepare` script (the CLI build).

### Connect from claude.ai

Settings → Connectors → **Add custom connector**:

- **URL**: `https://<your-app>.vercel.app/mcp` (must match `MCP_PUBLIC_URL` + `/mcp` exactly).
- Leave the OAuth client fields empty. Claude registers itself and sends you to sign in with YNAB.

### Local dev

```bash
npm install
echo 'YNAB_API_TOKEN=your_pat' > .env.local
echo 'MCP_API_KEY=local-dev-key' >> .env.local
npm run dev
# server at http://localhost:3000/mcp
```
