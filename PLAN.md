# DndOynatma — Plan

DnD oturumlarında Canva yerine kullanılacak sahne yönetim uygulaması. DM yönetir,
oyuncular ekran paylaşımından (Discord / Teams) izler. Yeni bir Roll20 değil.

## Faz 1 — Masaüstü uygulaması

### Kapsam dışı (Faz 1)

- Oyuncuların bağlanması, kendi zarını atması (Faz 2)
- Canva tarzı tasarım araçları: arka plan silme, efekt, filtre, şablon, stok görsel
- Görsel üretimi
- Telefon / başka bilgisayar desteği

### Terimler

- **Oyun ekranı** — oyuncuların gördüğü pencere. Discord/Teams'te sadece bu paylaşılır.
- **Kontrol paneli** — sadece DM'in gördüğü pencere, ikinci monitörde durur.
- **Pencere** — tuşla geçilen hazır düzen ("Kraliyet İçi", "Orman Yolu" gibi).
- **Kütüphane** — yüklenen tüm görseller, bölmelere ayrılmış.

Monitörler 2560x1440 ve 1920x1080 (ikisi de 16:9). Oyun ekranı sabit 16:9 oranında
çizilir ve pencereye göre ölçeklenir; hangi monitörde açılacağı seçilebilir.

### Ana menü

- **Oyna** — oyun ekranını ve kontrol panelini açar. Kişi sayısı sormaz.
- **Ayarlar** — oyuncu profilleri, kütüphane, pencereler.
- **Çıkış**

### Oyuncu profilleri (Ayarlar)

4 sabit kart (Oyuncu 1–4). Her kartta:

- portre görseli
- isim
- seviye

Dolu kartlar oyunda görünür, boş kartlar hiç görünmez. Soldaki portre sütunu dolu
kart sayısına göre otomatik dizilir. En fazla 4 oyuncu.

### Kütüphane

Kontrol panelinde durur; oyuncular kütüphaneyi hiç görmez (ileride gelecek boss
önceden görünmesin diye). Ayarlar'dan da aynı kütüphane açılır. Her bölmede
yükleme ve silme vardır. Yüklenen görseller (PNG, JPG, WEBP) uygulamanın kendi
klasörüne kopyalanır. Bir pencerede kullanılan görsel silinirken uyarı verilir ve
görsel o pencereden de kalkar.

| # | Bölme | Tür |
|---|-------|-----|
| 1 | NPC'ler | üste konur |
| 2 | Tüccarlar | üste konur |
| 3 | Mekanlar (bina içleri) | arka plan |
| 4 | Sahneler (köy, şehir, orman gibi büyük lokasyonlar) | arka plan |
| 5 | Düşmanlar | üste konur |
| 6 | Boss'lar | üste konur |
| 7 | Takım Eşyaları | üste konur |
| 8 | İtemler | üste konur |

- **Arka plan** türündeki görsele tıklanınca o anki pencerenin arka planı olur.
- **Üste konur** türündeki görsele tıklanınca oyun ekranının ortasına gelir; yeri ve
  boyutu oyun ekranında fareyle ayarlanır.

**İtemler ve Takım Eşyaları:** İtemler bölmesi tüm eşyaları tutar. Bir oyuncu eşyayı
alınca tek tıkla ("Takıma ver") Takım Eşyaları'na geçer; "Geri al" ile döner. Böylece
hangi eşyanın oyuncularda olduğu, hangisinin henüz bulunmadığı bir bakışta görülür.
Görsel kopyalanmaz, sadece bölmesi değişir.

Eşya göstermek için ayrı yuva yok: eşya da diğer görseller gibi oyun ekranına konur,
iş bitince silinir.

### Pencereler

Her pencerenin adı, arka planı (Mekanlar veya Sahneler'den) ve atama tuşu (1–9) vardır.
Tuşla ya da kontrol panelinden tıklayarak geçilir. Geçişte portreler sabit kalır; her
pencere üstündeki görselleri hatırlar.

### Oyun ekranı

İki bölgeden oluşur:

- **Portre sütunu (solda, kilitli):** çerçeveli portre, isim, seviye, 10 üzerinden can
  barı. Portreler taşınamaz ve boyutlandırılamaz; yerleri dolu profil sayısına göre
  otomatik belirlenir. Can 0 olunca portre soluk görünür. Hiç dolu profil yoksa sütun
  gizlenir.
- **Oyun alanı (sağda):** pencerenin arka planı ve üstüne konan görseller. Görseller
  portre sütununun üstüne taşamaz.

Oyun alanındaki görseller (arka plan dahil):

- fareyle taşınır, öne/arkaya alınır, silinir
- köşeden büyütülür/küçültülür; en-boy oranı her zaman korunur, görsel bozulmaz
- kısa etiket alabilir (ör. "7 LVL")

Arka plan ilk konduğunda oyun alanını bozulmadan dolduracak şekilde yerleşir.

### Araçlar: Fare ve Kalem

Araç kontrol panelinden seçilir; çizim oyun alanında yapılır.

- **Fare** (varsayılan): görselleri taşıma, boyutlandırma, silme.
- **Kalem — kırmızı** ve **Kalem — siyah**: oyun alanına serbest çizim. Kalem
  seçiliyken görseller taşınmaz.

Çizim geçicidir: kalemden fareye dönünce tüm çizimler otomatik silinir. Pencere
değişince de silinir, diske kaydedilmez. Kalemden çıkmadan silmek için kontrol
panelinde "Çizimi temizle" düğmesi vardır.

### d20

Kontrol panelindeki d20 düğmesine basılınca oyun ekranında zar atılır: zar ekrana
düşer, yuvarlanır, durur ve üste gelen sayı büyük olarak gösterilir. Birkaç saniye
sonra kaybolur. Kontrol panelinde son atışların kısa geçmişi durur.

3B zar için hazır açık kaynak kütüphane (`@3d-dice/dice-box`, MIT) denenecek;
Electron içinde sorun çıkarırsa aynı akış basit 2B animasyonla yapılır.

### Kontrol paneli (görsel)

Her dolu oyuncu için bir kart:

- can: 10 kutucuklu bar, tıklayarak ayarlama, −1 / +1 düğmeleri, "−5" gibi sayı girme
- seviye: − / + düğmeleri
- not alanı (ör. "şu itemi var")

Ayrıca:

- kütüphane (8 bölme)
- araç seçimi: Fare / Kalem kırmızı / Kalem siyah, "Çizimi temizle"
- d20 düğmesi ve son atışlar
- genel not alanı
- pencere listesi (tıklayarak geçiş)
- oyun ekranında şu an duran görsellerin listesi (tek tıkla kaldırma)

Kontrol panelindeki her değişiklik oyun ekranında anında görünür.

Not alanına yazı yazılırken atama tuşları (1–9) devre dışıdır; yazılan rakam pencere
değiştirmez.

### Kayıt

Her değişiklik otomatik kaydedilir; "kaydet" düğmesi yoktur. Bilgisayar kapatılıp
açılsa da her şey kaldığı yerden devam eder.

Kayıt klasörü: `Belgeler\DndOynatma\` (Ayarlar'da "Kayıt klasörünü aç" düğmesi).

| Dosya / klasör | İçerik |
|----------------|--------|
| `kayit.json` | profiller (isim, seviye, can), pencereler ve üstlerindeki görsellerin yeri / boyutu / etiketi, notlar, kütüphane bölmeleri, son açık pencere |
| `kayit.yedek.json` | bir önceki sağlam kayıt |
| `gorseller\` | kütüphaneye yüklenen görsellerin kopyaları |
| `zar.json` | aktif oyunun zar atışları |
| `log\` | günlük log dosyaları |

- **Kaydedilmeyen:** çizimler (geçici).
- **Güvenli yazma:** kayıt önce geçici dosyaya yazılır, sonra asıl dosyanın yerine
  konur; yazma sırasında elektrik kesilse bile kayıt bozulmaz. `kayit.json` yine de
  okunamazsa yedekten açılır ve loga yazılır.
- **Zar kaydı:** atışlar oyun açıkken `zar.json`'da tutulur. Oyun normal kapatılınca
  ("Oyunu bitir" ya da Çıkış) dosya temizlenir. Uygulama çökerse temizlenmez; tekrar
  açıldığında atış geçmişi yerindedir.

Kayıt düz metin (JSON) dosyasıdır, Obsidian vault'una yazılmaz: uygulama her
değişiklikte yazdığı için kendi klasöründe durması gerekir.

### Log ve hata kodları

Her gün için ayrı dosya: `log\dndoynatma-YYYY-AA-GG.log`. Son 30 gün saklanır.

Her satır: saat, seviye (BİLGİ / UYARI / HATA), kod, açıklama.

- **Yapılan işlemler:** uygulama açıldı / kapandı, pencere değişti, görsel eklendi /
  silindi, can değişti, zar atıldı. Çökmeden hemen önce ne yapıldığı buradan okunur.
- **Hatalar:** her bilinen hata durumunun sabit bir kodu ve açıklaması vardır
  (`DND-xxx`). Hata olduğunda ekranda kod ve kısa açıklama gösterilir, loga yazılır.
- **Beklenmeyen çökme:** yakalanamayan hata ayrıntısıyla loga yazılır. Bir sonraki
  açılışta "geçen sefer beklenmedik şekilde kapandı" uyarısı ve log dosyasının yeri
  gösterilir.

Kod aralıkları:

| Aralık | Konu |
|--------|------|
| DND-1xx | kayıt ve dosya (okuma / yazma, bozuk kayıt, yedekten açma) |
| DND-2xx | kütüphane ve görseller (desteklenmeyen dosya, bulunamayan görsel) |
| DND-3xx | pencereler ve oyun ekranı (aynı anda çakışan işlemler dahil) |
| DND-4xx | zar |
| DND-9xx | beklenmeyen hata |

Kodların tam listesi geliştirme sırasında `HATA_KODLARI.md` dosyasında tutulur.
"Hata değil, aynı anda iki işlem yapıldı" gibi durumlar da kendi koduyla yazılır.

### Teknoloji

- Electron (masaüstü kabuk, iki pencere, dosya erişimi)
- React + TypeScript + Vite (arayüz)
- Konva (oyun ekranında görsel taşıma / boyutlandırma)
- Durum tek yerde tutulur, iki pencere arasında eşitlenir; diskte JSON + görsel klasörü

Arayüz web teknolojisiyle yazıldığı için Faz 2'de çevrimiçi odaya taşınabilir.

### Adımlar

Her adım ayrı dalda yapılır, kullanıcı deneyip onaylayınca `main`'e birleştirilir ve
sürüm etiketi verilir. Her adımın sonunda uygulama çalışır durumdadır.

| Adım | İçerik | Sürüm |
|------|--------|-------|
| 0 | Repo hazırlığı: README, CHANGELOG, .gitignore, HATA_KODLARI | — |
| 1 | İskelet: Electron uygulaması, ana menü, iki pencere, otomatik kayıt, log ve hata kodu altyapısı | v0.1 |
| 2 | Oyuncular: 4 profil kartı, kilitli portre sütunu, kontrol panelinde can / seviye / not | v0.2 |
| 3 | Kütüphane: 8 bölme, yükle / sil, İtem ↔ Takım Eşyası geçişi | v0.3 |
| 4 | Oyun alanı: arka plan, görsel koyma, taşı / oranlı boyutlandır / sil, etiket, ekrandakiler listesi | v0.4 |
| 5 | Pencereler: tanımlama, atama tuşlarıyla geçiş | v0.5 |
| 6 | Kalem: kırmızı / siyah çizim, fareye dönünce otomatik silme | v0.6 |
| 7 | d20: zar atma animasyonu ve atış geçmişi | v0.7 |
| 8 | Paketleme: Windows için kurulabilir .exe | v0.8 |
| 9 | Gerçek oturum denemesi ve düzeltmeler | v1.0 |

## Faz 1 sonrası (küçük eklemeler)

- Kontrol panelinde komut satırı (`/can 3 -5` gibi)
- Özel kütüphane bölmesi ekleme / yeniden adlandırma
- Eşyanın hangi oyuncuda olduğunu işaretleme
- Diğer zarlar ve `2d6+3` gibi formüller
- 20 ve 1 gelince özel vurgu
- Kalem için başka renkler, kalınlık, silgi
- Birden fazla kampanya (ayrı kayıtlar)
- Notları Obsidian vault'una aktarma
- Pencere geçiş efekti
- Dışa / içe aktarma (başka bilgisayara taşıma)
- Müzik / ortam sesi

## Faz 2 — Çevrimiçi oda (ileri hedef)

Oyuncuların linkle katıldığı, kendi zarını attığı ortak oda.
Aday altyapı: Cloudflare Workers + Durable Objects (ücretsiz plan), zar sunucuda atılır.
Ayrıntılar Faz 1 bittikten sonra planlanacak.
