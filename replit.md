# EasyEdu PWA

EasyEdu is a frontend-only Progressive Web App for learners, teachers, and
staff. It handles login, schedules, classes, attendance, grades, tuition,
chat, files, and notifications through each center's existing EasyEdu Backend
chính.

## Project structure

```
artifacts/
  edu-web/       — public PWA artifact and static Expo Web export server
  edu-mobile/    — internal Expo Web source used by the PWA build
docs/
  easyedu-backend-push-contract.md
scripts/
  post-merge.sh
```

`edu-mobile` is not a second public product in this workspace. Its source is
kept internally because the PWA screens and Expo Router routes are still built
from it. It has no public artifact registration or workflow.

## Running and building

The public artifact is:

```text
artifacts/edu-web: web
```

Build and serve it with:

```bash
pnpm --filter @workspace/edu-web run build
pnpm --filter @workspace/edu-web run dev
```

The build exports the internal Expo Web source into
`artifacts/edu-web/dist/public`. The PWA is mounted at `/`.

## Production boundary

`artifacts/edu-web` is frontend-only. Production authentication, tenant
resolution, business data, push subscription persistence, and Web Push delivery
belong to the existing EasyEdu Backend chính. The PWA uses the center API URL
entered by the user and never stores production data in a workspace database.

The backend implementation contract is in
`docs/easyedu-backend-push-contract.md`. The PWA receives only the public VAPID
key and never the private key.