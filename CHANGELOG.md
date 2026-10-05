# Sürüm Geçmişi

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
