import { ipcRenderer } from 'electron'
import {
  appChannelContract,
  createChannelApi,
  dataChannelContract,
  fileChannelContract,
  videoChannelContract
} from '../shared/channelContract'

export const appApi = createChannelApi(ipcRenderer, appChannelContract)

export const fileApi = createChannelApi(ipcRenderer, fileChannelContract)

export const dataApi = createChannelApi(ipcRenderer, dataChannelContract)

export const videoApi = createChannelApi(ipcRenderer, videoChannelContract)
