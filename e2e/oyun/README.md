# Oyun ekranı denemeleri

Derlenmiş uygulamayı gerçekten açıp oyun ekranını (`src/renderer/src/game`) oyuncuların göreceği
koşullarda sınar: tam ekran, farklı ekran ölçeği, büyük görseller, kalabalık sahne, kontrol panelinden
gelen değişiklikler, araçların birbirine etkisi ve d20.

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
| `05-zar.mjs` | 30 atışta duran zarın üst yüzü ve büyük sayı = atış; rakamın dikliği; zarın oyun alanında kalması; animasyon sonrası DOM'da kalıntı; art arda hızlı atış; simge durumundaki pencere. Atış sayısı: `node e2e/oyun/05-zar.mjs 60` | ~2 dk |

## Nasıl çalışır

- `harness.mjs` uygulamayı Playwright (`_electron`) ile açar. Fare olayları sanal 1920x1080
  koordinatla verilir, pencere koordinatına çevrilir. Konva sahnesi sayfanın içinden okunur
  (görsellerin ekrandaki kutuları, seçim tutamaçları, etiketler); ekrandaki gerçek renkler
  `capturePage` ile alınır (tuvalden `getImageData` okunmaz, çünkü tuvali yazılım kipine düşürüp
  akıcılık ölçümünü bozar).
- Zarın üst yüzü, zar tuvaline yazılan rakamlar izlenerek bulunur: son karede izleyiciye en düz bakan
  yüzün rakamı atışla aynı olmalıdır.
- `gorseller.mjs` deneme görsellerini üretir; ağdan ya da diskten hazır dosya gerekmez.
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
