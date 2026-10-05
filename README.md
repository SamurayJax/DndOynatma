# DndOynatma

DnD oturumlarında Canva yerine kullanılan masaüstü sahne yönetim uygulaması. DM yönetir,
oyuncular ekran paylaşımından (Discord / Teams) izler.

**Sürüm:** 0.9.0 (Windows)

## Ne yapar

- **İki pencere:** oyuncuların gördüğü *oyun ekranı* ve yalnızca DM'in gördüğü *kontrol paneli*.
  Ekran paylaşımında sadece oyun ekranı paylaşılır.
- **Oyuncu portreleri:** en fazla 4 oyuncu; portre, isim, seviye ve 10'luk can barı. Portreler
  kilitlidir, can 0 olunca soluklaşır.
- **Kütüphane:** NPC'ler, Tüccarlar, Mekanlar, Sahneler, Düşmanlar, Boss'lar, Takım Eşyaları,
  İtemler. Görsele tıklayınca oyun ekranına gelir; oyuncular kütüphaneyi görmez.
- **Oyun alanı:** görseller taşınır, oranı bozulmadan boyutlandırılır, döndürülür,
  öne/arkaya alınır, etiket alır ("7 LVL").
- **Pencereler:** "Kraliyet İçi", "Orman Yolu" gibi hazır düzenler; 1–9 tuşlarıyla geçilir.
- **Kalem:** kırmızı ve siyah; çizim yalnızca "Çizimi temizle" ile silinir, fareye geçince kalır.
- **d20:** kontrol panelinden atılır, oyun ekranında zar düşer ve sonucu gösterir.
- **Otomatik kayıt:** her değişiklik kaydedilir; bilgisayar kapanıp açılsa da kaldığı yerden devam eder.
- **Log ve hata kodları:** yapılan işlemler ve hatalar kodlarıyla log dosyasına yazılır.

Ayrıntılı özellik tanımı: [PLAN.md](PLAN.md)

## Kurulum

`DndOynatma-Kurulum-<sürüm>.exe` dosyasını çalıştır. Yönetici izni gerekmez; masaüstüne ve
Başlat menüsüne kısayol ekler. Kurulum dosyası imzasız olduğu için Windows ilk çalıştırmada
uyarı gösterebilir ("Ek bilgi" → "Yine de çalıştır").

Kurulum dosyasının nasıl üretildiği: [docs/PAKETLEME.md](docs/PAKETLEME.md)

## Kullanım

1. **Ayarlar › Oyuncular:** oyuncuların portresini, adını ve seviyesini gir. Dolu kartlar oyunda
   görünür, boş kartlar görünmez.
2. **Ayarlar › Kütüphane:** görselleri bölmelere yükle (PNG, JPG, WEBP).
3. **Ayarlar › Pencereler:** sahnelerini oluştur, arka plan ve atama tuşu ver.
4. **Ayarlar › Genel:** oyun ekranının ve kontrol panelinin açılacağı monitörü seç
   ("Otomatik": oyun ekranı en büyük monitörde).
5. **Oyna:** oyun ekranı ve kontrol paneli açılır. Discord / Teams'te yalnızca
   "DndOynatma — Oyun Ekranı" penceresini paylaş.

Oyun ekranında:

| Tuş / hareket | İş |
|---------------|----|
| Tıkla, sürükle | görseli seç, taşı |
| Köşeden sürükle | boyutlandır (oran korunur) |
| R / Shift+R | seçili görseli 90° döndür (saat yönü / ters yön) |
| Üstteki tutamaç | serbest döndür (düz açılara yapışır) |
| Çift tıkla (boş alana) | arka planı seç |
| Delete | seçili görseli kaldır |
| PageUp / PageDown | bir öne / bir arkaya |
| Home / End | en öne / en arkaya |
| 1–9 | pencere değiştir |
| F11 | tam ekran |

## Kayıt ve log

Uygulama ilk açılışta kaydın nereye yapılacağını sorar ve seçilen yerin içine `DndOynatma-Kayit`
klasörünü açar. Klasör Ayarlar › Genel'den açılır ("Kayıt klasörünü aç") ve taşınır
("Klasörü değiştir"). İçinde:

| Dosya / klasör | İçerik |
|----------------|--------|
| `kayit.json` | profiller, pencereler, görsel yerleşimleri, notlar |
| `kayit.yedek.json` | bir önceki sağlam kayıt |
| `gorseller\` | yüklenen görseller |
| `zar.json` | aktif oyunun zar atışları |
| `log\` | günlük log dosyaları (son 30 gün) |

Hata kodlarının anlamı: [HATA_KODLARI.md](HATA_KODLARI.md)

## Geliştirme

Gereken: Node.js 22 veya üstü.

```bash
npm install
npm run dev
```

| Komut | İş |
|-------|----|
| `npm run dev` | geliştirme modunda çalıştırır |
| `npm run typecheck` | tip kontrolü |
| `npm test` | birim testleri |
| `npm run build` | derleme (`out/`) |
| `npm run dist` | kurulum dosyası (`release/`) |

Kodun düzeni: [docs/GELISTIRME.md](docs/GELISTIRME.md)

## Sürüm geçmişi

[CHANGELOG.md](CHANGELOG.md)
