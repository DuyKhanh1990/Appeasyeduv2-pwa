# EasyEdu Backend — PWA Web Push contract

This contract belongs to the EasyEdu Backend chính. The `artifacts/edu-web`
package is only a React/Vite client and must not own this schema or delivery
implementation.

## Runtime architecture

```text
PWA (artifacts/edu-web)
  -> HTTPS API at the selected edu_center_url
  -> EasyEdu Backend chính
  -> the authenticated center/tenant database
```

The browser never receives `VAPID_PRIVATE_KEY`, database credentials, or a
tenant identifier supplied by the client. The backend derives the authenticated
user and tenant from the existing session/Bearer token and center routing
context.

## Database model

Add this table to the existing multi-tenant database, using the project's
existing tenant key and user key types:

```sql
CREATE TABLE push_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES centers(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  endpoint text NOT NULL,
  p256dh text NOT NULL,
  auth text NOT NULL,
  expiration_time bigint,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, endpoint)
);

CREATE INDEX push_subscriptions_tenant_user_idx
  ON push_subscriptions (tenant_id, user_id);
```

Replace `centers` and the key types with the names already used by the
production backend. If each center has a physically separate database, keep
the equivalent table in each center database and still enforce the center
context at the API boundary.

## Endpoints

All endpoints require the existing EasyEdu authentication middleware.

### `GET /api/mobile/push/config`

Response:

```json
{
  "enabled": true,
  "publicKey": "<VAPID_PUBLIC_KEY>"
}
```

Return `enabled: false` and `publicKey: null` when push is not configured.
Never return the private VAPID key.

### `POST /api/mobile/push/subscription`

The body is the browser's `PushSubscription.toJSON()`:

```json
{
  "endpoint": "https://push-service.example/...",
  "expirationTime": null,
  "keys": {
    "p256dh": "...",
    "auth": "..."
  }
}
```

Validate the endpoint and key strings, then upsert by `(tenant_id, endpoint)`.
Set `tenant_id` from the authenticated center context and `user_id` from the
authenticated account. Do not accept either field from the request body.

### `DELETE /api/mobile/push/subscription`

Body:

```json
{ "endpoint": "https://push-service.example/..." }
```

Delete only the row matching the authenticated `tenant_id`, authenticated
`user_id`, and endpoint. A user in one center must not be able to remove a
subscription belonging to another center or account.

## Delivery

When the existing backend creates an in-app notification, it should call a
server-side helper with:

```ts
sendWebPush({
  tenantId,
  userId,
  title,
  body,
  url: "/notifications",
  notificationId,
});
```

The helper must:

1. Query subscriptions by both `tenant_id` and `user_id`.
2. Send the payload with `web-push` using the server-side VAPID keys.
3. Use `404`/`410` responses from the push service to remove only the stale
   subscription in the same tenant/user scope.
4. Treat delivery failure as non-fatal to the in-app notification transaction.
5. Preserve the existing notification row and unread count even when push is
   disabled or unavailable.

The notification payload should contain `title`, `body`, and a PWA-relative
`data.url` such as `./notifications`, `./schedule`, or `./grades`.

## Secrets and deployment

Configure these as server-side secrets on the EasyEdu Backend chính:

- `VAPID_PUBLIC_KEY`
- `VAPID_PRIVATE_KEY`
- `VAPID_SUBJECT`

The PWA only receives `VAPID_PUBLIC_KEY` from the config endpoint. Do not put
the private key in Vite environment variables, `manifest.webmanifest`, source
code, or browser storage.

## Security checks before production

- Verify the auth token/session resolves to the same tenant used for queries.
- Reject cross-tenant user IDs and subscription deletion attempts.
- Require HTTPS in production.
- Restrict CORS to the deployed PWA origins while allowing credentials as
  required by the existing auth flow.
- Add tests for tenant A/B isolation, user A/B isolation within one tenant,
  idempotent subscription upsert, stale endpoint cleanup, and disabled VAPID
  configuration.