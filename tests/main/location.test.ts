import fs from 'node:fs'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  CONFIG_FILE_NAME,
  DATA_FOLDER_NAME,
  canCreateIn,
  copyDataDir,
  countImages,
  detectCloud,
  ensureWritable,
  hasSaveData,
  isInside,
  listFiles,
  readConfig,
  resolveStartLocation,
  samePath,
  targetFor,
  writeConfig
} from '../../src/main/location'
import { makeTempDir, removeTempDir } from './helpers'

let dir: string

beforeEach(() => {
  dir = makeTempDir()
})

afterEach(() => {
  removeTempDir(dir)
})

/** İçinde kayıt, yedek, iki görsel ve bir log olan örnek kayıt klasörü. */
function makeSave(root: string): void {
  fs.mkdirSync(path.join(root, 'gorseller'), { recursive: true })
  fs.mkdirSync(path.join(root, 'log'), { recursive: true })
  fs.writeFileSync(path.join(root, 'kayit.json'), '{"schema":1}')
  fs.writeFileSync(path.join(root, 'kayit.yedek.json'), '{"schema":1}')
  fs.writeFileSync(path.join(root, 'gorseller', 'a.png'), Buffer.alloc(1200, 1))
  fs.writeFileSync(path.join(root, 'gorseller', 'b.webp'), Buffer.alloc(300, 2))
  fs.writeFileSync(path.join(root, 'log', 'dndoynatma-2026-10-05.log'), 'satır\n')
  fs.writeFileSync(path.join(root, 'zar.json'), '[]')
}

describe('ayar dosyası', () => {
  it('yazılan klasörü geri okur', () => {
    const file = path.join(dir, 'ayarlar', CONFIG_FILE_NAME)
    writeConfig(file, { dataDir: path.join(dir, 'kayit') })
    expect(readConfig(file)).toEqual({ dataDir: path.join(dir, 'kayit') })
    expect(fs.existsSync(`${file}.tmp`)).toBe(false)
  })

  it('dosya yoksa, bozuksa ya da klasör yolu geçersizse null döner', () => {
    const file = path.join(dir, CONFIG_FILE_NAME)
    expect(readConfig(file)).toBeNull()
    fs.writeFileSync(file, '{bozuk')
    expect(readConfig(file)).toBeNull()
    fs.writeFileSync(file, '[]')
    expect(readConfig(file)).toEqual(null)
    fs.writeFileSync(file, JSON.stringify({ dataDir: 'goreli/yol' }))
    expect(readConfig(file)).toBeNull()
    fs.writeFileSync(file, JSON.stringify({ dataDir: '   ' }))
    expect(readConfig(file)).toBeNull()
    fs.writeFileSync(file, JSON.stringify({ dataDir: 42 }))
    expect(readConfig(file)).toBeNull()
  })

  it('başında BOM olan dosyayı da okur', () => {
    const file = path.join(dir, CONFIG_FILE_NAME)
    fs.writeFileSync(file, `\uFEFF${JSON.stringify({ dataDir: dir })}`)
    expect(readConfig(file)).toEqual({ dataDir: dir })
  })
})

describe('yol karşılaştırma', () => {
  it('büyük/küçük harf ve sondaki ayraç farkını yok sayar', () => {
    expect(samePath(dir, dir.toUpperCase())).toBe(true)
    expect(samePath(dir, dir + path.sep)).toBe(true)
    expect(samePath(dir, path.join(dir, 'alt'))).toBe(false)
  })

  it('iç içe klasörleri tanır; benzer adlı kardeş klasörü iç saymaz', () => {
    expect(isInside(path.join(dir, 'a', 'b'), dir)).toBe(true)
    expect(isInside(dir, dir)).toBe(true)
    expect(isInside(dir, path.join(dir, 'a'))).toBe(false)
    expect(isInside(`${dir}-yan`, dir)).toBe(false)
  })
})

describe('targetFor', () => {
  it('seçilen yerin içine uygulamanın klasörünü ekler', () => {
    expect(targetFor(dir)).toBe(path.join(dir, DATA_FOLDER_NAME))
  })

  it('kayıt klasörünün kendisi seçildiyse iç içe ikinci klasör açmaz', () => {
    const chosen = path.join(dir, DATA_FOLDER_NAME)
    expect(targetFor(chosen)).toBe(chosen)
    expect(targetFor(path.join(dir, DATA_FOLDER_NAME.toUpperCase()))).toBe(path.join(dir, DATA_FOLDER_NAME.toUpperCase()))
  })

  it('içinde kayıt olan başka adlı klasör seçildiyse onu kullanır', () => {
    const old = path.join(dir, 'Eski Kayıt')
    makeSave(old)
    expect(targetFor(old)).toBe(old)
  })
})

describe('hasSaveData / countImages', () => {
  it('boş ya da olmayan klasörde kayıt yoktur', () => {
    expect(hasSaveData(dir)).toBe(false)
    expect(hasSaveData(path.join(dir, 'yok'))).toBe(false)
    expect(countImages(path.join(dir, 'yok'))).toBe(0)
  })

  it('kayıt dosyası, yedek ya da görsel varsa kayıt vardır', () => {
    const onlyBackup = path.join(dir, 'yedekli')
    fs.mkdirSync(onlyBackup)
    fs.writeFileSync(path.join(onlyBackup, 'kayit.yedek.json'), '{}')
    expect(hasSaveData(onlyBackup)).toBe(true)

    const onlyImages = path.join(dir, 'gorselli')
    fs.mkdirSync(path.join(onlyImages, 'gorseller'), { recursive: true })
    expect(hasSaveData(onlyImages)).toBe(false)
    fs.writeFileSync(path.join(onlyImages, 'gorseller', 'x.png'), 'x')
    expect(hasSaveData(onlyImages)).toBe(true)
    expect(countImages(onlyImages)).toBe(1)
  })

  it('yalnızca log ya da boş klasörler kayıt sayılmaz', () => {
    fs.mkdirSync(path.join(dir, 'log'))
    fs.writeFileSync(path.join(dir, 'log', 'x.log'), 'x')
    expect(hasSaveData(dir)).toBe(false)
  })
})

describe('detectCloud', () => {
  it('OneDrive kökünü ortam değişkeninden tanır', () => {
    const root = path.join(dir, 'Bulut')
    expect(detectCloud(path.join(root, 'Belgeler', 'DndOynatma'), { OneDrive: root })).toBe('OneDrive')
    expect(detectCloud(path.join(dir, 'Yerel'), { OneDrive: root })).toBeNull()
  })

  it('bilinen klasör adlarından tanır', () => {
    expect(detectCloud('C:\\Users\\biri\\OneDrive\\Belgeler\\DndOynatma', {})).toBe('OneDrive')
    expect(detectCloud('C:\\Users\\biri\\OneDrive - Şirket\\Kayıt', {})).toBe('OneDrive')
    expect(detectCloud('D:\\Dropbox\\Oyun', {})).toBe('Dropbox')
    expect(detectCloud('G:\\My Drive\\Oyun', {})).toBe('Google Drive')
    expect(detectCloud('C:\\Users\\biri\\iCloudDrive\\Oyun', {})).toBe('iCloud')
  })

  it('yerel klasörde null döner; ad benzerliği yetmez', () => {
    expect(detectCloud('C:\\Users\\biri\\DndOynatma-Kayit', {})).toBeNull()
    expect(detectCloud('C:\\OneDriveYedek\\Kayıt', {})).toBeNull()
  })
})

describe('yazılabilirlik', () => {
  it('klasörü oluşturur ve deneme dosyasını geride bırakmaz', () => {
    const target = path.join(dir, 'a', 'b')
    expect(ensureWritable(target)).toBe(true)
    expect(fs.readdirSync(target)).toEqual([])
  })

  it('dosyanın altına klasör açılamaz', () => {
    const file = path.join(dir, 'dosya.txt')
    fs.writeFileSync(file, 'x')
    expect(ensureWritable(path.join(file, 'alt'))).toBe(false)
    expect(canCreateIn(path.join(file, 'alt'))).toBe(false)
  })

  it('henüz olmayan hedef için var olan en yakın üst klasöre bakar', () => {
    expect(canCreateIn(path.join(dir, 'olmayan', 'daha', 'derin'))).toBe(true)
    expect(fs.existsSync(path.join(dir, 'olmayan'))).toBe(false)
  })
})

describe('copyDataDir', () => {
  it('bütün dosyaları alt klasörleriyle kopyalar ve kaynağa dokunmaz', () => {
    const from = path.join(dir, 'eski')
    const to = path.join(dir, 'yeni', DATA_FOLDER_NAME)
    makeSave(from)
    const before = listFiles(from)

    const report = copyDataDir(from, to)
    expect(report.files).toBe(6)
    expect(report.bytes).toBe(before.reduce((sum, file) => sum + file.size, 0))
    expect(listFiles(to)).toEqual(before)
    expect(listFiles(from)).toEqual(before)
    expect(fs.readFileSync(path.join(to, 'gorseller', 'a.png')).equals(fs.readFileSync(path.join(from, 'gorseller', 'a.png')))).toBe(true)
  })

  it('çalışma işaretini ve yarım kalmış yazmaları taşımaz', () => {
    const from = path.join(dir, 'eski')
    const to = path.join(dir, 'yeni')
    makeSave(from)
    fs.writeFileSync(path.join(from, 'calisiyor.kilit'), '')
    fs.writeFileSync(path.join(from, 'kayit.json.tmp'), 'yarım')
    copyDataDir(from, to)
    expect(fs.existsSync(path.join(to, 'calisiyor.kilit'))).toBe(false)
    expect(fs.existsSync(path.join(to, 'kayit.json.tmp'))).toBe(false)
    expect(fs.existsSync(path.join(to, 'kayit.json'))).toBe(true)
  })

  it('hedefte var olan dosyaların üzerine yazar, fazladan dosyaya dokunmaz', () => {
    const from = path.join(dir, 'eski')
    const to = path.join(dir, 'yeni')
    makeSave(from)
    fs.mkdirSync(to)
    fs.writeFileSync(path.join(to, 'kayit.json'), 'eski içerik')
    fs.writeFileSync(path.join(to, 'baska.txt'), 'kalmalı')
    copyDataDir(from, to)
    expect(fs.readFileSync(path.join(to, 'kayit.json'), 'utf8')).toBe('{"schema":1}')
    expect(fs.readFileSync(path.join(to, 'baska.txt'), 'utf8')).toBe('kalmalı')
  })

  it('kaynak klasör yoksa fırlatır', () => {
    expect(() => copyDataDir(path.join(dir, 'yok'), path.join(dir, 'yeni'))).toThrow()
  })
})

describe('resolveStartLocation', () => {
  const configFile = (): string => path.join(dir, 'ayar', CONFIG_FILE_NAME)

  it('DND_DATA_DIR verilmişse onu kullanır ve sabit sayar', () => {
    const override = path.join(dir, 'deneme')
    expect(resolveStartLocation(configFile(), { DND_DATA_DIR: override })).toEqual({ kind: 'ready', dataDir: override, fixed: true })
  })

  it('ayar dosyası yoksa ilk açılıştır', () => {
    expect(resolveStartLocation(configFile(), {})).toEqual({ kind: 'setup', reason: 'first-run', missingDir: null })
  })

  it('ayardaki klasör yerindeyse onu kullanır', () => {
    const data = path.join(dir, DATA_FOLDER_NAME)
    fs.mkdirSync(data)
    writeConfig(configFile(), { dataDir: data })
    expect(resolveStartLocation(configFile(), {})).toEqual({ kind: 'ready', dataDir: data, fixed: false })
  })

  it('ayardaki klasör yoksa yenisini açmaz, "bulunamadı" der', () => {
    const data = path.join(dir, 'takili-olmayan-disk', DATA_FOLDER_NAME)
    writeConfig(configFile(), { dataDir: data })
    expect(resolveStartLocation(configFile(), {})).toEqual({ kind: 'setup', reason: 'missing', missingDir: data })
    expect(fs.existsSync(data)).toBe(false)
  })

  it('ayardaki yol bir dosyaysa "bulunamadı" der', () => {
    const file = path.join(dir, 'dosya')
    fs.writeFileSync(file, 'x')
    writeConfig(configFile(), { dataDir: file })
    expect(resolveStartLocation(configFile(), {})).toMatchObject({ kind: 'setup', reason: 'missing' })
  })
})
