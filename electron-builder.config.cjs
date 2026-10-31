// Windows paketleme ayarları (electron-builder). Ayrıntı: docs/PAKETLEME.md
// DND_OUT_DIR: derlenmiş uygulamanın klasörü; verilmezse olağan `out/`. Paket içinde her zaman `out/` olur.
const outDir = process.env.DND_OUT_DIR || 'out'

module.exports = {
  appId: 'com.samurayjax.dndoynatma',
  productName: 'DndOynatma',
  directories: { output: 'release', buildResources: 'build' },

  // Yalnızca derlenmiş çıktı ve package.json paketlenir. Bütün kütüphaneler derlemenin içindedir
  // (ana süreçte electron-updater da); node_modules pakete girmez.
  files: [{ from: outDir, to: 'out' }, 'package.json', '!node_modules'],
  asar: true,
  npmRebuild: false,
  electronLanguages: ['tr', 'en-US'],
  // Otomatik güncelleme buradan okur. Yükleme komutla yapılır (docs/PAKETLEME.md); `dist` yalnızca
  // `latest.yml` ve pakete giren `app-update.yml` dosyalarını üretir.
  publish: { provider: 'github', owner: 'SamurayJax', repo: 'DndOynatma' },

  win: {
    target: [{ target: 'nsis', arch: ['x64'] }],
    icon: 'build/icon.ico'
  },

  nsis: {
    // Tek tıkla kurulum: yönetici izni istemez, kullanıcının kendi klasörüne kurar.
    oneClick: true,
    perMachine: false,
    // Yönetici izni kullanılmadığı için yardımcısı paketlenmez.
    packElevateHelper: false,
    // Güncelleme parça parça değil, kurulum dosyasının tamamı indirilerek yapılır; tek dosya yayımlanır.
    differentialPackage: false,
    createDesktopShortcut: true,
    createStartMenuShortcut: true,
    shortcutName: 'DndOynatma',
    artifactName: 'DndOynatma-Kurulum-${version}.${ext}',
    installerLanguages: ['tr_TR'],
    language: '1055',
    // Kaldırma yalnızca kurulum klasörünü siler; Belgeler\DndOynatma'ya dokunulmaz.
    deleteAppDataOnUninstall: false
  }
}
