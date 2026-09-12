# appeduv2pwa Kubernetes deployment

This directory contains the Docker image and Kubernetes manifests for the
EasyEdu public PWA.

## Build and push

The Docker build context must be the repository root because the PWA export
uses the internal Expo source in `artifacts/edu-mobile`.

```bash
docker build \
  --build-arg APP_VERSION=0.0.1 \
  -t harbor.emso.vn/emso-common/appeduv2pwa:0.0.1 \
  .

docker push harbor.emso.vn/emso-common/appeduv2pwa:0.0.1
```

Update `appeduv2pwa/deployment.yaml` when publishing a different image tag.

## Apply

```bash
kubectl apply -k k8s-appeduv2pwa/appeduv2pwa
kubectl rollout status deployment/appeduv2pwa -n production --timeout=120s
```

Or use the helper:

```bash
./k8s-appeduv2pwa/appeduv2pwa/first-deploy.sh
```

## DNS and CORS

The Ingress assumes:

```text
appeduv2pwa.easyedu.vn
```

Point DNS to the cluster ingress and add the exact production origin to the
EasyEdu Backend CORS allowlist:

```text
https://appeduv2pwa.easyedu.vn
```

The PWA calls each center's existing backend directly from the browser, so
Kubernetes cannot replace the backend CORS configuration.

## Secrets

The PWA image and manifests do not contain database, JWT, storage, chat, or
provider credentials. Do not copy the old `k8s-edu` ConfigMap secrets into this
deployment. If a future server-side integration needs credentials, create a
Kubernetes Secret out of band and reference it from the Deployment.
