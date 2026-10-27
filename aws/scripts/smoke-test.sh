#!/usr/bin/env bash
# End-to-end check of a deployed backend. Exercises every IAM permission the
# Lambdas need (S3 presign/head/get/put, DynamoDB put/get/update/query,
# lambda:InvokeFunction), so it is the most reliable way to verify LabRole.
#
# Usage: aws/scripts/smoke-test.sh https://abc123.execute-api.us-east-1.amazonaws.com
# Requires: curl, jq
set -euo pipefail

API="${1:?Pass the API base URL (ApiBaseUrl stack output)}"
API="${API%/}"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

echo "1/6 GET /capabilities"
curl -fsS "$API/capabilities" | tee "$TMP/caps.json" | jq .

printf 'hello cloud computing lab\n' > "$TMP/smoke.txt"
SIZE=$(wc -c < "$TMP/smoke.txt" | tr -d ' ')

echo "2/6 POST /jobs"
curl -fsS -X POST "$API/jobs" -H 'Content-Type: application/json' \
  -d "{\"fileName\":\"smoke.txt\",\"contentType\":\"text/plain\",\"size\":$SIZE,\"conversionType\":\"TXT_TO_UPPERCASE\"}" > "$TMP/job.json"
JOB_ID=$(jq -r .jobId "$TMP/job.json")
URL=$(jq -r .upload.url "$TMP/job.json")
echo "   jobId=$JOB_ID"

echo "3/6 Upload to S3 via presigned POST"
FORM=()
while IFS= read -r k; do
  FORM+=(-F "$k=$(jq -r --arg k "$k" '.upload.fields[$k]' "$TMP/job.json")")
done < <(jq -r '.upload.fields | keys[]' "$TMP/job.json")
curl -fsS -X POST "$URL" "${FORM[@]}" -F "file=@$TMP/smoke.txt"

echo "4/6 POST /jobs/$JOB_ID/convert"
curl -fsS -X POST "$API/jobs/$JOB_ID/convert" | jq .

echo "5/6 Polling status"
for _ in $(seq 1 40); do
  STATUS=$(curl -fsS "$API/jobs/$JOB_ID" | tee "$TMP/status.json" | jq -r .status)
  echo "   $STATUS"
  [[ "$STATUS" == "SUCCEEDED" || "$STATUS" == "FAILED" ]] && break
  sleep 1.5
done
[[ "$STATUS" == "SUCCEEDED" ]] || { echo "Conversion did not succeed:"; jq . "$TMP/status.json"; exit 1; }

echo "6/6 Download + list history"
DL=$(curl -fsS "$API/jobs/$JOB_ID/download" | jq -r .downloadUrl)
OUT=$(curl -fsS "$DL")
echo "   output: $OUT"
[[ "$OUT" == "HELLO CLOUD COMPUTING LAB" ]] || { echo "Unexpected output"; exit 1; }
curl -fsS "$API/jobs?limit=5" | jq '.items | length' | xargs -I{} echo "   history returned {} job(s)"

echo "All checks passed — S3, Lambda, DynamoDB and IAM permissions are working."
