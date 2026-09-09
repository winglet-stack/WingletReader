/// <reference types="vite/client" />

import type { WingletApi } from '../../shared/channelContract'

// What is left here, and why it is left here (issue 03):
//
// 1. The `vite/client` reference — renderer ambient types (`import.meta.env`,
//    asset module declarations). Nothing to do with IPC.
// 2. The `Window.api` augmentation itself. `declare global` is required for this
//    `interface Window` augmentation to reach the real DOM `Window` type:
//    env.d.ts is a module (it has a top-level import), so a bare
//    `interface Window` would augment nothing and `window.api` would be untyped
//    everywhere.
//
// No channel name, argument type, result type or arity is stated here any more.
// `WingletApi` is derived from `src/shared/channelContract.ts`, which is the one
// place a channel is declared — the same module main registers from and preload
// binds from. This file only says *where* that surface is attached.
declare global {
  interface Window {
    api: WingletApi
  }
}
