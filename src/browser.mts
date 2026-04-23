import { REXConfiguration } from '@bric/rex-core/common'

import { REXClientModule, registerREXModule } from '@bric/rex-core/browser'

class PassiveDataKitModule extends REXClientModule {
  configuration:object|null = null
  refreshTimeout:number = 0

  constructor() {
    super()
  }

  setup() {
    console.log(`Setting up PassiveDataKitModule...`)

    chrome.runtime.sendMessage({
        'messageType': 'fetchConfiguration',
      }).then((response:{ [name: string]: any; }) => { // eslint-disable-line @typescript-eslint/no-explicit-any
        const configuration = response as REXConfiguration

        this.configuration = configuration['page_manipulation']
      })
  }

  applyConfiguration() {
    console.log('PassiveDataKitModule.applyConfiguration')

    if (this.configuration == null) {
      return
    }

    // for (const elementRule of this.configuration['passive_data_kit']) {

    // }
  }
}

const plugin = new PassiveDataKitModule()

registerREXModule(plugin)

export default plugin
