// Ana süreç denemelerinin hepsini sırayla çalıştırır; biri başarısızsa çıkış kodu 1 olur.
// Çalıştırma: node e2e/main/tumu.mjs
import { spawnSync } from 'node:child_process'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const scripts = ['01-pencereler.mjs', '02-medya-kutuphane.mjs', '03-kayit.mjs']
const failed = []

for (const script of scripts) {
  console.log(`\n===== ${script} =====`)
  // Takılan bir deneme pencereleri açık bırakmasın diye süre sınırı vardır.
  const result = spawnSync(process.execPath, [join(here, script)], { stdio: 'inherit', timeout: 300_000 })
  if (result.status !== 0) failed.push(script)
}

console.log(failed.length === 0 ? '\nBütün denemeler geçti.' : `\nBaşarısız: ${failed.join(', ')}`)
process.exitCode = failed.length === 0 ? 0 : 1
