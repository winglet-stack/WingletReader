import { ipcRenderer } from 'electron'
import { createChannelApi, dbChannelContract } from '../shared/channelContract'

/**
 * The `db:` family, derived from the channel contract. Nothing here restates a
 * channel name, an argument type or an arity — all three come from
 * `src/shared/channelContract.ts`.
 */
export const dbApi = createChannelApi(ipcRenderer, dbChannelContract)
