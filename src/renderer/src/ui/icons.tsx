/**
 * Uygulamanın bütün simgeleri. Dışarıdan simge kütüphanesi yok; hepsi 24x24 çizgi simge
 * ve rengini bulunduğu yazıdan (`currentColor`) alır.
 */
import type { JSX, ReactNode } from 'react'

export interface IconProps {
  /** Kenar uzunluğu (piksel). Varsayılan 20. */
  size?: number
  /** 24 birimlik çizim alanına göre çizgi kalınlığı. Büyük boyutlarda inceltmek için. */
  strokeWidth?: number
  className?: string
}

const DEFAULT_SIZE = 20
const DEFAULT_STROKE = 1.8

function Svg({ size = DEFAULT_SIZE, strokeWidth = DEFAULT_STROKE, className, children }: IconProps & { children: ReactNode }): JSX.Element {
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {children}
    </svg>
  )
}

export function PlusIcon(props: IconProps): JSX.Element {
  return (
    <Svg {...props}>
      <path d="M12 5v14M5 12h14" />
    </Svg>
  )
}

export function MinusIcon(props: IconProps): JSX.Element {
  return (
    <Svg {...props}>
      <path d="M5 12h14" />
    </Svg>
  )
}

export function TrashIcon(props: IconProps): JSX.Element {
  return (
    <Svg {...props}>
      <path d="M4 7h16" />
      <path d="M9 7V4.5h6V7" />
      <path d="M6.5 7l1 12.5h9l1-12.5" />
      <path d="M10 11v5M14 11v5" />
    </Svg>
  )
}

export function UploadIcon(props: IconProps): JSX.Element {
  return (
    <Svg {...props}>
      <path d="M12 15V4" />
      <path d="M7.5 8.5 12 4l4.5 4.5" />
      <path d="M4 15v3.5A1.5 1.5 0 0 0 5.5 20h13a1.5 1.5 0 0 0 1.5-1.5V15" />
    </Svg>
  )
}

/** Kutudan dışarı çıkan ok: dışa aktarma. */
export function ExportIcon(props: IconProps): JSX.Element {
  return (
    <Svg {...props}>
      <path d="M14 4h6v6" />
      <path d="M20 4l-8.5 8.5" />
      <path d="M18 14v4.5a1.5 1.5 0 0 1-1.5 1.5h-11A1.5 1.5 0 0 1 4 18.5v-11A1.5 1.5 0 0 1 5.5 6H10" />
    </Svg>
  )
}

/** Kutunun içine giren ok: içe aktarma. */
export function ImportIcon(props: IconProps): JSX.Element {
  return (
    <Svg {...props}>
      <path d="M11.5 6.5v6h6" />
      <path d="M20 4l-8.5 8.5" />
      <path d="M18 14v4.5a1.5 1.5 0 0 1-1.5 1.5h-11A1.5 1.5 0 0 1 4 18.5v-11A1.5 1.5 0 0 1 5.5 6H8" />
    </Svg>
  )
}

export function CloseIcon(props: IconProps): JSX.Element {
  return (
    <Svg {...props}>
      <path d="M6 6l12 12M18 6 6 18" />
    </Svg>
  )
}

export function CheckIcon(props: IconProps): JSX.Element {
  return (
    <Svg {...props}>
      <path d="M5 12.5l4.5 4.5L19 7.5" />
    </Svg>
  )
}

export function ArrowUpIcon(props: IconProps): JSX.Element {
  return (
    <Svg {...props}>
      <path d="M12 19V5" />
      <path d="M6 11l6-6 6 6" />
    </Svg>
  )
}

/** Saat yönünde döndürme. */
export function RotateIcon(props: IconProps): JSX.Element {
  return (
    <Svg {...props}>
      <path d="M20 12a8 8 0 1 1-2.6-5.9" />
      <path d="M20 4v5h-5" />
    </Svg>
  )
}

export function ArrowDownIcon(props: IconProps): JSX.Element {
  return (
    <Svg {...props}>
      <path d="M12 5v14" />
      <path d="M6 13l6 6 6-6" />
    </Svg>
  )
}

/** Öne getir: dolu kare üstte. */
export function BringToFrontIcon(props: IconProps): JSX.Element {
  return (
    <Svg {...props}>
      <path d="M15 9h4.5A1.5 1.5 0 0 1 21 10.5v9a1.5 1.5 0 0 1-1.5 1.5h-9A1.5 1.5 0 0 1 9 19.5V15" />
      <rect x="3" y="3" width="12" height="12" rx="1.5" fill="currentColor" fillOpacity="0.35" />
    </Svg>
  )
}

/** Arkaya gönder: dolu kare altta kalır. */
export function SendToBackIcon(props: IconProps): JSX.Element {
  return (
    <Svg {...props}>
      <path
        d="M9 15H4.5A1.5 1.5 0 0 1 3 13.5v-9A1.5 1.5 0 0 1 4.5 3h9A1.5 1.5 0 0 1 15 4.5V9H9z"
        fill="currentColor"
        fillOpacity="0.35"
      />
      <rect x="9" y="9" width="12" height="12" rx="1.5" />
    </Svg>
  )
}

export function PencilIcon(props: IconProps): JSX.Element {
  return (
    <Svg {...props}>
      <path d="M4 20l1-4L16.5 4.5a2.12 2.12 0 0 1 3 3L8 19l-4 1z" />
      <path d="M14.5 6.5l3 3" />
    </Svg>
  )
}

export function EraserIcon(props: IconProps): JSX.Element {
  return (
    <Svg {...props}>
      <path d="M10 20 4.3 14.3a1.6 1.6 0 0 1 0-2.3l7.7-7.7a1.6 1.6 0 0 1 2.3 0l5.4 5.4a1.6 1.6 0 0 1 0 2.3L12 20" />
      <path d="M8.2 8.2l7.6 7.6" />
      <path d="M7 20h13" />
    </Svg>
  )
}

/** Fare imleci (Fare aracı). */
export function CursorIcon(props: IconProps): JSX.Element {
  return (
    <Svg {...props}>
      <path d="M5 3l14 7.5-6 2-2 6L5 3z" />
    </Svg>
  )
}

/** d20: önden görünen yirmi yüzlü. İç çizgiler küçük boyutta boğulmasın diye incedir. */
export function DiceIcon(props: IconProps): JSX.Element {
  const inner = (props.strokeWidth ?? DEFAULT_STROKE) * 0.55
  return (
    <Svg {...props}>
      <path
        d="M12 2.5v3.9M16.85 14.8l3.35 1.95M7.15 14.8 3.8 16.75M12 6.4 3.8 7.25M12 6.4l8.2.85M7.15 14.8 3.8 7.25M7.15 14.8 12 21.5M16.85 14.8l3.35-7.55M16.85 14.8 12 21.5"
        strokeWidth={inner}
        opacity="0.75"
      />
      <path d="M12 2.5 20.2 7.25v9.5L12 21.5l-8.2-4.75v-9.5L12 2.5z" />
      <path d="M12 6.4l4.85 8.4H7.15L12 6.4z" />
    </Svg>
  )
}

/** d10: kutbu yukarıda duran on yüzlü; ortadaki uçurtma öndeki yüzdür. */
export function D10Icon(props: IconProps): JSX.Element {
  const inner = (props.strokeWidth ?? DEFAULT_STROKE) * 0.55
  return (
    <Svg {...props}>
      <path d="M16.7 12.6 20.6 13.6M7.3 12.6 3.4 13.6M12 15.9v5.6" strokeWidth={inner} opacity="0.75" />
      <path d="M12 2.5 20.6 10.9v2.7L12 21.5l-8.6-7.9v-2.7L12 2.5z" />
      <path d="M12 2.5 16.7 12.6 12 15.9 7.3 12.6 12 2.5z" />
    </Svg>
  )
}

/** d4: yandan görünen piramit; ortadaki çizgi öndeki kenardır. */
export function D4Icon(props: IconProps): JSX.Element {
  return (
    <Svg {...props}>
      <path d="M12 3 2.8 16.6 10.2 21l11-4.4L12 3z" />
      <path d="M12 3 10.2 21" />
    </Svg>
  )
}

export function FullscreenIcon(props: IconProps): JSX.Element {
  return (
    <Svg {...props}>
      <path d="M4 9V4h5M15 4h5v5M20 15v5h-5M9 20H4v-5" />
    </Svg>
  )
}

export function FolderIcon(props: IconProps): JSX.Element {
  return (
    <Svg {...props}>
      <path d="M3 6.5A1.5 1.5 0 0 1 4.5 5h4.6l2 2.5h8.4A1.5 1.5 0 0 1 21 9v9a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 18V6.5z" />
    </Svg>
  )
}

export function HeartIcon({ filled = false, ...props }: IconProps & { filled?: boolean }): JSX.Element {
  return (
    <Svg {...props}>
      <path
        d="M12 20.5 4.6 13a4.88 4.88 0 0 1 6.9-6.9l.5.5.5-.5a4.88 4.88 0 0 1 6.9 6.9L12 20.5z"
        fill={filled ? 'currentColor' : 'none'}
      />
    </Svg>
  )
}

export function WarningIcon(props: IconProps): JSX.Element {
  return (
    <Svg {...props}>
      <path d="M12 3.5 21.5 20h-19L12 3.5z" />
      <path d="M12 10v4.5M12 17.2v.1" />
    </Svg>
  )
}

export function InfoIcon(props: IconProps): JSX.Element {
  return (
    <Svg {...props}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 11v5.5M12 7.6v.1" />
    </Svg>
  )
}

export function ChevronLeftIcon(props: IconProps): JSX.Element {
  return (
    <Svg {...props}>
      <path d="M15 5l-7 7 7 7" />
    </Svg>
  )
}

export function ChevronRightIcon(props: IconProps): JSX.Element {
  return (
    <Svg {...props}>
      <path d="M9 5l7 7-7 7" />
    </Svg>
  )
}

export function ChevronUpIcon(props: IconProps): JSX.Element {
  return (
    <Svg {...props}>
      <path d="M5 15l7-7 7 7" />
    </Svg>
  )
}

export function ChevronDownIcon(props: IconProps): JSX.Element {
  return (
    <Svg {...props}>
      <path d="M5 9l7 7 7-7" />
    </Svg>
  )
}

export function EyeOffIcon(props: IconProps): JSX.Element {
  return (
    <Svg {...props}>
      <path d="M10.6 6.15A9.7 9.7 0 0 1 12 6c5.5 0 9 6 9 6a15.8 15.8 0 0 1-2.9 3.5" />
      <path d="M6.5 7.7A15.4 15.4 0 0 0 3 12s3.5 6 9 6a8.9 8.9 0 0 0 4-.95" />
      <path d="M9.9 9.9a3 3 0 0 0 4.2 4.2" />
      <path d="M3 3l18 18" />
    </Svg>
  )
}

export function ImageIcon(props: IconProps): JSX.Element {
  return (
    <Svg {...props}>
      <rect x="3" y="4.5" width="18" height="15" rx="2" />
      <circle cx="8.5" cy="9.5" r="1.5" />
      <path d="M21 15.5l-5-5-9 9" />
    </Svg>
  )
}

/** Dosyası bulunamayan ya da açılamayan görsel. */
export function ImageOffIcon(props: IconProps): JSX.Element {
  return (
    <Svg {...props}>
      <path d="M8 4.5h11a2 2 0 0 1 2 2v11" />
      <path d="M19 19.5H5a2 2 0 0 1-2-2v-11a2 2 0 0 1 .6-1.4" />
      <path d="M21 15.5l-5-5-1.8 1.8M11 15.5l-4 4" />
      <path d="M3 3l18 18" />
    </Svg>
  )
}

export function PlayIcon(props: IconProps): JSX.Element {
  return (
    <Svg {...props}>
      <path d="M7 4.5v15l12-7.5L7 4.5z" fill="currentColor" fillOpacity="0.25" />
    </Svg>
  )
}

/** Ayarlar. */
export function SlidersIcon(props: IconProps): JSX.Element {
  return (
    <Svg {...props}>
      <path d="M4 7h9M17 7h3M4 12h3M11 12h9M4 17h11M19 17h1" />
      <circle cx="15" cy="7" r="2" />
      <circle cx="9" cy="12" r="2" />
      <circle cx="17" cy="17" r="2" />
    </Svg>
  )
}

/** Çıkış. */
export function ExitIcon(props: IconProps): JSX.Element {
  return (
    <Svg {...props}>
      <path d="M10 4H5.5A1.5 1.5 0 0 0 4 5.5v13A1.5 1.5 0 0 0 5.5 20H10" />
      <path d="M15 8l4 4-4 4" />
      <path d="M19 12H9" />
    </Svg>
  )
}

export function MonitorIcon(props: IconProps): JSX.Element {
  return (
    <Svg {...props}>
      <rect x="3" y="4" width="18" height="12" rx="1.5" />
      <path d="M8 20h8M12 16v4" />
    </Svg>
  )
}
