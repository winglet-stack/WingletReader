import { ipcRenderer } from 'electron'
import { createChannelApi, readWhileWorkingChannelContract } from '../shared/channelContract'

const enableFailedFallback = 'Read while working could not be enabled.'

/**
 * The RWW family. Its two event channels are subscriptions, not invocations, so
 * the contract types them separately and preload supplies the only part that is
 * genuinely transport: turning raw `ipcRenderer` event arguments into the
 * callback arguments the contract promises.
 */
export const readWhileWorkingApi = createChannelApi(
  ipcRenderer,
  readWhileWorkingChannelContract,
  {
    onExited: () => [],
    onEnableFailed: (_event, payload) => [
      (payload as { error?: string } | undefined)?.error ?? enableFailedFallback
    ]
  }
)
