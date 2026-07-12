import { describe, it, expect, beforeEach, afterAll, vi } from 'vitest'
import { getStoredApiKey, storeApiKey, isKeyRemembered } from './apiKey'

// Node's experimental webstorage shadows jsdom's localStorage with a
// non-functional stub (no --localstorage-file), so install a working
// in-memory Storage for these tests.
function createMemoryStorage(): Storage {
  let store: Record<string, string> = {}
  return {
    get length() {
      return Object.keys(store).length
    },
    clear: () => {
      store = {}
    },
    getItem: (key: string) => store[key] ?? null,
    key: (index: number) => Object.keys(store)[index] ?? null,
    removeItem: (key: string) => {
      delete store[key]
    },
    setItem: (key: string, value: string) => {
      store[key] = value
    },
  }
}

describe('apiKey', () => {
  beforeEach(() => {
    vi.stubGlobal('localStorage', createMemoryStorage())
    vi.stubGlobal('sessionStorage', createMemoryStorage())
  })

  afterAll(() => {
    vi.unstubAllGlobals()
  })

  it('stores the key in sessionStorage only when remember is off', () => {
    storeApiKey('sk-ant-session', false)
    expect(sessionStorage.getItem('claude_api_key')).toBe('sk-ant-session')
    expect(localStorage.getItem('claude_api_key_saved')).toBeNull()
    expect(isKeyRemembered()).toBe(false)
    expect(getStoredApiKey()).toBe('sk-ant-session')
  })

  it('stores the key in localStorage when remember is on', () => {
    storeApiKey('sk-ant-local', true)
    expect(localStorage.getItem('claude_api_key_saved')).toBe('sk-ant-local')
    expect(sessionStorage.getItem('claude_api_key')).toBeNull()
    expect(isKeyRemembered()).toBe(true)
    expect(getStoredApiKey()).toBe('sk-ant-local')
  })

  it('moves a remembered key out of localStorage when re-saved without remember', () => {
    storeApiKey('sk-ant-local', true)
    storeApiKey('sk-ant-local', false)
    expect(localStorage.getItem('claude_api_key_saved')).toBeNull()
    expect(localStorage.getItem('claude_api_key_remember')).toBeNull()
    expect(sessionStorage.getItem('claude_api_key')).toBe('sk-ant-local')
    expect(isKeyRemembered()).toBe(false)
  })

  it('clears the key from both storages when given an empty key', () => {
    storeApiKey('sk-ant-local', true)
    storeApiKey('', false)
    expect(localStorage.getItem('claude_api_key_saved')).toBeNull()
    expect(localStorage.getItem('claude_api_key_remember')).toBeNull()
    expect(sessionStorage.getItem('claude_api_key')).toBeNull()
    expect(getStoredApiKey()).toBe('')
    expect(isKeyRemembered()).toBe(false)
  })
})
