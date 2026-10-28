# Geliştirme Rehberi

Özelliklerin tanımı `PLAN.md` dosyasındadır. Bu dosya kodun nasıl düzenlendiğini anlatır.

## Mimari

Electron uygulaması; üç parça:

- **Ana süreç** (`src/main`): pencereleri açar, tek doğru durumu (state) tutar, diske kaydeder, log yazar.
- **Preload** (`src/preload`): arayüze `window.dnd` adıyla güvenli bir API sunar (`src/shared/ipc.ts` içindeki `DndApi`).
- **Arayüz** (`src/renderer`): React. Tek giriş noktası; pencerenin rolü adresteki `?role=` ile belirlenir:
  - `menu`: ana menü ve ayarlar
  - `game`: oyuncuların gördüğü oyun ekranı
  - `control`: DM'in kontrol paneli

### Durum akışı

1. Arayüz `window.dnd.dispatch(action)` çağırır (`src/shared/actions.ts`).
2. Ana süreç `reduce(state, action)` ile yeni durumu hesaplar (`src/shared/reducer.ts`, saf fonksiyon).
3. Ana süreç yeni durumu bütün pencerelere yayar ve diske kaydeder.
4. Arayüz `useAppState()` ile durumu okur; kendi kopyasını tutmaz.

Durum iki parçadır (`src/shared/types.ts`):

- `app` (`AppState`): kalıcı; `kayit.json`'a yazılır.
- `session` (`SessionState`): geçici; seçili araç, çizim sayacı, zar geçmişi.

Kalem çizimleri hiçbir duruma girmez; yalnızca oyun ekranı penceresinin belleğinde yaşar.

### Koordinatlar

Oyun ekranı 1920x1080 sanal uzayda çizilir ve pencereye sığacak şekilde ölçeklenir.
Solda portre sütunu (en az bir dolu profil varsa 300 birim), sağında oyun alanı.
Yerleşim hesapları `src/shared/layout.ts` içindedir.

### Görseller

Yüklenen dosyalar kayıt klasöründeki `gorseller/` altına kopyalanır. Arayüz bunları
`window.dnd.mediaUrl(fileName)` ile aldığı `dnd-media://gorsel/<dosya>` adresinden okur.

### Müzik

Ses dosyaları (müzik, ortam sesleri, MP4) kayıt klasöründeki `muzik/` altına kopyalanır ve
`window.dnd.soundUrl(fileName)` ile alınan `dnd-media://ses/<dosya>` adresinden okunur. Bu adres
parça parça (Range isteği, 206 yanıtı) sunulur; ileri-geri sarma ve büyük MP4'ler bununla çalışır.

- Liste, ortam sesleri, döngü aralıkları ve ses düzeyleri `app.music` içindedir (kayda girer).
- Çalan parça ve açık ortam sesleri `session.playback` içindedir (kayda girmez, oyun bitince sıfırlanır).
- Ses **oyun ekranında** çalar (`game/MusicPlayer.tsx`), çünkü Discord'da paylaşılan pencere odur.
  Kontrol paneli yalnızca `playback/…` işlemleri gönderir. Anlık konum duruma yazılmaz; oyun ekranı
  `window.dnd.music.sendStatus` ile gönderir, ana süreç yalnızca kontrol paneline iletir.
- Hareketli arka plan (`SceneWindow.videoTrackId`) oyun alanını kaplayan sessiz bir `<video>`dır
  (`game/SceneVideo.tsx`); Konva tuvali saydam olduğu için altında durur. Seçilen aralık her karede
  denetlenerek döndürülür; video kesilmez, dönüştürülmez.

### Kayıt klasörü

Kullanıcının seçtiği yerdeki `DndOynatma-Kayit` klasörü. Yeri, uygulamanın ayar klasöründeki
(`%APPDATA%\DndOynatma\ayar.json`) küçük bir dosyada tutulur; dosya yoksa ya da gösterdiği klasör
bulunamıyorsa açılışta kayıt klasörü penceresi (`setup` rolü) çıkar. İlgili kod: `src/main/location.ts`
(saf mantık), `src/main/setup.ts` (açılış penceresi), `src/main/relocate.ts` (seçme ve taşıma).

Testler ve denemeler için ortam değişkenleri:

| Değişken | İş |
|----------|----|
| `DND_DATA_DIR` | kayıt klasörünü doğrudan verir; soru sorulmaz, arayüzden değiştirilemez |
| `DND_CONFIG_DIR` | `ayar.json` dosyasının duracağı klasör |
| `DND_LEGACY_DIR` | eski kayıt klasörü (varsayılan `Belgeler\DndOynatma`) |
| `DND_HOME_DIR` | kayıt klasörü için önerilen üst klasör |
| `DND_NO_RELAUNCH` | klasör değiştirildikten sonra uygulama yeniden başlatılmaz, yalnızca kapanır |

| Dosya | İçerik |
|-------|--------|
| `kayit.json` | kalıcı durum |
| `kayit.yedek.json` | bir önceki sağlam kayıt |
| `gorseller/` | yüklenen görseller |
| `muzik/` | yüklenen müzikler, ortam sesleri ve MP4'ler |
| `zar.json` | aktif oyunun zar atışları |
| `log/` | günlük log dosyaları |

## Klasör yapısı

```
src/shared/     ortak tipler, işlemler, reducer, yerleşim, hata kodları, IPC sözleşmesi
src/main/       ana süreç
src/preload/    window.dnd köprüsü
src/renderer/   arayüz
  src/lib/        useAppState, ortak yardımcılar
  src/ui/         ortak arayüz parçaları (düğme, panel, sekme, bildirim)
  src/menu/       ana menü
  src/settings/   ayarlar: oyuncu profilleri (ve kartları dışa / içe aktarma), pencereler
  src/library/    kütüphane paneli (ayarlarda ve kontrol panelinde kullanılır)
  src/game/       oyun ekranı: portre sütunu, oyun alanı, çizim, zar animasyonu
    dice/           zarlar: biçim (geometry), fizik, atış planı, çizim; üç zar aynı kodu kullanır
  src/control/    kontrol paneli (üst sekmeler: Kontrol Paneli, Müzik)
  src/music/      kontrol panelinin Müzik sayfası: oynatıcı, parça listesi, ortam sesleri, MP4 döngü seçimi
tests/          birim testleri (vitest)
  shared/ main/   ortak kod ve ana süreç
  renderer/       zarın tuvale dokunmayan kısmı: biçim, fizik, atış planı
e2e/            uçtan uca testler (playwright + electron)
  main/           ana süreç: kayıt, çökme, bozuk dosya, pencereler, görsel protokolü, karakter aktarma
  oyun/           oyun ekranı: tam ekran, büyük görseller, iki pencere arası, zar, müzik ve hareketli arka plan
  kontrol/        kontrol paneli, kütüphane, ayarlar
  paket/          paketlenmiş uygulama
build/          uygulama simgesi (svg + ico)
scripts/        yardımcı betikler (simge üretimi)
```

## Komutlar

| Komut | İş |
|-------|----|
| `npm run dev` | geliştirme modunda çalıştırır |
| `npm run typecheck` | tip kontrolü (ana süreç + arayüz) |
| `npm test` | birim testleri |
| `npm run build` | tip kontrolü + derleme (`out/`) |
| `npm run e2e` | derler ve bütün uçtan uca testleri çalıştırır (yaklaşık 15 dakika) |
| `npm run dist` | kurulum dosyasını üretir (`release/`), ayrıntı: `docs/PAKETLEME.md` |

Uçtan uca testler gerçek pencereler açar (kısa süreli tam ekran dahil) ve odağı alır;
çalışırken klavyeye dokunulmamalıdır. Her test kendi geçici kayıt klasörünü kullanır;
kullanıcının gerçek kayıt klasörüne ve ayar dosyasına dokunmaz.

## Kurallar

- Arayüz metinleri Türkçe. Kod adları İngilizce.
- Arayüz durumu doğrudan değiştirmez; her değişiklik bir `Action` ile yapılır.
- Bilinen her hata durumunun `src/shared/errors.ts` içinde bir kodu olur ve `HATA_KODLARI.md`'ye yazılır.
- Kullanıcının kayıt klasöründeki dosyalar asla sessizce silinmez; bozuk dosya yeniden adlandırılır.
