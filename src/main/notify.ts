/**
 * Pencerelere yayın ve ekranda gösterilen bildirimler.
 */
import { BrowserWindow, WebContents } from 'electron'
import { ERROR_CODES, ErrorCode } from '@shared/errors'
import { newId } from '@shared/id'
import { IPC, Notice } from '@shared/ipc'
import { log } from './logger'

/** Açık olan bütün pencerelere gönderir. Kapanmakta olan pencere yüzünden hata fırlatmaz. */
export function broadcast(channel: string, payload: unknown): void {
  for (const win of BrowserWindow.getAllWindows()) {
    try {
      if (win.isDestroyed() || win.webContents.isDestroyed()) continue
      win.webContents.send(channel, payload)
    } catch {
      // Pencere tam bu sırada kapanmış olabilir.
    }
  }
}

function buildNotice(code: ErrorCode, extra?: string): Notice {
  const info = ERROR_CODES[code]
  return { id: newId(), level: info.level, code, message: extra ? `${info.title}: ${extra}` : info.title }
}

/** Yalnızca bildirim gönderir; loga yazmaz. `extra` kullanıcıya gösterilecek kısa ektir. */
export function notify(code: ErrorCode, extra?: string): void {
  broadcast(IPC.notice, buildNotice(code, extra))
}

/** Kodu loga yazar; seviyesi UYARI ya da HATA ise pencerelere bildirim de gönderir. */
export function report(code: ErrorCode, detail?: string): void {
  log.code(code, detail)
  if (ERROR_CODES[code].level !== 'BILGI') notify(code)
}

// Açılışta oluşan sorunlar (yedekten açma gibi) henüz pencere yokken ortaya çıkar;
// ana menü hazır olana kadar burada bekler.
const startupNotices: Notice[] = []

export function queueStartupNotice(code: ErrorCode, extra?: string): void {
  startupNotices.push(buildNotice(code, extra))
}

/** Ana menü durumu ilk kez istediğinde çağrılır. Arayüzün dinleyicisini kurması için kısa süre beklenir. */
export function deliverStartupNotices(contents: WebContents, delayMs = 500): void {
  if (startupNotices.length === 0) return
  const notices = startupNotices.splice(0)
  setTimeout(() => {
    try {
      if (contents.isDestroyed()) return
      for (const notice of notices) contents.send(IPC.notice, notice)
    } catch {
      // Pencere kapandıysa bildirim loga zaten yazılmıştır.
    }
  }, delayMs)
}
