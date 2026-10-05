# Hata Kodları

Uygulamanın bildiği her durumun sabit bir kodu vardır. Kod hem ekrandaki bildirimde hem de
log dosyasında (kayıt klasöründeki `log\dndoynatma-YYYY-AA-GG.log`) görünür. Kayıt klasörü henüz
seçilmemişken (ilk açılış) log `%APPDATA%\DndOynatma\log` altına yazılır.

Log satırı biçimi: `SS:DD:SN.mmm [SEVIYE] [KOD] mesaj`

Seviyeler:

- **BILGI** — hata değil; ne olduğunun kaydı (ör. aynı anda iki işlem yapıldı).
- **UYARI** — bir şey atlandı ya da yedeğe düşüldü; uygulama çalışmaya devam ediyor.
- **HATA** — işlem tamamlanamadı.

Kodların kaynağı `src/shared/errors.ts` dosyasıdır; bu liste onunla aynı tutulur.

## 1xx — Kayıt ve dosya

| Kod | Seviye | Durum | Açıklama |
|-----|--------|-------|----------|
| DND-101 | UYARI | Kayıt dosyası okunamadı, yedekten açıldı | `kayit.json` bozuk ya da eksikti. Bir önceki sağlam kayıt (`kayit.yedek.json`) yüklendi; son değişiklikler kaybolmuş olabilir. |
| DND-102 | HATA | Kayıt ve yedek okunamadı, boş kayıtla başlandı | İki dosya da okunamadı. Bozuk dosyalar silinmedi, adlarına `.bozuk` eklenerek saklandı. Okunamayan dosya kenara da alınamadıysa (kilitli), üzerine yazmamak için bu oturumda kayıt kapatılır. |
| DND-103 | HATA | Kayıt yazılamadı | Kayıt klasörüne yazılamadı (disk dolu, klasör kilitli ya da izin yok). Değişiklikler bellekte durur; yazma kendiliğinden, aralıkları uzayarak yeniden denenir. |
| DND-104 | HATA | Kayıt klasörü oluşturulamadı | `Belgeler\DndOynatma` klasörü oluşturulamadı ya da açılamadı. |
| DND-105 | UYARI | Zar kaydı okunamadı ya da yazılamadı | `zar.json` okunamadı ya da yazılamadı. Zar atmaya devam edilebilir; yalnızca geçmiş kaydı etkilenir. |
| DND-107 | UYARI | Kayıt klasörü bulunamadı | Seçilmiş kayıt klasörü yerinde yok (taşınmış, silinmiş ya da bulunduğu disk takılı değil). Boş kayıt açılmaz; klasör yeniden sorulur. |
| DND-108 | HATA | Kayıt klasörü kullanılamıyor | Seçilen yerde klasör oluşturulamadı ya da klasöre yazılamıyor. Başka bir klasör seçin. |
| DND-109 | HATA | Kayıt taşınamadı | Kayıt yeni klasöre kopyalanamadı ya da kopya doğrulanamadı. Eski kayıt yerinde duruyor ve kullanılmaya devam ediyor. |
| DND-110 | UYARI | Eski kayıt klasörü kaldırılamadı | Kayıt yeni klasöre taşındı ama eski klasör Geri Dönüşüm Kutusu'na gönderilemedi. Eski klasör yerinde duruyor; elle silinebilir. |
| DND-106 | HATA | Kayıt daha yeni bir sürüme ait | `kayit.json` bu sürümün tanımadığı bir şemayla yazılmış. Dosyaya dokunulmadı; uygulamayı güncelleyin. |

## 2xx — Kütüphane ve görseller

| Kod | Seviye | Durum | Açıklama |
|-----|--------|-------|----------|
| DND-201 | UYARI | Desteklenmeyen dosya türü | Yalnızca PNG, JPG ve WEBP yüklenebilir. Dosya atlandı. |
| DND-202 | HATA | Görsel kopyalanamadı | Seçilen dosya kayıt klasörüne kopyalanamadı (dosya taşınmış, kilitli ya da disk dolu olabilir). |
| DND-203 | UYARI | Görsel dosyası bulunamadı | Kütüphanede kaydı olan görselin dosyası `gorseller` klasöründe yok (elle silinmiş olabilir). Görsel boş kutu olarak gösterilir. |
| DND-204 | UYARI | Görsel okunamadı | Dosya bozuk ya da boyutu okunamadı. Dosya atlandı. |
| DND-205 | UYARI | Görsel dosyası silinemedi | Görsel kütüphaneden kaldırıldı ama dosyası diskten silinemedi. Dosya `gorseller` klasöründe kalır. |
| DND-206 | UYARI | Dosya çok büyük | Görsel 50 MB sınırını aşıyor. Dosya atlandı. |

## 3xx — Pencereler ve oyun ekranı

| Kod | Seviye | Durum | Açıklama |
|-----|--------|-------|----------|
| DND-301 | BILGI | Pencere bulunamadı | İşlem yapılan pencere artık yok. Genellikle hata değildir: pencere silinirken ona ait başka bir işlem gönderilmiştir. |
| DND-302 | BILGI | Öğe bulunamadı | İşlem yapılan görsel artık yok. Genellikle hata değildir: aynı anda iki işlem yapılmıştır (ör. görsel silinirken taşınması). |
| DND-303 | BILGI | Atama tuşu başka pencereden alındı | Seçilen tuş başka bir pencereye atanmıştı; tuş yeni pencereye geçti, eskisinin tuşu boşaldı. |
| DND-304 | BILGI | Oyun durumu uyuşmuyor | Oyun zaten açıkken açılmak ya da kapalıyken kapatılmak istendi. İşlem yok sayıldı. |
| DND-305 | HATA | Pencere beklenmedik şekilde kapandı | Oyun ekranı ya da kontrol paneli çöktü. Oyun kapatıldı; kayıt korunur. |
| DND-306 | UYARI | Geçersiz işlem | Tanınmayan ya da eksik alanlı bir işlem gönderildi; yok sayıldı. |
| DND-307 | BILGI | Oyuncu yuvası geçersiz | Var olmayan bir oyuncu yuvası için işlem gönderildi; yok sayıldı. |

## 4xx — Zar

| Kod | Seviye | Durum | Açıklama |
|-----|--------|-------|----------|
| DND-401 | BILGI | Zar atılamadı | Oyun açık değilken zar atılmak istendi; yok sayıldı. |

## 9xx — Beklenmeyen

| Kod | Seviye | Durum | Açıklama |
|-----|--------|-------|----------|
| DND-901 | HATA | Beklenmeyen hata (ana süreç) | Yakalanmamış bir hata oluştu. Ayrıntı log dosyasındadır. |
| DND-902 | HATA | Beklenmeyen hata (arayüz) | Bir pencerede yakalanmamış hata oluştu. Ayrıntı log dosyasındadır. |
| DND-903 | UYARI | Önceki oturum beklenmedik şekilde kapandı | Uygulama geçen sefer düzgün kapatılmadı (çökme ya da bilgisayarın kapanması). Kayıt korunur; ayrıntı için önceki log dosyasına bakın. |
