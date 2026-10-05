import { describe, expect, it } from 'vitest'
import { DisplayLike, describeDisplays, pickControlDisplay, pickGameDisplay, planGameWindows } from '../../src/main/displays'

/** Görev çubuğu için alttan 40 birim ayrılmış monitör. */
function display(id: number, x: number, width: number, height: number, scaleFactor = 1): DisplayLike {
  return {
    id,
    bounds: { x, y: 0, width, height },
    workArea: { x, y: 0, width, height: height - 40 },
    scaleFactor
  }
}

const primary = display(1, 0, 2560, 1440)
const secondary = display(2, 2560, 1920, 1080)
const third = display(3, -1920, 1920, 1080)

describe('pickGameDisplay', () => {
  it('seçilen monitör takılıysa onu kullanır', () => {
    expect(pickGameDisplay([primary, secondary], 1, 1).id).toBe(1)
    expect(pickGameDisplay([primary, secondary, third], 1, 3).id).toBe(3)
  })

  it('seçim yoksa en büyük monitörü seçer (ana olsun olmasın)', () => {
    expect(pickGameDisplay([primary, secondary], 1, null).id).toBe(1)
    expect(pickGameDisplay([secondary, primary], 1, null).id).toBe(1)
    // Büyük monitör ana değilken de o seçilir.
    expect(pickGameDisplay([primary, secondary], 2, null).id).toBe(1)
  })

  it('monitörler eşit büyüklükteyse ana olmayanı seçer', () => {
    expect(pickGameDisplay([secondary, third], 2, null).id).toBe(3)
    expect(pickGameDisplay([third, secondary], 2, null).id).toBe(3)
  })

  it('büyüklük karşılaştırması fiziksel pikselle yapılır', () => {
    // 1280x720 mantıksal ama %200 ölçekli monitör aslında 2560x1440'tır.
    const scaled = display(5, 0, 1280, 720, 2)
    expect(pickGameDisplay([scaled, secondary], 2, null).id).toBe(5)
  })

  it('seçilen monitör artık yoksa otomatik seçime düşer', () => {
    expect(pickGameDisplay([primary, secondary], 1, 99).id).toBe(1)
  })

  it('tek monitörde ana monitörü kullanır', () => {
    expect(pickGameDisplay([primary], 1, null).id).toBe(1)
    expect(pickGameDisplay([primary], 1, 99).id).toBe(1)
  })
})

describe('pickControlDisplay', () => {
  it('oyun başka monitördeyse ana monitörü kullanır', () => {
    expect(pickControlDisplay([primary, secondary], 1, secondary).id).toBe(1)
    expect(pickControlDisplay([primary, secondary, third], 1, third).id).toBe(1)
  })

  it('oyun ana monitördeyse başka bir monitöre geçer', () => {
    expect(pickControlDisplay([primary, secondary], 1, primary).id).toBe(2)
  })

  it('tek monitörde oyunla aynı monitörde kalır', () => {
    expect(pickControlDisplay([primary], 1, primary).id).toBe(1)
  })

  it('açıkça seçilen monitörü kullanır, oyunla aynı olsa bile', () => {
    expect(pickControlDisplay([primary, secondary, third], 1, primary, 3).id).toBe(3)
    expect(pickControlDisplay([primary, secondary], 1, primary, 1).id).toBe(1)
  })

  it('seçilen monitör artık yoksa otomatik seçime düşer', () => {
    expect(pickControlDisplay([primary, secondary], 1, primary, 99).id).toBe(2)
  })
})

describe('planGameWindows', () => {
  it('iki monitörde pencereleri ayrı monitörlere koyar', () => {
    const plan = planGameWindows([primary, secondary], 1, { gameDisplayId: null, controlDisplayId: null, gameFullscreen: true })
    expect(plan.shared).toBe(false)
    // Otomatik: oyun ekranı büyük monitörde (2560x1440), kontrol paneli diğerinde.
    expect(plan.game.display.id).toBe(1)
    expect(plan.game.fullscreen).toBe(true)
    expect(plan.control.display.id).toBe(2)
    expect(plan.control.maximize).toBe(true)

    // Tam ekrandan çıkınca dönülecek pencere oyun monitörünün içinde ve 16:9 olmalı.
    const { x, y, width, height } = plan.game.bounds
    expect(x).toBeGreaterThanOrEqual(primary.workArea.x)
    expect(x + width).toBeLessThanOrEqual(primary.workArea.x + primary.workArea.width)
    expect(y + height).toBeLessThanOrEqual(primary.workArea.height)
    expect(width / height).toBeCloseTo(16 / 9, 1)

    const control = plan.control.bounds
    expect(control.x).toBeGreaterThanOrEqual(secondary.workArea.x)
    expect(control.x + control.width).toBeLessThanOrEqual(secondary.workArea.x + secondary.workArea.width)
  })

  it('iki monitör de elle seçilebilir', () => {
    const plan = planGameWindows([primary, secondary], 1, { gameDisplayId: 2, controlDisplayId: 1, gameFullscreen: true })
    expect(plan.game.display.id).toBe(2)
    expect(plan.control.display.id).toBe(1)
    expect(plan.shared).toBe(false)
  })

  it('ikisi için aynı monitör seçilirse pencereler yan yana açılır', () => {
    const plan = planGameWindows([primary, secondary], 1, { gameDisplayId: 1, controlDisplayId: 1, gameFullscreen: false })
    expect(plan.shared).toBe(true)
    expect(plan.control.maximize).toBe(false)
    expect(plan.game.bounds.x + plan.game.bounds.width).toBeLessThanOrEqual(plan.control.bounds.x)
  })

  it('tam ekran ayarını olduğu gibi aktarır', () => {
    expect(planGameWindows([primary, secondary], 1, { gameDisplayId: null, controlDisplayId: null, gameFullscreen: false }).game.fullscreen).toBe(false)
    expect(planGameWindows([primary], 1, { gameDisplayId: null, controlDisplayId: null, gameFullscreen: true }).game.fullscreen).toBe(true)
  })

  it('tek monitörde pencereleri çakışmadan yan yana koyar', () => {
    const plan = planGameWindows([secondary], 2, { gameDisplayId: null, controlDisplayId: null, gameFullscreen: false })
    const area = secondary.workArea
    expect(plan.shared).toBe(true)
    expect(plan.control.maximize).toBe(false)
    expect(plan.game.bounds.x).toBe(area.x)
    expect(plan.game.bounds.x + plan.game.bounds.width).toBe(plan.control.bounds.x)
    expect(plan.game.bounds.width + plan.control.bounds.width).toBe(area.width)
    expect(plan.game.bounds.height).toBe(area.height)
    expect(plan.control.bounds.height).toBe(area.height)
    expect(plan.control.bounds.width).toBeGreaterThanOrEqual(420)
    expect(plan.game.bounds.width).toBeGreaterThan(plan.control.bounds.width)
  })

  it('küçük monitörde kontrol paneli ekranın yarısını aşmaz', () => {
    const small = display(7, 0, 800, 600)
    const plan = planGameWindows([small], 7, { gameDisplayId: null, controlDisplayId: null, gameFullscreen: false })
    expect(plan.control.bounds.width).toBe(400)
    expect(plan.game.bounds.width).toBe(400)
  })
})

describe('describeDisplays', () => {
  it('monitörleri soldan sağa numaralar ve ana monitörü işaretler', () => {
    expect(describeDisplays([primary, secondary, third], 1)).toEqual([
      { id: 3, label: '1: 1920x1080', width: 1920, height: 1080, primary: false },
      { id: 1, label: '2: 2560x1440 (ana)', width: 2560, height: 1440, primary: true },
      { id: 2, label: '3: 1920x1080', width: 1920, height: 1080, primary: false }
    ])
  })

  it('ölçekli monitörde fiziksel çözünürlüğü gösterir', () => {
    const scaled = display(5, 0, 2048, 1152, 1.25)
    expect(describeDisplays([scaled], 5)).toEqual([{ id: 5, label: '1: 2560x1440 (ana)', width: 2560, height: 1440, primary: true }])
  })
})
