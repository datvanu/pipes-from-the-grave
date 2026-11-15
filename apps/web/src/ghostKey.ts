/** Browser-only storage for an optional user LLM key (BYOK). Never sent except as a request header. */

const KEY = 'pipes-ghost-llm-key'
const PERSIST = 'pipes-ghost-llm-persist'
const PROVIDER = 'pipes-ghost-llm-provider'
const MODEL = 'pipes-ghost-llm-model'

function read(store: Storage, name: string): string {
  try {
    return store.getItem(name) || ''
  } catch {
    return ''
  }
}

function write(store: Storage, name: string, value: string): void {
  try {
    if (value) store.setItem(name, value)
    else store.removeItem(name)
  } catch {
    /* private mode */
  }
}

function remove(store: Storage, name: string): void {
  try {
    store.removeItem(name)
  } catch {
    /* private mode */
  }
}

export type GhostByokState = {
  key: string
  persist: boolean
  provider: string
  model: string
}

export function loadGhostByok(): GhostByokState {
  const persist = read(localStorage, PERSIST) === '1'
  const key = persist ? read(localStorage, KEY) : read(sessionStorage, KEY)
  const provider =
    read(persist ? localStorage : sessionStorage, PROVIDER) ||
    read(sessionStorage, PROVIDER) ||
    'openai'
  const model = persist ? read(localStorage, MODEL) : read(sessionStorage, MODEL)
  return { key, persist, provider, model }
}

export function saveGhostByok(state: GhostByokState): void {
  write(sessionStorage, PROVIDER, state.provider)
  write(sessionStorage, MODEL, state.model)
  write(sessionStorage, KEY, state.key)
  if (state.persist) {
    write(localStorage, PERSIST, '1')
    write(localStorage, PROVIDER, state.provider)
    write(localStorage, MODEL, state.model)
    write(localStorage, KEY, state.key)
  } else {
    remove(localStorage, PERSIST)
    remove(localStorage, KEY)
    remove(localStorage, PROVIDER)
    remove(localStorage, MODEL)
  }
}

export function clearGhostByok(): void {
  for (const name of [KEY, PERSIST, PROVIDER, MODEL]) {
    remove(sessionStorage, name)
    remove(localStorage, name)
  }
}
