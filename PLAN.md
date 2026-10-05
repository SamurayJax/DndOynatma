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
çizilir ve pencereye göre ölçeklenir.

Hangi pencerenin hangi monitörde açılacağı Ayarlar › Genel'den ayrı ayrı seçilir.
"Otomatik" bırakılırsa oyun ekranı en büyük monitörde (2560x1440), kontrol paneli
diğerinde açılır.

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
- döndürülür (ters ya da yan gelen görsel için): seçiliyken R tuşu saat yönünde, Shift+R ters
  yönde çeyrek tur çevirir; seçim çerçevesinin üstündeki tutamaçla serbest açı verilir ve
  0 / 90 / 180 / 270 dereceye yaklaşınca yapışır; kontrol panelindeki "Ekrandakiler"
  listesinde her görselin ve arka planın 90° döndürme düğmesi vardır
- kısa etiket alabilir (ör. "7 LVL")

Arka plan ilk konduğunda oyun alanını bozulmadan dolduracak şekilde yerleşir.

### Araçlar: Fare ve Kalem

Araç kontrol panelinden seçilir; çizim oyun alanında yapılır.

- **Fare** (varsayılan): görselleri taşıma, boyutlandırma, silme.
- **Kalem — kırmızı** ve **Kalem — siyah**: oyun alanına serbest çizim. Kalem
  seçiliyken görseller taşınmaz.

Çizimi yalnızca kontrol panelindeki "Çizimi temizle" düğmesi siler. Kalemden fareye
dönünce çizim ekranda kalır; böylece çizdikten sonra fareyle görsel taşınabilir.

Çizim, yapıldığı pencereye aittir: başka pencereye geçince görünmez, geri dönünce yerindedir.
"Çizimi temizle" o an açık olan pencerenin çizimini siler. Çizimler diske kaydedilmez;
oyun bitince hepsi kaybolur.

### d20

Kontrol panelindeki d20 düğmesine basılınca oyun ekranında zar atılır: zar ekrana
düşer, yuvarlanır, durur ve üste gelen sayı büyük olarak gösterilir. Birkaç saniye
sonra kaybolur. Kontrol panelinde son atışların kısa geçmişi durur.

Zar, uygulamanın kendi çizdiği üç boyutlu 20 yüzlü zardır; hareketi bir fizik
benzetimiyle hesaplanır (yerçekimi, sekme, sürtünme). Hazır 3B zar kütüphanesi
kullanılmadı: o kütüphane sonucu kendi fiziğiyle belirliyor, burada ise sonuç atıştan
önce ana süreçte belirlenip kaydediliyor ve animasyon o sayıda bitmek zorunda.

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

Kayıt klasörü kullanıcının seçtiği yerdedir: ilk açılışta sorulur, uygulama seçilen yerin içine
`DndOynatma-Kayit` klasörünü açar. Ayarlar › Genel'den açılır ve değiştirilir (ayrıntı aşağıda,
"Sürüm 1.0 yolu › Kayıt yeri").

| Dosya / klasör | İçerik |
|----------------|--------|
| `kayit.json` | profiller (isim, seviye, can), pencereler ve üstlerindeki görsellerin yeri / boyutu / etiketi, notlar, kütüphane bölmeleri, son açık pencere |
| `kayit.yedek.json` | bir önceki sağlam kayıt |
| `gorseller\` | kütüphaneye yüklenen görsellerin kopyaları |
| `zar.json` | aktif oyunun zar atışları |
| `log\` | günlük log dosyaları |

- **Kaydedilmeyen:** çizimler (oyun bitene kadar oyun ekranının belleğinde durur).
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
| 6 | Kalem: kırmızı / siyah çizim, "Çizimi temizle" ile silme | v0.6 |
| 7 | d20: zar atma animasyonu ve atış geçmişi | v0.7 |
| 8 | Paketleme: Windows için kurulabilir .exe | v0.8 |
| 9 | Gerçek oturum denemesi ve düzeltmeler | v1.0 |

## Sürüm 1.0 yolu

Faz 1 (sürüm 0.8.1) kullanıcı tarafından denendi ve çalışıyor. Aşağıdaki beş iş bitip
sorunsuz çalıştığı görülünce sürüm 1.0 "tam sürüm" olarak çıkar. Sıra, veri güvenliği
önce gelecek şekilde seçildi.

Her iş ayrı dalda yapılır; kullanıcı deneyip onaylayınca `main`'e birleştirilir.

| Sıra | İş | Sürüm |
|------|----|-------|
| 0 | `faz-1` dalını `main`'e birleştir, `v0.8.1` etiketi | 0.8.1 |
| 1 | Kayıt yeri: yerel klasör seçimi | 0.9.0 |
| 2 | Kalem: kalınlık ve silgi | 0.9.1 |
| 3 | Zarlar: d3 ve d10 | 0.9.2 |
| 4 | Karakterleri dışa / içe aktarma | 0.9.3 |
| 5 | Müzik | 0.9.4 |
| 6 | Gerçek oturumda deneme, düzeltmeler, tam sürüm | 1.0.0 |

### 1. Kayıt yeri (0.9.0) — yapıldı

0.8 sürümlerinde kayıt `Belgeler\DndOynatma` klasöründeydi; bu bilgisayarda Belgeler OneDrive'a
bağlı olduğu için kayıt, görseller ve log buluta eşitleniyordu. Kayıt yerelde durmalı.

- İlk açılışta uygulama kaydın nereye yapılacağını sorar. Kullanıcı bir klasör seçer; uygulama
  onun içine kendi klasörünü (`DndOynatma-Kayit`) açar ve her şeyi oraya yazar.
- Önerilen varsayılan eşitlenmeyen bir yerdir (kullanıcı klasörünün kökü). Seçilen yer OneDrive,
  Dropbox ya da Google Drive içindeyse uyarı gösterilir (engellenmez).
- Eski yerde (`Belgeler\DndOynatma`) kayıt varsa yeni yere taşımayı önerir; taşıma önce kopyalar,
  kopya doğrulanınca eskisini Geri Dönüşüm Kutusu'na gönderir.
- Ayarlar › Genel'de "Klasörü değiştir": aynı taşıma adımlarıyla; taşıma bitince uygulama yeni
  klasörle yeniden başlar. Oyun açıkken değiştirilemez.
- Seçilen yerde zaten bir DndOynatma kaydı varsa taşıma yapılmaz, o kayıt kullanılır.
- Seçilen klasörün yolu küçük bir yerel ayar dosyasında (uygulamanın kendi ayar klasöründe) durur.
  Klasör bulunamazsa (silinmiş, disk takılı değil) uygulama boş kayıt açmaz; yeniden sorar.
- Hata kodları: DND-107 (klasör bulunamadı), DND-108 (kullanılamıyor), DND-109 (taşınamadı),
  DND-110 (eski klasör kaldırılamadı).

**Bitti sayılır:** İlk açılışta klasör sorulur ve kayıt orada oluşur. Eski kayıt eksiksiz taşınır
(görseller dahil). Klasör değiştirilince hiçbir şey kaybolmaz. Seçilen klasör yokken açılış veri
kaybettirmez.

### 2. Kalem: kalınlık ve silgi (0.9.1) — yapıldı

- Kalınlık: ince / orta / kalın (3 / 6 / 12 birim), kontrol panelinden seçilir; her çizgi çizildiği
  kalınlığı korur. Ayar kalem ve silgi için ortaktır; silgi aynı ayarda kalemin dört katı geniştir.
- Silgi: ayrı bir araç. Üstünden geçilen yerdeki çizimi siler (çizginin tamamını değil, silginin
  değdiği kısmı). Silgi yalnızca çizimleri etkiler; görsellere dokunmaz. İmleç silginin çapını
  gösteren bir dairedir.
- Ctrl+Z son izi geri alır; silgi izi de geri alınabilir (silinen kısım geri gelir).
- "Çizimi temizle" ve çizimin pencereye ait olması aynen kalır.

**Bitti sayılır:** Üç kalınlık oyun ekranında ayırt edilir. Silgi çizginin bir kısmını siler,
altındaki görsel bozulmaz. Silinen kısım pencere değişip geri gelince de silik kalır.

### 3. Zarlar: d3 ve d10 (0.9.2)

Yalnızca üç zar olacak: d3, d10, d20. Başka zar ve formül yok.

- d10: gerçek on yüzlü zar biçimi (uçurtma yüzlü).
- d3: fiziksel d3'lerde olduğu gibi, yüzlerinde 1-2-3 ikişer kez yazan küp.
- Kontrol panelinde üç zar düğmesi; atış geçmişinde hangi zarın atıldığı görünür.
- Zar kodu şu an yalnızca 20 yüzlü biçime göre yazılı; biçim (köşeler, yüzler, rakamlar,
  simetriler) ayrı bir tanıma çıkarılıp üç zar aynı fizik ve çizim koduyla çalışacak.

**Bitti sayılır:** Üç zar da atılır, yuvarlanır ve üstte gelen sayı gösterilen sonuçla aynıdır
(her zar için en az 30 atışlık otomatik denetim). d20'nin bugünkü davranışı değişmez.

### 4. Karakterleri dışa / içe aktarma (0.9.3)

Yalnızca karakter bilgileri taşınır: dört oyuncu kartının adı, seviyesi, canı, notu ve portresi.
Kütüphane, pencereler ve yerleşimler taşınmaz; onları herkes kendisi kurar.

- Ayarlar › Oyuncular'da "Dışa aktar": tek bir dosya üretir (bilgiler + portre görselleri).
- "İçe aktar": dosyayı okur, hangi kartların değişeceğini gösterir, onaydan sonra uygular.
- Birden fazla kampanya / kayıt yok; düzen değiştirmek için pencereler yeterli.

**Bitti sayılır:** Bir bilgisayarda dışa aktarılan dosya başka bir kayıt klasöründe içe aktarılınca
dört kart portreleriyle birlikte aynı gelir. Bozuk ya da yabancı dosya kaydı bozmaz.

### 5. Müzik (0.9.4)

Kontrol panelinde bir müzik oynatıcısı: kullanıcı kendi ses dosyalarını (mp3, ogg, wav) yükler,
oradan seçip çalar. Müzik oyunculara uygulama üzerinden gider.

- Kontrol panelinde ayrı bir "Müzik" sekmesi: parça listesi, yükleme ve silme.
- Oynatma: parça seç, çal / duraklat, ileri / geri sar (ilerleme çubuğu), önceki / sonraki parça,
  ses düzeyi, tekrar.
- Ses dosyaları kayıt klasöründe (`muzik/`) durur; liste ve ses düzeyi kayda girer.
- Önce kısa bir deneme: Discord'da oyun ekranı penceresi sesle paylaşılınca kontrol panelinden
  çalan müzik karşıya gidiyor mu. Gitmiyorsa ses oyun ekranı penceresinden çalınır.

YouTube / YouTube Music bağlantısı yapılmayacak (kullanıcı kararı, 2026-10-05): YouTube Music'in
resmi bir oynatma arayüzü yok, Google uygulama içi tarayıcıda hesap girişini engelliyor, gömülü
oynatıcıda bazı şarkılar kapalı ve reklam çıkabiliyor.

**Bitti sayılır:** Yüklenen parça kontrol panelinden çalınır, ileri-geri sarılır ve Discord'da
karşı taraf duyar. Uygulama kapatılıp açılınca liste yerindedir. Çalınamayan dosya açık bir hata
koduyla bildirilir.

### Kararlar (2026-10-05)

- Mevcut arka planın kartına tekrar tıklamak hiçbir şey yapmaz; böyle kalacak.
- Kontrol panelindeki can denetimi olduğu gibi kalacak; komut satırı (`/can 3 -5`) yapılmayacak.
- Birden fazla kampanya yapılmayacak.
- Zarlar d3, d10, d20 ile sınırlı; formül (`2d6+3`) yapılmayacak.
- Dışa aktarma yalnızca karakter bilgileri ve portreler.

### İstenirse (sıraya alınmadı)

- Özel kütüphane bölmesi ekleme / yeniden adlandırma
- Eşyanın hangi oyuncuda olduğunu işaretleme
- Kalem için başka renkler
- Pencere geçiş efekti
- Notları Obsidian vault'una aktarma

## Faz 2 — Çevrimiçi oda (ertelendi)

Oyuncuların linkle katıldığı, kendi zarını attığı ortak oda. Kullanıcı kararıyla (2026-10-05)
süresiz ertelendi; sürüm 1.0'dan önce ele alınmayacak.
Aday altyapı: Cloudflare Workers + Durable Objects (ücretsiz plan), zar sunucuda atılır.
