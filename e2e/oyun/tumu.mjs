// Oyun ekranı denemelerinin hepsini sırayla çalıştırır. Çalıştırma: node e2e/oyun/tumu.mjs
import { spawnSync } from 'node:child_process'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const scripts = ['01-ekran.mjs', '02-gorseller.mjs', '03-diger-pencere.mjs', '04-etkilesim.mjs', '05-zar.mjs', '06-duzeltmeler.mjs', '07-kalem.mjs', '08-muzik.mjs', '09-karakterler.mjs', '10-istatistik-zari.mjs', '11-kartlar.mjs']

const failed = []
for (const script of scripts) {
  console.log(`\n=== ${script} ===`)
  const result = spawnSync(process.execPath, [join(here, script)], { stdio: 'inherit' })
  if (result.status !== 0) failed.push(script)
}

console.log(failed.length === 0 ? '\nBütün betikler geçti.' : `\nBaşarısız betikler: ${failed.join(', ')}`)
process.exitCode = failed.length === 0 ? 0 : 1
