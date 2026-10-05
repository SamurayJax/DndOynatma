# Paketleme (Windows kurulum dosyası)

Uygulama `electron-builder` ile paketlenir. Ayarlar `electron-builder.config.cjs` dosyasındadır;
sürüm numarası `package.json` içindeki `version` alanından gelir.

## Komutlar

| Komut | İş |
|-------|----|
| `npm run dist` | derler (`out/`) ve kurulum dosyasını üretir |
| `npm run pack` | derler ve yalnızca açılmış uygulama klasörünü üretir (hızlı; deneme için) |
| `npm run test:paket` | `release\win-unpacked` içindeki paketlenmiş uygulamayı doğrular |
| `npm run icon` | `build/icon.svg` dosyasından `build/icon.ico` üretir |

## Çıktı

Her şey `release\` klasörüne yazılır (repoya girmez):

| Dosya / klasör | İçerik |
|----------------|--------|
| `DndOynatma-Kurulum-<sürüm>.exe` | kullanıcıya verilecek kurulum dosyası (yaklaşık 90 MB) |
| `win-unpacked\` | kurulumun açılmış hâli; `DndOynatma.exe` buradan doğrudan çalışır (yaklaşık 320 MB) |
| `builder-debug.yml` | electron-builder'ın ayrıntı dökümü |

Pakete yalnızca derlenmiş `out/` klasörü ve `package.json` girer (`resources\app.asar`).
Kaynak kod, testler, belgeler ve `node_modules` girmez; arayüz kütüphaneleri derlemenin içindedir.

## Kurulum dosyası ne yapar

- Tek tıkla kurar; soru sormaz, yönetici izni istemez.
- Yalnızca o kullanıcı için kurar: `%LOCALAPPDATA%\Programs\dndoynatma\`.
- Masaüstüne ve Başlat menüsüne `DndOynatma` kısayolu koyar, kurulum bitince uygulamayı açar.
- Yeni sürümün kurulum dosyası çalıştırılınca eski sürümün üstüne kurar.
- Kaldırma: Ayarlar → Uygulamalar → `DndOynatma <sürüm>`. Kurulum klasörü ve kısayollar silinir.

Dosya imzalı değildir (sertifika yok). Windows SmartScreen ilk çalıştırmada "Windows kişisel
bilgisayarınızı korudu" uyarısı gösterebilir: "Ek bilgi" → "Yine de çalıştır".

## Kullanıcı verisi

Kayıt, görseller ve loglar kullanıcının ilk açılışta seçtiği yerdeki `DndOynatma-Kayit`
klasöründedir (bkz. `PLAN.md`, "Kayıt"). Klasörün yeri `%APPDATA%\DndOynatma\ayar.json` dosyasında
tutulur. İkisi de kurulum klasörünün dışındadır: güncelleme de kaldırma da onlara dokunmaz.
Electron'un kendi önbelleği `%APPDATA%\dndoynatma\` altındadır; kaldırmada o da silinmez
(`deleteAppDataOnUninstall: false`).

## Simge

Kaynak `build/icon.svg` (koyu zemin, altın d20). `npm run icon` bu dosyayı gizli bir Electron
penceresinde 16, 24, 32, 48, 64, 128 ve 256 piksel olarak çizer ve `build/icon.ico` içine paketler.
Küçük boyutlarda (32 ve altı) iç çizgiler çıkarılır, dış hat kalınlaştırılır. Uygulamanın exe'si,
kısayollar ve kurulum dosyası bu simgeyi kullanır. SVG değişince komutu yeniden çalıştırın.

## Paketin doğrulanması

`npm run test:paket` (`e2e/paket/paket.mjs`) kurulum dosyasını **çalıştırmaz**; `release\win-unpacked`
içindeki uygulamayı geçici bir kayıt klasörüyle (`DND_DATA_DIR`) açar. Denetlenenler: exe'nin sürüm
bilgisi ve simgesi, ana menünün asar içinden yüklenmesi, sürüm ve kayıt klasörü, görsel içe aktarma ve
`dnd-media://` protokolü, oyun ve kontrol pencereleri, zar atışı, oyunu bitirme, düzgün kapanış,
`kayit.json` ve log dosyası. Her denetim `PASS` / `FAIL` satırı yazar; hata varsa çıkış kodu 1'dir.

Başka bir klasördeki kopyayı (örneğin kurulmuş uygulamayı) denemek için:
`DND_PAKET_DIR=<klasör> node e2e/paket/paket.mjs`

## Makine gereksinimleri

- Windows 10/11 x64, Node.js ve `npm install` yapılmış repo. Yönetici izni ya da Geliştirici Modu gerekmez.
- İlk paketlemede internet gerekir: electron-builder NSIS araçlarını (`nsis`, `nsis-resources`, `7zip`;
  toplam ~17 MB) `%LOCALAPPDATA%\electron-builder\Cache` altına indirir. Electron'un kendisi
  `npm install` sırasında `%LOCALAPPDATA%\electron\Cache` altına inmiş olan arşivden alınır.
- Kod imzalama yapılmaz. Sertifika tanımlı olmadığı için electron-builder imzalamayı atlar ve eski
  sürümlerde sembolik bağ izni isteyen `winCodeSign` arşivini hiç indirmez; exe'nin simgesi ve sürüm
  bilgisi yine de yazılır. İleride sertifika eklenirse (`CSC_LINK` ya da `win.signtoolOptions`) bu arşiv
  gerekir; o durumda `toolsets: { winCodeSign: '1.1.0' }` ayarı sembolik bağ içermeyen yeni arşivi kullanır.
- Paketleme sırasında `release\win-unpacked\DndOynatma.exe` açıksa dosya kilitli olur; önce kapatın.
