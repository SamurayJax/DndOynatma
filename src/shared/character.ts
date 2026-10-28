/**
 * Karakter hesapları: istatistik artısı, yeterlilik ve beceri atışının sonucu. Saf fonksiyonlar;
 * zar ana süreçte atılır, sonuç burada hesaplanır.
 */
import {
  Ability,
  AppState,
  CharacterClass,
  CheckMode,
  CheckModifier,
  PlayerProfile,
  Skill,
  SkillCheck
} from './types'

export const ABILITY_INFO: Record<Ability, { short: string; name: string }> = {
  str: { short: 'STR', name: 'Güç' },
  dex: { short: 'DEX', name: 'Çeviklik' },
  con: { short: 'CON', name: 'Dayanıklılık' },
  int: { short: 'INT', name: 'Zeka' },
  wis: { short: 'WIS', name: 'Bilgelik' },
  cha: { short: 'CHA', name: 'Karizma' }
}

export const CHECK_MODE_LABEL: Record<CheckMode, string> = {
  normal: 'Normal',
  advantage: 'Avantaj',
  disadvantage: 'Dezavantaj'
}

/** İstatistikten gelen artı / eksi: 10-11 → 0, her 2 puan yukarı +1, her 2 puan aşağı -1. */
export function abilityModifier(score: number): number {
  return Math.floor((score - 10) / 2)
}

/** Seviyeye göre yeterlilik: 1-4 → 2, 5-8 → 3, 9-12 → 4, 13-16 → 5, 17 ve üstü → 6. */
export function proficiencyForLevel(level: number): number {
  return Math.min(6, 2 + Math.floor((Math.max(1, level) - 1) / 4))
}

/** Oyuncunun geçerli yeterliliği: DM elle verdiyse o, vermediyse seviyeden. */
export function playerProficiency(player: PlayerProfile): number {
  return player.proficiency ?? proficiencyForLevel(player.level)
}

/** Yeterlilik düşüldükten sonraki gereksinim; en az 1. */
export function effectiveRequirement(requirement: number, proficiency: number): number {
  return Math.max(1, requirement - proficiency)
}

/** "+2", "-1", "0" */
export function signed(value: number): string {
  return value > 0 ? `+${value}` : String(value)
}

export function findClass(app: AppState, classId: string | null): CharacterClass | undefined {
  return classId === null ? undefined : app.classes.find((entry) => entry.id === classId)
}

/** Alınan zarın sırası: avantajda büyük, dezavantajda küçük; eşitse ilki. */
export function keptDieIndex(mode: CheckMode, dice: readonly number[]): number {
  if (dice.length < 2 || mode === 'normal') return 0
  const [first, second] = dice
  if (mode === 'advantage') return second > first ? 1 : 0
  return second < first ? 1 : 0
}

/**
 * Beceri atışının sonucu: alınan zar + istatistik artısı + geçici artı / eksiler; toplam, yeterlilik
 * düşülmüş gereksinime eşit ya da büyükse başarılı. Sıfır olan artılar listeye girmez.
 */
export function computeSkillCheck(input: {
  slot: number
  player: PlayerProfile
  skill: Skill
  mode: CheckMode
  dice: number[]
}): SkillCheck {
  const { slot, player, skill, mode, dice } = input
  const keptIndex = keptDieIndex(mode, dice)
  const modifiers: CheckModifier[] = []
  const fromAbility = abilityModifier(player.abilities[skill.ability])
  if (fromAbility !== 0) modifiers.push({ label: ABILITY_INFO[skill.ability].short, value: fromAbility, kind: 'ability' })
  for (const effect of player.effects) {
    if (effect.value !== 0) modifiers.push({ label: effect.label, value: effect.value, kind: 'effect' })
  }
  const total = dice[keptIndex] + modifiers.reduce((sum, modifier) => sum + modifier.value, 0)
  const proficiency = playerProficiency(player)
  const requirement = effectiveRequirement(skill.requirement, proficiency)
  return {
    slot,
    playerName: player.name.trim() || `Oyuncu ${slot + 1}`,
    skillName: skill.name,
    ability: skill.ability,
    mode,
    dice,
    keptIndex,
    modifiers,
    total,
    baseRequirement: skill.requirement,
    proficiency,
    requirement,
    success: total >= requirement
  }
}

/** Atıştan sonra etkiler: sayılı olanlar bir azalır, sıfıra inen düşer; kalıcılar aynen kalır. */
export function consumeEffects(player: PlayerProfile): PlayerProfile['effects'] {
  if (!player.effects.some((effect) => effect.rolls !== null)) return player.effects
  return player.effects
    .map((effect) => (effect.rolls === null ? effect : { ...effect, rolls: effect.rolls - 1 }))
    .filter((effect) => effect.rolls === null || effect.rolls > 0)
}
