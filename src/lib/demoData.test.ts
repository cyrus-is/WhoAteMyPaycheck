import { describe, it, expect, vi, afterEach } from 'vitest'
import { fetchDemoFile, DEMO_SAMPLE_PATH } from './demoData'

describe('fetchDemoFile', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('fetches the shipped sample path and returns it as a CSV File', async () => {
    const csv = 'Date,Description,Amount\n01/01/2026,NVIDIA CORPORATION PAYROLL,7100.00\n'
    const fetchSpy = vi.fn(() => Promise.resolve(new Response(csv)))
    vi.stubGlobal('fetch', fetchSpy)

    const file = await fetchDemoFile()

    expect(fetchSpy).toHaveBeenCalledWith(DEMO_SAMPLE_PATH)
    // Deliberately not "checking.csv" — that's a common real export name, and handleFiles
    // dedupes dropped files by name, so a same-named demo file could silently swallow a
    // real drop.
    expect(file.name).not.toBe('checking.csv')
    expect(file.type).toBe('text/csv')

    const text = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(reader.result as string)
      reader.onerror = () => reject(reader.error)
      reader.readAsText(file)
    })
    expect(text).toBe(csv)
  })

  it('throws when the response is not ok', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(new Response('', { status: 404 }))))

    await expect(fetchDemoFile()).rejects.toThrow('404')
  })

  it('propagates a network rejection', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('offline'))))

    await expect(fetchDemoFile()).rejects.toThrow('offline')
  })

  it('rejects an HTML response (e.g. an SPA-fallback 200) instead of returning it as a CSV', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(new Response(
      '<!DOCTYPE html><html><body>Not Found</body></html>',
      { headers: { 'content-type': 'text/html' } },
    ))))

    await expect(fetchDemoFile()).rejects.toThrow('unexpected response')
  })

  it('rejects a body that looks like HTML even without a content-type header', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(new Response('<html><body>fallback</body></html>'))))

    await expect(fetchDemoFile()).rejects.toThrow('unexpected response')
  })
})
