// @ts-nocheck

import { test, expect } from './fixtures';

// The v3 upload path PUTs raw gzip bytes with a bearer token instead of POSTing
// a base64 payload field. These specs drive the module's configuration directly
// rather than editing tests/extension/config.json, so the default POST transport
// stays in place for every other spec.

const VALID_BEARER_TOKEN = 'local-test-bearer-token'
const ENDPOINT = 'http://localhost:9090/data/add-bundle.json'

const V3_CONFIGURATION = {
  identifier: 'rex-pdk',
  endpoint: ENDPOINT,
  endpoint_version: 'v3',
  authorization: { token: VALID_BEARER_TOKEN }
}

const LEGACY_CONFIGURATION = {
  identifier: 'rex-pdk',
  endpoint: ENDPOINT
}

// Waits for setup() to open the database and the initial configuration fetch to
// land, then replaces that configuration with the one the spec needs and drains
// a single freshly enqueued point.
const uploadPointWith = (serviceWorker, configuration, generatorId) => {
  return serviceWorker.evaluate(async ([configuration, generatorId]) => {
    const pdk = self.rexPDKPlugin

    // Awaits the condition, so async predicates (an IndexedDB count, say) are
    // resolved rather than treated as an always-truthy Promise.
    const waitFor = async (condition, timeoutMs, label) => {
      const started = Date.now()

      while ((await condition()) === false) {
        if (Date.now() - started > timeoutMs) {
          throw new Error(`Timed out waiting for: ${label}`)
        }

        await new Promise((resolve) => self.setTimeout(resolve, 25))
      }
    }

    await waitFor(() => pdk.database !== null && pdk.uploadUrl !== '', 10000, 'database open and configuration loaded')

    const untransmittedCount = () => {
      return new Promise<number>((resolve) => {
        const request = pdk.database.transaction(['dataPoints'], 'readonly')
          .objectStore('dataPoints')
          .index('transmitted')
          .count(0)

        request.onsuccess = () => resolve(request.result)
      })
    }

    // setup() kicks off its own drain via refreshConfiguration(). Waiting on
    // currentlyUploading is not enough: it reads false both before that drain
    // starts and after it ends. Wait for the queue itself to empty, so this
    // spec's point is the only untransmitted one when it drains below.
    await waitFor(async () => (await untransmittedCount()) === 0, 15000, 'startup queue drained')

    pdk.updateConfiguration(configuration)

    pdk.enqueueDataPoint(generatorId, { 'test': 'v3' })

    // Wait for the point to be durable AND still untransmitted. Checking
    // queuedPoints alone is not enough: it empties the moment the point is
    // persisted, which can be before the startup drain's in-flight upload
    // returns and sweeps this point into that batch.
    await waitFor(async () => (await untransmittedCount()) === 1, 5000, 'point persisted and awaiting upload')

    try {
      const responses = await pdk.uploadQueuedDataPoints(() => {})

      return { ok: true, responses, untransmitted: await untransmittedCount() }
    } catch (error) {
      return { ok: false, error: `${error}`, untransmitted: await untransmittedCount() }
    }
  }, [configuration, generatorId])
}

test('v3 configuration PUTs a gzipped bundle with bearer authorization', async ({serviceWorker}) => {
  const result = await uploadPointWith(serviceWorker, V3_CONFIGURATION, 'v3-put-test')

  expect(result.ok).toBe(true)

  const headers = result.responses[0]['request-headers']

  expect(headers['authorization']).toEqual(`Bearer ${VALID_BEARER_TOKEN}`)
  expect(headers['content-type']).toEqual('application/json')
  expect(headers['content-encoding']).toEqual('gzip')
  expect(headers['x-pdk-identifier']).toEqual('rex-pdk')

  const uploaded = result.responses[0].payload.find((point) => point['passive-data-metadata']['generator-id'] === 'v3-put-test')

  expect(uploaded).toBeDefined()
  expect(uploaded['test']).toEqual('v3')
  expect(uploaded['passive-data-metadata'].source).toEqual('rex-pdk')
})

test('configuration without endpoint_version still POSTs the legacy payload', async ({serviceWorker}) => {
  const result = await uploadPointWith(serviceWorker, LEGACY_CONFIGURATION, 'legacy-post-test')

  expect(result.ok).toBe(true)

  // The legacy route echoes the urlencoded request body; the v3 route has no
  // such field. Its presence is what proves the POST transport ran.
  expect(result.responses[0]['request-body'].compression).toEqual('gzip')

  const uploaded = result.responses[0].payload.find((point) => point['passive-data-metadata']['generator-id'] === 'legacy-post-test')

  expect(uploaded).toBeDefined()
})

test('a rejected bearer token leaves the bundle queued', async ({serviceWorker}) => {
  const staleTokenConfiguration = {
    ...V3_CONFIGURATION,
    authorization: { token: 'stale-token' }
  }

  const result = await uploadPointWith(serviceWorker, staleTokenConfiguration, 'v3-stale-token-test')

  expect(result.ok).toBe(false)
  expect(result.untransmitted).toBeGreaterThan(0)
})

test('v3 configuration without an authorization token uploads nothing', async ({serviceWorker}) => {
  const tokenlessConfiguration = {
    identifier: 'rex-pdk',
    endpoint: ENDPOINT,
    endpoint_version: 'v3'
  }

  const result = await uploadPointWith(serviceWorker, tokenlessConfiguration, 'v3-tokenless-test')

  expect(result.ok).toBe(false)
  expect(result.error).toContain('authorization.token')
  expect(result.untransmitted).toBeGreaterThan(0)
})

test('an ignored identifier resolves without uploading', async ({serviceWorker}) => {
  const ignoredConfiguration = {
    ...V3_CONFIGURATION,
    identifier: 'store-review-install',
    ignored_identifiers: ['store-review-install']
  }

  const result = await uploadPointWith(serviceWorker, ignoredConfiguration, 'v3-ignored-test')

  // Resolving marks the points transmitted, so the queue drains without any
  // request reaching the server. A rejected upload would strand them instead.
  expect(result.ok).toBe(true)
  expect(result.untransmitted).toEqual(0)

  // Draining alone is not evidence: an upload that actually reached the server
  // would also clear the queue. The server echoes its request headers on every
  // successful ingest, so an empty reply is what proves nothing was sent.
  const reply = result.responses[0]

  expect(reply === undefined || reply['request-headers'] === undefined).toBe(true)
})

// The drift this extraction fixes: Keystone's copy of the stamping loop moved
// neither half of enqueuedAt, so points shipped without enqueued-at metadata AND
// with a stray enqueuedAt key still on the body. Both transports must do both.
for (const [label, configuration] of [['v3 PUT', V3_CONFIGURATION], ['legacy POST', LEGACY_CONFIGURATION]]) {
  test(`${label} moves enqueuedAt into metadata and strips it from the point body`, async ({serviceWorker}) => {
    const result = await uploadPointWith(serviceWorker, configuration, 'enqueued-at-test')

    expect(result.ok).toBe(true)

    const uploaded = result.responses[0].payload.find((point) => point['passive-data-metadata']['generator-id'] === 'enqueued-at-test')

    expect(uploaded).toBeDefined()
    expect(uploaded['passive-data-metadata']['enqueued-at']).toEqual(expect.any(Number))
    expect(uploaded.enqueuedAt).toBeUndefined()
  })
}
