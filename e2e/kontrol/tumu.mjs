// Kontrol paneli denemelerinin hepsini sırayla çalıştırır; biri başarısızsa çıkış kodu 1 olur.
// Çalıştırma: npx electron-vite build --outDir .tmp/kontrol-denetim/out && node e2e/kontrol/tumu.mjs
import { spawnSync } from 'node:child_process'
import { readdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const scripts = readdirSync(here)
  .filter((name) => /^\d\d-.*\.mjs$/.test(name))
  .sort()
const failed = []

for (const script of scripts) {
  console.log(`\n===== ${script} =====`)
  // Takılan bir deneme pencereleri açık bırakmasın diye süre sınırı vardır.
  const result = spawnSync(process.execPath, [join(here, script)], { stdio: 'inherit', timeout: 300_000 })
  if (result.status !== 0) failed.push(script)
}

console.log(failed.length === 0 ? '\nBütün denemeler geçti.' : `\nBaşarısız: ${failed.join(', ')}`)
process.exitCode = failed.length === 0 ? 0 : 1
