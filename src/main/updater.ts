/**
 * Otomatik güncelleme akışı: açılışta son sürüme bakılır, yeni sürüm varsa kullanıcıya sorulur; onay
 * gelmeden hiçbir şey indirilmez. İnternet yoksa ya da denetim başarısızsa uygulama olağan açılır.
 */
import { IPC, UpdateStatus } from '@shared/ipc'
import { log } from './logger'

/** `electron-updater` üzerindeki ince katman; testlerde sahtesi verilir (bkz. updateEngine.ts). */
export interface UpdateEngine {
  /** Yeni sürümün numarası; güncel ise null. */
  check(): Promise<string | null>
  /** Dosyayı indirir ve doğrular. Doğrulanmayan ya da yarım kalan indirme reddedilir. */
  download(onProgress: (percent: number) => void): Promise<void>
  cancelDownload(): void
  /** Uygulamayı kapatır, kurar ve yeniden açar. */
  install(): void
}

export interface UpdaterDeps {
  loadEngine: () => Promise<UpdateEngine>
  publish: (channel: string, status: UpdateStatus) => void
  /** Oyun sürerken kurulum başlatılmaz. */
  isPlaying: () => boolean
}

/** "Kuruluyor" yazısı görünsün diye kurulum bu kadar sonra başlar. */
const INSTALL_DELAY_MS = 400

function reason(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

export class Updater {
  private status: UpdateStatus = { phase: 'idle' }
  private engine: UpdateEngine | null = null
  private canceled = false

  constructor(private readonly deps: UpdaterDeps) {}

  getStatus(): UpdateStatus {
    return this.status
  }

  /** Hiçbir durumda reddedilmez: yakalanmamış ret uygulamayı kapatır, denetim buna değmez. */
  async check(): Promise<void> {
    try {
      this.engine = await this.deps.loadEngine()
      const version = await this.engine.check()
      if (version === null) {
        log.info('Güncelleme denetlendi: uygulama güncel')
        return
      }
      log.info(`Yeni sürüm bulundu: ${version}`)
      this.set({ phase: 'available', version })
    } catch (error) {
      // Çevrimdışı açılış olağandır; kullanıcıya gösterilmez, yalnızca loga yazılır.
      log.code('DND-601', reason(error))
    }
  }

  /** Kullanıcı "Güncelle" dedi (ya da başarısız indirmeyi yeniden denedi). */
  accept(): void {
    const { status, engine } = this
    if ((status.phase !== 'available' && status.phase !== 'failed') || engine === null) return
    // Kutu açıkken oyun başlatılamaz; yine de kurulum oyunu hiçbir zaman kesmesin.
    if (this.deps.isPlaying()) return
    const { version } = status
    log.info(`Güncelleme onaylandı: ${version}`)
    this.canceled = false
    this.set({ phase: 'downloading', version, percent: 0 })
    void this.download(engine, version)
  }

  /** "Şimdi değil" ya da indirirken "Vazgeç". Bir sonraki açılışta yeniden sorulur. */
  decline(): void {
    if (this.status.phase === 'downloading') {
      this.canceled = true
      this.engine?.cancelDownload()
      log.info('Güncelleme indirmesinden vazgeçildi')
    } else if (this.status.phase === 'available' || this.status.phase === 'failed') {
      log.info(`Güncelleme ertelendi: ${this.status.version}`)
    } else {
      return
    }
    this.set({ phase: 'idle' })
  }

  private async download(engine: UpdateEngine, version: string): Promise<void> {
    try {
      await engine.download((percent) => {
        const rounded = Math.floor(percent)
        const current = this.status
        // Her parçada değil, yüzde değiştikçe yayınlanır.
        if (current.phase === 'downloading' && current.percent !== rounded) this.set({ phase: 'downloading', version, percent: rounded })
      })
    } catch (error) {
      if (this.canceled) return
      log.code('DND-602', reason(error))
      this.set({ phase: 'failed', version })
      return
    }
    if (this.canceled) return
    log.info(`Güncelleme indirildi ve doğrulandı: ${version}; kuruluyor`)
    this.set({ phase: 'installing', version })
    setTimeout(() => {
      try {
        engine.install()
      } catch (error) {
        log.code('DND-602', reason(error))
        this.set({ phase: 'failed', version })
      }
    }, INSTALL_DELAY_MS)
  }

  private set(status: UpdateStatus): void {
    this.status = status
    this.deps.publish(IPC.updateStatus, status)
  }
}
