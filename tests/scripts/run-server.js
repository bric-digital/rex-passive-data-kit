import { gunzipSync } from 'node:zlib';
import { Buffer } from 'node:buffer';

import express from 'express'
import multer from 'multer'

const app = express();
const port = 3000;

app.use(express.json()) // for parsing application/json
app.use(express.urlencoded({ extended: true })) // for parsing application/x-www-form-urlencoded

const upload = multer()

app.get('/', (request, response) => {
  response.send('The only way to pass a test is to take the test.')
});

app.get('/headers', (request, response) => {
  response.statusCode = 200;
  response.setHeader('Content-Type', 'application/json')

  response.send(JSON.stringify(request.headers, null, '  '))
});

app.post('/post', upload.none(), (request, response) => {
  response.statusCode = 200;
  response.setHeader('Content-Type', 'application/json')

  if ([null, undefined, ''].includes(request.body)) {
    request.body = {}
  }

  response.send(JSON.stringify(request.body, null, '  '))
});

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

  for (const dataPoint of reply.payload) {
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
  }

  response.send(JSON.stringify(reply, null, '  '))
});

app.listen(port, () => {
  console.log(`Server running on port ${port}...`);
});
