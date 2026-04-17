import Papa from 'papaparse'

interface CsvReadResult {
  headers: string[]
  rows: Record<string, string>[]
}

const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024 // 10 MB

export function readCsvFile(file: File): Promise<CsvReadResult> {
  if (file.size > MAX_FILE_SIZE_BYTES) {
    return Promise.reject(
      new Error(
        `${file.name} is ${(file.size / 1024 / 1024).toFixed(1)} MB — files over 10 MB are not supported. ` +
          'Export a smaller date range from your bank.',
      ),
    )
  }

  return new Promise((resolve, reject) => {
    Papa.parse<Record<string, string>>(file, {
      header: true,
      skipEmptyLines: true,
      complete(results) {
        const headers = results.meta.fields ?? []
        resolve({ headers, rows: results.data })
      },
      error(err) {
        reject(new Error(`Failed to parse ${file.name}: ${err.message}`))
      },
    })
  })
}
