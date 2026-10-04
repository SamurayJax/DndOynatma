import { memo } from 'react'
import type { JSX } from 'react'
import { filledPlayers, findImage } from '@shared/layout'
import { TEXT_LIMITS } from '@shared/reducer'
import { MAX_LEVEL, MIN_LEVEL } from '@shared/types'
import type { LibraryImage, PlayerProfile } from '@shared/types'
import { dispatch, useApp } from '@renderer/lib/useAppState'
import { EmptyState, ImageThumb, InfoIcon, NumberStepper, Panel, TextArea, cx } from '@renderer/ui'
import { HealthControl } from './HealthControl'
import { blurOnEscape } from './leaveField'

/** Sol sütun: her dolu oyuncu için bir kart, yuva sırasıyla. */
export function PlayersColumn(): JSX.Element {
  const app = useApp()
  const players = filledPlayers(app)

  return (
    <section className="ctl-col ctl-col--players" aria-label="Oyuncular">
      {players.length === 0 ? (
        <Panel title="Oyuncular">
          <EmptyState
            compact
            icon={<InfoIcon size={24} />}
            title="Oyuncu profili yok"
            hint="Oyunu bitirip Ayarlar › Oyuncular bölümünden ekleyebilirsin."
          />
        </Panel>
      ) : (
        players.map(({ slot, player }) => (
          <PlayerCard key={slot} slot={slot} player={player} portrait={findImage(app, player.portraitId)} />
        ))
      )}
    </section>
  )
}

interface PlayerCardProps {
  slot: number
  player: PlayerProfile
  portrait: LibraryImage | undefined
}

// Durum yayınları değişmeyen oyuncunun nesnesini korur; memo sayesinde yalnızca değişen kart yeniden çizilir.
const PlayerCard = memo(function PlayerCard({ slot, player, portrait }: PlayerCardProps): JSX.Element {
  const slotName = `Oyuncu ${slot + 1}`
  const name = player.name.trim()
  const shownName = name === '' ? slotName : name
  const down = player.hp <= 0

  return (
    <article className={cx('ctl-player', down && 'is-down')} aria-label={shownName} data-slot={slot}>
      <header className="ctl-player__head">
        <ImageThumb className="ctl-player__portrait ctl-thumb" image={portrait} fit="cover" emptyLabel="" alt="" />
        <div className="ctl-player__identity">
          <h2 className={cx('ctl-player__name', name === '' && 'is-unnamed')} title={shownName}>
            {name === '' ? 'İsimsiz' : name}
          </h2>
          <span className="ctl-player__slot">
            {slotName}
            {down && <span className="ctl-player__down"> · canı 0</span>}
          </span>
        </div>
        <div className="ctl-player__level">
          <span className="ctl-player__level-label" aria-hidden="true">
            Seviye
          </span>
          <NumberStepper
            size="sm"
            label="Seviye"
            value={player.level}
            min={MIN_LEVEL}
            max={MAX_LEVEL}
            onChange={(level) => dispatch({ type: 'player/update', slot, patch: { level } })}
          />
        </div>
      </header>

      <HealthControl slot={slot} hp={player.hp} />

      <TextArea
        className="ctl-player__note"
        value={player.note}
        maxLength={TEXT_LIMITS.playerNote}
        rows={2}
        placeholder="Not (ör. şu itemi var)"
        aria-label={`${shownName} için not`}
        onChange={(note) => dispatch({ type: 'player/update', slot, patch: { note } })}
        onKeyDown={blurOnEscape}
      />
    </article>
  )
})
