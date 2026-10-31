# DndOynatma

DnD oturumlarında Canva yerine kullanılan masaüstü sahne yönetim uygulaması. DM yönetir,
oyuncular ekran paylaşımından (Discord / Teams) izler.

**Sürüm:** 1.0.0 (Windows)

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
- **Kalem:** kırmızı ve siyah, üç kalınlık; silgi çizginin değdiği kısmını siler. Çizimin tamamı
  yalnızca "Çizimi temizle" ile silinir, fareye geçince kalır.
- **Zarlar:** d20, d10 ve d4 kontrol panelinden atılır; oyun ekranında zar düşer, yuvarlanır ve
  sonucu gösterir. Kontrol panelinde son atış görünür.
- **Müzik:** kontrol panelinin "Müzik" sekmesinden kendi dosyalarını (MP3, OGG, WAV, M4A, MP4) yükle,
  çal, ileri-geri sar; tekrar ve ses düzeyi ayarlanır. Ses oyun ekranından çıkar, yani Discord'da
  paylaşılan pencereden oyunculara gider.
- **Ortam sesleri:** kuş sesi, yağmur gibi kendi eklediğin düğmeler; müzikle birlikte, döngüde çalar.
  Her birinin kendi ses düzeyi var.
- **Hareketli arka plan:** MP4 yüklerken "Ses + hareketli görüntü" seçilirse videonun seçilen bölümü
  GIF gibi sessiz döner. Kaydederken ekrandaki pencerenin arka planı yapılır; sonradan müzik
  listesindeki "Arka plan yap" ya da Ayarlar › Pencereler ile değiştirilir.
- **Sınıflar ve beceriler:** sınıfları ve becerilerini sen tanımlarsın (Ayarlar › Sınıflar); her
  beceri bir istatistikle atılır ve bir gereksinimi vardır. Oyuncunun altı istatistiği (STR, DEX,
  CON, INT, WIS, CHA), sınıfı ve yeterliliği oyuncu kartında girilir.
- **Karakterler sekmesi:** kontrol panelinde dört sütun, her oyuncunun beceri düğmeleri. Basınca d20
  atılır (avantaj / dezavantajda iki zar); istatistik artısı ve verdiğin geçici artı / eksiler
  oyun ekranında uçarak sayıya eklenir, sonunda "Başarılı" ya da "Başarısız" yazar. Artı / eksiler
  açıklamalıdır ("İyi rol +2") ve birkaç atış ya da kalıcı sürer.
- **İstatistikle zar:** Zar panelinde karakter ve istatistik seçince zar düğmesi o istatistiğin artısını
  ve oyuncunun geçici artı / eksilerini kendisi ekler; avantaj / dezavantaj seçilebilir.
- **Karakter aktarma:** dört oyuncu kartı (isim, seviye, can, not, portre, istatistikler, sınıf) tek dosyaya aktarılır ve
  başka bir bilgisayarda geri alınır. Kütüphane ve pencereler taşınmaz.
- **Otomatik kayıt:** her değişiklik kaydedilir; bilgisayar kapanıp açılsa da kaldığı yerden devam eder.
- **Log ve hata kodları:** yapılan işlemler ve hatalar kodlarıyla log dosyasına yazılır.

Ayrıntılı özellik tanımı: [PLAN.md](PLAN.md)

## Kurulum

`DndOynatma-Kurulum-<sürüm>.exe` dosyasını çalıştır. Yönetici izni gerekmez; masaüstüne ve
Başlat menüsüne kısayol ekler. Kurulum dosyası imzasız olduğu için Windows ilk çalıştırmada
uyarı gösterebilir ("Ek bilgi" → "Yine de çalıştır").

Kurulum dosyasının nasıl üretildiği: [docs/PAKETLEME.md](docs/PAKETLEME.md)

## Kullanım

1. **Ayarlar › Sınıflar:** sınıfları ve becerilerini tanımla (ad, istatistik, en az kaç gelmeli).
2. **Ayarlar › Oyuncular:** oyuncuların portresini, adını, seviyesini, sınıfını ve istatistiklerini gir.
   Dolu kartlar oyunda görünür, boş kartlar görünmez. "Dışa aktar" kartları tek bir `.dndkarakter` dosyasına yazar;
   "İçe aktar" o dosyadaki kartları, hangilerinin değişeceğini gösterip onay aldıktan sonra getirir.
3. **Ayarlar › Kütüphane:** görselleri bölmelere yükle (PNG, JPG, WEBP).
4. **Ayarlar › Pencereler:** sahnelerini oluştur, arka plan ve atama tuşu ver.
5. **Ayarlar › Genel:** oyun ekranının ve kontrol panelinin açılacağı monitörü seç
   ("Otomatik": oyun ekranı en büyük monitörde).
6. **Oyna:** oyun ekranı ve kontrol paneli açılır. Discord / Teams'te yalnızca
   "DndOynatma — Oyun Ekranı" penceresini paylaş. Müzik de bu pencereden çalar; Discord'da
   paylaşırken sesi açık bırak.

Oyun ekranında:

| Tuş / hareket | İş |
|---------------|----|
| Tıkla, sürükle | görseli seç, taşı |
| Köşeden sürükle | boyutlandır (oran korunur) |
| R / Shift+R | seçili görseli 90° döndür (saat yönü / ters yön) |
| Ctrl+Z | kalem ya da silgi seçiliyken son izi geri al |
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
| `muzik\` | yüklenen müzikler, ortam sesleri ve MP4'ler |
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
