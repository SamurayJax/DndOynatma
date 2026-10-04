import { memo, useLayoutEffect, useRef, useState } from 'react'
import type { JSX, RefObject } from 'react'
import { filledPlayers, findImage } from '@shared/layout'
import { MAX_HP, PORTRAIT_COLUMN_WIDTH } from '@shared/types'
import type { LibraryImage, PlayerProfile } from '@shared/types'
import { imageUrl } from '@renderer/lib/media'
import { useApp } from '@renderer/lib/useAppState'
import { cx, HeartIcon } from '@renderer/ui'

const HP_SEGMENTS = Array.from({ length: MAX_HP }, (_, index) => index)

/** İsmin baş harfi; portresi olmayan kartta görselin yerini tutar. */
function initialOf(name: string): string {
  const first = Array.from(name.trim())[0]
  return first === undefined ? '' : first.toLocaleUpperCase('tr-TR')
}

/** Uzun isimler tek satıra sığsın diye yazı kademeli küçülür. */
function nameSizeClass(name: string): string | false {
  const length = Array.from(name).length
  if (length > 18) return 'is-xlong'
  if (length > 12) return 'is-long'
  return false
}

/** Yazı en fazla bu orana kadar küçülür; daha uzun isim (çok geniş harfler) üç noktayla kesilir. */
const MIN_NAME_SCALE = 0.55

/**
 * Kademeli küçültme harflerin genişliğini bilemez: 24 karakterlik isim iki kartlı düzende üç noktayla
 * kesiliyordu. İsim hâlâ sığmıyorsa yazı, satıra tam sığacak kadar küçültülür.
 * `layoutKey`: yazı boyutunu değiştiren düzen (dolu kart sayısı).
 */
function useFitName(name: string, layoutKey: number): RefObject<HTMLHeadingElement | null> {
  const ref = useRef<HTMLHeadingElement>(null)
  useLayoutEffect(() => {
    const element = ref.current
    if (!element) return
    element.style.fontSize = ''
    // Yerleşim ölçüleri sanal pikseldir; sahnenin CSS ölçeğinden etkilenmez.
    const available = element.clientWidth
    const needed = element.scrollWidth
    if (available <= 0 || needed <= available) return
    const base = Number.parseFloat(getComputedStyle(element).fontSize)
    if (!Number.isFinite(base) || base <= 0) return
    // Ölçüler tam sayıya yuvarlandığı için küçük bir pay bırakılır.
    element.style.fontSize = `${base * Math.max((available / needed) * 0.98, MIN_NAME_SCALE)}px`
  }, [name, layoutKey])
  return ref
}

interface PlayerCardProps {
  player: PlayerProfile
  portrait: LibraryImage | undefined
  /** Dolu kart sayısı; kartın ölçülerini belirler. */
  count: number
}

const PlayerCard = memo(function PlayerCard({ player, portrait, count }: PlayerCardProps): JSX.Element {
  const src = imageUrl(portrait)
  // Hangi adresin açılamadığı tutulur; portre değişince hata durumu kendiliğinden düşer.
  const [failedSrc, setFailedSrc] = useState<string | null>(null)
  const showImage = src !== null && failedSrc !== src
  const name = player.name.trim()
  const nameRef = useFitName(name, count)
  const hp = Math.min(Math.max(player.hp, 0), MAX_HP)

  return (
    <article className={cx('game-card', hp === 0 && 'is-down')}>
      {/* Solukluk gövdeye uygulanır; kartlar arasındaki ayraç etkilenmez. */}
      <div className="game-card__body">
        <div className="game-card__frame">
          <div className="game-card__portrait">
            {showImage ? (
              <img className="game-card__img" src={src} alt="" draggable={false} onError={() => setFailedSrc(src)} />
            ) : (
              <span className="game-card__initial">{initialOf(name)}</span>
            )}
          </div>
          <span className="game-card__level">{player.level} LVL</span>
        </div>
        <h2 ref={nameRef} className={cx('game-card__name', nameSizeClass(name))}>
          {name}
        </h2>
        <div className="game-card__hp" role="img" aria-label={`Can: ${hp} / ${MAX_HP}`}>
          <HeartIcon className="game-card__heart" filled />
          <div className="game-card__pips">
            {HP_SEGMENTS.map((index) => (
              <span key={index} className={cx('game-card__pip', index < hp && 'is-filled')} />
            ))}
          </div>
        </div>
      </div>
    </article>
  )
})

/**
 * Soldaki kilitli portre sütunu: dolu her oyuncu için bir kart. Fareye tepki vermez
 * (portreler taşınamaz); hiç dolu oyuncu yoksa çizilmez.
 */
export function PortraitColumn(): JSX.Element | null {
  const app = useApp()
  const players = filledPlayers(app)
  if (players.length === 0) return null

  return (
    <aside className="game-portraits" data-count={players.length} style={{ width: PORTRAIT_COLUMN_WIDTH }} aria-label="Oyuncular">
      {players.map(({ slot, player }) => (
        <PlayerCard key={slot} player={player} portrait={findImage(app, player.portraitId)} count={players.length} />
      ))}
    </aside>
  )
}
