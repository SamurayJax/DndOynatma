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

Kartlar tek bir dosyaya aktarılıp başka bir bilgisayarda geri alınabilir ("Dışa aktar" /
"İçe aktar"). Dosyada yalnızca kartlar vardır: isim, seviye, can, not ve portre. Kütüphane,
pencereler ve yerleşimler taşınmaz.

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

### Zarlar: d20, d10, d6

Kontrol panelindeki zar düğmelerinden birine basılınca oyun ekranında o zar atılır: zar
ekrana düşer, yuvarlanır, durur ve üste gelen sayı büyük olarak gösterilir. Birkaç saniye
sonra kaybolur. Kontrol panelinde son atış ve hangi zarın atıldığı görünür; atış geçmişi yine
durumda ve `zar.json`'da tutulur.

- d20: yirmi yüzlü. 20 ve 1 vurgulanır (altın / kırmızı); bu vurgu yalnızca d20 içindir.
- d10: on uçurtma yüzlü gerçek d10 biçimi. Yüzlerde 1-10 yazar (0 yerine 10).
- d6: küp. Karşılıklı yüzlerin toplamı 7'dir.

Zarlar, uygulamanın kendi çizdiği üç boyutlu cisimlerdir; hareketleri bir fizik
benzetimiyle hesaplanır (yerçekimi, sekme, sürtünme). Hazır 3B zar kütüphanesi
kullanılmadı: o kütüphane sonucu kendi fiziğiyle belirliyor, burada ise sonuç atıştan
önce ana süreçte belirlenip kaydediliyor ve animasyon o sayıda bitmek zorunda. Üç zar
aynı fizik, plan ve çizim kodunu kullanır; zarın biçimi (köşeler, yüzler, sayılar) ayrı
bir tanımdır.

### Kontrol paneli (görsel)

Her dolu oyuncu için bir kart:

- can: 10 kutucuklu bar, tıklayarak ayarlama, −1 / +1 düğmeleri, "−5" gibi sayı girme
- seviye: − / + düğmeleri
- not alanı (ör. "şu itemi var")

Ayrıca:

- kütüphane (8 bölme)
- araç seçimi: Fare / Kalem kırmızı / Kalem siyah, "Çizimi temizle"
- zar düğmeleri (d20, d10, d6), son atış ve istatistikle zar seçimi
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
| 4b | d3 yerine d4 (sonradan eklendi) | 0.9.4 |
| 4c | Kütüphane: mekan/sahne tıklaması arka plan yapmaz (sonradan eklendi) | 0.9.5 |
| 5 | Müzik, ortam sesleri ve hareketli arka plan | 0.9.6 |
| 6 | Sınıflar, beceriler ve karakter ekranı | 0.9.7 |
| 6b | Video arka plan düzeltmeleri (sonradan eklendi) | 0.9.8 |
| 6c | Beceri dışında istatistikle zar atma | 0.9.9 |
| 7 | Gerçek oturumda deneme, düzeltmeler, tam sürüm | 1.0.0 |
| 8 | Düşman ve boss kartları (oyuncu isteği) | 1.1.0 |
| 9 | Otomatik güncelleme | 1.1.0 |

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

### 3. Zarlar: d3 ve d10 (0.9.2) — yapıldı

Yalnızca üç zar var: d3, d10, d20. Başka zar ve formül yok.

- d10: gerçek on yüzlü zar biçimi (uçurtma yüzlü). Yüzlerde 1-10 yazar; gerçek zardaki 0'ın
  yerinde 10 durur ki ekrandaki zar ile gösterilen sonuç aynı sayıyı söylesin.
- d3: fiziksel d3'lerde olduğu gibi, yüzlerinde 1-2-3 ikişer kez yazan küp.
- Kontrol panelinde üç zar düğmesi; atış geçmişinde hangi zarın atıldığı görünür.
- Zarın biçimi (köşeler, yüzler, rakamlar) ayrı bir tanıma çıkarıldı; üç zar aynı fizik, plan
  ve çizim koduyla çalışır. d10 ve küp d20 kadar kolay yuvarlanmadığı için biraz daha hızlı
  döndürülerek atılır.

**Bitti sayılır:** Üç zar da atılır, yuvarlanır ve üstte gelen sayı gösterilen sonuçla aynıdır
(her zar için en az 30 atışlık otomatik denetim). d20'nin bugünkü davranışı değişmez.

### 4. Karakterleri dışa / içe aktarma (0.9.3) — yapıldı

Yalnızca karakter bilgileri taşınır: dört oyuncu kartının adı, seviyesi, canı, notu ve portresi.
Kütüphane, pencereler ve yerleşimler taşınmaz; onları herkes kendisi kurar.

- Ayarlar › Oyuncular'da "Dışa aktar": tek bir dosya üretir (bilgiler + portre görselleri).
  Dosyanın uzantısı `.dndkarakter`; boş kartlar dosyaya girmez.
- "İçe aktar": dosyayı okur, hangi kartların değişeceğini gösterir, onaydan sonra uygular.
  Dosyadaki kart aynı numaralı kartın yerine geçer; dosyada olmayan karta dokunulmaz. Zaten aynı
  olan kart "Zaten aynı" diye gösterilir ve yeniden yazılmaz. Yerine geçilen kartın eski portresi
  Geri Dönüşüm Kutusu'na gider.
- Aktarma yalnızca ana menüdeki ayarlardan yapılır, oyun sırasında yapılmaz.
- Birden fazla kampanya / kayıt yok; düzen değiştirmek için pencereler yeterli.

Dosya biçimi: imza satırı, başlık (kartların bilgileri, JSON) ve ardından portrelerin kendi
baytları. Portreler olduğu gibi durur; dosya, portrelerin toplamından yalnızca biraz büyüktür.
Dosya dışarıdan geldiği için okurken her alan denetlenir; tutarsız dosya bütünüyle reddedilir.

**Bitti sayılır:** Bir bilgisayarda dışa aktarılan dosya başka bir kayıt klasöründe içe aktarılınca
dört kart portreleriyle birlikte aynı gelir. Bozuk ya da yabancı dosya kaydı bozmaz.

### 4b. d3 yerine d4 (0.9.4) — yapıldı

Kullanıcı isteğiyle (2026-10-05) küp biçimli d3 kaldırıldı, yerine d4 geldi. Zarlar artık d20, d10
ve d4.

- d4 gerçek biçimindedir: dört yüzlü piramit. Öbür zarlardan farkı, bir yüzü değil bir köşesi
  üstte durmasıdır; sonuç o köşeden okunur. Her yüzde, köşelerin yanında üç sayı yazar; zar
  durunca üstteki köşenin sayısı görünen üç yüzde de okunur, biri izleyiciye göre dik durur.
- Zar kodu bunun için bir adım daha genellendi: "üstte kalan yüz" yerine "duruş" (yukarı bakan yüz
  ya da köşe) ve yüz başına birden çok rakam.
- Piramit masada yuvarlanmaz; çarpar, bir kez sekip devrilir ve kalır. Bu yüzden d4'ün atışı
  öbürlerinden biraz kısadır (en az 1,6 saniye; d20 ve d10'da 1,9).
- Eski bir oturumdan kalan d3 atışları geçmişe alınmaz.

**Bilinen sınır:** Oyun ekranı masaya tam tepeden bakar. Duran piramidin yüzleri bu açıdan dik
göründüğü için üzerindeki sayılar basık durur; sonuç her zaman zarın üstündeki büyük sayıdan okunur.

### 5. Müzik, ortam sesleri ve hareketli arka plan (0.9.6) — yapıldı

Kontrol panelinde iki katmanlı bir ses bölümü: arkada çalan **müzik** ve DM'in kendi eklediği
**ortam sesleri** (kuş sesi, yağmur, taverna uğultusu gibi). Kullanıcı kendi dosyalarını (mp3, ogg,
wav, m4a, mp4) yükler. Ses oyunculara uygulama üzerinden gider. Müzik pencereye bağlı değildir; ne
zaman ne çalacağını DM elle seçer (karar, 2026-10-28).

Kontrol paneli üst sekmeleri (karar, 2026-10-28):

- Müzik ve beceriler kendi ayarlarıyla bir panele sığmayacağı için kontrol panelinin en üstünde,
  tarayıcı sekmelerine benzeyen sabit bir sekme şeridi olur: **Kontrol Paneli** (bugünkü ekran),
  **Müzik**, **Karakterler** (6. işte eklenir).
- Sekmeler uygulamanın içindedir; yeni pencere açılmaz, sekme kapatılmaz ya da eklenmez. Sekmeye
  tıklayınca o bölüm gösterilir.
- Sekme değişince hiçbir şey durmaz: müzik çalmaya, 1–9 tuşları pencere değiştirmeye devam eder.
- Dar pencerede bugün de bir sekme şeridi var (Oyuncular / Kütüphane / Araçlar); o, yalnızca
  "Kontrol Paneli" sekmesinin içinde kalır.

Müzik:

- "Müzik" sekmesi: parça listesi, yükleme, silme.
- Aynı anda tek parça. Çal / duraklat, ileri / geri sar (ilerleme çubuğu), önceki / sonraki
  parça, tekrar, ses düzeyi.

Ortam sesleri:

- Aynı sekmede DM'in kendi oluşturduğu düğmeler: ad + ses dosyası. Düğmeye basınca ses döngüde
  çalar, tekrar basınca durur. Birden çok ortam sesi aynı anda çalabilir.
- Her düğmenin kendi ses düzeyi var; ayrıca müziğin ve ortam seslerinin genel ses düzeyi.
- Düğmeler eklenir, yeniden adlandırılır, silinir; kayda girer.

MP4 ve hareketli arka plan:

- MP4 yüklenirken sorulur: "Yalnızca ses" ya da "Ses + hareketli görüntü".
- "Yalnızca ses": dosya müzik listesine girer, görüntüsü kullanılmaz.
- "Ses + hareketli görüntü": DM videonun bir bölümünü (başlangıç-bitiş saniyesi) seçer; o bölüm
  GIF gibi sessiz ve sürekli döner. Video kesilmez, dönüştürülmez; oynatma sırasında yalnızca o
  aralık tekrarlanır. Bu görüntü Ayarlar › Pencereler'de pencereye arka plan olarak verilebilir.
- Hareketli arka plan oyun sırasında kontrol panelinden de verilir (0.9.8): döngü kaydedilirken
  "ekrandaki pencerenin arka planı yap" seçeneği ve müzik listesinde "Arka plan yap" düğmesi.
- Hareketli arka planlı pencere açılınca yalnızca görüntü döner; videonun sesi kendiliğinden
  başlamaz, istenirse müzik listesinden elle çalınır (karar, 2026-10-28).

Teknik notlar:

- Ses ve video dosyaları kayıt klasöründe tek bir `muzik/` klasöründe durur (MP4 hem ses hem görüntü
  olarak aynı dosyadan okunur); listeler, ortam düğmeleri, döngü aralıkları ve ses düzeyleri kayda
  girer. Çalma durumu (çalan parça, açık ortam sesleri) kayda girmez; oyun bitince sıfırlanır.
- Kaydırma ve ileri-geri sarma `dnd-media://ses/<dosya>` adresinden, parça parça okunarak (Range
  isteği, 206 yanıtı) yapılır; büyük MP4 belleğe bütün olarak okunmaz. Görseller eskisi gibi okunur.
- Ses oyun ekranı penceresinden çalınır (karar, 2026-10-05): Discord'da paylaşılan pencere odur.
  Denetimler kontrol panelindedir; kontrol paneli yalnızca komut gönderir, çalma durumunu oyun
  ekranından alır. Oyun ekranının ses çalabilmesi için pencerede otomatik oynatma izni açılır.
- Electron MP3, AAC ve H.264 (MP4) çalabildiği için ek bir dönüştürücü (ffmpeg) gerekmez.
- Discord'da pencere paylaşırken sesin karşıya gitmesi denenecek: Electron sesi ayrı bir yardımcı
  süreçten çalar. Gitmezse yedek yol, Discord'da ekranın tamamını sesle paylaşmaktır.

YouTube / YouTube Music bağlantısı yapılmayacak (kullanıcı kararı, 2026-10-05): YouTube Music'in
resmi bir oynatma arayüzü yok, Google uygulama içi tarayıcıda hesap girişini engelliyor, gömülü
oynatıcıda bazı şarkılar kapalı ve reklam çıkabiliyor.

**Bitti sayılır:** Yüklenen parça kontrol panelinden çalınır, ileri-geri sarılır ve Discord'da
karşı taraf duyar. Uygulama kapatılıp açılınca liste yerindedir. Çalınamayan dosya açık bir hata
koduyla bildirilir.

Durum (2026-10-28): Discord dışındaki her madde otomatik denetimle doğrulandı (`e2e/oyun/08-muzik.mjs`).
Discord'da pencere paylaşımında sesin karşıya gittiğini kullanıcı 2026-10-31'de denedi; ses geliyor.

### 6. Sınıflar, beceriler ve karakter ekranı (0.9.7) — yapıldı

Müzikten sonra yapılır. Oyuncuların istatistikleri girilir; DM bir oyuncunun becerisine basınca
zar kendiliğinden atılır ve istatistiğe göre artı / eksi eklenir. Sınıfları ve becerileri tamamen
DM tanımlar; uygulama hazır bir D&D listesi dayatmaz.

Karakter ekranı (Ayarlar › Oyuncular, her kartta):

- Altı istatistik: Güç (STR), Çeviklik (DEX), Dayanıklılık (CON), Zeka (INT), Bilgelik (WIS),
  Karizma (CHA).
- Oyuncunun sınıfı (DM'in tanımladığı sınıflardan biri).
- İstatistikten artı / eksi: 10-11 → 0; her 2 puan yukarı +1, her 2 puan aşağı -1
  (12 → +1, 14 → +2, 8 → -1). D&D'deki `(değer - 10) / 2`, aşağı yuvarlanır.

Sınıflar ve beceriler (Ayarlar'da yeni bölüm):

- DM sınıf oluşturur (Savaşçı, Büyücü...) ve her sınıfa beceri ekler.
- Beceri: ad + hangi istatistikle atıldığı ("Ac" → STR gibi) + gereksinim.
- Ayarlar › Sınıflar sekmesi. Sınıflar ve beceriler sıralanır, yeniden adlandırılır, silinir;
  silinen sınıftaki oyuncuların sınıfı boşalır.

Kontrol panelinde "Karakterler" sekmesi (karar, 2026-10-28):

- Sekme dört eşit sütuna bölünür; her sütun bir oyuncu yuvasıdır (Oyuncu 1–4, soldan sağa).
  Sütunun başında portre, isim, sınıf ve istatistikler; altında sınıfının beceri düğmeleri.
- Dolu yuva kadar sütun dolar, boş yuvaların yeri boş kalır (3 oyuncu varsa 4. sütun boş).
  Böylece bir oyuncunun yeri hiç kaymaz.
- Yalnızca kontrol panelinde; oyuncular beceri listesini görmez.
- Son atış bu sekmede de görünür; zar paneline geçmeden sonuç okunur.
- Oyun sırasında ana menüye dönülemediği için oyuncunun sınıfı ve istatistikleri bu sütundan da
  değiştirilir ("İstatistikleri düzenle"). Sınıf ve beceri tanımı yalnızca Ayarlar'dadır.
- Avantaj / dezavantaj tek atış içindir; atıştan sonra seçim Normal'e döner.
- Atıştan önce Normal / Avantaj / Dezavantaj seçilir. Avantajda iki d20 atılır, yüksek olan alınır;
  dezavantajda düşük olan.
- Düğmeye basınca oyun ekranına d20 düşer; sonuç aşağıdaki "Gereksinim ve yeterlilik" kuralıyla
  hesaplanır. Atış geçmişinde oyuncu, beceri, zar, toplam, gereksinim ve sonuç yazar
  ("Aras · Ac · 14 + 2 = 16 / 8 · Başarılı").

Kararla ilişkisi: 2026-10-05'te "formül (`2d6+3`) yapılmayacak" denmişti. Burada formül yazılmaz;
yalnızca beceriye bağlı d20 + istatistik artısı vardır.

Teknik notlar:

- Zar oynatıcısına şerit eklendi: avantaj / dezavantajda iki d20 oyun alanının solunda ve sağında
  ayrı tuvallerde düşer. Hesap `src/shared/character.ts` içindedir; zar ana süreçte atılır.
- Kayıt şeması büyüdü (istatistikler, sınıflar, beceriler, etkiler); eski kayıtlar varsayılanlarla
  (bütün istatistikler 10, sınıf yok) açılır.

Oyun ekranında sonuç (karar, 2026-10-28):

- Zar durup sayıyı gösterdikten sonra artı / eksi ekranın kenarından uçarak gelir ("+2" yeşil,
  "-2" kırmızı), zarın sayısına çarpar ve sayı tek tek sayarak sonuca döner (14 → 15 → 16).
  Oyunlardaki yükseltme efekti gibi. Artı / eksi 0 ise yalnızca zar görünür.
- Altta oyuncunun ve becerinin adı yazar ("Aras · Ac"). Avantaj / dezavantajda alınmayan zar
  soluklaşır. Uygulanan artı / eksiler sayının yanında listelenir; en sonda madalyonun altında
  "Başarılı" (yeşil) ya da "Başarısız" (kırmızı) ve gereksinim yazar.

Gereksinim ve yeterlilik (karar, 2026-10-28):

- Her becerinin bir **gereksinimi** vardır: başarmak için en az kaç gelmesi gerektiği (örneğin 10).
  DM beceriyi tanımlarken girer.
- Yeterlilik, D&D'deki gibi seviyeyle büyür ama zara eklenmez; **gereksinimi düşürür**:
  gereksinimi 10 olan beceri, yeterliliği 2 olan oyuncu için 8'dir.
- Yeterlilik seviyeye göre kendiliğinden hesaplanır (1-4 → 2, 5-8 → 3, 9-12 → 4, 13-16 → 5,
  17-20 → 6, sonrası 6), DM her oyuncu için elle değiştirebilir.
- Sonuç = zar + istatistik artısı + geçici artı / eksiler; sonuç düşürülmüş gereksinime eşit ya
  da büyükse **başarılı**. Kontrol panelinde ve oyun ekranında "Başarılı" / "Başarısız" yazar.

Geçici artı / eksi (karar, 2026-10-28):

- Ayrı bir yönetim paneli yerine Karakterler sekmesinde, her oyuncunun sütununda: DM bir oyuncuya
  açıklamalı artı / eksi verir ("İyi rol +2", "Ayağı takıldı -2"). Hazır düğmeler (+1, +2, -1, -2)
  ve açıklama alanı.
- Atışta bu artı / eksiler de ayrı ayrı ekranın kenarından uçarak gelir, açıklamalarıyla.
- Verirken süresi seçilir: **kaç atış** (1, 2, 3 ya da elle girilen sayı) veya **Kalıcı**.
- Atış sayılı olan, o oyuncunun her beceri atışında bir azalır, sıfıra inince kendiliğinden düşer.
  Kontrol panelindeki zar düğmeleriyle (d20 / d10 / d4) atılan, oyuncuya bağlı olmayan zarlar
  saymaz.
- Kalıcı olan (ağır yaralanma gibi) DM kapatana kadar her atışa eklenir.
- Oyuncunun sütununda etkin artı / eksiler listelenir: açıklama, değer ve kalan süre
  ("İyi rol +2 · 2 atış", "Kırık kol -2 · kalıcı"). Her birinin yanında kaldırma düğmesi var.
- Etkin artı / eksiler kayda girer; uygulama kapanıp açılınca yerinde durur.

Karakter dosyası (karar, 2026-10-28):

- `.dndkarakter` dosyası istatistikleri, yeterlilik bonusunu ve sınıfı (becerileriyle) da taşır.
  Bunlar yalnızca metin ve sayıdır, birkaç KB etmez; dosyanın boyutunu portreler belirler.
- Dosya biçiminin sürümü artar; eski sürümle yazılmış dosyalar okunmaya devam eder.

### 6c. Beceri dışında istatistikle zar atma (0.9.9) — yapıldı

Kullanıcı isteği (2026-10-29): beceri dışında bir atış yapılınca ("Güç ile kapıyı it" gibi) artı /
eksiler elle toplanıyordu. Artık oyuncunun istatistiği üzerinden doğrudan zar atılır; uygulama
istatistik artısını ve geçici artı / eksileri kendisi ekler.

Kararlar (2026-10-29):

- Yeri: kontrol panelinin Zar paneli. d20 / d10 / d4 düğmeleri ve "Son atış" yerinde kalır; altındaki
  atış geçmişi listesi kalktı, yerine **karakter** ve **istatistik** seçimi ile Normal / Avantaj /
  Dezavantaj geldi. Karakter seçiliyken basılan zara (hangisi olursa) istatistiğin artısı eklenir.
  Karakter seçilmezse zar eskisi gibi düz atılır.
- Hedef yok: Başarılı / Başarısız yazmaz, yalnızca toplam.
- Yeterlilik uygulanmaz. Oyuncunun geçici artı / eksileri eklenir, sayılı olanlar bir azalır.
  Avantaj / dezavantaj tek atış içindir, atıştan sonra Normal'e döner.
- "Son atış" kimin attığını yazmaz, yalnızca zarı ("Son atış · d20"); büyük sayı toplamdır, altında
  zarın kendisi ve eklenen artı ("6 +3").
- Oyun ekranında becerilerdeki gösterim: artı / eksiler uçarak eklenir, altta "Aras · Güç" (d20
  değilse zarın adı da). Avantajda iki zar (d10 / d4 de olabilir) düşer.
- Atış geçmişi yine durumda ve `zar.json`'da tutulur; Karakterler sekmesindeki "Son atış"ta
  istatistik atışı "Toplam" diye görünür.

### 7. Gerçek oturumda deneme, tam sürüm (1.0.0) — yapıldı

Kullanıcı uygulamayı yaklaşık 3 saatlik gerçek bir oturumda kullandı, sorun çıkmadı (2026-10-31).
Müzik ve ortam sesleri Discord pencere paylaşımında karşıya gidiyor. Düzeltme gerekmedi.

### 8. Düşman ve boss kartları (1.1.0) — yapıldı

Oyuncu isteği (2026-10-31): oyuncular çerçeveli kartlarla dururken düşmanlar sade görünüyor.

Kararlar (2026-10-31):

- Kart ayrı bir görsel türü değil, oyun alanındaki görselin görünümüdür. Yalnızca NPC, tüccar, düşman ve
  boss kart olabilir. Düz görsel olduğu gibi kalır; ikisi arasında geçilir.
- Can bar değil sayı olarak görünür ve yanında "CAN" yazar; oyunculardan gizlenmez. En yüksek can kart
  başınadır (varsayılan 10, en çok 9999). İhtiyaç olursa sonra değiştirilir.
- Boss kartları belirgin ve şaşalıdır; beş çerçeve: Gölge, Işık, Kan, Buz, Zehir. Öbür kartlar oyuncu
  kartlarıyla aynı altın çerçeveyi kullanır.
- Can her kartındır; ad, seviye, en yüksek can ve çerçeve görsele de yazılır. Yeni kart dolu canla gelir.
  Aynı pencerede aynı görselden kart varsa ad numaralanır; ilk kart numarasızdır (tek boss "Ejderha 1" olmasın).

Teknik notlar:

- `StageItem.card` ve `LibraryImage.cardDefaults` isteğe bağlıdır; eski kayıtlar düz görsel olarak açılır.
- Kart 300x420 tasarım ölçüsünde çizilir ve kutuya ölçeklenir; görsel çerçeveye kırpılır, oranı bozulmaz.
  Seçim çerçevesi kutuyu çocukların kapladığı alandan ölçtüğü için süsler kartın dışına taşmaz.

### 9. Otomatik güncelleme (1.1.0) — yapıldı

Kullanıcı kararı (2026-10-31): her açılışta internet varsa GitHub'daki son sürüme bakılır, güncelleme onay
istedikten sonra yapılır. Ana menüde sorulur; oyun sırasında kurulum başlamaz. "Şimdi değil" denirse bir sonraki
açılışta yeniden sorulur. Kod aralığı DND-6xx. Ayrıntı ve yayımlama adımları: `docs/PAKETLEME.md`.

### 10. d4 yerine d6 (1.2.0) — yapıldı

Kullanıcı isteği (2026-10-31): piramit masaya tepeden bakınca basık görünüyordu (bkz. 4b, "Bilinen sınır").
d4 kaldırıldı, yerine küp biçimli d6 geldi; zarlar d20, d10, d6. Sonuç yeniden üstteki yüzden okunur, köşeden
okumaya özgü kod kalktı. Eski oturumdan kalan d4 atışları geçmişe alınmaz. Bu bölümden önceki d3 ve d4 anlatımları
o sürümlerin kaydıdır.

### Kararlar (2026-10-05)

- Mevcut arka planın kartına tekrar tıklamak hiçbir şey yapmaz; böyle kalacak.
- Kontrol panelindeki can denetimi olduğu gibi kalacak; komut satırı (`/can 3 -5`) yapılmayacak.
- Birden fazla kampanya yapılmayacak.
- Zarlar d6, d10, d20 ile sınırlı (d6, 2026-10-31'de d4'ün yerine geçti); formül (`2d6+3`) yapılmayacak.
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
