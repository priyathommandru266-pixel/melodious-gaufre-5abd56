/**
 * File Converter Drop Box — API Lambda (Amazon API Gateway HTTP API, payload v2).
 *
 * Routes (see docs/API_CONTRACT.md):
 *   GET  /capabilities
 *   POST /jobs                      -> create job + presigned S3 POST for upload
 *   POST /jobs/{jobId}/convert      -> verify upload, queue job, invoke converter async
 *   GET  /jobs                      -> list history (newest first)
 *   GET  /jobs/{jobId}              -> job status
 *   GET  /jobs/{jobId}/download     -> presigned S3 GET for the output
 *
 * There are NO S3 event triggers: the converter is invoked explicitly by this
 * function, so writing converted files can never re-trigger processing.
 */
import { randomUUID } from 'node:crypto'
import { S3Client, HeadObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3'
import { createPresignedPost } from '@aws-sdk/s3-presigned-post'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import { DynamoDBClient } from '@aws-sdk/client-dynamodb'
import { DynamoDBDocumentClient, GetCommand, PutCommand, QueryCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb'
import { LambdaClient, InvokeCommand } from '@aws-sdk/client-lambda'

const env = process.env
const INPUT_BUCKET = env.INPUT_BUCKET
const OUTPUT_BUCKET = env.OUTPUT_BUCKET
const JOBS_TABLE = env.JOBS_TABLE
const CONVERTER_FUNCTION_NAME = env.CONVERTER_FUNCTION_NAME
const MAX_UPLOAD_BYTES = Number(env.MAX_UPLOAD_BYTES ?? 10 * 1024 * 1024)
const UPLOAD_URL_TTL = Number(env.UPLOAD_URL_TTL ?? 300)
const DOWNLOAD_URL_TTL = Number(env.DOWNLOAD_URL_TTL ?? 300)
const ALLOWED_ORIGINS = (env.ALLOWED_ORIGIN ?? '*').split(',').map((s) => s.trim()).filter(Boolean)
const VERSION = '1.0.0'

const CONVERSIONS = {
  TXT_TO_UPPERCASE: { inputExtensions: ['txt'], inputMimeTypes: ['text/plain'], outputExtension: 'txt' },
  CSV_TO_JSON: { inputExtensions: ['csv'], inputMimeTypes: ['text/csv', 'application/csv', 'application/vnd.ms-excel', 'text/plain'], outputExtension: 'json' },
  PNG_TO_JPEG: { inputExtensions: ['png'], inputMimeTypes: ['image/png'], outputExtension: 'jpg' },
}
// Lets you advertise only what is actually deployed (e.g. drop PNG_TO_JPEG if sharp is not packaged).
const ENABLED = (env.ENABLED_CONVERSIONS || Object.keys(CONVERSIONS).join(','))
  .split(',')
  .map((s) => s.trim())
  .filter((id) => id in CONVERSIONS)

const s3 = new S3Client({})
const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}), { marshallOptions: { removeUndefinedValues: true } })
const lambda = new LambdaClient({})

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/

class HttpError extends Error {
  constructor(status, code, message) {
    super(message)
    this.status = status
    this.code = code
  }
}

function corsHeaders(event) {
  const origin = event.headers?.origin ?? event.headers?.Origin
  let allow = ALLOWED_ORIGINS[0] ?? '*'
  if (ALLOWED_ORIGINS.includes('*')) allow = '*'
  else if (origin && ALLOWED_ORIGINS.includes(origin)) allow = origin
  return {
    'Access-Control-Allow-Origin': allow,
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    Vary: 'Origin',
  }
}

function json(event, status, body) {
  return {
    statusCode: status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...corsHeaders(event) },
    body: JSON.stringify(body),
  }
}

export function sanitizeFileName(name) {
  const base = String(name).split(/[\\/]/).pop() ?? ''
  const cleaned = base
    .normalize('NFKD')
    .replace(/[^\w.-]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^[._]+/, '')
    .slice(-120)
  return cleaned || 'file'
}

const extOf = (name) => {
  const i = name.lastIndexOf('.')
  return i > 0 ? name.slice(i + 1).toLowerCase() : ''
}

/** Remove internal fields (S3 keys, index attributes) before returning a job. */
function publicJob(item) {
  return {
    jobId: item.jobId,
    originalFileName: item.originalFileName,
    conversionType: item.conversionType,
    status: item.status,
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
    inputSize: item.inputSize,
    contentType: item.contentType,
    outputFileName: item.outputFileName,
    outputSize: item.outputSize,
    errorMessage: item.errorMessage,
  }
}

function parseBody(event) {
  if (!event.body) throw new HttpError(400, 'INVALID_REQUEST', 'Request body is required.')
  const raw = event.isBase64Encoded ? Buffer.from(event.body, 'base64').toString('utf8') : event.body
  if (raw.length > 4096) throw new HttpError(413, 'INVALID_REQUEST', 'Request body is too large.')
  try {
    return JSON.parse(raw)
  } catch {
    throw new HttpError(400, 'INVALID_JSON', 'Request body must be valid JSON.')
  }
}

async function loadJob(jobId) {
  if (!UUID_RE.test(jobId ?? '')) throw new HttpError(400, 'INVALID_JOB_ID', 'Job ID is not valid.')
  const res = await ddb.send(new GetCommand({ TableName: JOBS_TABLE, Key: { jobId } }))
  if (!res.Item) throw new HttpError(404, 'JOB_NOT_FOUND', 'No job exists with that ID.')
  return res.Item
}

// ---------- handlers ----------

function getCapabilities() {
  return {
    service: 'file-converter-dropbox',
    version: VERSION,
    maxUploadBytes: MAX_UPLOAD_BYTES,
    conversions: ENABLED.map((id) => ({
      id,
      inputExtensions: CONVERSIONS[id].inputExtensions,
      outputExtension: CONVERSIONS[id].outputExtension,
    })),
  }
}

async function createJob(event) {
  const { fileName, contentType, size, conversionType } = parseBody(event)

  if (!ENABLED.includes(conversionType)) {
    throw new HttpError(400, 'UNSUPPORTED_CONVERSION', `Conversion "${conversionType}" is not supported by this backend.`)
  }
  const conv = CONVERSIONS[conversionType]
  if (typeof fileName !== 'string' || fileName.length < 1 || fileName.length > 255) {
    throw new HttpError(400, 'INVALID_FILE_NAME', 'fileName must be 1–255 characters.')
  }
  const safeName = sanitizeFileName(fileName)
  const ext = extOf(safeName)
  if (!conv.inputExtensions.includes(ext)) {
    throw new HttpError(400, 'UNSUPPORTED_FILE_TYPE', `${conversionType} requires a .${conv.inputExtensions.join('/.')} file.`)
  }
  if (typeof contentType !== 'string' || !conv.inputMimeTypes.includes(contentType)) {
    throw new HttpError(400, 'UNSUPPORTED_CONTENT_TYPE', `Content type "${contentType}" is not allowed for ${conversionType}.`)
  }
  if (!Number.isInteger(size) || size < 1) throw new HttpError(400, 'INVALID_SIZE', 'size must be a positive integer (bytes).')
  if (size > MAX_UPLOAD_BYTES) {
    throw new HttpError(413, 'FILE_TOO_LARGE', `File exceeds the ${Math.round(MAX_UPLOAD_BYTES / 1048576)} MB upload limit.`)
  }

  const jobId = randomUUID()
  const inputKey = `uploads/${jobId}/${safeName}`
  const now = new Date().toISOString()

  // The POST policy is what actually enforces size and type at S3.
  const presigned = await createPresignedPost(s3, {
    Bucket: INPUT_BUCKET,
    Key: inputKey,
    Conditions: [
      ['content-length-range', 1, MAX_UPLOAD_BYTES],
      ['eq', '$Content-Type', contentType],
    ],
    Fields: { 'Content-Type': contentType },
    Expires: UPLOAD_URL_TTL,
  })

  await ddb.send(
    new PutCommand({
      TableName: JOBS_TABLE,
      Item: {
        jobId,
        entity: 'JOB',
        originalFileName: safeName,
        conversionType,
        contentType,
        status: 'PENDING_UPLOAD',
        inputKey,
        inputSize: size,
        createdAt: now,
        updatedAt: now,
      },
      ConditionExpression: 'attribute_not_exists(jobId)',
    }),
  )

  return {
    jobId,
    status: 'PENDING_UPLOAD',
    upload: { url: presigned.url, fields: presigned.fields, expiresIn: UPLOAD_URL_TTL, maxBytes: MAX_UPLOAD_BYTES },
  }
}

async function startConversion(jobId) {
  const job = await loadJob(jobId)
  if (job.status !== 'PENDING_UPLOAD') {
    throw new HttpError(409, 'JOB_ALREADY_STARTED', `Job is already ${job.status}.`)
  }

  let head
  try {
    head = await s3.send(new HeadObjectCommand({ Bucket: INPUT_BUCKET, Key: job.inputKey }))
  } catch (err) {
    if (err?.$metadata?.httpStatusCode === 404 || err?.name === 'NotFound') {
      throw new HttpError(400, 'UPLOAD_NOT_FOUND', 'The file has not been uploaded to S3 yet.')
    }
    throw err
  }
  if ((head.ContentLength ?? 0) > MAX_UPLOAD_BYTES) throw new HttpError(413, 'FILE_TOO_LARGE', 'Uploaded file exceeds the size limit.')
  if (head.ContentType !== job.contentType) throw new HttpError(400, 'CONTENT_TYPE_MISMATCH', 'Uploaded file content type does not match the job.')

  const now = new Date().toISOString()
  try {
    await ddb.send(
      new UpdateCommand({
        TableName: JOBS_TABLE,
        Key: { jobId },
        UpdateExpression: 'SET #s = :queued, updatedAt = :now, inputSize = :size',
        ConditionExpression: '#s = :pending', // only one convert request can win
        ExpressionAttributeNames: { '#s': 'status' },
        ExpressionAttributeValues: { ':queued': 'QUEUED', ':pending': 'PENDING_UPLOAD', ':now': now, ':size': head.ContentLength },
      }),
    )
  } catch (err) {
    if (err?.name === 'ConditionalCheckFailedException') throw new HttpError(409, 'JOB_ALREADY_STARTED', 'Conversion was already started.')
    throw err
  }

  try {
    await lambda.send(
      new InvokeCommand({
        FunctionName: CONVERTER_FUNCTION_NAME,
        InvocationType: 'Event', // async; client polls GET /jobs/{id}
        Payload: Buffer.from(JSON.stringify({ jobId })),
      }),
    )
  } catch (err) {
    console.error('Failed to invoke converter', err)
    await ddb.send(
      new UpdateCommand({
        TableName: JOBS_TABLE,
        Key: { jobId },
        UpdateExpression: 'SET #s = :failed, errorMessage = :msg, updatedAt = :now',
        ExpressionAttributeNames: { '#s': 'status' },
        ExpressionAttributeValues: { ':failed': 'FAILED', ':msg': 'Could not start the converter Lambda (check lambda:InvokeFunction permission).', ':now': new Date().toISOString() },
      }),
    )
    throw new HttpError(502, 'CONVERTER_UNAVAILABLE', 'Could not start the converter.')
  }
  return { jobId, status: 'QUEUED' }
}

async function listJobs(event) {
  const qs = event.queryStringParameters ?? {}
  const limit = Math.min(Math.max(Number(qs.limit) || 50, 1), 100)
  let ExclusiveStartKey
  if (qs.nextToken) {
    try {
      ExclusiveStartKey = JSON.parse(Buffer.from(qs.nextToken, 'base64url').toString('utf8'))
    } catch {
      throw new HttpError(400, 'INVALID_TOKEN', 'nextToken is not valid.')
    }
  }
  const res = await ddb.send(
    new QueryCommand({
      TableName: JOBS_TABLE,
      IndexName: 'byCreatedAt',
      KeyConditionExpression: 'entity = :e',
      ExpressionAttributeValues: { ':e': 'JOB' },
      ScanIndexForward: false,
      Limit: limit,
      ExclusiveStartKey,
    }),
  )
  return {
    items: (res.Items ?? []).map(publicJob),
    nextToken: res.LastEvaluatedKey ? Buffer.from(JSON.stringify(res.LastEvaluatedKey)).toString('base64url') : null,
  }
}

async function getDownload(jobId) {
  const job = await loadJob(jobId)
  if (job.status !== 'SUCCEEDED' || !job.outputKey) {
    throw new HttpError(409, 'OUTPUT_NOT_READY', `No output available — job is ${job.status}.`)
  }
  const downloadUrl = await getSignedUrl(
    s3,
    new GetObjectCommand({
      Bucket: OUTPUT_BUCKET,
      Key: job.outputKey,
      ResponseContentDisposition: `attachment; filename="${job.outputFileName}"`,
    }),
    { expiresIn: DOWNLOAD_URL_TTL },
  )
  return { jobId, fileName: job.outputFileName, downloadUrl, expiresIn: DOWNLOAD_URL_TTL }
}

// ---------- router ----------

export const handler = async (event) => {
  const method = event.requestContext?.http?.method ?? event.httpMethod
  const path = (event.rawPath ?? event.path ?? '').replace(/\/+$/, '') || '/'
  // Strip a stage prefix such as /prod if present.
  const route = path.replace(/^\/(prod|dev|\$default)(?=\/)/, '')

  if (method === 'OPTIONS') return { statusCode: 204, headers: corsHeaders(event) }

  try {
    let m
    if (method === 'GET' && route === '/capabilities') return json(event, 200, getCapabilities())
    if (method === 'POST' && route === '/jobs') return json(event, 201, await createJob(event))
    if (method === 'GET' && route === '/jobs') return json(event, 200, await listJobs(event))
    if (method === 'POST' && (m = route.match(/^\/jobs\/([^/]+)\/convert$/))) return json(event, 202, await startConversion(m[1]))
    if (method === 'GET' && (m = route.match(/^\/jobs\/([^/]+)\/download$/))) return json(event, 200, await getDownload(m[1]))
    if (method === 'GET' && (m = route.match(/^\/jobs\/([^/]+)$/))) return json(event, 200, publicJob(await loadJob(m[1])))
    throw new HttpError(404, 'NOT_FOUND', 'Route not found.')
  } catch (err) {
    if (err instanceof HttpError) return json(event, err.status, { error: { code: err.code, message: err.message } })
    console.error('Unhandled error', err)
    const denied = err?.name === 'AccessDenied' || err?.name === 'AccessDeniedException'
    return json(event, 500, {
      error: {
        code: denied ? 'AWS_PERMISSION_DENIED' : 'INTERNAL_ERROR',
        message: denied
          ? 'The Lambda execution role is missing a required permission. See docs/AWS_SETUP.md.'
          : 'Internal server error. Check CloudWatch logs for the API function.',
      },
    })
  }
}
