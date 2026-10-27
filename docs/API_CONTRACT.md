# API Contract — File Converter Physical Drop Box

Base URL: the value of `VITE_API_BASE_URL` (API Gateway HTTP API, e.g. `https://abc123.execute-api.us-east-1.amazonaws.com`).

- All requests and responses are JSON (`Content-Type: application/json`) unless noted.
- The browser never sends AWS credentials. File bytes go **directly to S3** using a short-lived presigned POST; downloads use a short-lived presigned GET.
- CORS: the API allows the origin configured in `ALLOWED_ORIGIN` (stack parameter `AllowedOrigin`), methods `GET, POST, OPTIONS`, header `Content-Type`.

## Error format

Every non-2xx response has this body:

```json
{ "error": { "code": "FILE_TOO_LARGE", "message": "File exceeds the 10 MB upload limit." } }
```

| HTTP | code | When |
|------|------|------|
| 400 | `INVALID_REQUEST`, `INVALID_JSON` | Body missing or not JSON |
| 400 | `UNSUPPORTED_CONVERSION` | `conversionType` not enabled on this backend |
| 400 | `UNSUPPORTED_FILE_TYPE` | Extension does not match the conversion |
| 400 | `UNSUPPORTED_CONTENT_TYPE` | MIME type not allowed for the conversion |
| 400 | `INVALID_FILE_NAME`, `INVALID_SIZE`, `INVALID_JOB_ID`, `INVALID_TOKEN` | Bad parameters |
| 400 | `UPLOAD_NOT_FOUND` | `convert` called before the S3 upload finished |
| 400 | `CONTENT_TYPE_MISMATCH` | Uploaded object type differs from the job |
| 404 | `JOB_NOT_FOUND`, `NOT_FOUND` | Unknown job or route |
| 409 | `JOB_ALREADY_STARTED` | Duplicate `convert` request |
| 409 | `OUTPUT_NOT_READY` | Download requested before the job succeeded |
| 413 | `FILE_TOO_LARGE` | Declared or uploaded size over `MAX_UPLOAD_BYTES` |
| 500 | `AWS_PERMISSION_DENIED` | Lambda role lacks an IAM permission |
| 500 | `INTERNAL_ERROR` | Anything else — see CloudWatch logs |
| 502 | `CONVERTER_UNAVAILABLE` | Converter Lambda could not be invoked |

## Job object

```json
{
  "jobId": "3b0c3f2e-6f1e-4a59-9d1b-0c7f4f1a2b3c",
  "originalFileName": "student-marks.csv",
  "conversionType": "CSV_TO_JSON",
  "status": "SUCCEEDED",
  "createdAt": "2026-10-13T10:15:02.120Z",
  "updatedAt": "2026-10-13T10:15:04.881Z",
  "inputSize": 18340,
  "contentType": "text/csv",
  "outputFileName": "student-marks.json",
  "outputSize": 41207,
  "errorMessage": null
}
```

`status` lifecycle: `PENDING_UPLOAD` → `QUEUED` → `PROCESSING` → `SUCCEEDED` | `FAILED`.
`errorMessage` is set only when `status` is `FAILED`.

`conversionType` values: `TXT_TO_UPPERCASE`, `CSV_TO_JSON`, `PNG_TO_JPEG`.

---

## 1. `GET /capabilities`

Lists what this backend can actually do. The frontend only shows these conversions.

**200**
```json
{
  "service": "file-converter-dropbox",
  "version": "1.0.0",
  "maxUploadBytes": 10485760,
  "conversions": [
    { "id": "TXT_TO_UPPERCASE", "inputExtensions": ["txt"], "outputExtension": "txt" },
    { "id": "CSV_TO_JSON", "inputExtensions": ["csv"], "outputExtension": "json" },
    { "id": "PNG_TO_JPEG", "inputExtensions": ["png"], "outputExtension": "jpg" }
  ]
}
```

## 2. `POST /jobs` — create an upload request

**Request**
```json
{ "fileName": "student-marks.csv", "contentType": "text/csv", "size": 18340, "conversionType": "CSV_TO_JSON" }
```

Server-side validation: conversion enabled, extension matches, MIME type allowed, `1 ≤ size ≤ MAX_UPLOAD_BYTES`, filename sanitised to `[A-Za-z0-9._-]` (max 120 chars). A DynamoDB record is written with status `PENDING_UPLOAD`.

**201**
```json
{
  "jobId": "3b0c3f2e-6f1e-4a59-9d1b-0c7f4f1a2b3c",
  "status": "PENDING_UPLOAD",
  "upload": {
    "url": "https://uploads-bucket.s3.amazonaws.com/",
    "fields": { "key": "uploads/3b0c…/student-marks.csv", "Content-Type": "text/csv", "Policy": "…", "X-Amz-Signature": "…", "…": "…" },
    "expiresIn": 300,
    "maxBytes": 10485760
  }
}
```

## 3. Upload the file (direct to S3)

`POST {upload.url}` as `multipart/form-data`: every entry of `upload.fields` first, then the file as the **last** field named `file`.

The presigned policy enforces `content-length-range 1..MAX_UPLOAD_BYTES` and the exact `Content-Type`; S3 rejects anything else with `403`/`400` XML. Success is `204 No Content`. The URL expires after `expiresIn` seconds.

## 4. `POST /jobs/{jobId}/convert` — start conversion

No body. The API checks the object exists in S3 (`HeadObject`), re-checks size and content type, atomically moves the job `PENDING_UPLOAD → QUEUED` (so duplicate clicks get `409`), and invokes the converter Lambda asynchronously.

**202**
```json
{ "jobId": "3b0c3f2e-…", "status": "QUEUED" }
```

## 5. `GET /jobs/{jobId}` — check status

**200** — a [Job object](#job-object). Poll every ~1.5 s until `SUCCEEDED` or `FAILED`.

## 6. `GET /jobs?limit=50&nextToken=…` — list history

Newest first (DynamoDB GSI `byCreatedAt`). `limit` 1–100, default 50.

**200**
```json
{ "items": [ { "jobId": "…", "status": "SUCCEEDED", "…": "…" } ], "nextToken": "eyJqb2JJZCI6…" }
```

`nextToken` is `null` when there are no more pages.

## 7. `GET /jobs/{jobId}/download` — secure download

Only for `SUCCEEDED` jobs. Returns a presigned S3 GET URL (default 300 s) with `Content-Disposition: attachment`.

**200**
```json
{ "jobId": "3b0c…", "fileName": "student-marks.json", "downloadUrl": "https://output-bucket.s3.amazonaws.com/converted/…?X-Amz-Signature=…", "expiresIn": 300 }
```

---

## Sequence

```
Browser            API Lambda              S3 uploads     Converter Lambda     S3 output     DynamoDB
  │ POST /jobs ──────▶│ validate, presign ───────────────────────────────────────────────────▶ PutItem PENDING_UPLOAD
  │◀── url+fields ────│
  │ POST file ─────────────────────────────▶│
  │ POST /convert ───▶│ HeadObject ────────▶│
  │                   │ UpdateItem QUEUED ────────────────────────────────────────────────────▶
  │                   │ Invoke (Event) ─────────────────▶│ GetObject ◀──│
  │◀── 202 ───────────│                                  │ convert, PutObject ─────▶│
  │ GET /jobs/{id} ──▶│ GetItem ◀────────────────────────│ UpdateItem SUCCEEDED/FAILED ─────────▶
  │ GET /download ───▶│ presign GET ───────────────────────────────────────▶│
  │ GET file ──────────────────────────────────────────────────────────────▶│
```
