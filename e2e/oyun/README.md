# Oyun ekranı denemeleri

Derlenmiş uygulamayı gerçekten açıp oyun ekranını (`src/renderer/src/game`) oyuncuların göreceği
koşullarda sınar: tam ekran, farklı ekran ölçeği, büyük görseller, kalabalık sahne, kontrol panelinden
gelen değişiklikler, araçların birbirine etkisi ve zarlar (d20, d10, d6).

## Çalıştırma

```
npx electron-vite build --outDir .tmp/oyun-denetim/out
node e2e/oyun/tumu.mjs
```

Tek bir betik de çalıştırılabilir: `node e2e/oyun/03-diger-pencere.mjs`. Her betik `PASS` / `FAIL`
satırları yazar; bir denetim bile başarısızsa çıkış kodu 1 olur. `BILGI` satırları ölçüm ve gözlemdir.

Başka bir derlemeyi denemek için: `DND_E2E_OYUN=out/main/index.js node e2e/oyun/tumu.mjs`

| Betik | Ne sınar | Süre |
|-------|----------|------|
| `01-ekran.mjs` | Takılı her monitörde tam ekran (ölçek ≥ 1), `devicePixelRatio` 1,5 ve oranın pencere açıkken değişmesi: tuvallerin gerçek çözünürlüğü, görsel ve portre keskinliği, sürükleme / köşeden boyutlandırma / kalemin imlecin tam altına düşmesi, zar tuvali | ~40 sn |
| `02-gorseller.mjs` | 4000x3000 arka plan, 2000x3000 karakter, saydam PNG, çok geniş / çok uzun / şerit görsel; 36 görselli sahnede sürükleme akıcılığı (kare aralığı); 40 pencere değişiminden sonra düğüm, `<img>` ve `<canvas>` sızıntısı. `--tam-ekran` ile en büyük monitörde tam ekran çalışır | ~40 sn |
| `03-diger-pencere.mjs` | Görsel seçiliyken, sürüklenirken ve boyutlanırken kontrol panelinden silinmesi / sırasının, etiketinin, yerinin değişmesi; sürüklerken pencere değişimi; oyuncu canı, ismi, seviyesi, portresi; portre sütununun belirip kaybolması (sol kenardaki görseller, arka plan) | ~35 sn |
| `04-etkilesim.mjs` | Seçim ve kalem etkinken zar; görsellerin üstüne çizim; kalemde tutamaçların gizlenmesi; pencere boyutu değişince tutamaçlar; seçim varken 1–9; 24 karakterlik isimler, 99. seviye, kenarlarda 40 karakterlik etiket | ~45 sn |
| `05-zar.mjs` | d20, d10 ve d6 için 30'ar atışta duran zarda okunan rakam ve büyük sayı = atış; zarın biçimi; rakamın dikliği; zarın oyun alanında kalması; kontrol panelindeki üç düğme ve geçmişte zarın adı; animasyon sonrası DOM'da kalıntı; art arda hızlı atış; simge durumundaki pencere; tanınmayan zar. Zar başına atış sayısı: `node e2e/oyun/05-zar.mjs 60` | ~6 dk |
| `11-kartlar.mjs` | Düz görsel ve "Kart olarak koy", numaralanan kopyalar; kartı taşıma ve oranıyla boyutlandırma; can (−1, "-3", en yüksek can), kopyaların ayrı canı; karta / düz görsele çevirme; beş boss çerçevesi ve süslerin kutuyu aşmaması; yeniden açılışta kartlar | ~30 sn |
| `10-istatistik-zari.mjs` | Zar panelinde karakter / istatistik seçimi (geçmiş listesi yok, seçilmeden kapalı); düz zar; d20 + STR + etkiler, hedef ve yeterlilik yok, 1 atışlık etkinin düşmesi; "Son atış" yalnızca zar ve toplam; oyun ekranında eklenen artılar, sonuç yazısı olmaması; avantajlı d10'da iki zar ve Normal'e dönüş; Karakterler sekmesinde "Toplam" | ~40 sn |
| `09-karakterler.mjs` | Karakterler sekmesi: dört eşit sütun, boş yuvanın yeri; beceri düğmesinde artı ve yeterlilikle düşen gereksinim; arayüzden süreli ve kalıcı artı / eksi verme; beceri atışında hesap, 1 atışlık etkinin düşmesi, oyun ekranında uçan artı / eksi, toplama giden sayı, Başarılı / Başarısız, uygulanan liste; avantajda iki zar ve soluk zar, Normal'e dönüş; sütundan sınıf ve istatistik değiştirme; zar geçmişi; etkiyi kaldırma; kapatıp açınca kalıcılık | ~1 dk |
| `08-muzik.mjs` | Kontrol panelinin üst sekmeleri (Kontrol Paneli / Müzik; gizlenen sayfa kapanmaz); parça yükleme, oyun ekranında çalma, kontrol panelindeki süre, 40. saniyeye ve ilerleme çubuğuyla sarma (206 yanıtı), duraklat / devam, ses düzeyi, Müzik sekmesindeyken 1–9; sonraki parça ve üç tekrar kipi; ortam sesinin döngüde çalması, iki katman, ses düzeyi çarpımı; bozuk dosyada DND-503; MP4 yükleyince sorulan soru, döngü seçicisi, hareketli arka planın oyun ekranında yalnızca seçilen aralıkta (renkle) dönmesi; silme; oyun bitince susma; kapatıp açınca listenin yerinde durması | ~1 dk |

## Nasıl çalışır

- `harness.mjs` uygulamayı Playwright (`_electron`) ile açar. Fare olayları sanal 1920x1080
  koordinatla verilir, pencere koordinatına çevrilir. Konva sahnesi sayfanın içinden okunur
  (görsellerin ekrandaki kutuları, seçim tutamaçları, etiketler); ekrandaki gerçek renkler
  `capturePage` ile alınır (tuvalden `getImageData` okunmaz, çünkü tuvali yazılım kipine düşürüp
  akıcılık ölçümünü bozar).
- Zarın üst yüzü, zar tuvaline yazılan rakamlar izlenerek bulunur: son karede izleyiciye en düz bakan
  yüzün rakamı atışla aynı olmalıdır.
- `gorseller.mjs` deneme görsellerini, `sesler.mjs` deneme seslerini (WAV) ve renkli MP4'ü üretir; ağdan ya da
  diskten hazır dosya, makinede ffmpeg gerekmez (MP4 uygulamanın kendi Chromium'unda kaydedilir).
- Ekran görüntüleri `e2e/.cikti/oyun/` altına yazılır.

## Bilinmesi gerekenler

- Yalnızca Windows'ta çalışır (`taskkill` kullanır).
- Kullanıcının gerçek kayıt klasörüne dokunmaz: her açılış `%TEMP%\dnd-oyun-…` altında yeni bir kayıt
  klasörü (`DND_DATA_DIR`) ve ayrı bir tarayıcı profili kullanır. Bu klasörler silinmez.
- Denemeler ekranda gerçek pencereler açar. `01-ekran.mjs` oyun ekranını her monitörde birkaç
  saniyeliğine tam ekran yapar. Açılan pencereler odağı alır: denemeler sürerken klavyeye basmayın ve
  fareyi oyun penceresinin üstünde gezdirmeyin (ör. o sırada basılan bir rakam pencereyi değiştirir ve
  denetimler boşa düşer; uygulamanın logunda `scene/activateHotkey` satırı görülür).
- Akıcılık denetimi kare aralığının ortancasını (< 25 ms) ve %95'ini (< 50 ms) ölçer; bilgisayar o
  sırada başka ağır bir iş yapıyorsa başarısız olabilir.
- Sınanmayanlar: gerçekten farklı ölçekli iki monitör arasında pencere taşıma (oran değişimi sayfa
  yakınlaştırmasıyla taklit edilir), dokunmatik ekran ve tablet kalemi, 4K monitör.
- Betik yarıda kesilirse açık kalan `electron.exe` süreçleri elle kapatılmalıdır.
