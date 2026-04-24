#!/usr/bin/env bash
# Deploy the Klypup API to Cloud Run.
#
# Prereqs:
#   - gcloud CLI installed and authenticated (`gcloud auth login`)
#   - Active billing project set (`gcloud config set project <id>`)
#   - Environment variables loaded in the current shell (see backend/.env.template)
#
# Usage:
#   cd backend && ./deploy.sh [service-name]
#
# The script bakes the image with Cloud Build (so Playwright's large dependencies
# don't upload from your laptop), then deploys to Cloud Run with the env vars
# needed by the agent, RAG, and Firebase Admin.

set -euo pipefail

PROJECT_ID="${GCP_PROJECT_ID:-klypup}"
SERVICE_NAME="${1:-klypup-api}"
REGION="${GCP_REGION:-us-central1}"
IMAGE="gcr.io/${PROJECT_ID}/${SERVICE_NAME}:$(date +%Y%m%d-%H%M%S)"

echo "▶ Building image: ${IMAGE}"
gcloud builds submit --tag "${IMAGE}" --project "${PROJECT_ID}"

echo "▶ Deploying to Cloud Run: ${SERVICE_NAME} (${REGION})"

ENV_VARS=(
  "ENVIRONMENT=production"
  "FIREBASE_PROJECT_ID=${FIREBASE_PROJECT_ID:-$PROJECT_ID}"
)

# Optional credentials — only pass what's set so Cloud Run doesn't choke on empties.
append_if_set() {
  local name="$1"
  local val="${!name:-}"
  if [[ -n "$val" ]]; then
    ENV_VARS+=("${name}=${val}")
  fi
}

append_if_set GEMINI_API_KEY
append_if_set GEMINI_MODEL
append_if_set NEWS_API_KEY
append_if_set GNEWS_API_KEY
append_if_set FMP_API_KEY
append_if_set REDDIT_CLIENT_ID
append_if_set REDDIT_CLIENT_SECRET
append_if_set REDDIT_USER_AGENT
append_if_set SUPABASE_URL
append_if_set SUPABASE_SERVICE_KEY
append_if_set SEC_USER_AGENT
append_if_set FIREBASE_CREDENTIALS_JSON
append_if_set CORS_ORIGINS

ENV_FLAG=$(IFS=, ; echo "${ENV_VARS[*]}")

gcloud run deploy "${SERVICE_NAME}" \
  --image "${IMAGE}" \
  --project "${PROJECT_ID}" \
  --platform managed \
  --region "${REGION}" \
  --memory 2Gi \
  --cpu 2 \
  --timeout 300 \
  --max-instances 3 \
  --min-instances 0 \
  --port 8080 \
  --set-env-vars "${ENV_FLAG}" \
  --allow-unauthenticated

echo "✅ Deploy complete."
echo "Fetch the URL with: gcloud run services describe ${SERVICE_NAME} --region ${REGION} --format='value(status.url)'"
