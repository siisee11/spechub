# SpecHub Web (`apps/web`)

Standalone product website for SpecHub, built with Vite + React and deployed to Cloudflare with Wrangler.

## Prerequisites

- Node.js 20+
- npm 10+
- A Cloudflare account for deployment

## Local Development

From repository root:

```sh
npm run web:install
npm run web:dev
```

This starts Vite dev server for `apps/web`.

## Build And Validate

From repository root:

```sh
npm run web:typecheck
npm run web:test
npm run web:build
```

## Cloudflare Deployment (Wrangler)

All deployment commands are checked into repository scripts.

### One-time setup

1. Authenticate Wrangler:

```sh
npm run web:cf:check || npx wrangler login
npm run web:cf:check
```

2. Create the Cloudflare Pages project from CLI (no dashboard required):

```sh
npm run web:cf:project:create
```

### Deploy production

```sh
npm run web:cf:build-and-deploy
```

### Deploy preview branch build

```sh
npm run web:build
npm run web:cf:deploy:preview
```

## Environment Variables

### Required for non-interactive CI deploys

- `CLOUDFLARE_API_TOKEN`: API token with Cloudflare Pages edit/deploy permissions
- `CLOUDFLARE_ACCOUNT_ID`: target Cloudflare account ID

### Optional for install-command generation in website build output

- `SPECHUB_REPO`: override GitHub owner/repo used in install commands (example: `openai/spechub`)
- `SPECHUB_REF`: override Git reference used in install commands (example: `main`)

If `SPECHUB_REPO`/`SPECHUB_REF` are not set, build-time git origin detection is used with fallback placeholders.
