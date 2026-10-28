import { memo, useEffect, useRef, useState } from 'react'
import type { JSX } from 'react'
import {
  ABILITY_INFO,
  CHECK_MODE_LABEL,
  abilityModifier,
  effectiveRequirement,
  findClass,
  playerProficiency,
  signed
} from '@shared/character'
import { newId } from '@shared/id'
import { findImage, isPlayerFilled } from '@shared/layout'
import { MAX_EFFECTS, MAX_EFFECT_ROLLS, MAX_EFFECT_VALUE, TEXT_LIMITS } from '@shared/reducer'
import { ABILITIES, MAX_PLAYERS } from '@shared/types'
import type { CharacterClass, CheckMode, DiceRoll, LibraryImage, PlayerEffect, PlayerProfile, Skill, SkillCheck } from '@shared/types'
import { reportError } from '@renderer/lib/reportError'
import { dispatch, useApp, useSession } from '@renderer/lib/useAppState'
import { CharacterSheet } from '@renderer/settings/CharacterSheet'
import {
  Button,
  ChevronDownIcon,
  ChevronUpIcon,
  CloseIcon,
  DiceIcon,
  IconButton,
  ImageThumb,
  NumberStepper,
  PlusIcon,
  Select,
  TextInput,
  Toggle,
  cx,
  toast
} from '@renderer/ui'
import type { SelectOption } from '@renderer/ui'
import './characters.css'

/** Art arda tıklamayla zar yığılmasın (kontrol panelindeki zar düğmeleriyle aynı). */
const ROLL_COOLDOWN_MS = 1200
const MODES: readonly CheckMode[] = ['normal', 'advantage', 'disadvantage']
const QUICK_VALUES = [-2, -1, 1, 2] as const
const NO_CLASS = 'none'

/**
 * Kontrol panelinin "Karakterler" sayfası: dört eşit sütun, her biri bir oyuncu yuvası (soldan sağa
 * Oyuncu 1–4). Boş yuvanın yeri boş kalır; böylece bir oyuncunun yeri hiç kaymaz. Yalnızca DM görür.
 */
export function CharactersPage(): JSX.Element {
  const app = useApp()
  const { diceHistory } = useSession()
  // Atışlar arasında ortak bekleme: oyun ekranında aynı anda tek atış gösterilir.
  const [cooling, setCooling] = useState(false)
  const timer = useRef<number | undefined>(undefined)
  useEffect(() => () => window.clearTimeout(timer.current), [])

  const roll = async (slot: number, skill: Skill, mode: CheckMode): Promise<boolean> => {
    if (cooling) return false
    setCooling(true)
    window.clearTimeout(timer.current)
    timer.current = window.setTimeout(() => setCooling(false), ROLL_COOLDOWN_MS)
    try {
      const result = await window.dnd.dice.rollSkill(slot, skill.id, mode)
      if (result === 'not-playing') toast('Beceri atılamadı: oyun açık değil.', 'UYARI', 'DND-401')
      return typeof result === 'object'
    } catch (error) {
      reportError('Beceri atılamadı', error)
      toast('Beceri atılamadı. Ayrıntı log dosyasında.', 'HATA', 'DND-902')
      return false
    }
  }

  return (
    <div className="chr-page">
      {Array.from({ length: MAX_PLAYERS }, (_, slot) => {
        const player = app.players[slot]
        if (!isPlayerFilled(player)) return <div key={slot} className="chr-col chr-col--empty" aria-label={`Oyuncu ${slot + 1} (boş)`} />
        return (
          <CharacterColumn
            key={slot}
            slot={slot}
            player={player}
            portrait={findImage(app, player.portraitId)}
            classes={app.classes}
            characterClass={findClass(app, player.classId)}
            lastCheck={lastCheckOf(diceHistory, slot)}
            cooling={cooling}
            onRoll={roll}
          />
        )
      })}
    </div>
  )
}

function lastCheckOf(history: readonly DiceRoll[], slot: number): { id: string; check: SkillCheck } | null {
  const roll = history.find((entry) => entry.check?.slot === slot)
  return roll?.check ? { id: roll.id, check: roll.check } : null
}

interface CharacterColumnProps {
  slot: number
  player: PlayerProfile
  portrait: LibraryImage | undefined
  classes: readonly CharacterClass[]
  characterClass: CharacterClass | undefined
  lastCheck: { id: string; check: SkillCheck } | null
  cooling: boolean
  onRoll: (slot: number, skill: Skill, mode: CheckMode) => Promise<boolean>
}

const CharacterColumn = memo(function CharacterColumn({
  slot,
  player,
  portrait,
  classes,
  characterClass,
  lastCheck,
  cooling,
  onRoll
}: CharacterColumnProps): JSX.Element {
  const [mode, setMode] = useState<CheckMode>('normal')
  const [editing, setEditing] = useState(false)
  const name = player.name.trim() || `Oyuncu ${slot + 1}`
  const proficiency = playerProficiency(player)
  const effectTotal = player.effects.reduce((sum, effect) => sum + effect.value, 0)
  const classOptions: SelectOption[] = [{ value: NO_CLASS, label: 'Sınıf yok' }, ...classes.map((entry) => ({ value: entry.id, label: entry.name }))]

  const rollSkill = (skill: Skill): void => {
    void onRoll(slot, skill, mode).then((rolled) => {
      // Avantaj / dezavantaj tek atış içindir; atıştan sonra Normal'e döner.
      if (rolled) setMode('normal')
    })
  }

  return (
    <section className="chr-col" aria-label={name} data-slot={slot}>
      <header className="chr-head">
        <ImageThumb className="chr-head__portrait ctl-thumb" image={portrait} fit="cover" emptyLabel="" alt="" />
        <div className="chr-head__text">
          <h2 className="chr-head__name" title={name}>
            {name}
          </h2>
          <span className="chr-head__meta">
            {player.level}. seviye · yeterlilik {proficiency}
          </span>
        </div>
      </header>

      <Select
        className="chr-class"
        aria-label={`${name} sınıfı`}
        value={player.classId ?? NO_CLASS}
        options={classOptions}
        onChange={(value) => dispatch({ type: 'player/update', slot, patch: { classId: value === NO_CLASS ? null : value } })}
      />

      <div className="chr-stats" role="list" aria-label={`${name} istatistikleri`}>
        {ABILITIES.map((ability) => {
          const score = player.abilities[ability]
          const modifier = abilityModifier(score)
          return (
            <div key={ability} className="chr-stat" role="listitem" title={`${ABILITY_INFO[ability].name}: ${score} (${signed(modifier)})`}>
              <span className="chr-stat__name">{ABILITY_INFO[ability].short}</span>
              <span className="chr-stat__score">{score}</span>
              <span className={cx('chr-stat__mod', modifier > 0 && 'is-plus', modifier < 0 && 'is-minus')}>{signed(modifier)}</span>
            </div>
          )
        })}
      </div>

      <button type="button" className="chr-edit-toggle" aria-expanded={editing} onClick={() => setEditing((on) => !on)}>
        {editing ? <ChevronUpIcon size={16} /> : <ChevronDownIcon size={16} />}
        {editing ? 'Düzenlemeyi kapat' : 'İstatistikleri düzenle'}
      </button>
      {editing && (
        <div className="chr-edit">
          <CharacterSheet slot={slot} player={player} classes={classes} />
        </div>
      )}

      <div className="chr-modes" role="radiogroup" aria-label="Atış türü">
        {MODES.map((entry) => (
          <button
            key={entry}
            type="button"
            role="radio"
            aria-checked={mode === entry}
            className={cx('chr-mode', `chr-mode--${entry}`, mode === entry && 'is-selected')}
            onClick={() => setMode(entry)}
          >
            {CHECK_MODE_LABEL[entry]}
          </button>
        ))}
      </div>

      <div className="chr-skills" aria-label={`${name} becerileri`}>
        {characterClass === undefined ? (
          <p className="chr-none">Sınıf seçilmemiş. Yukarıdan bir sınıf seç; sınıflar Ayarlar › Sınıflar'da tanımlanır.</p>
        ) : characterClass.skills.length === 0 ? (
          <p className="chr-none">“{characterClass.name}” sınıfının becerisi yok. Ayarlar › Sınıflar'dan eklenir.</p>
        ) : (
          characterClass.skills.map((skill) => {
            const modifier = abilityModifier(player.abilities[skill.ability]) + effectTotal
            const requirement = effectiveRequirement(skill.requirement, proficiency)
            return (
              <button
                key={skill.id}
                type="button"
                className={cx('chr-skill', cooling && 'is-cooling')}
                aria-disabled={cooling}
                data-skill={skill.id}
                title={`${skill.name}: d20 ${signed(modifier)} · en az ${skill.requirement}, yeterlilikle ${requirement}`}
                onClick={() => rollSkill(skill)}
              >
                <DiceIcon size={18} />
                <span className="chr-skill__name">{skill.name}</span>
                <span className="chr-skill__info">
                  {ABILITY_INFO[skill.ability].short} {signed(modifier)}
                </span>
                <span className="chr-skill__req">
                  {requirement !== skill.requirement && <s>{skill.requirement}</s>} {requirement}
                </span>
              </button>
            )
          })
        )}
      </div>

      <LastCheck entry={lastCheck} />

      <Effects slot={slot} effects={player.effects} name={name} />
    </section>
  )
})

function LastCheck({ entry }: { entry: { id: string; check: SkillCheck } | null }): JSX.Element {
  if (entry === null) return <div className="chr-last is-empty">Henüz beceri atılmadı.</div>
  const { check } = entry
  const sum = check.modifiers.reduce((total, modifier) => total + modifier.value, 0)
  return (
    // Aynı sonuç art arda gelse de canlanma yeniden oynasın diye atışın kimliği anahtar olur.
    <div key={entry.id} className={cx('chr-last', check.success !== null && (check.success ? 'is-success' : 'is-fail'))} aria-live="polite">
      <span className="chr-last__title">
        Son atış · {check.skillName}
        {check.mode !== 'normal' && ` · ${CHECK_MODE_LABEL[check.mode]} (${check.dice.join(' / ')})`}
      </span>
      <span className="chr-last__math">
        {check.dice[check.keptIndex]} {sum !== 0 && `${sum > 0 ? '+' : '−'} ${Math.abs(sum)} `}= <strong>{check.total}</strong>
        {check.requirement !== null && <span className="chr-last__req"> / en az {check.requirement}</span>}
      </span>
      {/* Zar panelinden istatistikle atılanın hedefi yoktur. */}
      <span className="chr-last__result">{check.success === null ? 'Toplam' : check.success ? 'Başarılı' : 'Başarısız'}</span>
    </div>
  )
}

function effectDuration(effect: PlayerEffect): string {
  return effect.rolls === null ? 'kalıcı' : `${effect.rolls} atış`
}

function Effects({ slot, effects, name }: { slot: number; effects: readonly PlayerEffect[]; name: string }): JSX.Element {
  const [label, setLabel] = useState('')
  const [value, setValue] = useState(2)
  const [rolls, setRolls] = useState(1)
  const [permanent, setPermanent] = useState(false)
  const full = effects.length >= MAX_EFFECTS

  const add = (): void => {
    if (value === 0 || full) return
    dispatch({ type: 'player/addEffect', slot, effect: { id: newId(), label, value, rolls: permanent ? null : rolls } })
    setLabel('')
  }

  return (
    <div className="chr-effects">
      <h3 className="chr-effects__title">Artı / eksi</h3>
      {effects.length > 0 && (
        <ul className="chr-effects__list" aria-label={`${name} etkileri`}>
          {effects.map((effect) => (
            <li key={effect.id} className={cx('chr-effect', effect.value > 0 ? 'is-plus' : 'is-minus', effect.rolls === null && 'is-permanent')}>
              <span className="chr-effect__value">{signed(effect.value)}</span>
              <span className="chr-effect__label" title={effect.label}>
                {effect.label}
              </span>
              <span className="chr-effect__rolls">{effectDuration(effect)}</span>
              <IconButton
                label={`“${effect.label}” etkisini kaldır`}
                icon={<CloseIcon size={14} />}
                size="sm"
                onClick={() => dispatch({ type: 'player/removeEffect', slot, effectId: effect.id })}
              />
            </li>
          ))}
        </ul>
      )}

      <div className="chr-effects__form">
        <TextInput
          aria-label="Açıklama"
          placeholder="Açıklama (İyi rol, Ayağı takıldı…)"
          value={label}
          maxLength={TEXT_LIMITS.effectLabel}
          onChange={setLabel}
          onKeyDown={(event) => {
            if (event.key === 'Enter') add()
          }}
        />
        <div className="chr-effects__row">
          <div className="chr-effects__quick" role="group" aria-label="Hazır değerler">
            {QUICK_VALUES.map((quick) => (
              <button
                key={quick}
                type="button"
                className={cx('chr-quick', quick > 0 ? 'is-plus' : 'is-minus', value === quick && 'is-selected')}
                aria-pressed={value === quick}
                onClick={() => setValue(quick)}
              >
                {signed(quick)}
              </button>
            ))}
          </div>
          <NumberStepper size="sm" label="Değer" value={value} min={-MAX_EFFECT_VALUE} max={MAX_EFFECT_VALUE} format={signed} onChange={setValue} />
        </div>
        <div className="chr-effects__row">
          <span className="chr-effects__label">Süre</span>
          <NumberStepper
            size="sm"
            label="Kaç atış sürsün"
            value={rolls}
            min={1}
            max={MAX_EFFECT_ROLLS}
            format={(count) => `${count} atış`}
            disabled={permanent}
            onChange={setRolls}
          />
          <Toggle checked={permanent} label="Kalıcı" aria-label="Kalıcı (elle kaldırılana kadar)" onChange={setPermanent} />
        </div>
        <Button
          size="sm"
          variant="primary"
          icon={<PlusIcon size={16} />}
          disabled={value === 0 || full}
          title={full ? `Bir oyuncuda en fazla ${MAX_EFFECTS} etki olabilir.` : undefined}
          onClick={add}
        >
          {value > 0 ? `${signed(value)} ver` : `${value} ver`}
        </Button>
      </div>
    </div>
  )
}
