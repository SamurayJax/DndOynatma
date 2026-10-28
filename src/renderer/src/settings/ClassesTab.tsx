import { useEffect, useRef, useState } from 'react'
import type { JSX } from 'react'
import { ABILITY_INFO, proficiencyForLevel } from '@shared/character'
import { newId } from '@shared/id'
import { DEFAULT_REQUIREMENT, MAX_CLASSES, MAX_REQUIREMENT, MAX_SKILLS, TEXT_LIMITS } from '@shared/reducer'
import { ABILITIES } from '@shared/types'
import type { Ability, CharacterClass, Skill } from '@shared/types'
import { dispatch, useApp } from '@renderer/lib/useAppState'
import {
  ArrowDownIcon,
  ArrowUpIcon,
  Button,
  EmptyState,
  IconButton,
  NumberStepper,
  PlusIcon,
  Select,
  TextInput,
  TrashIcon,
  confirmDialog
} from '@renderer/ui'
import type { SelectOption } from '@renderer/ui'
import './settings.css'

const ABILITY_OPTIONS: SelectOption<Ability>[] = ABILITIES.map((ability) => ({
  value: ability,
  label: `${ABILITY_INFO[ability].short} · ${ABILITY_INFO[ability].name}`
}))

/**
 * Ayarlar › Sınıflar. Sınıfları ve becerilerini DM tanımlar; uygulama hazır bir liste dayatmaz.
 * Beceri: adı, hangi istatistikle atıldığı ve başarmak için en az kaç gelmesi gerektiği.
 */
export function ClassesTab(): JSX.Element {
  const app = useApp()
  // Yeni eklenen sınıfın / becerinin adı odaklanır ki hemen yazılabilsin.
  const [focusId, setFocusId] = useState<string | null>(null)
  const full = app.classes.length >= MAX_CLASSES

  const addClass = (): void => {
    const classId = newId()
    dispatch({ type: 'class/add', classId, name: `Sınıf ${app.classes.length + 1}` })
    setFocusId(classId)
  }

  return (
    <div className="set-classes">
      <header className="set-intro">
        <p className="set-intro__text">
          Sınıfı ve becerilerini sen tanımlarsın. Oyuncunun sınıfı Oyuncular sekmesinden seçilir; oyunda kontrol panelinin
          Karakterler sekmesinde o sınıfın becerileri düğme olur. Atış: d20 + istatistik artısı, gereksinimden yeterlilik düşülür.
        </p>
        <Button variant="primary" icon={<PlusIcon size={18} />} disabled={full} onClick={addClass} title={full ? `En fazla ${MAX_CLASSES} sınıf olabilir.` : undefined}>
          Yeni sınıf
        </Button>
      </header>

      {app.classes.length === 0 ? (
        <EmptyState
          className="set-classes__empty"
          icon={<PlusIcon size={28} />}
          title="Henüz sınıf yok"
          hint="“Savaşçı”, “Büyücü” gibi bir sınıf ekle, sonra ona beceriler ver (örneğin “Ac” · STR · en az 10)."
          action={
            <Button icon={<PlusIcon size={18} />} onClick={addClass}>
              İlk sınıfı oluştur
            </Button>
          }
        />
      ) : (
        <div className="set-classes__list">
          {app.classes.map((entry, index) => (
            <ClassCard
              key={entry.id}
              entry={entry}
              first={index === 0}
              last={index === app.classes.length - 1}
              users={app.players.filter((player) => player.classId === entry.id).length}
              focusId={focusId}
              onFocused={() => setFocusId(null)}
              onAddedSkill={setFocusId}
            />
          ))}
        </div>
      )}
    </div>
  )
}

interface ClassCardProps {
  entry: CharacterClass
  first: boolean
  last: boolean
  /** Bu sınıftaki oyuncu sayısı. */
  users: number
  focusId: string | null
  onFocused: () => void
  onAddedSkill: (skillId: string) => void
}

function ClassCard({ entry, first, last, users, focusId, onFocused, onAddedSkill }: ClassCardProps): JSX.Element {
  const nameRef = useRef<HTMLInputElement>(null)
  const full = entry.skills.length >= MAX_SKILLS

  useEffect(() => {
    if (focusId !== entry.id) return
    nameRef.current?.focus()
    nameRef.current?.select()
    onFocused()
  }, [focusId, entry.id, onFocused])

  const remove = async (): Promise<void> => {
    const confirmed = await confirmDialog({
      title: `“${entry.name}” silinsin mi?`,
      message:
        `${entry.skills.length} becerisiyle birlikte silinir.` +
        (users > 0 ? ` Bu sınıftaki ${users} oyuncunun sınıfı boşalır; istatistikleri kalır.` : ''),
      confirmLabel: 'Sil',
      danger: true
    })
    if (confirmed) dispatch({ type: 'class/remove', classId: entry.id })
  }

  const addSkill = (): void => {
    const skillId = newId()
    dispatch({ type: 'skill/add', classId: entry.id, skill: { id: skillId, name: `Beceri ${entry.skills.length + 1}`, ability: 'str', requirement: DEFAULT_REQUIREMENT } })
    onAddedSkill(skillId)
  }

  return (
    <section className="set-class" aria-label={entry.name} data-class={entry.id}>
      <header className="set-class__head">
        <TextInput
          ref={nameRef}
          className="set-class__name"
          aria-label="Sınıfın adı"
          value={entry.name}
          maxLength={TEXT_LIMITS.className}
          onCommit={(name) => dispatch({ type: 'class/update', classId: entry.id, name })}
          onKeyDown={(event) => {
            if (event.key === 'Enter') event.currentTarget.blur()
          }}
        />
        <span className="set-class__meta">{users > 0 ? `${users} oyuncu` : 'Oyuncu yok'}</span>
        <IconButton label="Yukarı taşı" icon={<ArrowUpIcon size={16} />} size="sm" disabled={first} onClick={() => dispatch({ type: 'class/move', classId: entry.id, to: 'up' })} />
        <IconButton label="Aşağı taşı" icon={<ArrowDownIcon size={16} />} size="sm" disabled={last} onClick={() => dispatch({ type: 'class/move', classId: entry.id, to: 'down' })} />
        <IconButton className="set-quiet-danger" label="Sınıfı sil" icon={<TrashIcon size={18} />} onClick={() => void remove()} />
      </header>

      {entry.skills.length === 0 ? (
        <p className="set-class__none">Bu sınıfın becerisi yok.</p>
      ) : (
        <ol className="set-class__skills" aria-label={`${entry.name} becerileri`}>
          <li className="set-skill set-skill--head" aria-hidden="true">
            <span>Beceri</span>
            <span>İstatistik</span>
            <span title={`Yeterlilik bu sayıdan düşülür; 1. seviyede ${proficiencyForLevel(1)}.`}>En az</span>
            <span />
          </li>
          {entry.skills.map((skill, index) => (
            <SkillRow
              key={skill.id}
              classId={entry.id}
              skill={skill}
              first={index === 0}
              last={index === entry.skills.length - 1}
              focus={focusId === skill.id}
              onFocused={onFocused}
            />
          ))}
        </ol>
      )}

      <Button size="sm" icon={<PlusIcon size={16} />} disabled={full} onClick={addSkill} title={full ? `Bir sınıfta en fazla ${MAX_SKILLS} beceri olabilir.` : undefined}>
        Beceri ekle
      </Button>
    </section>
  )
}

interface SkillRowProps {
  classId: string
  skill: Skill
  first: boolean
  last: boolean
  focus: boolean
  onFocused: () => void
}

function SkillRow({ classId, skill, first, last, focus, onFocused }: SkillRowProps): JSX.Element {
  const nameRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!focus) return
    nameRef.current?.focus()
    nameRef.current?.select()
    onFocused()
  }, [focus, onFocused])

  const update = (patch: Partial<Pick<Skill, 'name' | 'ability' | 'requirement'>>): void =>
    dispatch({ type: 'skill/update', classId, skillId: skill.id, patch })

  return (
    <li className="set-skill" data-skill={skill.id}>
      <TextInput
        ref={nameRef}
        aria-label="Becerinin adı"
        value={skill.name}
        maxLength={TEXT_LIMITS.skillName}
        onCommit={(name) => update({ name })}
        onKeyDown={(event) => {
          if (event.key === 'Enter') event.currentTarget.blur()
        }}
      />
      <Select aria-label="Hangi istatistikle atılır" value={skill.ability} options={ABILITY_OPTIONS} onChange={(ability) => update({ ability })} />
      <NumberStepper size="sm" label="En az kaç gelmeli" value={skill.requirement} min={1} max={MAX_REQUIREMENT} onChange={(requirement) => update({ requirement })} />
      <div className="set-skill__actions">
        <IconButton label="Yukarı taşı" icon={<ArrowUpIcon size={14} />} size="sm" disabled={first} onClick={() => dispatch({ type: 'skill/move', classId, skillId: skill.id, to: 'up' })} />
        <IconButton label="Aşağı taşı" icon={<ArrowDownIcon size={14} />} size="sm" disabled={last} onClick={() => dispatch({ type: 'skill/move', classId, skillId: skill.id, to: 'down' })} />
        <IconButton className="set-quiet-danger" label="Beceriyi sil" icon={<TrashIcon size={14} />} size="sm" onClick={() => dispatch({ type: 'skill/remove', classId, skillId: skill.id })} />
      </div>
    </li>
  )
}
