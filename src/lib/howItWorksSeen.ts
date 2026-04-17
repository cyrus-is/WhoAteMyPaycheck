const SEEN_KEY = 'whoatemypaycheck:how-it-works-seen'

export function getHowItWorksSeen(): boolean {
  try { return localStorage.getItem(SEEN_KEY) === '1' } catch { return false }
}

export function markHowItWorksSeen(): void {
  try { localStorage.setItem(SEEN_KEY, '1') } catch { /* ignore */ }
}
