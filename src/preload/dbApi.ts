import { ipcRenderer } from 'electron'

export const dbApi = {
  getTexts: () => ipcRenderer.invoke('db:getTexts'),
  getText: (id: number) => ipcRenderer.invoke('db:getText', id),
  saveText: (text: object) => ipcRenderer.invoke('db:saveText', text),
  deleteText: (id: number) => ipcRenderer.invoke('db:deleteText', id),
  getCategories: () => ipcRenderer.invoke('db:getCategories'),
  saveCategory: (category: object) => ipcRenderer.invoke('db:saveCategory', category),
  deleteCategory: (id: number) => ipcRenderer.invoke('db:deleteCategory', id),
  assignTextCategory: (textId: number, categoryId: number) =>
    ipcRenderer.invoke('db:assignTextCategory', textId, categoryId),
  getSettings: () => ipcRenderer.invoke('db:getSettings'),
  saveSettings: (settings: object) => ipcRenderer.invoke('db:saveSettings', settings),
  getSettingsStore: () => ipcRenderer.invoke('db:getSettingsStore'),
  saveSettingsStore: (store: object) => ipcRenderer.invoke('db:saveSettingsStore', store),
  getSegments: (textId: number) => ipcRenderer.invoke('db:getSegments', textId),
  getSegment: (id: number) => ipcRenderer.invoke('db:getSegment', id),
  saveSegments: (textId: number, drafts: object[]) =>
    ipcRenderer.invoke('db:saveSegments', textId, drafts),
  updateSegmentTitle: (id: number, title: string) =>
    ipcRenderer.invoke('db:updateSegmentTitle', id, title),
  deleteSegments: (textId: number) => ipcRenderer.invoke('db:deleteSegments', textId),
  deleteSegment: (id: number) => ipcRenderer.invoke('db:deleteSegment', id),
  appendSegment: (textId: number, draft: object) =>
    ipcRenderer.invoke('db:appendSegment', textId, draft),
  createChapterFromPassage: (
    textId: number,
    startWordOffset: number,
    endWordOffset: number,
    title: string
  ) => ipcRenderer.invoke('db:createChapterFromPassage', textId, startWordOffset, endWordOffset, title),
  getBookmarks: (textId: number) => ipcRenderer.invoke('db:getBookmarks', textId),
  saveBookmark: (textId: number, draft: object) =>
    ipcRenderer.invoke('db:saveBookmark', textId, draft),
  updateBookmarkLabel: (id: number, label: string) =>
    ipcRenderer.invoke('db:updateBookmarkLabel', id, label),
  deleteBookmark: (id: number) => ipcRenderer.invoke('db:deleteBookmark', id),
  getSummaries: (textId: number) => ipcRenderer.invoke('db:getSummaries', textId),
  saveSummary: (data: object) => ipcRenderer.invoke('db:saveSummary', data),
  deleteSummary: (id: number) => ipcRenderer.invoke('db:deleteSummary', id),
  getSummaryQuestionsForText: (textId: number) =>
    ipcRenderer.invoke('db:getSummaryQuestionsForText', textId),
  saveSummaryQuestion: (data: object) => ipcRenderer.invoke('db:saveSummaryQuestion', data),
  deleteSummaryQuestion: (id: number) => ipcRenderer.invoke('db:deleteSummaryQuestion', id),
  getReadingPosition: (textId: number) => ipcRenderer.invoke('db:getReadingPosition', textId),
  getLatestResumeCandidate: () => ipcRenderer.invoke('db:getLatestResumeCandidate'),
  getBookResumeTarget: (bookTextId: number) =>
    ipcRenderer.invoke('db:getBookResumeTarget', bookTextId),
  saveReadingPosition: (textId: number, stackIndex: number, source?: 'text' | 'segment') =>
    ipcRenderer.invoke('db:saveReadingPosition', textId, stackIndex, source)
}
