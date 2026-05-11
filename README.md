# airtable-integration

Airtable integration with OAuth-based record sync, an authenticated revision-history scraper, and an Angular + AG Grid UI for browsing the resulting MongoDB collections.

## Stack

| Layer    | Tech                                                                |
| -------- | ------------------------------------------------------------------- |
| Frontend | Angular 19 (signals, standalone components), Angular Material 19, AG Grid 33 |
| Build    | Vite via Angular's `application` builder                            |
| Backend  | Node.js 22, Fastify 5, TypeScript 5.6, Mongoose 8, Pino 9, Playwright, Cheerio, undici 7 |
| Database | MongoDB 7                                                           |
| Tooling  | npm workspaces, ESLint 9 (flat config), Prettier 3                  |

## Prerequisites

- **Node 22** (`nvm use` reads `.nvmrc`)
- **MongoDB 7+** running on `mongodb://localhost:27017`
- An **Airtable OAuth integration** registered at <https://airtable.com/create/oauth>
  - Redirect URI: `http://localhost:3000/auth/airtable/callback`
  - Scopes: `data.records:read`, `data.recordComments:read`, `schema.bases:read`, `user.email:read`
- **Playwright Chromium** (installed automatically on first scrape, or run `npx playwright install chromium`)

## Quick start

```bash
nvm use
npm install

cp .env.example .env
# Fill in OAuth client id/secret, scraper credentials, and two 32-byte encryption keys.
# Generate keys with: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"

npm run dev
# API → http://localhost:3000
# Web → http://localhost:4200
```

Open <http://localhost:4200>, click **Connect Airtable** to authorize, then **Sync** to pull bases / tables / records / users into MongoDB, then **Scrape** to acquire session cookies (you'll be prompted for an MFA code) and pull revision history.

## Project layout

```
airtable-integration/
├── apps/
│   ├── api/                    # Fastify backend
│   │   └── src/
│   │       ├── server.ts
│   │       ├── config/         # env loading
│   │       ├── crypto/         # AES-256-GCM helpers
│   │       ├── db/             # Mongoose connection
│   │       ├── models/         # Mongoose schemas
│   │       └── modules/        # oauth, airtable, sync, scraper, collections
│   └── web/                    # Angular SPA
│       └── src/app/            # components, services, types
└── packages/
    └── shared/                 # cross-package types and enums
```

## Demo flow

1. **Connect** — authorize the Airtable OAuth integration; you're redirected back to `/integrations`.
2. **Sync** — background job fetches bases, tables, paginated records, and users into MongoDB. Toolbar shows progress.
3. **Browse** — pick an entity (any `airtable_*` collection or `revision_history`); AG Grid renders columns dynamically. Sort, filter, and search work on every column.
4. **Scrape** — backend probes scraper cookies; if missing or expired, a headless Chromium prompts for an MFA code via the inline form. Activity HTML is fetched per record, parsed for Status / Assignee changes, and persisted to `revision_history`.
5. **Inspect changelogs** — select `revision_history` to see one row per change (`uuid`, `issueId`, `columnType`, `oldValue`, `newValue`, `createdDate`, `authoredBy`).

## Scripts

| Script              | What it does                                  |
| ------------------- | --------------------------------------------- |
| `npm run dev`       | Build shared types, then run API + Web in dev |
| `npm run dev:api`   | API only (port 3000)                          |
| `npm run dev:web`   | Web only (port 4200)                          |
| `npm run build`     | Production build of all workspaces            |
| `npm run typecheck` | Type-check every workspace                    |
| `npm test`          | Run unit tests across workspaces              |
| `npm run lint`      | ESLint across the project                     |
| `npm run format`    | Prettier-format the project                   |

## Notes

- The Airtable activity endpoint used by the scraper is undocumented and may change without notice; the path is configurable via `AIRTABLE_ACTIVITY_PATH`.
- The scraper pauses for an operator to submit the OTP; push-based MFA and hardware keys are not supported.
- Tokens and scraper sessions are keyed on a single demo user — there is no multi-user login layer.
- Local MongoDB is expected to run without auth.
