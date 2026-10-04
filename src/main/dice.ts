/**
 * d20. Sonuç ana süreçte üretilir; geçmiş hem oturum durumunda hem `zar.json`'da tutulur.
 */
import { randomInt } from 'node:crypto'
import { newId } from '@shared/id'
import { IPC } from '@shared/ipc'
import { DiceRoll } from '@shared/types'
import { log } from './logger'
import { broadcast, notify } from './notify'
import { DICE_HISTORY_LIMIT, clearDiceHistory, writeDiceHistory } from './storage'
import { Store } from './store'

// Zar kaydı yazılamıyorsa her atışta bildirim göstermek oyunu böler; bir kez yeter.
let diceFileNoticeShown = false

function diceFileFailed(error: unknown, what: string): void {
  log.error('DND-105', error, what)
  if (!diceFileNoticeShown) notify('DND-105')
  diceFileNoticeShown = true
}

export function rollDice(store: Store, diceFile: string): DiceRoll | null {
  if (store.getState().session.phase !== 'playing') {
    log.code('DND-401')
    return null
  }
  const roll: DiceRoll = { id: newId(), sides: 20, value: randomInt(1, 21), at: new Date().toISOString() }
  const history = [roll, ...store.getState().session.diceHistory].slice(0, DICE_HISTORY_LIMIT)
  try {
    writeDiceHistory(diceFile, history)
  } catch (error) {
    diceFileFailed(error, 'zar.json yazılamadı')
  }
  store.updateSession((session) => ({ ...session, diceHistory: history }))
  broadcast(IPC.diceRoll, roll)
  log.info(`Zar atıldı: d20 = ${roll.value}`)
  return roll
}

/** Oyun normal bittiğinde ve düzgün kapanışta çağrılır. */
export function clearDiceFile(diceFile: string): void {
  try {
    clearDiceHistory(diceFile)
  } catch (error) {
    diceFileFailed(error, 'zar.json temizlenemedi')
  }
}
