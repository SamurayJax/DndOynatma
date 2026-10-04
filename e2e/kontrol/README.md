# Kontrol paneli denemeleri

Derlenmiş uygulamayı gerçekten açıp DM'in penceresini (kontrol paneli, içindeki kütüphane ve
"Pencereleri düzenle" kutusu) kullanıcının yapacağı gibi kullanır: gerçek tıklama, gerçek klavye,
oyun ekranında gerçek fare sürüklemesi.

## Çalıştırma

```
npx electron-vite build --outDir .tmp/kontrol-denetim/out
node e2e/kontrol/tumu.mjs
```

Tek betik de çalıştırılabilir: `node e2e/kontrol/03-iki-yon.mjs`. Her betik `PASS` / `FAIL` satırları
yazar; bir denetim bile başarısızsa çıkış kodu 1 olur. Hepsi birlikte yaklaşık iki dakika sürer.

Başka bir derlemeyi denemek için: `DND_E2E_KONTROL=out/main/index.js node e2e/kontrol/tumu.mjs`

| Betik | Ne sınar |
|-------|----------|
| `01-duzen.mjs` | 1920×1080 ve 1920×1001'de dolu oturumun yerleşimi (üst üste binme, taşma, kırpılma); "Pencereleri düzenle" kutusu (belirli yükseklik, listenin kendi içinde kayması, iç içe seçici ve silme onayında Escape, kutu açıkken pencerenin daralması); dar pencere (672 ve 420 piksel) ve orada sık yapılan işler; kalem renklerinin `game/DrawingLayer.tsx` ile aynı olması |
| `02-yazma.mjs` | `maxLength` değerlerinin `TEXT_LIMITS` ile aynı olması (Ayarlar dahil); yazı alanlarına yazılan rakamların pencere değiştirmemesi; 200 karakterlik hızlı yazının durumla birebir aynı kalması; sınırdan uzun yapıştırma (emoji sınırı dahil); Enter / Escape ile alandan çıkınca atama tuşlarının yeniden çalışması |
| `03-iki-yon.mjs` | oyun ekranında Delete, fareyle taşıma ve klavyeyle sıralamanın "Ekrandakiler"e ve kütüphane rozetlerine yansıması; görsel sürüklenirken yazılan etiketin kaybolmaması; oyun ekranında atama tuşuyla geçişin üst şeridi, pencere listesini ve rozetleri güncellemesi |
| `04-hata-yollari.mjs` | dosyası diskten silinmiş görselin kütüphanede, "Ekrandakiler"de ve arka plan seçicide görünüşü; zar ve "Oyunu bitir" çağrıları reddedilince çıkan bildirim ve panelin kullanılabilir kalması; "Tam ekran" düğmesinin oyun penceresini gerçekten değiştirmesi |
| `05-kutuphane.mjs` | hiç pencere yokken ilk tıklama ("Pencere 1"); sürükle-bırak yükleme (atlanan dosya, panelden çıkma, kutu açıkken bırakma); "pencerede kullanılıyor" uyarılı silme; İtem ↔ Takım Eşyası; Türkçe karakterli arama |
| `06-klavye.mjs` | yalnızca klavyeyle can değiştirme, görsel koyma, zar atma, pencere geçişi; Tab durak sayısı; odak halkasının çizilmesi ve kırpılmaması |
| `07-oturum.mjs` | dolu oturumda kare süreleri ve "tıklama → ekranda görünme" gecikmesi: can kutucukları, zar geçmişinin 50'ye dolması, pencere geçişi, art arda görsel koyma |
| `08-uc-durumlar.mjs` | bomboş oturum ve sınırları zorlayan içerik (en uzun adlar, 12 pencere, 2000 karakterlik not) ile beş pencere boyutunda yerleşim |

`harness.mjs` ortak parçaları tutar: uygulamayı açma, örnek veri (`seedFullSession`: 4 oyuncu, 6 pencere,
150 görsel), pencere boyutu, yerleşim ölçümü (`probeLayout`), dosya bırakma, kare süresi ölçümü.

## Bilinmesi gerekenler

- Yalnızca Windows'ta çalışır (`taskkill` kullanır).
- Kullanıcının gerçek kayıt klasörüne dokunmaz: her açılış `%TEMP%\dnd-kontrol-…` altında yeni bir
  kayıt klasörü (`DND_DATA_DIR`) ve ayrı bir tarayıcı profili kullanır. Bu klasörler silinmez; bir
  denetim başarısız olursa kayıt ve log orada incelenir.
- Ekranda gerçek pencereler açılıp kapanır. Oyun ekranı yalnızca `04-hata-yollari.mjs` içindeki
  "Tam ekran" denetiminde, bir iki saniyeliğine tam ekrana geçer.
- Silinen görseller gerçek Geri Dönüşüm Kutusu'na gitmez: `shell.trashItem` yerine dosyayı geçici
  klasöre taşıyan bir sahte konur (`stubTrash`).
- Kullanıcının panosuna dokunulmaz: yapıştırma, odaktaki alana `insertText` komutuyla tek seferde
  metin eklenerek sınanır (sınır denetimi yapıştırmayla aynı yoldan geçer).
- Sürükle-bırak işletim sisteminden başlatılamadığı için dosyalar önce gizli bir dosya girişine
  verilir, sonra aynı `File` nesneleriyle `dragenter` / `dragover` / `drop` olayları gönderilir.
  Uygulamanın dosya yolunu okuduğu kod (`webUtils.getPathForFile`) gerçek haliyle çalışır.
- Zar ve "Oyunu bitir" hataları, ana süreçteki çağrı işleyicisi geçici olarak hata fırlatanla
  değiştirilerek üretilir; denetimden sonra asıl işleyici geri konur.
- 1920×1080 iç boyutu en az o büyüklükte bir monitör ister; sığmazsa o boyutun denetimleri atlanır
  ve `BILGI` satırıyla bildirilir. `07-oturum.mjs` içindeki eşikler takılmayı yakalamak içindir
  (kare p95 ≤ 40 ms, gecikme ortancası ≤ 60 ms); pencere başka bir pencerenin altında kalırsa
  Chromium çizimi yavaşlatır ve bu denetimler yanıltıcı biçimde başarısız olabilir.
- Ekran görüntüleri `e2e/.cikti/kontrol-*.png` olarak yazılır.
- Betik yarıda kesilirse açık kalan `electron.exe` süreçleri elle kapatılmalıdır.
