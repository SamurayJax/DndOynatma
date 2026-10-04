/**
 * Uygulanan işlemlerin log satırı. Yalnızca tür, kimlik ve sayılar yazılır;
 * isim, not ve etiket içerikleri loga hiçbir zaman girmez.
 */
import { Action } from '@shared/actions'

function id(value: unknown): string {
  return typeof value === 'string' ? value.slice(0, 64) : '?'
}

function num(value: unknown): string {
  return typeof value === 'number' && Number.isFinite(value) ? String(Math.round(value * 10) / 10) : '?'
}

function fields(patch: unknown): string {
  return typeof patch === 'object' && patch !== null ? Object.keys(patch).join(',') : '?'
}

function describe(action: Action): string {
  switch (action.type) {
    case 'player/update': {
      const parts = [`yuva=${num(action.slot)}`, `alanlar=${fields(action.patch)}`]
      if (action.patch.level !== undefined) parts.push(`seviye=${num(action.patch.level)}`)
      if (action.patch.portraitId !== undefined) parts.push(`portre=${action.patch.portraitId === null ? 'yok' : id(action.patch.portraitId)}`)
      return parts.join(' ')
    }
    case 'player/setHp':
      return `yuva=${num(action.slot)} can=${num(action.hp)}`
    case 'player/adjustHp':
      return `yuva=${num(action.slot)} fark=${num(action.delta)}`
    case 'player/clear':
      return `yuva=${num(action.slot)}`
    case 'library/add': {
      const kinds = [...new Set(action.images.map((image) => image.kind))].join(',')
      const ids = action.images.slice(0, 10).map((image) => id(image.id)).join(',')
      return `adet=${action.images.length} tür=${kinds} görseller=${ids}`
    }
    case 'library/remove':
      return `görsel=${id(action.imageId)}`
    case 'library/setKind':
      return `görsel=${id(action.imageId)} tür=${id(action.kind)}`
    case 'scene/add':
    case 'scene/remove':
    case 'scene/setActive':
    case 'stage/clearBackground':
    case 'stage/clearItems':
      return `pencere=${id(action.sceneId)}`
    case 'scene/update': {
      const parts = [`pencere=${id(action.sceneId)}`, `alanlar=${fields(action.patch)}`]
      if (action.patch.hotkey !== undefined) parts.push(`tuş=${action.patch.hotkey === null ? 'yok' : num(action.patch.hotkey)}`)
      return parts.join(' ')
    }
    case 'scene/activateHotkey':
      return `tuş=${num(action.hotkey)}`
    case 'stage/setBackground':
    case 'stage/addItem':
      return `pencere=${action.sceneId === undefined ? 'etkin' : id(action.sceneId)} öğe=${id(action.itemId)} görsel=${id(action.imageId)}`
    case 'stage/updateItem': {
      const { x, y, width, height, label } = action.patch
      const parts = [`pencere=${id(action.sceneId)}`, `öğe=${id(action.itemId)}`]
      if (x !== undefined) parts.push(`x=${num(x)}`)
      if (y !== undefined) parts.push(`y=${num(y)}`)
      if (width !== undefined) parts.push(`en=${num(width)}`)
      if (height !== undefined) parts.push(`boy=${num(height)}`)
      if (label !== undefined) parts.push('etiket=değişti')
      return parts.join(' ')
    }
    case 'stage/removeItem':
      return `pencere=${id(action.sceneId)} öğe=${id(action.itemId)}`
    case 'stage/reorderItem':
      return `pencere=${id(action.sceneId)} öğe=${id(action.itemId)} yön=${id(action.to)}`
    case 'note/setGeneral':
      return `uzunluk=${typeof action.text === 'string' ? action.text.length : '?'}`
    case 'settings/update': {
      const parts: string[] = []
      if (action.patch.gameDisplayId !== undefined) parts.push(`monitör=${action.patch.gameDisplayId === null ? 'otomatik' : num(action.patch.gameDisplayId)}`)
      if (action.patch.gameFullscreen !== undefined) parts.push(`tamEkran=${action.patch.gameFullscreen ? 'açık' : 'kapalı'}`)
      return parts.join(' ')
    }
    case 'session/setTool':
      return `araç=${id(action.tool)}`
    case 'session/clearDrawing':
      return ''
    default:
      return ''
  }
}

/** Örn. `player/setHp yuva=1 can=7`. Eksik alanlı işlemde bile hata fırlatmaz. */
export function describeAction(action: Action): string {
  const type = id((action as { type?: unknown }).type)
  try {
    const detail = describe(action)
    return detail ? `${type} ${detail}` : type
  } catch {
    return type
  }
}
