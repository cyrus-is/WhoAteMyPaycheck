const SESSION_KEY = 'claude_api_key'
const LOCAL_KEY = 'claude_api_key_saved'
const REMEMBER_KEY = 'claude_api_key_remember'

export function getStoredApiKey(): string {
  // Check localStorage first (persisted keys), then sessionStorage
  return localStorage.getItem(LOCAL_KEY) ?? sessionStorage.getItem(SESSION_KEY) ?? ''
}

export function storeApiKey(key: string, remember: boolean): void {
  if (key) {
    if (remember) {
      localStorage.setItem(LOCAL_KEY, key)
      localStorage.setItem(REMEMBER_KEY, '1')
      sessionStorage.removeItem(SESSION_KEY)
    } else {
      sessionStorage.setItem(SESSION_KEY, key)
      localStorage.removeItem(LOCAL_KEY)
      localStorage.removeItem(REMEMBER_KEY)
    }
  } else {
    sessionStorage.removeItem(SESSION_KEY)
    localStorage.removeItem(LOCAL_KEY)
    localStorage.removeItem(REMEMBER_KEY)
  }
}

export function isKeyRemembered(): boolean {
  return localStorage.getItem(REMEMBER_KEY) === '1'
}
