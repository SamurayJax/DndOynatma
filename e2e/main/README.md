# Ana süreç denemeleri

Derlenmiş uygulamayı gerçekten açıp ana sürecin (`src/main`) davranışını sınar. Birim testlerinin
göremediği şeyler buradadır: gerçek pencereler, `dnd-media` protokolü, diske yazma, çökme.

## Çalıştırma

```
npx electron-vite build --outDir .tmp/main-review/out
node e2e/main/tumu.mjs
```

Tek bir betik de çalıştırılabilir: `node e2e/main/03-kayit.mjs`. Her betik `PASS` / `FAIL`
satırları yazar; bir denetim bile başarısızsa çıkış kodu 1 olur.

Başka bir derlemeyi denemek için: `DND_E2E_MAIN=out/main/index.js node e2e/main/tumu.mjs`

| Betik | Ne sınar |
|-------|----------|
| `01-pencereler.mjs` | `window.dnd` ve rolü, sandbox, pencere başlıkları, CSP, monitör yerleşimi, tam ekran (düğme + F11), oyunu başlat/bitir yarışları, X ile kapatma, arayüz çökmesi (DND-305 / DND-902), oyun açıkken çıkış |
| `02-medya-kutuphane.mjs` | `dnd-media` (`<img>`, `fetch`, tuval, 404, klasör dışına çıkma denemeleri), yükleme uç durumları (DND-201 / 202 / 204), portre değiştirme, kütüphaneden silme, çöpe taşıma hatası (DND-205) |
| `04-kayit-yeri.mjs` | ilk açılışta kayıt klasörü sorusu, bulunamayan klasör (DND-107), eski kaydı taşıma, ayarlardan klasör değiştirme, var olan kaydı kullanma, bulut uyarısı, yazılamayan yer (DND-108) |
| `03-kayit.mjs` | otomatik kayıt ve geri yükleme, yedek, `zar.json`, zorla kapatma sonrası açılış (DND-903), bozuk kayıt (DND-101 / 102), yeni şema (DND-106), kilitli dosya (DND-103), kullanılamayan klasör (DND-104), yakalanmamış hata (DND-901), log biçimi ve logda isim/not olmaması |

## Bilinmesi gerekenler

- Yalnızca Windows'ta çalışır (`taskkill` ve PowerShell kullanır).
- Kullanıcının gerçek kayıt klasörüne dokunmaz: her açılış `%TEMP%\dnd-main-…` altında yeni bir
  kayıt klasörü (`DND_DATA_DIR`) ve ayrı bir tarayıcı profili kullanır. Bu klasörler silinmez;
  bir denetim başarısız olursa log ve kayıt orada incelenir.
- Denemeler sırasında ekranda gerçek pencereler açılıp kapanır (toplam bir-iki dakika). Oyun ekranı
  tam ekrana yalnızca tam ekran denetimlerinde, birkaç saniyeliğine geçer.
- `02-medya-kutuphane.mjs` silinen görselleri varsayılan olarak gerçek geri dönüşüm kutusuna
  göndermez (`shell.trashItem` yerine geçici klasöre taşıyan bir sahte konur). Gerçek kutuyu
  denemek için `--gercek-cop` verilir; o zaman iki küçük PNG geri dönüşüm kutusuna gider.
- Monitör denetimleri iki monitör varsa "farklı monitörde" olmayı, tek monitör varsa yan yana
  açılmayı bekler; bulunan monitörler ve pencerelerin yeri `BILGI` satırlarında yazılır.
- Sınanmayanlar: ikinci kopyanın engellenmesi (tek kopya kilidi `DND_DATA_DIR` verilince
  kapalıdır), Windows oturumu kapanırken kayıt (`session-end`), dosya seçme pencereleri ve
  "klasörü aç" düğmeleri.
- Betik yarıda kesilirse açık kalan `electron.exe` süreçleri elle kapatılmalıdır.
