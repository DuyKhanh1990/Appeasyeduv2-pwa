# EasyEdu PWA

EasyEdu is a frontend-only Progressive Web App for learners, teachers, and
staff. It uses each center's existing EasyEdu Backend chính for authentication,
tenant data, schedules, classes, attendance, grades, tuition, chat, and
notifications.

## Local development

```bash
pnpm install
pnpm --filter @workspace/edu-web run build
pnpm --filter @workspace/edu-web run dev
```

## Docker

The Dockerfile is at the repository root because the build context must include
the internal Expo source in `artifacts/edu-mobile`.

```bash
docker build \
  --build-arg APP_VERSION=0.0.1 \
  -t harbor.emso.vn/emso-common/appeduv2pwa:0.0.1 \
  .

docker push harbor.emso.vn/emso-common/appeduv2pwa:0.0.1
```

The image serves the static export on port `3000` and exposes:

```text
GET /healthz
```

## Kubernetes

Kubernetes manifests are in `k8s-appeduv2pwa/appeduv2pwa`.

```bash
kubectl apply -k k8s-appeduv2pwa/appeduv2pwa
kubectl rollout status deployment/appeduv2pwa -n production --timeout=120s
```

The default Ingress host is:

```text
app.easyedu.vn
```

Point DNS to the cluster ingress and add the exact public origin to the
EasyEdu Backend CORS allowlist:

```text
https://app.easyedu.vn
```

The PWA calls each center backend directly from the browser. Kubernetes does
not replace the backend CORS configuration.

## Security

Do not put database credentials, JWT secrets, storage credentials, chat
credentials, or provider secrets in the PWA image, ConfigMap, or repository.
The PWA only needs the center URL entered by the user and the public VAPID key
for web push.
