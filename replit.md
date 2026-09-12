# EasyeduV3

An education platform monorepo with a mobile app (Expo/React Native) and a Node.js API backend.

## Project structure

```
artifacts/
  api-server/     — Express.js REST API (TypeScript, esbuild)
  edu-web/        — EasyEdu React/Vite PWA frontend; production API is selected via edu_center_url
  edu-mobile/     — Expo React Native app (expo-router)
  mockup-sandbox/ — Vite-based UI component preview canvas
lib/
  db/             — Drizzle ORM schema + migrations (PostgreSQL)
  api-spec/       — OpenAPI spec + generated types
  api-client-react/ — React Query hooks generated from OpenAPI
  api-zod/        — Zod validation schemas
```

## Running the project

All three artifacts have managed workflows that start automatically.

| Workflow | Command |
|---|---|
| `artifacts/api-server: API Server` | `pnpm --filter @workspace/api-server run dev` |
| `artifacts/edu-web: web` | `pnpm --filter @workspace/edu-web run dev` |
| `artifacts/edu-mobile: expo` | `pnpm --filter @workspace/edu-mobile run dev` |
| `artifacts/mockup-sandbox: Component Preview Server` | `pnpm --filter @workspace/mockup-sandbox run dev` |

## Stack

- **Runtime**: Node.js 24, pnpm 10 monorepo
- **Mobile**: Expo ~54, expo-router, React Native 0.81
- **Backend**: Express 5, Drizzle ORM, PostgreSQL 16
- **Auth**: express-session + bcryptjs (session stored in PostgreSQL via connect-pg-simple)
- **Storage**: Google Cloud Storage (file uploads)
- **Build**: esbuild (API), Metro (mobile)

## Production PWA architecture

`artifacts/edu-web` is a frontend-only PWA. In production it calls the
authenticated EasyEdu Backend chính over HTTPS using the center API URL entered
as `edu_center_url`; it must not use the local workspace database for business
data. `artifacts/api-server` remains a development/mock/fallback server only.

Web Push subscriptions, tenant isolation, VAPID configuration, and delivery
belong to the EasyEdu Backend chính. The backend implementation contract is in
`docs/easyedu-backend-push-contract.md`. The PWA receives only the public VAPID
key and never receives the private key.

## Environment secrets

| Secret | Purpose |
|---|---|
| `SESSION_SECRET` | Express session signing key ✓ already set |
| Google Cloud credentials | Required for file upload features (GCS bucket) |
| `DATABASE_URL` | PostgreSQL connection string (auto-provided by Replit) |

## User preferences

<!-- Add any preferences here -->
