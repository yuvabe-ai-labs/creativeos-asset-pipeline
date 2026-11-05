#!/usr/bin/env bash
# One-time (and safe to re-run) GCP setup that lets GitHub Actions deploy production
# (.github/workflows/deploy-prod.yml) with no stored key: Workload Identity Federation
# trusts GitHub's OIDC token, but only for this repo's main branch.
# Needs: gcloud logged in as a project Owner; scripts/gcp/setup-prod.sh already run.
#   bash scripts/gcp/setup-cicd.sh
source "$(dirname "$0")/common.sh"

GITHUB_REPO="yuvabe-ai-labs/creativeos-asset-pipeline"
POOL="github"
PROVIDER="github-oidc"
DEPLOY_SA_NAME="creativeos-deployer"
DEPLOY_SA="${DEPLOY_SA_NAME}@${PROJECT}.iam.gserviceaccount.com"

gcloud config set project "$PROJECT" >/dev/null
PROJECT_NUMBER="$(gcloud projects describe "$PROJECT" --format='value(projectNumber)')"
BUILD_SA="${PROJECT_NUMBER}-compute@developer.gserviceaccount.com"
SOURCE_BUCKET="gs://${PROJECT}_cloudbuild" # where `gcloud builds submit` uploads the source

gcloud services enable iamcredentials.googleapis.com sts.googleapis.com

echo "== Deployer service account $DEPLOY_SA"
gcloud iam service-accounts describe "$DEPLOY_SA" >/dev/null 2>&1 ||
  gcloud iam service-accounts create "$DEPLOY_SA_NAME" --display-name="CreativeOS deploy (GitHub Actions)"
for role in roles/run.developer roles/cloudbuild.builds.editor roles/serviceusage.serviceUsageConsumer roles/logging.viewer; do
  gcloud projects add-iam-policy-binding "$PROJECT" --condition=None --quiet \
    --member="serviceAccount:$DEPLOY_SA" --role="$role" >/dev/null
done
gcloud storage buckets add-iam-policy-binding "$SOURCE_BUCKET" --quiet \
  --member="serviceAccount:$DEPLOY_SA" --role=roles/storage.admin >/dev/null
# `gcloud run deploy` checks the deploying account can pull the image it names.
gcloud artifacts repositories add-iam-policy-binding "$REPO" --location="$REGION" --quiet \
  --member="serviceAccount:$DEPLOY_SA" --role=roles/artifactregistry.reader >/dev/null
# Deploying a revision that runs as RUN_SA, and a build that runs as BUILD_SA, both need actAs.
for sa in "$RUN_SA" "$BUILD_SA"; do
  gcloud iam service-accounts add-iam-policy-binding "$sa" --quiet \
    --member="serviceAccount:$DEPLOY_SA" --role=roles/iam.serviceAccountUser >/dev/null
done

echo "== Workload Identity pool '$POOL' / provider '$PROVIDER'"
gcloud iam workload-identity-pools describe "$POOL" --location=global >/dev/null 2>&1 ||
  gcloud iam workload-identity-pools create "$POOL" --location=global --display-name="GitHub Actions"
gcloud iam workload-identity-pools providers describe "$PROVIDER" --location=global \
  --workload-identity-pool="$POOL" >/dev/null 2>&1 ||
  gcloud iam workload-identity-pools providers create-oidc "$PROVIDER" --location=global \
    --workload-identity-pool="$POOL" \
    --issuer-uri="https://token.actions.githubusercontent.com" \
    --attribute-mapping="google.subject=assertion.sub,attribute.repository=assertion.repository,attribute.ref=assertion.ref" \
    --attribute-condition="assertion.repository == '${GITHUB_REPO}' && assertion.ref == 'refs/heads/main'"
gcloud iam service-accounts add-iam-policy-binding "$DEPLOY_SA" --quiet \
  --role=roles/iam.workloadIdentityUser \
  --member="principalSet://iam.googleapis.com/projects/${PROJECT_NUMBER}/locations/global/workloadIdentityPools/${POOL}/attribute.repository/${GITHUB_REPO}" >/dev/null

echo "Done. Workflow values:"
echo "  workload_identity_provider: projects/${PROJECT_NUMBER}/locations/global/workloadIdentityPools/${POOL}/providers/${PROVIDER}"
echo "  service_account:            ${DEPLOY_SA}"
