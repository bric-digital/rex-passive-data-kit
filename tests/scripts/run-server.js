import { gunzipSync } from 'node:zlib';
import { Buffer } from 'node:buffer';

import express from 'express'
import multer from 'multer'

const app = express();
const port = 9090;

// The v3 bundle PUT sends gzip bytes under a Content-Type of application/json,
// which the global JSON parser would consume before the route's raw parser sees
// it. Skip both global parsers for that one request shape.
const isRawBundleUpload = (request) => request.method === 'PUT' && request.path === '/data/add-bundle.json'

const skipRawBundleUpload = (parser) => (request, response, next) => {
  if (isRawBundleUpload(request)) {
    return next()
  }

  return parser(request, response, next)
}

app.use(skipRawBundleUpload(express.json())) // for parsing application/json
app.use(skipRawBundleUpload(express.urlencoded({ extended: true }))) // for parsing application/x-www-form-urlencoded

const upload = multer()

// Specs exercising a bearer admission failure send anything else.
const VALID_BEARER_TOKEN = 'local-test-bearer-token'

// Every ingest route holds points to the same envelope contract. Returns an
// error string, or null when the bundle is well formed.
const validateDataPoints = (dataPoints) => {
  for (const dataPoint of dataPoints) {
    const metadata = dataPoint['passive-data-metadata']

    if (metadata === undefined) {
      return '<passive-data-metadata> is missing.'
    }

    if (metadata.source === undefined) {
      return '<passive-data-metadata.source> is missing.'
    }

    if (metadata['configuration-hash'] === undefined) {
      return '<passive-data-metadata.configuration-hash> is missing.'
    }

    // enqueuedAt belongs in the metadata envelope as enqueued-at; leaving it on
    // the point body means an uploader skipped the shared stamping step.
    if (dataPoint.enqueuedAt !== undefined) {
      return '<enqueuedAt> leaked into the data point body.'
    }
  }

  return null
}

app.get('/', (request, response) => {
  response.send('The only way to pass a test is to take the test.')
})

app.get('/headers', (request, response) => {
  response.statusCode = 200;
  response.setHeader('Content-Type', 'application/json')

  response.send(JSON.stringify(request.headers, null, '  '))
})

app.post('/post', upload.none(), (request, response) => {
  response.statusCode = 200;
  response.setHeader('Content-Type', 'application/json')

  if ([null, undefined, ''].includes(request.body)) {
    request.body = {}
  }

  response.send(JSON.stringify(request.body, null, '  '))
})

app.post('/data/add-bundle.json', upload.none(), (request, response) => {
  response.statusCode = 200;
  response.setHeader('Content-Type', 'application/json')

  let reply = {
    'request-headers': request.headers,
    'request-body': request.body
  }

  if ('gzip' == request.body.compression) {
    const buffer = Buffer.from(request.body.payload, 'base64');
    const decompressed = gunzipSync(buffer).toString();

    reply.payload = JSON.parse(decompressed)
  } else {
    reply.payload = JSON.parse(request.body.payload)
  }

  console.error(`/data/add-bundle.json: ${JSON.stringify(reply, null, '  ')}`)

  const error = validateDataPoints(reply.payload)

  if (error !== null) {
    console.error(`Error encountered in data point: ${error}`)
    console.error(`/data/add-bundle.json: ${JSON.stringify(reply.payload, null, '  ')}`)

    response.statusCode = 400;
    response.send(JSON.stringify({'error': error}))

    return
  }

  response.send(JSON.stringify(reply, null, '  '))
})

// The v3 bundle upload PUTs raw gzip bytes rather than a base64 payload field,
// so this route parses its own raw body. A global raw parser would swallow the
// urlencoded bodies the POST routes above depend on.
app.put('/data/add-bundle.json', express.raw({ type: '*/*', limit: '10mb' }), (request, response) => {
  response.setHeader('Content-Type', 'application/json')

  const authorization = request.headers['authorization']

  if (authorization !== `Bearer ${VALID_BEARER_TOKEN}`) {
    console.error(`PUT /data/add-bundle.json: rejecting authorization "${authorization}"`)

    response.statusCode = 401
    response.send(JSON.stringify({ 'error': 'Invalid or missing bearer token.' }))

    return
  }

  let payload = null

  try {
    // express.raw() inflates a gzip Content-Encoding itself, so request.body is
    // already plain JSON bytes by the time it gets here.
    payload = JSON.parse(request.body.toString())
  } catch (error) {
    console.error(`PUT /data/add-bundle.json: unable to decode body: ${error}`)

    response.statusCode = 400
    response.send(JSON.stringify({ 'error': `Unable to decode body: ${error}` }))

    return
  }

  const reply = {
    'request-headers': request.headers,
    'payload': payload
  }

  console.error(`PUT /data/add-bundle.json: ${JSON.stringify(reply, null, '  ')}`)

  const error = validateDataPoints(payload)

  if (error !== null) {
    console.error(`Error encountered in data point: ${error}`)

    response.statusCode = 400
    response.send(JSON.stringify({ 'error': error }))

    return
  }

  response.statusCode = 200
  response.send(JSON.stringify(reply, null, '  '))
})

app.post('/data/add-point.json', upload.none(), (request, response) => {
  response.statusCode = 200;
  response.setHeader('Content-Type', 'application/json')

  const dataPoint = JSON.parse(request.body.payload)

  let reply = {
    'request-headers': request.headers,
    'request-body': request.body,
    'post.payload': dataPoint
  }

  console.error(`/data/add-point.json: ${JSON.stringify(reply, null, '  ')}`)

  const metadata = dataPoint['passive-data-metadata']

  let error = null

  if (metadata === undefined) {
    error = '<passive-data-metadata> is missing.'
  }

  if (metadata.source === undefined) {
    error = '<passive-data-metadata.source> is missing.'
  }

  if (metadata['configuration-hash'] === undefined) {
    error = '<passive-data-metadata.configuration-hash> is missing.'
  }

  if (error !== null) {
    console.error(`Error encountered in data point: ${error}`)
    console.error(`/data/add-bundle.json: ${JSON.stringify(dataPoint, null, '  ')}`)
      
    response.statusCode = 400;
    response.send(JSON.stringify({'error': '"passive-data-metadata.source" is missing.'}))

    return
  }

  const replyMessage = {
    message: 'Data point added successfully.'
  }

  response.send(JSON.stringify(replyMessage, null, '  '))
})

app.listen(port, () => {
  console.log(`Server running on port ${port}...`);
})
