/**
 * `electron-updater` bağlantısı. Kütüphane yalnızca gerektiğinde yüklenir: geliştirme ve test
 * çalıştırmalarında hiç açılmaz, bir sorun çıksa da uygulamanın açılışını etkilemez.
 */
import { log } from './logger'
import { UpdateEngine } from './updater'

export async function loadUpdateEngine(): Promise<UpdateEngine> {
  const { autoUpdater, CancellationToken } = await import('electron-updater')

  // Onay gelmeden indirilmez; kullanıcının vazgeçtiği sürüm kapanışta da kurulmaz.
  autoUpdater.autoDownload = false
  autoUpdater.autoInstallOnAppQuit = false
  autoUpdater.logger = null
  // Dinleyicisi olmayan `error` olayı uygulamayı düşürür. Hatalar söz reddi olarak da gelir ve orada yazılır.
  autoUpdater.on('error', () => {})

  // Deneme: uygulama GitHub yerine yerel sunucuya bakar (e2e/paket/guncelleme.mjs).
  const testUrl = process.env['DND_UPDATE_URL']?.trim()
  if (testUrl) autoUpdater.setFeedURL({ provider: 'generic', url: testUrl })

  let token: InstanceType<typeof CancellationToken> | null = null

  return {
    async check() {
      const result = await autoUpdater.checkForUpdates()
      return result !== null && result.isUpdateAvailable ? result.updateInfo.version : null
    },
    async download(onProgress) {
      const listener = (progress: { percent: number }): void => onProgress(progress.percent)
      autoUpdater.on('download-progress', listener)
      token = new CancellationToken()
      try {
        await autoUpdater.downloadUpdate(token)
      } finally {
        token = null
        autoUpdater.off('download-progress', listener)
      }
    },
    cancelDownload() {
      token?.cancel()
    },
    install() {
      if (process.env['DND_UPDATE_NO_INSTALL']) {
        log.info('Deneme: kurulum atlandı')
        return
      }
      // Sessiz kurulum, bitince uygulamayı yeniden açar. Kapanışta kayıt olağan yoldan yazılır (will-quit).
      autoUpdater.quitAndInstall(true, true)
    }
  }
}
