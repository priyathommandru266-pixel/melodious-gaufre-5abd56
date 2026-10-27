# AWS Integration Guide

This guide connects the Netlify-hosted frontend to real AWS processing. Until these steps are done, the site shows **Backend not configured** (or **DEMO MODE** if you switch it on) and never claims that anything was uploaded or converted.

## 1. Architecture

```
Netlify (React frontend, no AWS credentials)
   │  HTTPS + CORS
   ▼
Amazon API Gateway (HTTP API)  ──▶  API Lambda  (aws/lambdas/api)
                                      │  presigned POST          ┌──────────────────────────┐
                                      ├────────────────────────▶ │ S3 uploads bucket (private)│ ◀── browser uploads directly
                                      │  Invoke (async)          └──────────────────────────┘
                                      ├────────────────────────▶ Converter Lambda (aws/lambdas/converter)
                                      │                             │ GetObject uploads/…
                                      │                             │ PutObject converted/…  ──▶ S3 output bucket (private)
                                      │                             │ UpdateItem status
                                      └──────── Get/Put/Update/Query ──▶ DynamoDB jobs table
```

**Why no S3 event notifications?** The API invokes the converter explicitly after verifying the upload. Nothing listens to S3 events, and converted files go to a *separate* bucket under `converted/`, so a converted file can never re-trigger the conversion workflow (no recursive invocation). If you ever add an S3 trigger, scope it to the uploads bucket with prefix `uploads/` only.

## 2. Required resources

| Resource | Purpose | Key settings |
|----------|---------|-------------|
| S3 uploads bucket | Original files under `uploads/{jobId}/` | Block all public access, SSE-S3, CORS `POST` from your Netlify origin, 7-day lifecycle expiry |
| S3 output bucket | Converted files under `converted/{jobId}/` | Block all public access, SSE-S3, CORS `GET` from your Netlify origin, 7-day lifecycle expiry |
| DynamoDB table | Job metadata and status | PK `jobId` (S); GSI `byCreatedAt` = `entity` (S, HASH) + `createdAt` (S, RANGE), projection ALL; on-demand billing |
| API Lambda | REST API | Node.js 22, 256 MB, 15 s |
| Converter Lambda | Conversions (sharp, csv-parse) | Node.js 22 x86_64, 1024 MB, 60 s, async retries = 0 |
| HTTP API | Public endpoint | Routes in `docs/API_CONTRACT.md`, CORS, throttling 10 rps / burst 20 |

All of this is defined in [`aws/template.yaml`](../aws/template.yaml).

## 3. Environment variables

**Netlify (public, build-time):**

| Name | Example | Notes |
|------|---------|-------|
| `VITE_API_BASE_URL` | `https://abc123.execute-api.us-east-1.amazonaws.com` | Must be `https://`. Empty = backend not configured |
| `VITE_MAX_UPLOAD_MB` | `10` | Client check only; keep equal to the server limit |

> ⚠️ Every `VITE_` variable is embedded in the JavaScript bundle. **Never** put `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_SESSION_TOKEN` or any other secret into Netlify variables for this frontend, into `.env` files, or into source code.

**Lambda (set by the template):**

| Name | Function | Purpose |
|------|----------|---------|
| `INPUT_BUCKET`, `OUTPUT_BUCKET`, `JOBS_TABLE` | both | Resource names |
| `MAX_UPLOAD_BYTES` | both | Server-side size limit (default 10 485 760) |
| `CONVERTER_FUNCTION_NAME` | API | Function to invoke |
| `ALLOWED_ORIGIN` | API | CORS origin(s), comma-separated |
| `ENABLED_CONVERSIONS` | API | What `/capabilities` advertises |
| `UPLOAD_URL_TTL`, `DOWNLOAD_URL_TTL` | API | Presigned URL lifetime in seconds (300) |

Lambdas get credentials from their **execution role** — no keys are configured anywhere.

## 4. IAM permissions (least privilege)

Ready-to-edit policy documents are in [`aws/iam/`](../aws/iam/). Replace `UPLOADS_BUCKET_NAME`, `OUTPUT_BUCKET_NAME`, `JOBS_TABLE_NAME`, `CONVERTER_FUNCTION_NAME`, `REGION`, `ACCOUNT_ID`.

**API Lambda role**
| Action | Resource | Why |
|--------|----------|-----|
| `s3:PutObject` | `uploads-bucket/uploads/*` | Signs the presigned POST (S3 checks the signer's permission) |
| `s3:GetObject` | `uploads-bucket/uploads/*` | `HeadObject` to verify the upload |
| `s3:GetObject` | `output-bucket/converted/*` | Signs presigned download URLs |
| `dynamodb:PutItem`, `GetItem`, `UpdateItem` | jobs table | Create/read/queue jobs |
| `dynamodb:Query` | `jobs-table/index/byCreatedAt` | History listing |
| `lambda:InvokeFunction` | converter function | Start conversion |
| CloudWatch Logs | own log group | Logging |

**Converter Lambda role**
| Action | Resource |
|--------|----------|
| `s3:GetObject` | `uploads-bucket/uploads/*` |
| `s3:PutObject` | `output-bucket/converted/*` |
| `dynamodb:GetItem`, `UpdateItem` | jobs table |
| CloudWatch Logs | own log group |

Neither role can list buckets, delete objects, scan the table, or touch other resources.

### Using the college `LabRole`

AWS Academy Learner Labs usually forbid creating IAM roles but provide `LabRole`. If your instructor approves it:

```bash
sam deploy --guided --parameter-overrides ExistingRoleArn=arn:aws:iam::<ACCOUNT_ID>:role/LabRole AllowedOrigin=https://<your-site>.netlify.app
```

Both Lambdas will then use `LabRole`. **Do not assume it has every permission** — it often does in Learner Lab, but policies vary between courses. `LabRole` is also usually broader than least privilege; note that in your report. Verify it:

1. **Simulate** (works only if your lab allows `iam:SimulatePrincipalPolicy`):
   ```bash
   aws iam simulate-principal-policy \
     --policy-source-arn arn:aws:iam::<ACCOUNT_ID>:role/LabRole \
     --action-names s3:GetObject s3:PutObject dynamodb:PutItem dynamodb:GetItem dynamodb:UpdateItem dynamodb:Query lambda:InvokeFunction \
     --query 'EvaluationResults[].[EvalActionName,EvalDecision]' --output table
   ```
2. **End-to-end test** (always works): `aws/scripts/smoke-test.sh <ApiBaseUrl>` exercises every permission. If a step fails with `AWS_PERMISSION_DENIED`, CloudWatch Logs for the failing function shows the exact missing action.

Without `ExistingRoleArn`, the template creates the two least-privilege roles above (requires `CAPABILITY_IAM`).

## 5. Deployment steps

Prerequisites: AWS CLI v2, AWS SAM CLI, Node.js 22, configured credentials **on your own machine** (for Learner Lab, paste the session credentials from "AWS Details" into `~/.aws/credentials` — never into this repo).

```bash
# 1. Install Lambda dependencies. sharp must be the Linux x64 build for Lambda.
cd aws/lambdas/api && npm install --omit=dev && cd -
cd aws/lambdas/converter && npm install --omit=dev --os=linux --cpu=x64 && cd -

# 2. Build & deploy
cd aws
sam build
sam deploy --guided \
  --stack-name file-converter-dropbox \
  --capabilities CAPABILITY_IAM \
  --parameter-overrides AllowedOrigin=https://<your-site>.netlify.app
#   add ExistingRoleArn=arn:aws:iam::<ACCOUNT_ID>:role/LabRole if required

# 3. Read the outputs
aws cloudformation describe-stacks --stack-name file-converter-dropbox \
  --query 'Stacks[0].Outputs' --output table

# 4. Verify
./scripts/smoke-test.sh <ApiBaseUrl>
```

Then in Netlify: **Project configuration → Environment variables → Add** `VITE_API_BASE_URL = <ApiBaseUrl>` → **Deploys → Trigger deploy**. Open the site, turn demo mode off, and check the **AWS Setup & Status** page shows green ticks for the API and DynamoDB.

If `sharp` cannot be packaged in your environment, deploy with `EnabledConversions=TXT_TO_UPPERCASE,CSV_TO_JSON`; the frontend will then hide PNG → JPEG instead of offering a conversion that cannot run.

### Console-only alternative

1. Create the two S3 buckets (keep *Block all public access* on) and apply `aws/s3/*-cors.json` under *Permissions → CORS*.
2. Create the DynamoDB table and GSI as in §2.
3. Create the two Lambdas (Node.js 22), upload zipped `aws/lambdas/<name>` folders **including** `node_modules`, set env vars from §3, choose the role.
4. Create an HTTP API with a Lambda integration to the API function for each route in `docs/API_CONTRACT.md`, enable CORS for your Netlify origin.

## 6. Security checklist

- [x] Buckets private, public access blocked, objects owner-enforced, SSE-S3 encrypted.
- [x] Uploads only through presigned POST with size range and exact content type.
- [x] Downloads only through presigned GET (5-minute expiry, `attachment` disposition).
- [x] Server validates extension, MIME type, size, filename, PNG signature and UTF-8 text.
- [x] Filenames sanitised; S3 keys are namespaced by a server-generated UUID.
- [x] Duplicate conversions prevented with DynamoDB conditional writes.
- [x] CORS restricted to the Netlify origin (set `AllowedOrigin`, don't leave `*` in production).
- [x] API throttling enabled.
- [x] No AWS credentials in the frontend or the repository.
- [ ] **Not implemented:** authentication — anyone with the site URL can upload and see the shared history. Add Cognito or an API key before real-world use.
- [ ] **Not implemented:** malware scanning of uploads.

## 7. Troubleshooting

| Symptom | Likely cause |
|---------|--------------|
| "Could not reach the backend API" | Wrong `VITE_API_BASE_URL`, API CORS origin mismatch, or the site wasn't redeployed after setting the variable |
| "Upload to S3 failed. Check the bucket CORS configuration." | Uploads bucket CORS missing `POST` for your origin |
| `S3 rejected the upload: Policy expired` | Took longer than 300 s between create and upload |
| `AWS_PERMISSION_DENIED` | Role missing an action from §4 — check CloudWatch |
| Job stuck in `QUEUED` | Converter not invoked / crashed before updating; check converter logs. Timeout in the UI after 2 minutes |
| PNG jobs fail with "Internal conversion error" | `sharp` installed for the wrong platform — reinstall with `--os=linux --cpu=x64` |
