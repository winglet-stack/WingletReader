import { contextBridge } from 'electron'
import { dbApi } from './dbApi'
import { appApi, dataApi, fileApi, videoApi } from './miscApi'
import { readWhileWorkingApi } from './readWhileWorkingApi'

contextBridge.exposeInMainWorld('api', {
  app: appApi,
  db: dbApi,
  file: fileApi,
  data: dataApi,
  video: videoApi,
  readWhileWorking: readWhileWorkingApi
})
