# Arayüz (renderer) rehberi

Özellik yazanlar için kısa kılavuz. Mimari `docs/GELISTIRME.md`, ürün tanımı `PLAN.md` içindedir.

## Genel kurallar

- Ana süreçle tek bağlantı `window.dnd` (`@shared/ipc` içindeki `DndApi`). Durumu arayüz değiştirmez; `dispatch(action)` gönderir.
- Takma adlar: `@renderer/*` → `src/renderer/src/*`, `@shared/*` → `src/shared/*`.
- Arayüz metinleri Türkçe, kod adları İngilizce. `any` yok.
- React 19: dönüş tipi için `import type { JSX } from 'react'` (genel `JSX` ad alanı artık yok).
- Uygulama `StrictMode` içinde çalışır: geliştirme modunda her etki (effect) bir kez fazladan kurulup
  sökülür. Abonelik, zamanlayıcı, tuval gibi her şeyin temizleme fonksiyonu olmalı.
- Ağ kaynağı yok (yazı tipi, CDN). Simge kütüphanesi yok; simgeler `@renderer/ui` içinden gelir.

## Durumu okumak ve değiştirmek

```tsx
import { dispatch, useApp, useSession } from '@renderer/lib/useAppState'

const app = useApp()          // AppState (kalıcı): players, library, scenes, settings…
const session = useSession()  // SessionState: tool, drawingNonce, diceHistory, phase
dispatch({ type: 'player/adjustHp', slot: 0, delta: -1 })
```

| Dışa aktarım | İş |
|---|---|
| `useFullState(): FullState \| null` | İlk durum gelene kadar `null`. Yalnızca kök bileşenler bununla bekler. |
| `useApp(): AppState` | Yalnızca `app` değişince yeniden çizer. Durum yüklenmeden çağrılırsa hata fırlatır. |
| `useSession(): SessionState` | Yalnızca `session` değişince yeniden çizer. Aynı kural. |
| `getFullState(): FullState \| null` | Olay işleyicisinde anlık okuma (abone olmaz). |
| `dispatch(action: Action): void` | `window.dnd.dispatch` sarmalayıcısı. |

- `GameScreen`, `ControlPanel` ve `MenuRoot` durumu bekler; altlarındaki her bileşen `useApp()` /
  `useSession()`'ı doğrudan kullanabilir.
- Her yayında değişmeyen dalların nesneleri aynı kalır (ör. yalnızca 2. oyuncunun canı değiştiyse
  `app.library` ve `app.players[0]` aynı nesnedir). `React.memo` ve `useMemo` bu sayede işe yarar.
- Yeni kimlik gereken işlemlerde (`scene/add`, `stage/addItem`…) kimliği gönderen üretir: `newId()` (`@shared/id`).
- Türetilmiş bilgi ve yerleşim için `@shared/layout`: `filledPlayers`, `playArea`, `findImage`,
  `activeScene`, `CATEGORIES`, `scenesUsingImage`, `coverRect`, `containRect`.

Diğer yardımcılar (`@renderer/lib/...`):

| Dışa aktarım | İş |
|---|---|
| `media.ts` → `imageUrl(image \| undefined): string \| null` | Görselin `<img>` / Konva adresi. |
| `useSceneHotkeys.ts` → `useSceneHotkeys(enabled = true)` | 1–9 ile pencere değiştirir. `GameScreen` ve `ControlPanel` kökünde çağrılır; başka yerde çağırmayın. Giriş alanında yazarken ve iletişim kutusu açıkken çalışmaz. |
| `useNotices.ts` → `toast(message, level = 'BILGI', code = null)` | Bu pencerede kısa mesaj (`@renderer/ui`'den de gelir). Loga yazmaz. |
| `useNotices.ts` → `useNotices()`, `dismissNotice(id)` | `ToastHost`'un kullandığı depo. |
| `useAppInfo.ts` → `useAppInfo(): AppInfo \| null` | Sürüm, klasör yolları, `crashedLastTime`. |
| `reportError.ts` → `reportError(context, error)` | Beklenmeyen hatayı DND-902 ile loga yazar. `describeError(error)` tek satırlık özet verir. |

## Ortak parçalar (`@renderer/ui`)

Hepsi tek yerden alınır: `import { Button, Panel, toast, TrashIcon } from '@renderer/ui'`.

| Parça | Kullanım |
|---|---|
| `Button` | `<Button variant="primary" size="lg" icon={<DiceIcon />} onClick={…}>d20 at</Button>` — `variant`: `primary \| secondary` (varsayılan) `\| danger \| ghost`; `size`: `sm \| md \| lg`; `block`; `active` (seçili araç gibi; `aria-pressed`). Diğer `<button>` özellikleri geçer. |
| `IconButton` | `<IconButton label="Sil" icon={<TrashIcon />} variant="danger" onClick={…} />` — `label` zorunlu (ipucu + ekran okuyucu). Varsayılan `ghost`. `active` destekler. |
| `Panel` | `<Panel title="Kütüphane" actions={<Button size="sm">Yükle</Button>}>…</Panel>` — `flush`: iç boşluk yok; `scroll`: gövde kendi içinde kayar (panelin yüksekliği dışarıdan sınırlı olmalı). |
| `Tabs` | `<Tabs tabs={[{ id: 'npc', label: "NPC'ler", badge: 12 }]} value={tab} onChange={setTab} label="Bölmeler" />` — yalnızca şeridi çizer; içerik `value`'ya göre sizde. `size="sm"`, `idBase`, `TabItem.icon/disabled`. |
| `Field` | `<Field label="İsim" hint="…" error="…"><TextInput … /></Field>` — etiketi içindeki **tek** kontrole bağlar. `inline`: yan yana. |
| `TextInput` | `<TextInput value={player.name} onChange={(name) => dispatch({ type: 'player/update', slot, patch: { name } })} />` — `onCommit`: odak çıkınca / Enter'da bir kez. |
| `TextArea` | `<TextArea value={app.generalNote} onChange={(text) => dispatch({ type: 'note/setGeneral', text })} rows={4} />` |
| `NumberStepper` | `<NumberStepper value={level} onChange={setLevel} min={MIN_LEVEL} max={MAX_LEVEL} label="Seviye" />` — `step`, `size`, `format`, `disabled`. |
| `Toggle` | `<Toggle label="Tam ekran" checked={on} onChange={setOn} />` |
| `Select` | `<Select value={v} onChange={setV} options={[{ value: 'a', label: 'A' }]} />` — değerler metindir. |
| `Modal` | `<Modal open={open} onClose={close} title="Pencere adı" footer={<Button variant="primary">Tamam</Button>}>…</Modal>` — Escape / dışarı tıklama `onClose` çağırır. İlk odak `data-autofocus` taşıyan öğeye gider. `size`, `closeOnBackdrop`. |
| `confirmDialog` | `if (await confirmDialog({ title: 'Görsel silinsin mi?', message: '…', danger: true, confirmLabel: 'Sil' })) { … }` — varsayılan düğmeler "Vazgeç" / "Onayla". Host App içinde bağlı; ek kurulum yok. |
| `ConfirmDialog` | Aynı kutunun denetimli hali: `open`, `onConfirm`, `onCancel`. |
| `toast` | `toast('Görsel eklendi')`, `toast('Dosya atlandı', 'UYARI', 'DND-201')` — `HATA` kapatılana kadar kalır, diğerleri ~6 sn. |
| `ToastHost` | Kök bileşende bir kez. Menü ve kontrol panelinde bağlı; **oyun ekranına koymayın**. |
| `ImageThumb` | `<ImageThumb image={findImage(app, id)} fit="cover" />` — görsel yoksa ya da dosyası açılamazsa yer tutucu çizer. Varsayılan kare; boyut/oran `className` ya da `style` ile. `emptyLabel`. |
| `EmptyState` | `<EmptyState icon={<ImageIcon />} title="Bu bölmede görsel yok" hint="…" action={<Button>Yükle</Button>} compact />` |
| `LoadingScreen` | Durum beklenirken tam ekran "Yükleniyor…". |
| `ErrorBoundary` | `<ErrorBoundary scope="zar" fallback={null}>…</ErrorBoundary>` — hatayı DND-902 ile loglar. `fallback` verilmezse tam ekran hata mesajı. |
| `cx` | `className={cx('lib-card', selected && 'is-selected')}` |

Simgeler (`size` varsayılan 20, `strokeWidth`, `className`; renk `currentColor`):
`PlusIcon MinusIcon TrashIcon UploadIcon CloseIcon CheckIcon ArrowUpIcon ArrowDownIcon BringToFrontIcon
SendToBackIcon PencilIcon EraserIcon CursorIcon DiceIcon FullscreenIcon FolderIcon HeartIcon` (`filled`)
`WarningIcon InfoIcon ChevronLeftIcon ChevronRightIcon ChevronUpIcon ChevronDownIcon EyeOffIcon ImageIcon
ImageOffIcon PlayIcon SlidersIcon ExitIcon MonitorIcon`. Yeni simge gerekiyorsa `ui/icons.tsx` içine aynı kalıpla eklenir.

### Yazı girişleri ve durum

`TextInput` / `TextArea` odaktayken kullanıcının yazdığını gösterir, odak çıkınca yeniden `value`'ya döner.
Bu yüzden `onChange` içinde doğrudan `dispatch` etmek güvenlidir (imleç zıplamaz, harf kaybolmaz).
Kendi `<input value={durum}>` bağlamanızı yazmayın; aynı sorunu yeniden yaşarsınız. Aynı giriş başka bir
kayda geçiyorsa (ör. seçili görsel değişti) bileşene `key` verin.

## Stil

- CSS çatısı ve CSS-in-JS yok; düz `.css` dosyaları ve CSS değişkenleri.
- Her özellik kendi stilini kendi klasöründe, bileşenlerinin yanında tutar ve bileşenden içe aktarır
  (`import './library.css'`). `ui/theme.css` ve `ui/ui.css` dosyalarına özellik stili eklenmez.
- Sınıf adları klasör önekiyle başlar; alt parça `__`, durum `is-` ile yazılır (`lib-card__name`, `is-selected`):

| Klasör | Önek |
|---|---|
| `ui/` | `ui-` |
| `menu/` | `menu-` |
| `settings/` | `set-` |
| `library/` | `lib-` |
| `game/` | `game-` |
| `control/` | `ctl-` |

- Renk, boşluk ve ölçü için sabit değer yerine değişken kullanın.
- `body` üzerinde `user-select: none` var. Seçilebilir metin için `selectable` sınıfı; girişler zaten seçilebilir.
- Odak halkası (`:focus-visible`) genel tanımlı; `outline: none` ile kapatmayın.
- Kök öğede `data-role="menu|game|control"` bulunur (`html[data-role='game'] …`). Oyun ekranında `body` siyahtır.
- Hazır yardımcı sınıflar: `ui-screen` (alanı doldurup ortalar), `ui-code` (küçük eş aralıklı kod metni),
  `ui-sr-only` (yalnızca ekran okuyucu), `selectable`.

### CSS değişkenleri (`ui/theme.css`)

| Grup | Değişkenler |
|---|---|
| Zemin | `--bg-0` (en derin: kuyu, giriş, küçük resim arkası) `--bg-1` (pencere) `--bg-2` (panel) `--bg-3` (kontrol) `--bg-4` (üzerine gelinen kontrol) |
| Çizgi | `--border` `--border-strong` |
| Yazı | `--text` `--text-muted` `--text-faint` |
| Altın vurgu | `--accent` `--accent-hover` `--accent-active` `--accent-ink` (altın üstündeki yazı) `--accent-soft` (saydam dolgu) `--accent-ring` |
| Tehlike | `--danger` `--danger-hover` `--danger-active` `--danger-ink` `--danger-text` (koyu zeminde kırmızı yazı) `--danger-soft` |
| Durum | `--success` `--warning` `--info` |
| Can barı | `--hp` `--hp-empty` (kontrol paneli ve oyun ekranı aynı tonu kullansın) |
| Örtü | `--overlay` |
| Yazı tipi | `--font-heading` (serif) `--font-body` `--font-mono` |
| Yazı boyutu | `--text-xs` 12 · `--text-sm` 13 · `--text-md` 15 · `--text-lg` 18 · `--text-xl` 24 · `--text-2xl` 34 |
| Boşluk | `--space-1` 4 · `--space-2` 8 · `--space-3` 12 · `--space-4` 16 · `--space-5` 24 · `--space-6` 32 · `--space-7` 48 |
| Köşe | `--radius-sm` 4 · `--radius` 8 · `--radius-lg` 12 |
| Kontrol yüksekliği | `--control-sm` 30 · `--control-md` 38 · `--control-lg` 48 |
| Gölge | `--shadow-1` `--shadow-2` |
| Geçiş | `--ease` (120ms) |
| Katman | `--z-toast` |

## Doldurulacak taslak dosyalar

Dışa aktarım adları ve imzalar sabittir; kabuk bu bileşenleri doğrudan çizer.

| Dosya | Dışa aktarım |
|---|---|
| `settings/ProfilesTab.tsx` | `ProfilesTab(): JSX.Element` |
| `settings/ScenesTab.tsx` | `ScenesTab(): JSX.Element` |
| `library/LibraryPanel.tsx` | `LibraryPanel(props: { mode: 'manage' \| 'play' }): JSX.Element` |
| `game/GameScreen.tsx` | `GameScreen(): JSX.Element` |
| `game/DrawingLayer.tsx` | `DrawingLayer(props: { tool: Tool; nonce: number; area: Rect }): JSX.Element \| null` |
| `game/DiceOverlay.tsx` | `DiceOverlay(): JSX.Element \| null` |
| `control/ControlPanel.tsx` | `ControlPanel(): JSX.Element` |

`GameScreen` ve `ControlPanel` yeniden yazılırken şunlar korunur: `useFullState()` ile bekleme,
`useSceneHotkeys()` çağrısı ve (yalnızca kontrol panelinde) `<ToastHost />`.

## Doğrulama

`npx tsc --noEmit -p tsconfig.web.json`
