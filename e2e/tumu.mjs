// Bütün uçtan uca test takımlarını derlenmiş uygulamaya (out/) karşı sırayla çalıştırır.
// Çalıştırma: npm run e2e   (önce derler)
// Testler gerçek pencereler açar ve odağı alır; çalışırken klavyeye dokunmayın.
import { spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { resolve } from 'node:path'

const root = process.cwd()
const mainEntry = resolve(root, 'out/main/index.js')
if (!existsSync(mainEntry)) {
  console.error('out/main/index.js yok. Önce: npx electron-vite build')
  process.exit(1)
}

const env = {
  ...process.env,
  DND_E2E_MAIN: mainEntry,
  DND_E2E_OYUN: mainEntry,
  DND_E2E_KONTROL: mainEntry
}

const suites = [
  ['temel akış', 'e2e/smoke.mjs'],
  ['ana süreç', 'e2e/main/tumu.mjs'],
  ['kontrol paneli', 'e2e/kontrol/tumu.mjs'],
  ['oyun ekranı', 'e2e/oyun/tumu.mjs']
]

const results = []
for (const [name, script] of suites) {
  console.log(`\n===== ${name} (${script}) =====`)
  const started = Date.now()
  const run = spawnSync(process.execPath, [script], { cwd: root, env, stdio: 'inherit' })
  results.push({ name, ok: run.status === 0, seconds: Math.round((Date.now() - started) / 1000) })
}

console.log('\n===== ÖZET =====')
for (const r of results) console.log(`${r.ok ? 'GEÇTİ ' : 'KALDI '} ${r.name} (${r.seconds} sn)`)
process.exit(results.every((r) => r.ok) ? 0 : 1)
