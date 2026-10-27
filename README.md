# File Converter Physical Drop Box

A software-only cloud computing lab project. The original "drop box" idea used a physical push-button and a status LED; here both are replaced by a web interface — a large **Convert File** button and an on-screen **status LED** — backed by serverless AWS processing.

Users drop a file in, choose a conversion, press the button, watch the job move through upload → processing → done, and download the result. Every job is recorded in Amazon DynamoDB.

| Conversion | Input | Output | Engine |
|-----------|-------|--------|--------|
| TXT → Uppercase TXT | `.txt` | `.txt` | Node.js string transform |
| CSV → JSON | `.csv` | `.json` | `csv-parse` |
| PNG → JPEG | `.png` | `.jpg` | `sharp` (libvips) |

## Architecture

```
Netlify (React + TypeScript frontend)
  → Amazon API Gateway (HTTP API) → API Lambda
      → Amazon S3 (private uploads bucket, presigned POST)
      → AWS Lambda converter (invoked asynchronously — no S3 triggers)
      → Amazon S3 (private output bucket, presigned GET)
      → Amazon DynamoDB (job metadata & status)
```

## Feature status

| Feature | Status |
|---------|--------|
| Responsive dashboard (summary cards, recent activity, file types, status indicators, storage overview, refresh) | ✅ Implemented |
| Drag-and-drop upload with file name / extension / size, remove option, validation, progress bar, duplicate-submit guard | ✅ Implemented |
| Conversion dropdown that lists only what the backend reports via `GET /capabilities` | ✅ Implemented |
| Conversion history with search, status & type filters, sorting, pagination, download action | ✅ Implemented |
| "Backend not configured" notice, and clearly labelled **DEMO MODE** with sample jobs | ✅ Implemented |
| Real TXT → uppercase conversion in the browser (demo only, never shown as a cloud upload) | ✅ Implemented |
| API Lambda, converter Lambda, SAM template, IAM policies, S3 CORS, smoke test | ✅ Code written — 🔧 **requires you to deploy to AWS** |
| S3 uploads, Lambda conversions (all three types), DynamoDB history, presigned downloads | 🔧 Works once AWS is deployed and `VITE_API_BASE_URL` is set |
| User accounts / per-user history, malware scanning | ❌ Not implemented (see Roadmap) |

The frontend never reports a file as uploaded, converted or saved unless the API confirms it. Sample jobs in demo mode are tagged **Sample**, and local conversions are tagged **Local demo**.

## Tech stack

- **Frontend:** React 19 + TypeScript, TanStack Start/Router, Tailwind CSS 4, lucide-react icons, Vite 7
- **Hosting:** Netlify
- **Backend (in `aws/`):** AWS Lambda (Node.js 22), Amazon API Gateway HTTP API, Amazon S3, Amazon DynamoDB, IAM, AWS SAM

## Running locally

```bash
pnpm install
cp .env.example .env      # optional — leave VITE_API_BASE_URL empty for demo mode
pnpm dev                  # http://localhost:3000
```

With `VITE_API_BASE_URL` empty the app shows **Backend not configured**; flip the **Demo mode** switch in the sidebar (or the banner link) to preview with sample data.

## Environment variables

| Name | Required | Description |
|------|----------|-------------|
| `VITE_API_BASE_URL` | for live mode | API Gateway base URL (`ApiBaseUrl` stack output). Must be `https://` |
| `VITE_MAX_UPLOAD_MB` | no (default 10) | Client-side size check. The server enforces its own `MaxUploadBytes` in the S3 upload policy — keep them equal |

**Never** put AWS access keys, secret keys or session tokens in any `VITE_` variable, `.env` file or source file. They would be shipped to every visitor's browser. The Lambdas use their IAM execution role instead.

## Deploying

### Frontend → Netlify
`netlify.toml` already configures the build (`vite build`, publish `dist/client`) and security headers. Push to the connected repository, then set `VITE_API_BASE_URL` under **Project configuration → Environment variables** and trigger a redeploy (Vite reads the variable at build time).

### Backend → AWS
Full instructions, IAM tables, LabRole guidance and troubleshooting: **[docs/AWS_SETUP.md](docs/AWS_SETUP.md)**. Short version:

```bash
cd aws/lambdas/api && npm install --omit=dev && cd -
cd aws/lambdas/converter && npm install --omit=dev --os=linux --cpu=x64 && cd -
cd aws && sam build && sam deploy --guided --capabilities CAPABILITY_IAM \
  --parameter-overrides AllowedOrigin=https://<your-site>.netlify.app
# College lab? add: ExistingRoleArn=arn:aws:iam::<ACCOUNT_ID>:role/LabRole
./scripts/smoke-test.sh <ApiBaseUrl>
```

## API

Documented in **[docs/API_CONTRACT.md](docs/API_CONTRACT.md)**:

| Method | Path | Purpose |
|--------|------|---------|
| `GET` | `/capabilities` | Supported conversions and upload limit |
| `POST` | `/jobs` | Create a job + presigned S3 upload |
| — | *(S3 presigned POST)* | Upload the file directly to S3 |
| `POST` | `/jobs/{jobId}/convert` | Start conversion |
| `GET` | `/jobs/{jobId}` | Job status |
| `GET` | `/jobs` | Conversion history |
| `GET` | `/jobs/{jobId}/download` | Presigned download URL |

Errors use `{ "error": { "code", "message" } }`; the UI shows the message directly.

## Security & validation

- Client **and** server check extension, MIME type, size; the server additionally checks the PNG signature, UTF-8 validity and parses CSV safely.
- Filenames are sanitised and S3 keys are namespaced by a server-generated UUID.
- Buckets are private with public access blocked; access is only via short-lived presigned URLs.
- Duplicate convert requests are rejected with a DynamoDB conditional write; the button is disabled while a job is in flight.
- CORS restricted to your Netlify origin; API throttling enabled.
- No S3 event triggers, separate output bucket → no recursive Lambda invocations.

## Project structure

```
src/
  routes/          index (dashboard), convert, history, setup
  components/      AppShell, ModeBanner, Dropzone, JobsTable, StatusBadge/StatusLed, DownloadButton, ui
  context/         AppContext (mode, capabilities, jobs), ToastContext
  lib/             api client, config, conversions catalog, validation, demo fixtures, stats
aws/
  lambdas/api/         API Gateway handler
  lambdas/converter/   TXT / CSV / PNG converter
  template.yaml        SAM stack (S3, DynamoDB, Lambdas, HTTP API, optional IAM roles)
  iam/  s3/            Policy and CORS JSON for manual setup
  scripts/smoke-test.sh
docs/
  API_CONTRACT.md  AWS_SETUP.md
```

## Roadmap

1. **Deploy the AWS stack** and connect it (the code is ready — this is a configuration step).
2. **Authentication** with Amazon Cognito so each student sees only their own jobs (add `ownerId` to the table and a GSI per owner).
3. **More conversions** (e.g. JPEG → PNG, JSON → CSV, image resize) — add a converter function and list it in `ENABLED_CONVERSIONS`; the UI picks it up automatically from `/capabilities` once added to `src/lib/conversions.ts`.
4. **Malware scanning** of uploads before conversion.
5. **Live updates** via WebSockets instead of polling.
