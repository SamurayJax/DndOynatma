# Sürüm Geçmişi

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
