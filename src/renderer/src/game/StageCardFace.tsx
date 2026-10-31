import { memo } from 'react'
import type { JSX } from 'react'
import type { Context } from 'konva/lib/Context'
import { Circle, Group, Image as KonvaImage, Line, Path, Rect, Star, Text } from 'react-konva'
import { CARD_HEIGHT, CARD_WIDTH } from '@shared/types'
import type { BossFrame, CardFrame, StageCard } from '@shared/types'
import { stagePalette } from './stageTheme'

/** Oyuncu kartlarındaki kalple aynı çizim (`ui/icons.tsx`). */
const HEART_PATH = 'M12 20.5 4.6 13a4.88 4.88 0 0 1 6.9-6.9l.5.5.5-.5a4.88 4.88 0 0 1 6.9 6.9L12 20.5z'
const CROWN_PATH = 'M108 42 L100 12 L126 27 L150 3 L174 27 L200 12 L192 42 Z'

interface FrameTheme {
  /** Kartın zemini, yukarıdan aşağıya. */
  background: [string, string]
  /** Dış kenar ve portre çerçevesi. */
  edge: [string, string]
  glow: string
  name: string
  badge: [string, string]
  badgeText: string
  hpBack: string
  heart: string
  hpText: string
}

const THEMES: Record<CardFrame, FrameTheme> = {
  standard: {
    background: ['#2c2318', '#14100b'],
    edge: ['#f0d58c', '#a67c2d'],
    glow: '#000000',
    name: '#efe3cb',
    badge: ['#f0d58c', '#c0913a'],
    badgeText: '#241a0c',
    hpBack: '#0c0a08',
    heart: '#c8434a',
    hpText: '#efe3cb'
  },
  shadow: {
    background: ['#1c1426', '#050308'],
    edge: ['#a884d8', '#37254f'],
    glow: '#7a4fc0',
    name: '#d9c6f5',
    badge: ['#6d4aa3', '#2c1b47'],
    badgeText: '#efe6ff',
    hpBack: '#08050d',
    heart: '#a884d8',
    hpText: '#e6dbf7'
  },
  radiant: {
    background: ['#fff4d0', '#d9ad5a'],
    edge: ['#fffbe6', '#e5b13a'],
    glow: '#ffe28a',
    name: '#3d2b08',
    badge: ['#fffdf0', '#f0c75c'],
    badgeText: '#3d2b08',
    hpBack: '#fff8e0',
    heart: '#d0542c',
    hpText: '#3d2b08'
  },
  blood: {
    background: ['#3a0b0f', '#100304'],
    edge: ['#e0454c', '#6d1016'],
    glow: '#d6222c',
    name: '#ffd9d3',
    badge: ['#d83a42', '#7a1218'],
    badgeText: '#fff0ec',
    hpBack: '#140405',
    heart: '#f0444d',
    hpText: '#ffe6e2'
  },
  frost: {
    background: ['#123047', '#071420'],
    edge: ['#d5f3ff', '#5da8cf'],
    glow: '#7fd4ff',
    name: '#e2f7ff',
    badge: ['#c8efff', '#5da8cf'],
    badgeText: '#0a2535',
    hpBack: '#06121c',
    heart: '#7fd4ff',
    hpText: '#e2f7ff'
  },
  venom: {
    background: ['#16300f', '#060f05'],
    edge: ['#b6ec55', '#46801f'],
    glow: '#8fdc32',
    name: '#e4f9bd',
    badge: ['#b6ec55', '#4f8f22'],
    badgeText: '#112205',
    hpBack: '#060f04',
    heart: '#a8e445',
    hpText: '#e4f9bd'
  }
}

/** Çizimin her parçası kartın kutusunda kalır: seçim çerçevesi kutuyu çocukların kapladığı alandan ölçer. */
function Ornaments({ frame }: { frame: BossFrame }): JSX.Element {
  switch (frame) {
    case 'shadow':
      return (
        <>
          {[
            [34, 392, 28],
            [90, 396, 22],
            [270, 388, 28],
            [214, 398, 20],
            [28, 60, 24],
            [272, 60, 24],
            [150, 400, 18]
          ].map(([x, y, radius]) => (
            <Circle
              key={`${x}-${y}`}
              x={x}
              y={y}
              radius={radius}
              fillRadialGradientStartRadius={0}
              fillRadialGradientEndRadius={radius}
              fillRadialGradientColorStops={[0, 'rgba(122, 79, 192, 0.55)', 1, 'rgba(122, 79, 192, 0)']}
            />
          ))}
        </>
      )
    case 'radiant':
      return (
        <>
          {Array.from({ length: 9 }, (_, index) => {
            const angle = Math.PI * (index / 8)
            const x = 150 - Math.cos(angle) * 142
            const y = 118 - Math.sin(angle) * 110
            return <Line key={index} points={[150, 118, x - 5, y, x + 5, y]} closed fill="rgba(255, 255, 255, 0.55)" />
          })}
          {[
            [24, 30, 11],
            [276, 30, 11],
            [16, 300, 8],
            [284, 300, 8],
            [38, 402, 7],
            [262, 402, 7]
          ].map(([x, y, size]) => (
            <Star key={`${x}-${y}`} x={x} y={y} numPoints={4} innerRadius={size / 4} outerRadius={size} fill="#ffffff" />
          ))}
        </>
      )
    case 'blood':
      return (
        <>
          {[
            [34, 0, 44],
            [58, 0, 26],
            [226, 0, 30],
            [252, 0, 52],
            [274, 0, 24],
            [18, 300, 62],
            [282, 290, 74]
          ].map(([x, y, length]) => (
            <Rect key={`${x}-${y}`} x={x - 4} y={y} width={8} height={length} cornerRadius={4} fill="#a3121b" />
          ))}
          {[
            [20, 396, 6],
            [34, 406, 3],
            [280, 404, 5],
            [266, 410, 3]
          ].map(([x, y, radius]) => (
            <Circle key={`${x}-${y}`} x={x} y={y} radius={radius} fill="#a3121b" />
          ))}
        </>
      )
    case 'frost':
      return (
        <>
          {[
            [6, 44, 18, 4, 30, 42],
            [294, 44, 282, 4, 270, 42],
            [10, 414, 14, 370, 34, 412],
            [290, 414, 286, 370, 266, 412],
            [8, 300, 20, 262, 26, 306],
            [292, 300, 280, 262, 274, 306]
          ].map((points) => (
            <Line key={points.join()} points={points} closed fill="rgba(200, 239, 255, 0.75)" stroke="#ffffff" strokeWidth={1} />
          ))}
          {[
            [62, 22, 7],
            [238, 22, 7],
            [22, 340, 6],
            [278, 340, 6]
          ].map(([x, y, size]) => (
            <Star key={`${x}-${y}`} x={x} y={y} numPoints={6} innerRadius={size / 3} outerRadius={size} fill="#e2f7ff" />
          ))}
        </>
      )
    case 'venom':
      return (
        <>
          {[
            [18, 110, 7],
            [13, 160, 4],
            [20, 214, 9],
            [282, 96, 5],
            [286, 150, 8],
            [280, 226, 6],
            [22, 396, 8],
            [40, 408, 4],
            [278, 400, 7],
            [260, 410, 4]
          ].map(([x, y, radius]) => (
            <Circle key={`${x}-${y}`} x={x} y={y} radius={radius} fill="rgba(143, 220, 50, 0.3)" stroke="#b6ec55" strokeWidth={1.5} />
          ))}
          {[
            [46, 0, 30],
            [254, 0, 38]
          ].map(([x, y, length]) => (
            <Rect key={x} x={x - 4} y={y} width={8} height={length} cornerRadius={4} fill="#6faa22" />
          ))}
        </>
      )
  }
}

function roundedClip(x: number, y: number, width: number, height: number, radius: number) {
  return (context: Context): void => {
    context.beginPath()
    context.moveTo(x + radius, y)
    context.arcTo(x + width, y, x + width, y + height, radius)
    context.arcTo(x + width, y + height, x, y + height, radius)
    context.arcTo(x, y + height, x, y, radius)
    context.arcTo(x, y, x + width, y, radius)
    context.closePath()
  }
}

/** Görseli çerçeveyi dolduracak kadar kırpar; yüzler genelde üstte olduğu için yukarıya yakın keser. */
function coverCrop(picture: HTMLImageElement, width: number, height: number): { x: number; y: number; width: number; height: number } {
  const scale = Math.min(picture.width / width, picture.height / height)
  const cropWidth = width * scale
  const cropHeight = height * scale
  return { x: (picture.width - cropWidth) / 2, y: (picture.height - cropHeight) * 0.25, width: cropWidth, height: cropHeight }
}

const NAME_MAX_FONT = 36
/** Bundan küçük yazı küçültülmüş kartta okunmaz; daha uzun ad üç noktayla kesilir. */
const NAME_MIN_FONT = 17

let measure: CanvasRenderingContext2D | null = null

/** Ad bu yazı boyutunda tek satıra tam sığar (oyuncu kartlarındaki `useFitName` ile aynı fikir). */
function nameFontSize(name: string, fontFamily: string, available: number): number {
  measure ??= document.createElement('canvas').getContext('2d')
  if (measure === null) return NAME_MIN_FONT
  measure.font = `700 ${NAME_MAX_FONT}px ${fontFamily}`
  const needed = measure.measureText(name).width
  // Ölçüler yuvarlandığı için küçük bir pay bırakılır.
  return needed <= available ? NAME_MAX_FONT : Math.max(NAME_MIN_FONT, Math.floor((NAME_MAX_FONT * available * 0.98) / needed))
}

export interface StageCardFaceProps {
  card: StageCard
  picture: HTMLImageElement | undefined
  /** Görsel dosyası açılamadı; yüklenirken yazı çıkmasın diye `picture` yokluğundan ayrıdır. */
  missing: boolean
  /** Kartın sahnedeki boyutu; çizim 300x420'lik tasarımdan buna ölçeklenir. */
  width: number
  height: number
}

/**
 * NPC, tüccar, düşman ve boss kartı: görsel, seviye rozeti, ad ve sayıyla can. Oyuncu kartlarıyla aynı
 * düzendedir; boss çerçevelerinde taç ve temaya özgü süsler vardır.
 *
 * Kart esnetilse de yazılar basılmaz: çizim tek ölçekle büyür, fazla boy ya da en çerçeveye ve can
 * kutusuna verilir. Görsel yeni çerçeveye kırpılır; yalnızca süsler kartla birlikte esner.
 */
export const StageCardFace = memo(function StageCardFace({ card, picture, missing, width, height }: StageCardFaceProps): JSX.Element {
  const palette = stagePalette()
  const theme = THEMES[card.frame]
  const boss = card.frame !== 'standard'
  // Tasarım ölçüsü: küçük kenar 300x420'ye oturur, öbürü uzar.
  const unit = Math.min(width / CARD_WIDTH, height / CARD_HEIGHT)
  const designWidth = width / unit
  const designHeight = height / unit
  const frame = boss
    ? { x: 28, y: 48, width: designWidth - 56, height: designHeight - 192 }
    : { x: 18, y: 18, width: designWidth - 36, height: designHeight - 156 }
  const badgeY = frame.y + frame.height - 20
  const badgeX = designWidth / 2 - 58
  const nameWidth = designWidth - 32
  const nameY = designHeight - 114
  const hpY = designHeight - 64
  const hpText = `${card.hp} / ${card.maxHp}`
  const down = card.hp === 0

  return (
    <Group scaleX={unit} scaleY={unit}>
      <Rect
        width={designWidth}
        height={designHeight}
        cornerRadius={18}
        fillLinearGradientStartPoint={{ x: 0, y: 0 }}
        fillLinearGradientEndPoint={{ x: 0, y: designHeight }}
        fillLinearGradientColorStops={[0, theme.background[0], 1, theme.background[1]]}
        stroke={theme.edge[0]}
        strokeWidth={boss ? 4 : 2.5}
        shadowColor={theme.glow}
        shadowBlur={boss ? 34 : 14}
        shadowOpacity={boss ? 0.95 : 0.6}
      />
      <Group opacity={down ? 0.45 : 1} listening={false}>
        {card.frame !== 'standard' && (
          <Group scaleX={designWidth / CARD_WIDTH} scaleY={designHeight / CARD_HEIGHT}>
            <Ornaments frame={card.frame} />
          </Group>
        )}
        {boss && <Rect x={8} y={8} width={designWidth - 16} height={designHeight - 16} cornerRadius={12} stroke={theme.edge[1]} strokeWidth={1.5} />}
        {/* Işık çerçevesinin zemini açık; taç koyu tonla çizilmezse kaybolur. */}
        {boss && <Path data={CROWN_PATH} x={(designWidth - CARD_WIDTH) / 2} fill={card.frame === 'radiant' ? theme.edge[1] : theme.edge[0]} stroke={card.frame === 'radiant' ? theme.name : theme.edge[1]} strokeWidth={2} />}

        <Rect x={frame.x} y={frame.y} width={frame.width} height={frame.height} cornerRadius={12} fill={palette.bgDeep} />
        <Group clipFunc={roundedClip(frame.x, frame.y, frame.width, frame.height, 12)}>
          {picture !== undefined && (
            <KonvaImage image={picture} x={frame.x} y={frame.y} width={frame.width} height={frame.height} crop={coverCrop(picture, frame.width, frame.height)} />
          )}
          {missing && (
            <Text x={frame.x} y={frame.y} width={frame.width} height={frame.height} padding={12} align="center" verticalAlign="middle" text="görsel bulunamadı" fontFamily={palette.fontBody} fontSize={24} fill={palette.textMuted} />
          )}
        </Group>
        <Rect
          x={frame.x}
          y={frame.y}
          width={frame.width}
          height={frame.height}
          cornerRadius={12}
          strokeLinearGradientStartPoint={{ x: 0, y: 0 }}
          strokeLinearGradientEndPoint={{ x: 0, y: frame.height }}
          strokeLinearGradientColorStops={[0, theme.edge[0], 1, theme.edge[1]]}
          strokeWidth={5}
        />

        <Rect
          x={badgeX}
          y={badgeY}
          width={116}
          height={40}
          cornerRadius={20}
          fillLinearGradientStartPoint={{ x: 0, y: 0 }}
          fillLinearGradientEndPoint={{ x: 0, y: 40 }}
          fillLinearGradientColorStops={[0, theme.badge[0], 1, theme.badge[1]]}
          stroke={theme.edge[1]}
          strokeWidth={1.5}
        />
        <Text x={badgeX} y={badgeY} width={116} height={40} align="center" verticalAlign="middle" text={`${card.level} LVL`} fontFamily={palette.fontBody} fontSize={23} fontStyle="700" fill={theme.badgeText} />

        <Text
          x={16}
          y={nameY}
          width={nameWidth}
          height={46}
          align="center"
          verticalAlign="middle"
          text={card.name}
          fontFamily={palette.fontHeading}
          fontSize={nameFontSize(card.name, palette.fontHeading, nameWidth)}
          fontStyle="700"
          fill={theme.name}
          wrap="none"
          ellipsis
        />

        <Rect x={32} y={hpY} width={designWidth - 64} height={46} cornerRadius={12} fill={theme.hpBack} stroke={theme.edge[1]} strokeWidth={1.5} />
        <Path data={HEART_PATH} x={40} y={hpY + 7} scaleX={1.3} scaleY={1.3} fill={down ? palette.textMuted : theme.heart} />
        <Text x={76} y={hpY} width={50} height={46} verticalAlign="middle" text="CAN" fontFamily={palette.fontBody} fontSize={17} fontStyle="700" fill={theme.hpText} />
        <Text
          x={118}
          y={hpY}
          width={designWidth - 160}
          height={46}
          align="right"
          verticalAlign="middle"
          text={hpText}
          fontFamily={palette.fontBody}
          fontSize={hpText.length > 7 ? 21 : 28}
          fontStyle="700"
          fill={theme.hpText}
        />
      </Group>
    </Group>
  )
})
