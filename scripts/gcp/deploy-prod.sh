#!/usr/bin/env bash
# Build the production image with Cloud Build and deploy it to Cloud Run.
# Run from the repo root, on a clean checkout of main:
#   bash scripts/gcp/deploy-prod.sh
# APP_URL defaults to the value in .env.production; override for the first deploy with
#   APP_URL=https://... bash scripts/gcp/deploy-prod.sh
source "$(dirname "$0")/common.sh"

gcloud config set project "$PROJECT" >/dev/null

if [[ -n "$(git status --porcelain)" ]]; then
  echo "Working tree has uncommitted changes — the image is tagged by commit, so commit first." >&2
  exit 1
fi

TAG="$(git rev-parse --short HEAD)"
IMAGE="${REGION}-docker.pkg.dev/${PROJECT}/${REPO}/app:${TAG}"
SUPABASE_URL="$(env_value NEXT_PUBLIC_SUPABASE_URL)"
SUPABASE_ANON_KEY="$(env_value NEXT_PUBLIC_SUPABASE_ANON_KEY)"
APP_URL="${APP_URL:-$(env_value APP_URL)}"
[[ -n "$SUPABASE_URL" && -n "$SUPABASE_ANON_KEY" && -n "$APP_URL" ]] ||
  { echo "NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY and APP_URL are required" >&2; exit 1; }
[[ "$APP_URL" == https://* ]] ||
  { echo "APP_URL must be the public https:// address of the app (got: $APP_URL)" >&2; exit 1; }

SECRETS="$(secret_keys | awk '{ printf "%s%s=%s:latest", (NR > 1 ? "," : ""), $1, $1 }')"

echo "== Building $IMAGE"
gcloud builds submit --config=cloudbuild.yaml \
  --substitutions="_IMAGE=${IMAGE},_SUPABASE_URL=${SUPABASE_URL},_SUPABASE_ANON_KEY=${SUPABASE_ANON_KEY}" .

echo "== Deploying $SERVICE ($REGION)"
gcloud run deploy "$SERVICE" \
  --image="$IMAGE" \
  --region="$REGION" \
  --service-account="$RUN_SA" \
  --allow-unauthenticated \
  --port=8080 \
  --cpu=1 --memory=1Gi \
  --min-instances=1 --max-instances=10 \
  --timeout=300 \
  --cpu-boost \
  --set-env-vars="APP_URL=${APP_URL}" \
  --set-secrets="$SECRETS"

gcloud run services describe "$SERVICE" --region="$REGION" --format='value(status.url)'
