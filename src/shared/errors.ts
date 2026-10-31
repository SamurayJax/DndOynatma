/**
 * Sabit hata kodları. Her bilinen durumun bir kodu ve açıklaması vardır; log dosyasına
 * ve ekrandaki bildirime bu kodla yazılır. Liste `HATA_KODLARI.md` ile aynı tutulur.
 *
 * Aralıklar: 1xx kayıt/dosya · 2xx kütüphane/görsel · 3xx pencere/oyun ekranı · 4xx zar · 5xx müzik/ses · 9xx beklenmeyen
 */

export type LogLevel = 'BILGI' | 'UYARI' | 'HATA'

export interface ErrorInfo {
  level: LogLevel
  title: string
  /** Sebep ve ne yapılacağı. */
  description: string
}

export const ERROR_CODES = {
  'DND-101': {
    level: 'UYARI',
    title: 'Kayıt dosyası okunamadı, yedekten açıldı',
    description: 'kayit.json bozuk ya da eksikti. Bir önceki sağlam kayıt (kayit.yedek.json) yüklendi; son değişiklikler kaybolmuş olabilir.'
  },
  'DND-102': {
    level: 'HATA',
    title: 'Kayıt ve yedek okunamadı, boş kayıtla başlandı',
    description: 'Hem kayit.json hem kayit.yedek.json okunamadı. Bozuk dosyalar silinmedi, adlarına ".bozuk" eklenerek saklandı. Okunamayan dosya kenara da alınamadıysa (kilitli), üzerine yazmamak için bu oturumda kayıt kapatılır.'
  },
  'DND-103': {
    level: 'HATA',
    title: 'Kayıt yazılamadı',
    description: 'Kayıt klasörüne yazılamadı (disk dolu, klasör kilitli ya da izin yok). Değişiklikler bellekte duruyor; yazma kendiliğinden, aralıkları uzayarak yeniden denenir.'
  },
  'DND-104': {
    level: 'HATA',
    title: 'Kayıt klasörü oluşturulamadı',
    description: 'Belgeler\\DndOynatma klasörü oluşturulamadı ya da açılamadı.'
  },
  'DND-105': {
    level: 'UYARI',
    title: 'Zar kaydı okunamadı ya da yazılamadı',
    description: 'zar.json okunamadı ya da yazılamadı. Zar atmaya devam edilebilir; yalnızca geçmiş kaydı etkilenir.'
  },
  'DND-106': {
    level: 'HATA',
    title: 'Kayıt daha yeni bir sürüme ait',
    description: 'kayit.json bu sürümün tanımadığı bir şemayla yazılmış. Dosyaya dokunulmadı; uygulamayı güncelleyin.'
  },
  'DND-107': {
    level: 'UYARI',
    title: 'Kayıt klasörü bulunamadı',
    description: 'Seçilmiş kayıt klasörü yerinde yok (taşınmış, silinmiş ya da bulunduğu disk takılı değil). Boş kayıt açılmaz; klasör yeniden sorulur.'
  },
  'DND-108': {
    level: 'HATA',
    title: 'Kayıt klasörü kullanılamıyor',
    description: 'Seçilen yerde klasör oluşturulamadı ya da klasöre yazılamıyor. Başka bir klasör seçin.'
  },
  'DND-109': {
    level: 'HATA',
    title: 'Kayıt taşınamadı',
    description: 'Kayıt yeni klasöre kopyalanamadı ya da kopya doğrulanamadı. Eski kayıt yerinde duruyor ve kullanılmaya devam ediyor.'
  },
  'DND-110': {
    level: 'UYARI',
    title: 'Eski kayıt klasörü kaldırılamadı',
    description: 'Kayıt yeni klasöre taşındı ama eski klasör Geri Dönüşüm Kutusu\'na gönderilemedi. Eski klasör yerinde duruyor; elle silinebilir.'
  },
  'DND-111': {
    level: 'HATA',
    title: 'Karakter dosyası yazılamadı',
    description: 'Dışa aktarılan karakter dosyası seçilen yere yazılamadı (disk dolu, klasör kilitli ya da izin yok). Kayıt etkilenmez; başka bir yer seçin.'
  },
  'DND-112': {
    level: 'UYARI',
    title: 'Karakter dosyası okunamadı',
    description: 'Seçilen dosya bir DndOynatma karakter dosyası değil ya da bozuk. Kartlara dokunulmadı.'
  },
  'DND-113': {
    level: 'UYARI',
    title: 'Karakter dosyası daha yeni bir sürüme ait',
    description: 'Dosya bu sürümün tanımadığı bir biçimle yazılmış. Kartlara dokunulmadı; uygulamayı güncelleyin.'
  },
  'DND-201': {
    level: 'UYARI',
    title: 'Desteklenmeyen dosya türü',
    description: 'Yalnızca PNG, JPG ve WEBP yüklenebilir. Dosya atlandı.'
  },
  'DND-202': {
    level: 'HATA',
    title: 'Görsel kopyalanamadı',
    description: 'Seçilen dosya kayıt klasörüne kopyalanamadı (dosya taşınmış, kilitli ya da disk dolu olabilir).'
  },
  'DND-203': {
    level: 'UYARI',
    title: 'Görsel dosyası bulunamadı',
    description: 'Kütüphanede kaydı olan görselin dosyası gorseller klasöründe yok (elle silinmiş olabilir). Görsel boş kutu olarak gösterilir.'
  },
  'DND-204': {
    level: 'UYARI',
    title: 'Görsel okunamadı',
    description: 'Dosya bozuk ya da boyutu okunamadı. Dosya atlandı.'
  },
  'DND-205': {
    level: 'UYARI',
    title: 'Görsel dosyası silinemedi',
    description: 'Görsel kütüphaneden kaldırıldı ama dosyası diskten silinemedi. Dosya gorseller klasöründe kalır.'
  },
  'DND-206': {
    level: 'UYARI',
    title: 'Dosya çok büyük',
    description: 'Görsel 50 MB sınırını aşıyor. Dosya atlandı.'
  },
  'DND-301': {
    level: 'BILGI',
    title: 'Pencere bulunamadı',
    description: 'İşlem yapılan pencere artık yok. Genellikle hata değildir: pencere silinirken ona ait başka bir işlem gönderilmiştir.'
  },
  'DND-302': {
    level: 'BILGI',
    title: 'Öğe bulunamadı',
    description: 'İşlem yapılan görsel artık yok. Genellikle hata değildir: aynı anda iki işlem yapılmıştır (ör. görsel silinirken taşınması).'
  },
  'DND-303': {
    level: 'BILGI',
    title: 'Atama tuşu başka pencereden alındı',
    description: 'Seçilen tuş başka bir pencereye atanmıştı; tuş yeni pencereye geçti, eskisinin tuşu boşaldı.'
  },
  'DND-304': {
    level: 'BILGI',
    title: 'Oyun durumu uyuşmuyor',
    description: 'Oyun zaten açıkken açılmak ya da kapalıyken kapatılmak istendi. İşlem yok sayıldı.'
  },
  'DND-305': {
    level: 'HATA',
    title: 'Pencere beklenmedik şekilde kapandı',
    description: 'Oyun ekranı ya da kontrol paneli çöktü. Oyun kapatıldı; kayıt korunur.'
  },
  'DND-306': {
    level: 'UYARI',
    title: 'Geçersiz işlem',
    description: 'Tanınmayan ya da eksik alanlı bir işlem gönderildi; yok sayıldı.'
  },
  'DND-307': {
    level: 'BILGI',
    title: 'Oyuncu yuvası geçersiz',
    description: 'Var olmayan bir oyuncu yuvası için işlem gönderildi; yok sayıldı.'
  },
  'DND-401': {
    level: 'BILGI',
    title: 'Zar atılamadı',
    description: 'Oyun açık değilken zar atılmak istendi; yok sayıldı.'
  },
  'DND-402': {
    level: 'UYARI',
    title: 'Beceri atışı yapılamadı',
    description: 'Atılmak istenen beceri artık yok ya da oyuncunun sınıfında değil (sınıf bu arada değişmiş ya da silinmiş olabilir). Zar atılmadı.'
  },
  'DND-501': {
    level: 'UYARI',
    title: 'Desteklenmeyen ses dosyası',
    description: 'Yalnızca MP3, OGG, WAV, M4A ve MP4 yüklenebilir. Dosya atlandı.'
  },
  'DND-502': {
    level: 'HATA',
    title: 'Ses dosyası kopyalanamadı',
    description: 'Seçilen dosya kayıt klasörüne (muzik) kopyalanamadı (dosya taşınmış, kilitli ya da disk dolu olabilir).'
  },
  'DND-503': {
    level: 'UYARI',
    title: 'Ses dosyası çalınamadı',
    description: 'Parçanın dosyası muzik klasöründe yok (elle silinmiş olabilir) ya da bozuk / çözülemeyen bir biçimde. Müzik durdu; listeden başka bir parça seçilebilir.'
  },
  'DND-504': {
    level: 'UYARI',
    title: 'Ses dosyası çok büyük',
    description: 'Dosya 2 GB sınırını aşıyor. Dosya atlandı.'
  },
  'DND-505': {
    level: 'UYARI',
    title: 'Ses dosyası silinemedi',
    description: 'Parça ya da ortam sesi listeden kaldırıldı ama dosyası diskten silinemedi. Dosya muzik klasöründe kalır.'
  },
  'DND-506': {
    level: 'UYARI',
    title: 'Videoda görüntü yok',
    description: 'Seçilen MP4 dosyasında oynatılabilen bir görüntü bulunamadı. Parça yalnızca ses olarak eklendi.'
  },
  'DND-601': {
    level: 'BILGI',
    title: 'Güncelleme denetlenemedi',
    description: 'Son sürüme bakılamadı (internet yok ya da GitHub yanıt vermedi). Uygulama olağan açılır; bir sonraki açılışta yeniden denenir.'
  },
  'DND-602': {
    level: 'UYARI',
    title: 'Güncelleme indirilemedi',
    description: 'Yeni sürüm indirilemedi ya da dosya doğrulanamadı. Hiçbir şey kurulmadı; uygulama olduğu gibi duruyor.'
  },
  'DND-901': {
    level: 'HATA',
    title: 'Beklenmeyen hata (ana süreç)',
    description: 'Yakalanmamış bir hata oluştu. Ayrıntı log dosyasındadır.'
  },
  'DND-902': {
    level: 'HATA',
    title: 'Beklenmeyen hata (arayüz)',
    description: 'Bir pencerede yakalanmamış hata oluştu. Ayrıntı log dosyasındadır.'
  },
  'DND-903': {
    level: 'UYARI',
    title: 'Önceki oturum beklenmedik şekilde kapandı',
    description: 'Uygulama geçen sefer düzgün kapatılmadı (çökme ya da bilgisayarın kapanması). Kayıt korunur; ayrıntı için önceki log dosyasına bakın.'
  }
} as const satisfies Record<string, ErrorInfo>

export type ErrorCode = keyof typeof ERROR_CODES

export function errorInfo(code: ErrorCode): ErrorInfo {
  return ERROR_CODES[code]
}
