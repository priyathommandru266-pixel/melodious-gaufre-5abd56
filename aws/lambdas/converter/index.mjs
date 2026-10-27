/**
 * File Converter Drop Box — converter Lambda.
 * Invoked asynchronously by the API Lambda with { jobId }. Never triggered by
 * S3 events, and writes to a separate output bucket, so it cannot recurse.
 */
import { S3Client, GetObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3'
import { DynamoDBClient } from '@aws-sdk/client-dynamodb'
import { DynamoDBDocumentClient, GetCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb'
import { parse } from 'csv-parse/sync'
import sharp from 'sharp'

const { INPUT_BUCKET, OUTPUT_BUCKET, JOBS_TABLE } = process.env
const MAX_UPLOAD_BYTES = Number(process.env.MAX_UPLOAD_BYTES ?? 10 * 1024 * 1024)

const s3 = new S3Client({})
const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}), { marshallOptions: { removeUndefinedValues: true } })

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])

/** Errors whose message is safe and useful to show to the user. */
class ConversionError extends Error {}

function decodeUtf8(buf) {
  if (buf.includes(0)) throw new ConversionError('File contains binary data, not plain text.')
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(buf).replace(/^﻿/, '')
  } catch {
    throw new ConversionError('File is not valid UTF-8 text.')
  }
}

const baseName = (name) => name.replace(/\.[^.]+$/, '') || 'file'

const CONVERTERS = {
  async TXT_TO_UPPERCASE(buf, name) {
    return { body: Buffer.from(decodeUtf8(buf).toUpperCase(), 'utf8'), contentType: 'text/plain; charset=utf-8', fileName: `${baseName(name)}_uppercase.txt` }
  },

  async CSV_TO_JSON(buf, name) {
    let rows
    try {
      rows = parse(decodeUtf8(buf), { columns: true, skip_empty_lines: true, trim: true, bom: true })
    } catch (err) {
      if (err instanceof ConversionError) throw err
      throw new ConversionError(`CSV parse error: ${err.message}`)
    }
    if (rows.length === 0) throw new ConversionError('CSV file has a header row but no data rows.')
    return { body: Buffer.from(JSON.stringify(rows, null, 2), 'utf8'), contentType: 'application/json', fileName: `${baseName(name)}.json` }
  },

  async PNG_TO_JPEG(buf, name) {
    if (buf.length < 8 || !buf.subarray(0, 8).equals(PNG_SIGNATURE)) throw new ConversionError('File is not a valid PNG image.')
    let out
    try {
      out = await sharp(buf, { limitInputPixels: 50_000_000 })
        .flatten({ background: '#ffffff' }) // JPEG has no alpha channel
        .jpeg({ quality: 85, mozjpeg: true })
        .toBuffer()
    } catch {
      throw new ConversionError('The PNG image could not be decoded.')
    }
    return { body: out, contentType: 'image/jpeg', fileName: `${baseName(name)}.jpg` }
  },
}

async function setStatus(jobId, fields, expectedStatus) {
  const names = {}
  const values = { ':now': new Date().toISOString() }
  const sets = ['updatedAt = :now']
  for (const [k, v] of Object.entries(fields)) {
    const nk = `#${k}`
    names[nk] = k
    values[`:${k}`] = v
    sets.push(`${nk} = :${k}`)
  }
  const cond = expectedStatus ? { ConditionExpression: '#status = :expected' } : {}
  if (expectedStatus) {
    names['#status'] = 'status'
    values[':expected'] = expectedStatus
  }
  await ddb.send(
    new UpdateCommand({
      TableName: JOBS_TABLE,
      Key: { jobId },
      UpdateExpression: `SET ${sets.join(', ')}`,
      ExpressionAttributeNames: names,
      ExpressionAttributeValues: values,
      ...cond,
    }),
  )
}

export const handler = async (event) => {
  const jobId = event?.jobId
  if (!UUID_RE.test(jobId ?? '')) {
    console.error('Invalid or missing jobId', event)
    return
  }
  const { Item: job } = await ddb.send(new GetCommand({ TableName: JOBS_TABLE, Key: { jobId } }))
  if (!job || job.status !== 'QUEUED') {
    console.warn(`Skipping job ${jobId}: status is ${job?.status ?? 'missing'}`)
    return // idempotent on Lambda async retries
  }

  try {
    await setStatus(jobId, { status: 'PROCESSING' }, 'QUEUED')
  } catch (err) {
    if (err?.name === 'ConditionalCheckFailedException') return
    throw err
  }

  try {
    const converter = CONVERTERS[job.conversionType]
    if (!converter) throw new ConversionError(`Unsupported conversion type ${job.conversionType}.`)

    const obj = await s3.send(new GetObjectCommand({ Bucket: INPUT_BUCKET, Key: job.inputKey }))
    if ((obj.ContentLength ?? 0) > MAX_UPLOAD_BYTES) throw new ConversionError('File exceeds the server-side upload limit.')
    const input = Buffer.from(await obj.Body.transformToByteArray())

    const { body, contentType, fileName } = await converter(input, job.originalFileName)
    const outputKey = `converted/${jobId}/${fileName}`

    await s3.send(
      new PutObjectCommand({
        Bucket: OUTPUT_BUCKET,
        Key: outputKey,
        Body: body,
        ContentType: contentType,
        Metadata: { 'source-job-id': jobId },
      }),
    )

    await setStatus(jobId, { status: 'SUCCEEDED', outputKey, outputFileName: fileName, outputSize: body.length, completedAt: new Date().toISOString() })
    console.log(`Job ${jobId} succeeded -> s3://${OUTPUT_BUCKET}/${outputKey}`)
  } catch (err) {
    console.error(`Job ${jobId} failed`, err)
    const denied = err?.name === 'AccessDenied' || err?.name === 'AccessDeniedException'
    const message =
      err instanceof ConversionError
        ? err.message
        : denied
          ? 'Converter is missing an IAM permission (S3 or DynamoDB). See docs/AWS_SETUP.md.'
          : 'Internal conversion error. Check the converter CloudWatch logs.'
    await setStatus(jobId, { status: 'FAILED', errorMessage: message })
  }
}
