#!/bin/sh
set -eu

NAMESPACE="production"
APP_NAME="appeduv2pwa"
K8S_DIR="$(CDPATH= cd -- "$(dirname "$0")" && pwd)"

echo "=== First deploy: ${APP_NAME} ==="

if ! kubectl get namespace "$NAMESPACE" >/dev/null 2>&1; then
  echo "Creating namespace ${NAMESPACE}..."
  kubectl create namespace "$NAMESPACE"
fi

echo "Applying Kubernetes resources..."
kubectl apply -k "$K8S_DIR"

echo "Waiting for deployment..."
kubectl rollout status "deployment/${APP_NAME}" \
  -n "$NAMESPACE" \
  --timeout=120s

echo "Deployment:"
kubectl get deployment "$APP_NAME" -n "$NAMESPACE"
echo "Pods:"
kubectl get pods -n "$NAMESPACE" -l "app=${APP_NAME}"
echo "Service:"
kubectl get service "$APP_NAME" -n "$NAMESPACE"
echo "Ingress:"
kubectl get ingress -n "$NAMESPACE" -l "app=${APP_NAME}"

echo "=== Deploy completed ==="
echo "Service: https://app.easyedu.vn"
