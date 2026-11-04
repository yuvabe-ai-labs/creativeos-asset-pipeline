# Shared settings for scripts/gcp/*.sh. Sourced, not run.
set -euo pipefail

PROJECT="yuvabe-500205"
REGION="australia-southeast1" # Sydney — next to the production Supabase database (perf rule 7)
REPO="creativeos"
SERVICE="creativeos-prod"
RUN_SA_NAME="creativeos-prod-run"
RUN_SA="${RUN_SA_NAME}@${PROJECT}.iam.gserviceaccount.com"
PROD_BUCKET="creativeos-assets"
ENV_FILE="${ENV_FILE:-.env.production}"

# Keys in the env file that do NOT become Cloud Run secrets:
# - NEXT_PUBLIC_* are build-time values (passed to the Docker build instead)
# - APP_URL is set as a plain env var by deploy-prod.sh
# - SUPABASE_DB_URL is only used by local scripts
# - GCP_SERVICE_ACCOUNT_KEY_BASE64: on Cloud Run, GCS uses the service's own account (gcs.ts)
SKIP_KEYS_RE='^(NEXT_PUBLIC_.*|APP_URL|SUPABASE_DB_URL|GCP_SERVICE_ACCOUNT_KEY_BASE64)$'

# Prints "KEY<TAB>value" for every assignment in $ENV_FILE. Tolerates "KEY = value",
# surrounding quotes, CRLF line endings and '=' inside values (base64).
read_env() {
  [[ -f "$ENV_FILE" ]] || { echo "Missing $ENV_FILE" >&2; exit 1; }
  local line key val
  while IFS= read -r line || [[ -n "$line" ]]; do
    line="${line%$'\r'}"
    [[ "$line" =~ ^[[:space:]]*# || ! "$line" =~ = ]] && continue
    key="${line%%=*}"; key="${key//[[:space:]]/}"
    [[ "$key" =~ ^[A-Z_][A-Z0-9_]*$ ]] || continue
    val="${line#*=}"
    val="${val#"${val%%[![:space:]]*}"}"; val="${val%"${val##*[![:space:]]}"}"
    [[ "$val" =~ ^\"(.*)\"$ || "$val" =~ ^\'(.*)\'$ ]] && val="${BASH_REMATCH[1]}"
    printf '%s\t%s\n' "$key" "$val"
  done < "$ENV_FILE"
}

env_value() { read_env | awk -F'\t' -v k="$1" '$1 == k { sub(/^[^\t]*\t/, ""); print; exit }'; }

secret_keys() { read_env | cut -f1 | grep -Ev "$SKIP_KEYS_RE" || true; }
