/**
 * Zarlar (d6, d10, d20). Sonuç ana süreçte üretilir; geçmiş hem oturum durumunda hem `zar.json`'da tutulur.
 */
import { randomInt } from 'node:crypto'
import { computeAbilityCheck, computeSkillCheck, findClass } from '@shared/character'
import { isPlayerFilled } from '@shared/layout'
import { newId } from '@shared/id'
import { IPC } from '@shared/ipc'
import { Ability, CheckMode, DiceRoll, DiceSides, MAX_PLAYERS } from '@shared/types'
import { log } from './logger'
import { broadcast, notify, report } from './notify'
import { DICE_HISTORY_LIMIT, clearDiceHistory, writeDiceHistory } from './storage'
import { Store } from './store'

// Zar kaydı yazılamıyorsa her atışta bildirim göstermek oyunu böler; bir kez yeter.
let diceFileNoticeShown = false

function diceFileFailed(error: unknown, what: string): void {
  log.error('DND-105', error, what)
  if (!diceFileNoticeShown) notify('DND-105')
  diceFileNoticeShown = true
}

export function rollDice(store: Store, diceFile: string, sides: DiceSides): DiceRoll | null {
  if (store.getState().session.phase !== 'playing') {
    log.code('DND-401')
    return null
  }
  const roll: DiceRoll = { id: newId(), sides, value: randomInt(1, sides + 1), at: new Date().toISOString() }
  record(store, diceFile, roll)
  log.info(`Zar atıldı: d${sides} = ${roll.value}`)
  return roll
}

export type SkillRollFailure = 'not-playing' | 'invalid'

/**
 * Beceri atışı: d20 (avantaj / dezavantajda iki) atılır, oyuncunun istatistiği ve geçici artı / eksileri
 * eklenir, yeterlilik düşülmüş gereksinimle karşılaştırılır. Sayılı etkiler bir azalır.
 */
export function rollSkill(store: Store, diceFile: string, slot: number, skillId: string, mode: CheckMode): DiceRoll | SkillRollFailure {
  const { app, session } = store.getState()
  if (session.phase !== 'playing') {
    log.code('DND-401')
    return 'not-playing'
  }
  const player = Number.isInteger(slot) && slot >= 0 && slot < MAX_PLAYERS ? app.players[slot] : undefined
  const skill = player ? findClass(app, player.classId)?.skills.find((entry) => entry.id === skillId) : undefined
  if (!player || !isPlayerFilled(player) || !skill) {
    report('DND-402', `yuva ${slot}, beceri ${skillId}`)
    return 'invalid'
  }

  const dice = mode === 'normal' ? [randomInt(1, 21)] : [randomInt(1, 21), randomInt(1, 21)]
  const check = computeSkillCheck({ slot, player, skill, mode, dice })
  const roll: DiceRoll = { id: newId(), sides: 20, value: dice[check.keptIndex], at: new Date().toISOString(), check }
  // Önce etkiler düşer: oyun ekranı atışı alırken kontrol paneli yeni sayıları göstersin.
  store.dispatch({ type: 'player/consumeEffects', slot }, { trusted: true })
  record(store, diceFile, roll)
  log.info(
    `Beceri atışı: yuva ${slot}, ${mode}, zar ${dice.join('/')} → ${check.total} / ${check.requirement ?? '-'} ${check.success ? 'başarılı' : 'başarısız'}`
  )
  return roll
}

/**
 * Zar panelinden, seçilen oyuncunun istatistiğiyle atış: seçilen zar (avantaj / dezavantajda iki) +
 * istatistik artısı + geçici artı / eksiler. Hedef ve yeterlilik yoktur. Sayılı etkiler bir azalır.
 */
export function rollAbility(
  store: Store,
  diceFile: string,
  slot: number,
  ability: Ability,
  sides: DiceSides,
  mode: CheckMode
): DiceRoll | SkillRollFailure {
  const { app, session } = store.getState()
  if (session.phase !== 'playing') {
    log.code('DND-401')
    return 'not-playing'
  }
  const player = Number.isInteger(slot) && slot >= 0 && slot < MAX_PLAYERS ? app.players[slot] : undefined
  if (!player || !isPlayerFilled(player)) {
    report('DND-402', `istatistik atışı: yuva ${slot} boş`)
    return 'invalid'
  }

  const throwOne = (): number => randomInt(1, sides + 1)
  const dice = mode === 'normal' ? [throwOne()] : [throwOne(), throwOne()]
  const check = computeAbilityCheck({ slot, player, ability, mode, dice })
  const roll: DiceRoll = { id: newId(), sides, value: dice[check.keptIndex], at: new Date().toISOString(), check }
  store.dispatch({ type: 'player/consumeEffects', slot }, { trusted: true })
  record(store, diceFile, roll)
  log.info(`İstatistik atışı: yuva ${slot}, ${ability}, d${sides}, ${mode}, zar ${dice.join('/')} → ${check.total}`)
  return roll
}

/** Atışı geçmişe ve zar.json'a yazar, bütün pencerelere yayar. */
function record(store: Store, diceFile: string, roll: DiceRoll): void {
  const history = [roll, ...store.getState().session.diceHistory].slice(0, DICE_HISTORY_LIMIT)
  try {
    writeDiceHistory(diceFile, history)
  } catch (error) {
    diceFileFailed(error, 'zar.json yazılamadı')
  }
  store.updateSession((session) => ({ ...session, diceHistory: history }))
  broadcast(IPC.diceRoll, roll)
}

/** Oyun normal bittiğinde ve düzgün kapanışta çağrılır. */
export function clearDiceFile(diceFile: string): void {
  try {
    clearDiceHistory(diceFile)
  } catch (error) {
    diceFileFailed(error, 'zar.json temizlenemedi')
  }
}
