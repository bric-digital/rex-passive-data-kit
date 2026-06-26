import { test, expect } from './fixtures';

test('Service worker single point transmission test', async ({serviceWorker}) => {
  return new Promise<void>((resolve) => {
    setTimeout(() => {
      serviceWorker.evaluate(async () => {
        return new Promise((testResolve) => {
          const doTest = () => {
            self.rexCorePlugin.handleMessage({
              'messageType': 'transmitSynchronousEvent',
              'event': {
                'name': 'rex-pdk-single-point-test',
                'source': 'rex-test-script'
              }
            }, this, (uploadResponse) => {
              console.log('uploadResponse')
              console.log(uploadResponse)
              testResolve(uploadResponse)
            })
          }

          self.setTimeout(doTest, 1000)
        })
      })
      .then((workerResponse) => {
        expect(typeof workerResponse).toEqual('object')
        expect(workerResponse['logged']).toEqual(true)
        expect(workerResponse['message']).toEqual('Data point added successfully.')
        expect(workerResponse['url']).toEqual('http://localhost:9090/data/add-point.json')

        resolve()
      })
    }, 1000)
  })
})
