import type { JSX } from 'react'
import { filledPlayers, findImage } from '@shared/layout'
import { MAX_PLAYERS } from '@shared/types'
import { useApp } from '@renderer/lib/useAppState'
import { cx } from '@renderer/ui'
import { CharacterTransfer } from './CharacterTransfer'
import { PlayerCard } from './PlayerCard'
import './settings.css'

/**
 * Ayarlar › Oyuncular. Dört sabit kart; oyun kişi sayısı sormaz, kaç oyuncu olacağını
 * buradaki dolu kartlar belirler.
 */
export function ProfilesTab(): JSX.Element {
  const app = useApp()
  const filledCount = filledPlayers(app).length

  return (
    <div className="set-profiles">
      <header className="set-intro">
        <p className="set-intro__text">
          Portresi ya da adı olan kart oyunda görünür, boş kart hiç görünmez; oyuncu sayısını bu kartlar belirler.
        </p>
        <span className={cx('set-chip', filledCount > 0 && 'set-chip--on')}>
          {filledCount} / {MAX_PLAYERS} oyuncu oyunda
        </span>
        <CharacterTransfer players={app.players} />
      </header>

      <div className="set-profiles__grid">
        {app.players.map((player, slot) => (
          // Yuvalar sabittir; sıra numarası kalıcı kimliktir.
          <PlayerCard key={slot} slot={slot} player={player} portrait={findImage(app, player.portraitId)} classes={app.classes} />
        ))}
      </div>
    </div>
  )
}
