import { REXConfiguration } from '@bric/rex-core/common'
import corePlugin from '@bric/rex-core/service-worker'
import pdkPlugin, { PassiveDataKitPointAnnotator, REXPDKDataPoint } from '@bric/rex-passive-data-kit/service-worker'

console.log(`Imported ${corePlugin} into service worker context...`)
console.log(`Imported ${pdkPlugin} into service worker context...`)

self['rexCorePlugin'] = corePlugin
self['rexPDKPlugin'] = pdkPlugin

class TestDataPointAnnotator extends PassiveDataKitPointAnnotator {
  annotate(dataPoint: REXPDKDataPoint): Promise<void> {
    return new Promise<void>((resolve) => {
      corePlugin.fetchConfiguration()
        .then((configuration: REXConfiguration) => {
          const testFields = {
            'test-field': configuration['testing']['test-field']
          }

          dataPoint['testing'] = testFields

          resolve()
        })
    })
  }

  toString():string {
    return 'TestDataPointAnnotator'
  }
}

pdkPlugin.registerDataPointAnnotator(new TestDataPointAnnotator())

class FooDataPointAnnotator extends PassiveDataKitPointAnnotator {
  annotate(dataPoint: REXPDKDataPoint): Promise<void> {
    return new Promise<void>((resolve) => {
      dataPoint['annotate-foo'] = 'bar'

      resolve()
    })
  }

  toString():string {
    return 'FooDataPointAnnotator'
  }
}

pdkPlugin.registerDataPointAnnotator(new FooDataPointAnnotator())

corePlugin.setup()
