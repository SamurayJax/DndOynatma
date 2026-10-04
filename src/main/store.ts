/**
 * Tek doğru durum. Arayüzden gelen her işlem buradan geçer: `reduce` ile uygulanır,
 * bütün pencerelere yayılır ve kalıcı kısmı değiştiyse kayıt zamanlanır.
 * Electron'a doğrudan bağlı değildir; yayın ve dosya işleri dışarıdan verilir.
 */
import { Action, ReduceResult } from '@shared/actions'
import { ErrorCode } from '@shared/errors'
import { IPC } from '@shared/ipc'
import { reduce } from '@shared/reducer'
import { AppState, FullState, LibraryImage, SessionState } from '@shared/types'
import { describeAction } from './actionLog'
import { describeError, log } from './logger'
import { DebouncedSaver, createDebouncedSaver } from './storage'

export interface StoreDeps {
  initial: FullState
  /** false ise kayıt dosyasına yazılmaz ve görsel dosyalarına dokunulmaz (DND-104, DND-106). */
  saveEnabled: boolean
  /** Kalıcı durumu diske yazar; başarısız olursa fırlatır. */
  writeSave: (app: AppState) => void
  broadcast: (channel: string, payload: unknown) => void
  /** Kodu loga yazar; seviyesi UYARI ya da HATA ise pencerelere bildirim de gönderir. */
  report: (code: ErrorCode, detail?: string) => void
  /** Kütüphaneden çıkan görselin dosyasını geri dönüşüm kutusuna taşır. */
  trashImage: (image: LibraryImage) => void
  saveDelayMs?: number
}

export type StateListener = (previous: FullState, next: FullState) => void

export interface DispatchOptions {
  /** Ana sürecin kendi gönderdiği işlem. `library/add` yalnızca böyle kabul edilir. */
  trusted?: boolean
}

export class Store {
  private state: FullState
  private readonly saver: DebouncedSaver
  private readonly listeners = new Set<StateListener>()
  private saveFailing = false

  constructor(private readonly deps: StoreDeps) {
    this.state = deps.initial
    this.saver = createDebouncedSaver({
      delayMs: deps.saveDelayMs,
      write: () => deps.writeSave(this.state.app),
      onError: (error) => {
        // Her başarısız denemede bildirim göstermek ekranı doldurur; arıza başına bir kez yeter.
        if (this.saveFailing) log.error('DND-103', error)
        else deps.report('DND-103', describeError(error))
        this.saveFailing = true
      },
      onSuccess: () => {
        if (this.saveFailing) log.info('Kayıt yeniden yazılabildi')
        this.saveFailing = false
      }
    })
  }

  getState(): FullState {
    return this.state
  }

  /** Durum her değiştiğinde çağrılır. Dönen fonksiyon aboneliği kaldırır. */
  subscribe(listener: StateListener): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  /** İşlemi uygular. Durum değiştiyse true döner. */
  dispatch(action: unknown, options: DispatchOptions = {}): boolean {
    if (typeof action !== 'object' || action === null || typeof (action as { type?: unknown }).type !== 'string') {
      this.deps.report('DND-306', 'işlem bir nesne değil ya da "type" alanı yok')
      return false
    }
    const typed = action as Action
    // Dosya adı taşıyan tek işlem; arayüzden gelirse klasör dışındaki bir dosyayı gösterebilir.
    if (typed.type === 'library/add' && !options.trusted) {
      this.deps.report('DND-306', 'library/add yalnızca ana süreçten gönderilebilir')
      return false
    }

    const previous = this.state
    let result: ReduceResult
    try {
      result = reduce(previous, typed)
    } catch (error) {
      // Eksik alanlı bir işlem reducer'ı düşürebilir; ana süreç bu yüzden kapanmamalı.
      this.deps.report('DND-306', `işlem uygulanamadı: ${describeAction(typed)}\n${describeError(error)}`)
      return false
    }

    if (result.issue) {
      // DND-303'ün ayrıntısında pencere adları geçer; loga isim girmesin diye yerine işlemin özeti yazılır.
      const detail = result.issue.code === 'DND-303' ? describeAction(typed) : result.issue.detail
      this.deps.report(result.issue.code, detail)
    }
    if (result.state === previous) return false

    log.info(`İşlem: ${describeAction(typed)}`)
    this.commit(previous, result.state)
    return true
  }

  /** Ana sürecin kendi yaptığı oturum değişiklikleri (oyun başlat/bitir, zar). */
  updateSession(update: (session: SessionState) => SessionState): void {
    const previous = this.state
    const session = update(previous.session)
    if (session === previous.session) return
    this.commit(previous, { app: previous.app, session })
  }

  /** Bekleyen kaydı hemen, eşzamanlı yazar (kapanışta). Yazılacak bir şey kalmadıysa true. */
  flushSave(): boolean {
    return this.saver.flush()
  }

  private commit(previous: FullState, next: FullState): void {
    this.state = next
    this.deps.broadcast(IPC.state, next)
    if (next.app !== previous.app && this.deps.saveEnabled) {
      this.saver.schedule()
      this.trashRemovedImages(previous.app.library, next.app.library)
    }
    for (const listener of [...this.listeners]) {
      try {
        listener(previous, next)
      } catch (error) {
        log.error('DND-901', error, 'durum dinleyicisi')
      }
    }
  }

  private trashRemovedImages(before: readonly LibraryImage[], after: readonly LibraryImage[]): void {
    if (before === after) return
    const remainingIds = new Set(after.map((image) => image.id))
    const remainingFiles = new Set(after.map((image) => image.fileName))
    for (const image of before) {
      if (remainingIds.has(image.id) || remainingFiles.has(image.fileName)) continue
      this.deps.trashImage(image)
    }
  }
}
