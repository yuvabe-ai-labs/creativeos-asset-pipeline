#!/usr/bin/env bash
# One-time (and safe to re-run) GCP setup for the production Cloud Run service.
# Needs: gcloud logged in as a project Owner. Run from the repo root:
#   bash scripts/gcp/setup-prod.sh
# Re-run it after changing a value in .env.production to push the new secret versions.
source "$(dirname "$0")/common.sh"

gcloud config set project "$PROJECT" >/dev/null
PROJECT_NUMBER="$(gcloud projects describe "$PROJECT" --format='value(projectNumber)')"
BUILD_SA="${PROJECT_NUMBER}-compute@developer.gserviceaccount.com"

echo "== Enabling APIs"
gcloud services enable \
  run.googleapis.com artifactregistry.googleapis.com cloudbuild.googleapis.com \
  secretmanager.googleapis.com cloudresourcemanager.googleapis.com

echo "== Artifact Registry repo '$REPO' ($REGION)"
gcloud artifacts repositories describe "$REPO" --location="$REGION" >/dev/null 2>&1 ||
  gcloud artifacts repositories create "$REPO" --repository-format=docker --location="$REGION"

echo "== Runtime service account $RUN_SA"
gcloud iam service-accounts describe "$RUN_SA" >/dev/null 2>&1 ||
  gcloud iam service-accounts create "$RUN_SA_NAME" --display-name="CreativeOS prod (Cloud Run)"
gcloud projects add-iam-policy-binding "$PROJECT" --condition=None --quiet \
  --member="serviceAccount:$RUN_SA" --role=roles/secretmanager.secretAccessor >/dev/null
# Storage access for the app itself — replaces the JSON key on Cloud Run.
gcloud storage buckets add-iam-policy-binding "gs://$PROD_BUCKET" --quiet \
  --member="serviceAccount:$RUN_SA" --role=roles/storage.objectAdmin >/dev/null

echo "== Build service account $BUILD_SA (pushes images, writes build logs)"
for role in roles/artifactregistry.writer roles/logging.logWriter roles/storage.objectViewer; do
  gcloud projects add-iam-policy-binding "$PROJECT" --condition=None --quiet \
    --member="serviceAccount:$BUILD_SA" --role="$role" >/dev/null
done

echo "== Secrets from $ENV_FILE"
while IFS=$'\t' read -r key val; do
  [[ "$key" =~ $SKIP_KEYS_RE ]] && continue
  if [[ -z "$val" ]]; then echo "   skip $key (empty)"; continue; fi
  if ! gcloud secrets describe "$key" >/dev/null 2>&1; then
    gcloud secrets create "$key" --replication-policy=automatic >/dev/null
  fi
  current="$(gcloud secrets versions access latest --secret="$key" 2>/dev/null || true)"
  if [[ "$current" == "$val" ]]; then
    echo "   $key unchanged"
  else
    printf '%s' "$val" | gcloud secrets versions add "$key" --data-file=- >/dev/null
    echo "   $key updated"
  fi
done < <(read_env)

echo "Done. Next: bash scripts/gcp/deploy-prod.sh"
