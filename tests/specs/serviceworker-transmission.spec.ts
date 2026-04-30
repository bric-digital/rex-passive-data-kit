import { test, expect } from './fixtures';

test('Service worker transmission tests', async ({serviceWorker}) => {
  return new Promise<void>((resolve) => {
    setTimeout(() => {
      serviceWorker.evaluate(async () => {
        return new Promise((testResolve) => {
          const doTest = () => {
            self.rexCorePlugin.handleMessage({
              'messageType': 'logEvent',
              'event': {
                'name': 'rex-pdk-test'
              }
            }, this, (loggedCount) => {
              setTimeout(() => {
                self.rexPDKPlugin.uploadQueuedDataPoints((remaining: number) => {},).then((uploadResponse) => {
                  testResolve(uploadResponse)
                }, (error) => {
                  testResolve(`uploadQueuedDataPoints error: ${error}`)
                }).catch((error) => {
                  testResolve(`uploadQueuedDataPoints catch: ${error}`)
                })
              }, 1000)
            })
          }

          self.setTimeout(doTest, 1000)

          // const deletePdkDb = indexedDB.deleteDatabase("passive_data_kit")

          // deletePdkDb.onerror = (event) => {
          //   testResolve('db error')
          // }

          // deletePdkDb.onsuccess = (event) => {
          //   testResolve('db success')
          // }
        })
      })
      .then((workerResponse) => {
        if ((typeof workerResponse) == 'string') {
          expect(workerResponse).toEqual(0)
        } else {
          expect(typeof workerResponse).not.toBe('string');
          expect(workerResponse[0].payload.length).toEqual(2)

          expect(workerResponse[0].payload[0]['annotate-foo']).toEqual('bar')
          expect(workerResponse[0].payload[1]['testing']).toEqual({'test-field': 'hello world'})
        }

        resolve()
      })
    }, 1000)
  })
})
