/**
 * Çökme işareti: uygulama açıkken kayıt klasöründe duran küçük bir dosya.
 * Düzgün kapanışta silinir; açılışta hâlâ duruyorsa önceki oturum beklenmedik şekilde bitmiştir.
 */
import fs from 'node:fs'

/** İşaret zaten varsa true döner (önceki oturum düzgün kapanmadı). Ardından işareti yeniden oluşturur. */
export function checkAndCreateCrashMarker(markerFile: string, now: Date = new Date()): boolean {
  const existed = fs.existsSync(markerFile)
  try {
    fs.writeFileSync(markerFile, `pid=${process.pid}\nbaslangic=${now.toISOString()}\n`, 'utf8')
  } catch {
    // İşaret yazılamazsa yalnızca bir sonraki açılıştaki uyarı eksik kalır.
  }
  return existed
}

export function removeCrashMarker(markerFile: string): void {
  try {
    fs.rmSync(markerFile, { force: true })
  } catch {
    // Silinemezse bir sonraki açılışta yanlış bir "düzgün kapanmadı" uyarısı çıkar; veri etkilenmez.
  }
}
