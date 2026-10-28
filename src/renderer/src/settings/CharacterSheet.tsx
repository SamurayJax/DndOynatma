import type { JSX } from 'react'
import { ABILITY_INFO, abilityModifier, proficiencyForLevel, signed } from '@shared/character'
import { MAX_PROFICIENCY } from '@shared/reducer'
import { ABILITIES, MAX_ABILITY, MIN_ABILITY } from '@shared/types'
import type { CharacterClass, PlayerProfile } from '@shared/types'
import { dispatch } from '@renderer/lib/useAppState'
import { Field, NumberStepper, Select, Toggle, cx } from '@renderer/ui'
import type { SelectOption } from '@renderer/ui'

const NO_CLASS = 'none'

export interface CharacterSheetProps {
  slot: number
  player: PlayerProfile
  classes: readonly CharacterClass[]
}

/**
 * Oyuncu kartının karakter bölümü: sınıf, altı istatistik (artı / eksisiyle) ve yeterlilik.
 * Beceriler sınıftan gelir; Ayarlar › Sınıflar'da tanımlanır.
 */
export function CharacterSheet({ slot, player, classes }: CharacterSheetProps): JSX.Element {
  const title = `Oyuncu ${slot + 1}`
  const classOptions: SelectOption[] = [
    { value: NO_CLASS, label: classes.length === 0 ? 'Sınıf yok (Ayarlar › Sınıflar)' : 'Sınıf yok' },
    ...classes.map((entry) => ({ value: entry.id, label: `${entry.name} · ${entry.skills.length} beceri` }))
  ]
  const levelProficiency = proficiencyForLevel(player.level)
  const manual = player.proficiency !== null

  return (
    <div className="set-sheet">
      <Field label="Sınıf" className="set-sheet__class">
        <Select
          value={player.classId ?? NO_CLASS}
          options={classOptions}
          onChange={(value) => dispatch({ type: 'player/update', slot, patch: { classId: value === NO_CLASS ? null : value } })}
        />
      </Field>

      <div className="set-sheet__abilities" role="group" aria-label={`${title} istatistikleri`}>
        {ABILITIES.map((ability) => {
          const score = player.abilities[ability]
          const modifier = abilityModifier(score)
          return (
            <div key={ability} className="set-sheet__ability" title={`${ABILITY_INFO[ability].name}: ${score} (${signed(modifier)})`}>
              <span className="set-sheet__ability-name">
                <strong>{ABILITY_INFO[ability].short}</strong> {ABILITY_INFO[ability].name}
              </span>
              <NumberStepper
                size="sm"
                value={score}
                min={MIN_ABILITY}
                max={MAX_ABILITY}
                label={`${title} ${ABILITY_INFO[ability].name}`}
                onChange={(value) => dispatch({ type: 'player/setAbility', slot, ability, value })}
              />
              <span className={cx('set-sheet__mod', modifier > 0 && 'is-plus', modifier < 0 && 'is-minus')}>{signed(modifier)}</span>
            </div>
          )
        })}
      </div>

      <div className="set-sheet__proficiency">
        <div className="set-sheet__proficiency-text">
          <span className="set-label">Yeterlilik</span>
          <span className="set-sheet__hint">Becerilerin gereksinimini bu kadar düşürür.</span>
        </div>
        {manual ? (
          <NumberStepper
            size="sm"
            value={player.proficiency ?? levelProficiency}
            min={0}
            max={MAX_PROFICIENCY}
            label={`${title} yeterliliği`}
            onChange={(value) => dispatch({ type: 'player/update', slot, patch: { proficiency: value } })}
          />
        ) : (
          <span className="set-sheet__auto" title="Seviyeden: 1-4 → 2, 5-8 → 3, 9-12 → 4, 13-16 → 5, 17+ → 6">
            {levelProficiency} <span className="set-sheet__hint">seviyeden</span>
          </span>
        )}
        <Toggle
          checked={manual}
          label="Elle"
          aria-label={`${title} yeterliliğini elle gir`}
          onChange={(on) => dispatch({ type: 'player/update', slot, patch: { proficiency: on ? levelProficiency : null } })}
        />
      </div>
    </div>
  )
}
