# Visitor Tracking System — 3MC

Menambahkan sistem tracking visitor ke seluruh halaman website 3MC (index.html & questionnaire.html), menyimpan semua data ke Supabase, dan mendeploy via GitHub Pages. Tracking berjalan secara pasif tanpa mengganggu UX.

---

## User Review Required

> [!IMPORTANT]
> Karena ini adalah **static site di GitHub Pages**, kita **tidak bisa menyembunyikan credentials** sepenuhnya. Solusinya adalah menggunakan Supabase `anon` key (bukan `service_role`) dan mengunci tabel dengan **Row Level Security (RLS)** sehingga `anon` hanya bisa INSERT, tidak bisa SELECT/UPDATE/DELETE. Ini adalah pola yang aman dan direkomendasikan Supabase untuk use case public tracking.

> [!WARNING]
> **IP Address tidak bisa diambil dari browser secara langsung** karena security restriction. Solusinya menggunakan **free API publik** (`https://api.ipify.org`) atau memanfaatkan **Supabase Edge Function** untuk mencatat IP dari server-side headers. Plan ini menggunakan pendekatan `ipify.org` (lebih sederhana, tidak butuh Edge Function) — IP yang tercatat adalah IP publik user.

> [!CAUTION]
> Browser fingerprinting menggunakan teknik yang sah (canvas, audio context, fonts) — **bukan** spyware. Data yang dikumpulkan sama seperti yang digunakan Google Analytics, Mixpanel, dll. Pastikan ada privacy notice jika website ini public-facing.

---

## Open Questions

> [!IMPORTANT]
> **Apakah kamu sudah punya project Supabase?** Jika belum, saya akan sertakan cara membuat project baru. Jika sudah, saya butuh:
> - Supabase Project URL
> - Supabase `anon` public key

> [!NOTE]
> **Tracking di semua halaman atau questionnaire saja?** Plan ini mengasumsikan tracking di **semua halaman** (index.html + questionnaire.html) dengan satu session per kunjungan. Jika hanya questionnaire, akan saya sesuaikan.

---

## Apa yang Akan Ditrack

| Field | Source | Contoh |
|---|---|---|
| `session_id` | UUID generated di browser | `uuid-v4` |
| `page` | `window.location.pathname` | `/questionnaire.html` |
| `ip_address` | `api.ipify.org` | `182.x.x.x` |
| `country` | `ip-api.com` (free) | `Indonesia` |
| `city` | `ip-api.com` | `Bandung` |
| `user_agent` | `navigator.userAgent` | `Mozilla/5.0 ...` |
| `browser` | Parsed dari UA | `Chrome 125` |
| `os` | Parsed dari UA | `Windows 11` |
| `device_type` | Parsed dari UA | `desktop / mobile` |
| `screen_resolution` | `screen.width x screen.height` | `1920x1080` |
| `viewport_size` | `window.innerWidth x innerHeight` | `1440x900` |
| `color_depth` | `screen.colorDepth` | `24` |
| `timezone` | `Intl.DateTimeFormat().resolvedOptions()` | `Asia/Jakarta` |
| `language` | `navigator.language` | `id-ID` |
| `referrer` | `document.referrer` | `google.com` |
| `utm_source` | URL param | `instagram` |
| `utm_medium` | URL param | `bio` |
| `fingerprint` | Canvas + Audio + Fonts hash | `a3f7c9...` |
| `cookie_enabled` | `navigator.cookieEnabled` | `true` |
| `do_not_track` | `navigator.doNotTrack` | `null` |
| `connection_type` | `navigator.connection.effectiveType` | `4g` |
| `nama` | Dari questionnaire input | `Budi / null` |
| `questionnaire_result` | Divisi hasil kuesioner | `Editing / null` |
| `time_on_page_seconds` | `beforeunload` event | `45` |
| `visited_at` | `new Date().toISOString()` | `2026-07-12T...` |

---

## Proposed Changes

### 1. Supabase — Database Setup

#### [NEW] Tabel `visitor_logs`

```sql
CREATE TABLE public.visitor_logs (
  id                    BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  session_id            TEXT NOT NULL,
  page                  TEXT,
  ip_address            TEXT,
  country               TEXT,
  city                  TEXT,
  user_agent            TEXT,
  browser               TEXT,
  os                    TEXT,
  device_type           TEXT,
  screen_resolution     TEXT,
  viewport_size         TEXT,
  color_depth           SMALLINT,
  timezone              TEXT,
  language              TEXT,
  referrer              TEXT,
  utm_source            TEXT,
  utm_medium            TEXT,
  utm_campaign          TEXT,
  fingerprint           TEXT,
  cookie_enabled        BOOLEAN,
  do_not_track          TEXT,
  connection_type       TEXT,
  nama                  TEXT,
  questionnaire_result  TEXT,
  time_on_page_seconds  INTEGER,
  visited_at            TIMESTAMPTZ DEFAULT NOW()
);
```

#### RLS Policies (keamanan)
```sql
-- Enable RLS
ALTER TABLE public.visitor_logs ENABLE ROW LEVEL SECURITY;

-- Anon hanya boleh INSERT (tidak bisa baca data orang lain)
CREATE POLICY "Allow public insert" ON public.visitor_logs
  FOR INSERT TO anon WITH CHECK (true);
```

---

### 2. File Baru

#### [NEW] `src/tracker.js`

Script tracker terpusat yang di-include di semua halaman. Bertanggung jawab untuk:
- Mengumpulkan semua data device/browser
- Fetch IP via `api.ipify.org`
- Fetch geo via `ip-api.com/json` (free, no key needed)
- Generate canvas/audio fingerprint
- Kirim data ke Supabase via REST API (no npm, pure `fetch`)
- Update record saat user meninggalkan halaman (`beforeunload`) dengan `time_on_page_seconds`
- Expose fungsi `window.TrackerUpdateNama(nama, result)` yang dipanggil dari questionnaire setelah user mengisi nama & selesai kuesioner

#### [NEW] `src/supabase-config.js`

File config yang menyimpan Supabase URL + anon key. File ini **committed ke Git** (aman karena anon key + RLS).

---

### 3. File yang Dimodifikasi

#### [MODIFY] [index.html](file:///home/normies/Projects/3MC/index.html)
- Tambahkan `<script src="src/supabase-config.js">` dan `<script src="src/tracker.js">` sebelum `</body>`

#### [MODIFY] [questionnaire.html](file:///home/normies/Projects/3MC/questionnaire.html)
- Tambahkan `<script src="src/supabase-config.js">` dan `<script src="src/tracker.js">` sebelum `</body>`
- Panggil `window.TrackerUpdateNama(userName, divisiResult)` di dua titik:
  1. Saat user melewati name step (nama terisi, result masih `null`)
  2. Saat `showResults()` dipanggil (update dengan nama + divisi hasil)

---

## Arsitektur Data Flow

```
Browser Visit
    │
    ├── Generate session_id (UUID)
    ├── Collect device/browser data (sync)
    ├── Fetch IP + Geo (async, api.ipify.org + ip-api.com)
    ├── Generate fingerprint (canvas + audio hash)
    │
    ├── INSERT ke Supabase visitor_logs
    │
    ├── [questionnaire.html only]
    │   ├── User isi nama → UPDATE record (nama = 'Budi')  
    │   └── User selesai kuesioner → UPDATE record (questionnaire_result = 'Editing')
    │
    └── beforeunload → UPDATE record (time_on_page_seconds = N)
```

---

## Setup & Deployment Guide (yang akan disertakan)

### A. Buat Project Supabase
1. Buat akun/login di [supabase.com](https://supabase.com)
2. New Project → isi nama, password, region (pilih **Southeast Asia - Singapore**)
3. Catat: **Project URL** dan **anon public key** (Settings → API)

### B. Buat Tabel
- Masuk ke **SQL Editor** di dashboard Supabase
- Jalankan SQL schema di atas (tabel + RLS policies)

### C. Konfigurasi File
- Isi `src/supabase-config.js` dengan URL dan anon key kamu

### D. Deploy ke GitHub Pages
- Push semua file ke repo GitHub
- Settings → Pages → Source: **Deploy from branch** → `main` / `root`
- Tidak perlu build step, ini pure static site

---

## Verification Plan

### Manual Verification
1. Buka website di browser, buka DevTools Network tab
2. Cek request ke `supabase.co` berhasil (status 201)
3. Buka Supabase dashboard → Table Editor → `visitor_logs`
4. Verifikasi row muncul dengan semua field terisi
5. Test questionnaire: isi nama → cek kolom `nama` terupdate
6. Selesaikan kuesioner → cek `questionnaire_result` terupdate
7. Test dari HP untuk verifikasi `device_type = mobile`
