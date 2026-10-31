# Sürüm Geçmişi

## 1.2.0 — 2026-10-31

### Değişenler

- **d4 yerine d6:** piramit tepeden bakınca basık görünüyordu. Yerine normal küp zar geldi: karşılıklı yüzlerin
  toplamı 7, sayı üst yüzden net okunur. Zarlar d20, d10 ve d6. Beceri ve istatistik atışları d6 ile de çalışır.
  Eski oturumdan kalan d4 atışları geçmişe alınmaz.

### Eklenenler

- **Görsel esnetme:** görseller ve kartlar sağ/sol ve üst/alt kenardan yalnızca o yönde esnetilir; köşeler o anki
  oranı korur. Esnemiş öğede Ekrandakiler listesinde "Oranı düzelt" düğmesi çıkar. Kartlarda ad, seviye ve can
  yazısı basılmaz; fazla boyut çerçeveye gider.
- **Araç paneli:** oyun ekranında sürüklenebilir şerit: fare, kalem, silgi, renk, kalınlık, geri al, temizle. Yatay ya da
  dikey dizilir, küçültülür; `T` tuşu gizler, yeri kaydedilir. Oyuncular da görür; üstüne gelinmedikçe yarı saydamdır.
- **Çizim araçları:** düz çizgi, ok, dikdörtgen, daire ve metin. Shift çizgiyi 45°'ye yapıştırır, kare ve daire çizdirir.
  Silgi, geri alma ve "Çizimi temizle" bunlarda da çalışır; kalem gibi pencereye aittir, kaydedilmez.
- **Kalem renkleri:** kırmızı ve siyaha beyaz, mavi, yeşil ve sarı eklendi. Kalem tek araç oldu, renk ayrı seçilir.

## 1.1.0 — 2026-10-31

Oyuncu isteği: düşmanlar oyuncuların yanında sade duruyordu.

### Eklenenler

- **Kartlar:** NPC, tüccar, düşman ve boss görselleri oyuncu kartları gibi çerçeveli konabilir: görsel,
  seviye, ad ve can. Kütüphanede "Kart olarak koy" düğmesi; karta tıklamak eskisi gibi düz görsel koyar.
  Ekrandakiler listesinden düz görsel karta, kart düz görsele çevrilir.
- **Can:** kartta sayıyla yazar ("CAN 45 / 60"). En yüksek can kart başına girilir (1–9999), −1 / +1 ve
  "-5" gibi girişle Ekrandakiler listesinden değişir. Her kopyanın canı ayrıdır; can 0 olunca kart soluklaşır.
- **Boss çerçeveleri:** Gölge, Işık, Kan, Buz ve Zehir; taçlı, parlayan ve temaya özgü süslü.
- Kartın adı, seviyesi, en yüksek canı ve çerçevesi görsele kaydedilir, bir sonraki koyuşta aynı gelir.
  Aynı görselden başka kart varsa ad numaralanır ("Goblin", "Goblin 2").
- **Otomatik güncelleme:** her açılışta internet varsa GitHub'daki son sürüme bakılır. Yeni sürüm varsa önce
  sorulur; onaylanırsa indirilir, doğrulanır, kurulur ve uygulama yeniden açılır. "Şimdi değil" denirse ya da
  internet yoksa uygulama olağan açılır. Kayıtlar etkilenmez. Önceki sürümlerden 1.1.0'a bir kez elle geçilir.

## 1.0.0 — 2026-10-31

İlk tam sürüm. Uygulama yaklaşık 3 saatlik gerçek bir oturumda sorunsuz kullanıldı; müzik ve ortam
seslerinin Discord pencere paylaşımında karşıya gittiği de denendi. Bu sürümde yeni özellik yok,
davranış 0.9.9 ile aynı.

### Değişenler

- Belgeler güncellendi: Zar panelinde atış geçmişi listesinin kalktığı README ve PLAN'a da işlendi.

## 0.9.9 — 2026-10-29

### Eklenenler

- **İstatistikle zar:** kontrol panelinin Zar panelinde karakter ve istatistik seçilir; zar düğmesine
  (d20, d10 ya da d4) basınca istatistiğin artısı ve o oyuncunun geçici artı / eksileri kendiliğinden
  eklenir. Hedef ve yeterlilik yoktur, yalnızca toplam. Avantaj / dezavantaj seçilebilir (her zarla;
  atıştan sonra Normal'e döner). Sayılı artı / eksiler bu atışta da bir azalır.
- Oyun ekranında bu atışlar da beceriler gibi gösterilir: artı / eksiler uçarak eklenir, altta oyuncu
  ve istatistiğin adı yazar.

### Değişenler

- Zar panelindeki atış geçmişi listesi kalktı; yerinde karakter / istatistik seçimi var. "Son atış"
  yalnızca zarı yazar, büyük sayı toplamdır, altında zar ve eklenen artı ("6 +3").
- Karakter seçilmezse zarlar eskisi gibi düz atılır.

## 0.9.8 — 2026-10-29

### Düzeltilenler

- MP4 yükleyince çıkan "nasıl kullanılsın?" penceresi, dosyanın adı uzun ve boşluksuzken (indirilen
  videolarda olduğu gibi) yana taşıyor, seçenekler kesiliyordu. Başlık kısaldı; dosyanın adı pencerenin
  içinde alt satırlara bölünerek yazar. Bütün pencerelerin başlıkları artık uzun adlarda bölünür.

### Değişenler

- Hareketli arka plan artık oyun sırasında kontrol panelinden verilir:
  - Döngü seçicide "Kaydedince … penceresinin arka planı yap" seçeneği (açık gelir): kaydedince video
    ekrandaki pencerenin arka planı olur.
  - Müzik listesinde döngüsü seçilmiş videoların yanında "Arka plan yap" düğmesi; ekrandaki pencerenin
    arka planıysa "Ekranda" yazar, basınca kaldırır.
- Ayarlar › Pencereler'deki arka plan seçici eskisi gibi çalışır.

## 0.9.7 — 2026-10-28

### Eklenenler

- **Ayarlar › Sınıflar:** sınıf (Savaşçı, Büyücü…) ve becerileri DM tanımlar. Beceri: ad, hangi
  istatistikle atıldığı ve başarmak için en az kaç gelmesi gerektiği. Sıralanır, adı değişir, silinir.
- **Oyuncu kartında karakter:** sınıf, altı istatistik (STR, DEX, CON, INT, WIS, CHA; 1–30) ve artı /
  eksileri (10-11 → 0, her 2 puan bir), yeterlilik (seviyeden: 1-4 → 2 … 17+ → 6; istenirse elle).
- **Kontrol paneli › Karakterler:** dört eşit sütun, her biri bir oyuncu yuvası; boş yuvanın yeri boş
  kalır. Sütunda sınıf, istatistikler, Normal / Avantaj / Dezavantaj, beceri düğmeleri, son atış ve
  geçici artı / eksiler. Oyun sırasında sınıf ve istatistik buradan da değiştirilir.
- **Beceri atışı:** d20 + istatistik artısı + geçici artı / eksiler; yeterlilik gereksinimden düşülür
  (gereksinimi 10 olan beceri, yeterliliği 2 olan oyuncu için 8). Toplam gereksinime eşit ya da
  büyükse başarılı. Avantajda iki d20'nin büyüğü, dezavantajda küçüğü alınır.
- **Oyun ekranında:** avantaj / dezavantajda iki zar yan yana düşer, alınmayan soluklaşır. Artı / eksiler
  ekranın kenarından tek tek uçup sayıya çarpar, sayı adım adım değişir; sonunda "Başarılı" /
  "Başarısız" ve gereksinim yazar. Altta oyuncu ve beceri adı.
- **Geçici artı / eksi:** açıklamalı ("İyi rol +2", "Kırık kol -1"), hazır değerler (-2, -1, +1, +2) ya
  da elle; süre kaç atış (1–99) ya da kalıcı. Sayılı olanlar o oyuncunun her beceri atışında bir
  azalır; düz zar düğmeleri saymaz. Kayda girer.
- Zar geçmişinde beceri atışları oyuncu, beceri, toplam / gereksinim ve ✓ / ✗ ile yazar.
- Karakter dosyası (sürüm 2) istatistikleri, yeterliliği ve sınıfı (becerileriyle) taşır. İçe
  aktarırken aynı adda sınıf varsa o kullanılır, yoksa becerileriyle eklenir. Eski dosyalar okunur.
- Kontrol panelinin üst sekmeleri: Kontrol Paneli, Karakterler, Müzik.
- Yeni hata kodu: DND-402 (beceri atışı yapılamadı).

## 0.9.6 — 2026-10-28

### Eklenenler

- Kontrol panelinin üstünde tarayıcıdaki gibi sekmeler: **Kontrol Paneli** (eski ekran) ve **Müzik**.
  Sekme değişince hiçbir şey durmaz; müzik çalmaya, 1–9 tuşları pencere değiştirmeye devam eder.
- **Müzik:** MP3, OGG, WAV, M4A ve MP4 yüklenir (düğmeyle ya da sürükleyerek). Çal / duraklat, ilerleme
  çubuğuyla ileri-geri sarma, önceki / sonraki parça, durdur, tekrar (kapalı / listeyi tekrarla / bu
  parçayı tekrarla) ve ses düzeyi. Parçalar yeniden adlandırılır, sıralanır, silinir.
- Ses oyun ekranı penceresinden çalar: Discord'da o pencere paylaşılınca müzik de oyunculara gider.
- **Ortam sesleri:** kuş sesi, yağmur gibi kendi eklenen düğmeler. Basınca döngüde çalar, yeniden
  basınca durur; birkaçı müzikle birlikte aynı anda çalabilir. Her birinin kendi ses düzeyi ve ortam
  seslerinin genel ses düzeyi var. "Hepsini durdur" düğmesi.
- **Hareketli arka plan:** MP4 yükleyince "Yalnızca ses" ya da "Ses + hareketli görüntü" diye sorulur.
  İkincisinde videonun bir bölümü (başlangıç-bitiş) seçilir; o bölüm GIF gibi sessiz döner. Ayarlar ›
  Pencereler'deki arka plan seçicide "Hareketli arka planlar" bölümünden bir pencereye verilir. Videonun
  sesi kendiliğinden başlamaz, müzik listesinden elle çalınır.
- Dosyalar kayıt klasöründeki `muzik\` altında durur. Liste, ortam sesleri ve ses düzeyleri kayda girer;
  çalan parça kayda girmez, oyun bitince müzik susar.
- Yeni hata kodları: DND-501 (desteklenmeyen ses dosyası), DND-502 (kopyalanamadı), DND-503
  (çalınamadı), DND-504 (2 GB sınırı), DND-505 (dosyası silinemedi), DND-506 (videoda görüntü yok).

### Bilinen sınır

- Discord'da yalnızca oyun penceresini sesle paylaşınca müziğin karşıya gittiği henüz gerçek bir
  oturumda denenmedi. Gitmezse yedek yol, Discord'da ekranın tamamını sesle paylaşmaktır.

## 0.9.5 — 2026-10-26

### Değişenler

- Kontrol panelindeki kütüphanede Mekanlar ve Sahneler bölmesindeki bir görsele tıklamak artık onu
  arka plan yapmaz; diğer bölmeler gibi görseli oyun ekranının üstüne ekler. Yeri ve boyutu oyun
  ekranında elle ayarlanır.
- Pencerenin arka planı yalnızca Ayarlar › Pencereler'deki arka plan seçiciden konur.

## 0.9.4 — 2026-10-05

### Değişenler

- d3 zarı kaldırıldı, yerine d4 geldi. Zarlar artık d20, d10 ve d4.
- d4 gerçek biçimindedir (dört yüzlü piramit): bir köşesi üstte durur, sonuç o köşedeki sayıdır ve
  görünen üç yüzde de yazar. Kontrol panelindeki üçüncü zar düğmesi "d4" oldu.
- Piramit masada yuvarlanmadığı için d4'ün atışı öbür zarlardan biraz kısadır.
- Eski bir oturumdan kalan d3 atışları geçmişe alınmaz.

### Bilinen sınır

- Oyun ekranı masaya tam tepeden baktığı için duran d4'ün üzerindeki sayılar basık görünür; sonuç
  zarın üstünde beliren büyük sayıdan okunur.

## 0.9.3 — 2026-10-05

### Eklenenler

- Karakterleri dışa / içe aktarma (Ayarlar › Oyuncular). "Dışa aktar" dolu kartları (isim, seviye,
  can, not, portre) tek bir `.dndkarakter` dosyasına yazar. "İçe aktar" dosyayı okur, hangi
  kartların değişeceğini gösterir ve onaydan sonra uygular.
- İçe aktarmada dosyadaki kart aynı numaralı kartın yerine geçer; dosyada olmayan karta
  dokunulmaz, zaten aynı olan kart yeniden yazılmaz. Yerine geçilen kartın eski portresi Geri
  Dönüşüm Kutusu'na gider.
- Bozuk, kesik ya da başka türde bir dosya kartlara dokunmadan reddedilir. Yeni hata kodları:
  DND-111 (dosya yazılamadı), DND-112 (dosya okunamadı), DND-113 (dosya daha yeni bir sürüme ait).

### Değişmeyenler

- Kütüphane, pencereler ve ayarlar dosyaya girmez; yalnızca dört kart taşınır.

## 0.9.2 — 2026-10-05

### Eklenenler

- İki yeni zar: d10 (on uçurtma yüzlü gerçek d10 biçimi, yüzlerde 1-10) ve d3 (yüzlerinde 1-2-3
  ikişer kez yazan küp). İkisi de d20 gibi oyun ekranına düşer, yuvarlanır ve atılan sayıyla durur.
- Kontrol panelinde üç zar düğmesi: d20, d10, d3. "Son atış" kutusu ve atış geçmişi hangi zarın
  atıldığını gösterir.

### Değişenler

- 20 ve 1 vurgusu (altın / kırmızı) yalnızca d20 için geçerlidir.
- Zar kodu tek bir zara göre yazılı olmaktan çıkarıldı: biçim ayrı bir tanım, fizik ve çizim ortak.
  d20'nin görünüşü ve davranışı aynıdır.

## 0.9.1 — 2026-10-05

### Eklenenler

- Kalem kalınlığı: ince, orta, kalın. Kontrol panelinden seçilir; çizilmiş çizgiler kendi
  kalınlığını korur.
- Silgi: çizginin yalnızca üstünden geçilen kısmını siler, alttaki görsellere dokunmaz. İmleç
  silginin çapını gösterir. Silgi izi de Ctrl+Z ile geri alınır.

### Değişenler

- Kontrol panelindeki araç düğmeleri tek satırda dört araç olacak şekilde yeniden düzenlendi
  (Fare, Kırmızı, Siyah, Silgi). "Çizimi temizle" açıklaması düğmenin ipucuna taşındı.

## 0.9.0 — 2026-10-05

Sürüm 1.0 yolunun ilk adımı: kayıt yeri.

### Eklenenler

- İlk açılışta kayıt klasörünün yeri sorulur; uygulama seçilen yerin içine `DndOynatma-Kayit`
  klasörünü açar. Önerilen yer bulut eşitlemesi dışındadır; OneDrive, Dropbox ya da Google Drive
  içindeki bir yer seçilirse uyarı gösterilir.
- Eski kayıt (`Belgeler\DndOynatma`) bulunursa yeni klasöre taşınması önerilir: önce kopyalanır,
  kopya doğrulanınca eski klasör Geri Dönüşüm Kutusu'na gönderilir.
- Ayarlar › Genel'de "Klasörü değiştir": kayıt yeni klasöre taşınır ve uygulama yeniden başlar.
- Seçilen kayıt klasörü bulunamazsa (disk takılı değil, klasör taşınmış) boş kayıt açılmaz;
  yeniden deneme ya da başka klasör seçme sorulur.
- Hata kodları DND-107 – DND-110.

### Değişenler

- Kayıt artık `Belgeler\DndOynatma` klasörüne yazılmıyor.

## 0.8.1 — 2026-10-05

Faz 1 düzeltmeleri.

### Eklenenler

- Görsel döndürme: seçili görselde R / Shift+R ile çeyrek tur, seçim çerçevesindeki tutamaçla
  serbest açı (0 / 90 / 180 / 270 dereceye yapışır), kontrol panelinde her görsel ve arka plan
  için 90° döndürme düğmesi.
- Kontrol panelinin açılacağı monitör de Ayarlar › Genel'den seçilebilir.

### Değişenler

- Kalem: çizimler artık fareye dönünce silinmiyor; yalnızca "Çizimi temizle" siler. Çizim
  yapıldığı pencereye aittir: başka pencereye geçince gizlenir, geri dönünce yerindedir.
- Monitör seçimi "Otomatik"teyken oyun ekranı artık en büyük monitörde, kontrol paneli diğerinde
  açılıyor (önceden oyun ekranı ikinci monitöre gidiyordu).

### Uyumluluk

- 0.8.0 ile yazılmış kayıtlar açılır; görseller döndürülmemiş (0°) olarak gelir.

## 0.8.0 — 2026-10-04

Faz 1'in ilk çalışan sürümü. Yol haritasındaki 0–8. adımlar bu sürümde birlikte geldi.

### Eklenenler

- Ana menü: Oyna, Ayarlar, Çıkış.
- İki pencere: oyun ekranı (oyuncuların gördüğü) ve kontrol paneli (DM); iki monitörde
  otomatik yerleşim, oyun ekranı için tam ekran (F11).
- Oyuncu profilleri: 4 kart (portre, isim, seviye); dolu kartlar oyunda görünür.
- Oyun ekranında kilitli portre sütunu: çerçeveli portre, isim, seviye, 10'luk can barı;
  can 0 olunca soluk görünüm.
- Kütüphane: 8 bölme, dosya seçerek ya da sürükleyip bırakarak yükleme, arama, silme
  (Geri Dönüşüm Kutusu'na), İtem ↔ Takım Eşyası geçişi.
- Oyun alanı: arka plan, görsel koyma, taşıma, oranı koruyan boyutlandırma, öne/arkaya alma,
  silme, etiket.
- Pencereler: ad, arka plan, 1–9 atama tuşu; her pencere kendi görsellerini hatırlar.
- Kontrol paneli: can (kutucuk, −1/+1, hızlı giriş), seviye, oyuncu notu, genel not,
  araç seçimi, pencere listesi, ekrandakiler listesi.
- Kalem: kırmızı ve siyah serbest çizim; fareye dönünce ve pencere değişince silinir.
- d20: üç boyutlu zar animasyonu, sonuç ve atış geçmişi.
- Otomatik kayıt: güvenli yazma, yedek dosya, bozuk kayıtta yedekten açma.
- Log dosyası ve sabit hata kodları (`HATA_KODLARI.md`); beklenmedik kapanıştan sonra uyarı.
- Windows kurulum dosyası.

### Bilinenler

- Kurulum dosyası imzasızdır; Windows ilk çalıştırmada uyarı gösterebilir.
- Zarı yalnızca DM atar; oyuncuların bağlanması Faz 2'dedir.
