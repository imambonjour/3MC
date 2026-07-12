# 3MC Tracker - Setup Guide

## 📋 Langkah Setup Supabase

### 1. Buat Project di Supabase
1. Kunjungi [supabase.com](https://supabase.com) dan login/signup
2. Klik "New Project"
3. Isi detail project:
   - Name: `3mc-analytics` (atau nama lain)
   - Database Password: (simpan password ini)
   - Region: Pilih yang terdekat (Singapore untuk Indonesia)

### 2. Dapatkan Credentials
Setelah project dibuat:
1. Buka **Settings** → **API**
2. Copy nilai berikut:
   - **Project URL** → untuk `SUPABASE_URL`
   - **anon/public key** → untuk `SUPABASE_KEY`

### 3. Update tracker.js
Buka file `tracker.js` dan ganti baris berikut:

```javascript
// REPLACE THESE WITH YOUR SUPABASE CREDENTIALS
const SUPABASE_URL = 'YOUR_SUPABASE_URL';        // Ganti dengan URL project Anda
const SUPABASE_KEY = 'YOUR_SUPABASE_ANON_KEY';   // Ganti dengan anon key Anda
```

Contoh:
```javascript
const SUPABASE_URL = 'https://xyzabcdefgh.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...';
```

### 4. Buat Tabel di Supabase

Buka **SQL Editor** di Supabase dan jalankan query berikut:

```sql
-- Tabel untuk page views
CREATE TABLE page_views (
    id BIGSERIAL PRIMARY KEY,
    session_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    page_url TEXT NOT NULL,
    page_title TEXT,
    referrer TEXT,
    screen_width INTEGER,
    screen_height INTEGER,
    user_agent TEXT,
    timestamp TIMESTAMPTZ DEFAULT NOW()
);

-- Tabel untuk events
CREATE TABLE events (
    id BIGSERIAL PRIMARY KEY,
    session_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    event_type TEXT NOT NULL,
    page_url TEXT,
    event_data JSONB,
    timestamp TIMESTAMPTZ DEFAULT NOW()
);

-- Tabel untuk response kuesioner
CREATE TABLE questionnaire_responses (
    id BIGSERIAL PRIMARY KEY,
    session_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    name TEXT NOT NULL,
    primary_division TEXT NOT NULL,
    secondary_division TEXT,
    status TEXT,
    scores JSONB,
    answers JSONB,
    page_url TEXT,
    completed_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index untuk performa
CREATE INDEX idx_page_views_session ON page_views(session_id);
CREATE INDEX idx_page_views_timestamp ON page_views(timestamp);
CREATE INDEX idx_events_session ON events(session_id);
CREATE INDEX idx_events_type ON events(event_type);
CREATE INDEX idx_questionnaire_name ON questionnaire_responses(name);
CREATE INDEX idx_questionnaire_division ON questionnaire_responses(primary_division);
```

### 5. Setup Row Level Security (RLS)

Untuk keamanan, aktifkan RLS dan buat policy:

```sql
-- Aktifkan RLS
ALTER TABLE page_views ENABLE ROW LEVEL SECURITY;
ALTER TABLE events ENABLE ROW LEVEL SECURITY;
ALTER TABLE questionnaire_responses ENABLE ROW LEVEL SECURITY;

-- Policy untuk insert (anon users bisa insert data)
CREATE POLICY "Allow anonymous inserts to page_views" 
ON page_views FOR INSERT 
WITH CHECK (true);

CREATE POLICY "Allow anonymous inserts to events" 
ON events FOR INSERT 
WITH CHECK (true);

CREATE POLICY "Allow anonymous inserts to questionnaire_responses" 
ON questionnaire_responses FOR INSERT 
WITH CHECK (true);

-- Policy untuk select (hanya authenticated users)
CREATE POLICY "Allow authenticated reads on page_views" 
ON page_views FOR SELECT 
TO authenticated 
USING (true);

CREATE POLICY "Allow authenticated reads on events" 
ON events FOR SELECT 
TO authenticated 
USING (true);

CREATE POLICY "Allow authenticated reads on questionnaire_responses" 
ON questionnaire_responses FOR SELECT 
TO authenticated 
USING (true);
```

### 6. Deploy ke GitHub Pages

1. Commit semua file ke repository GitHub
2. Aktifkan GitHub Pages:
   - Settings → Pages
   - Source: Deploy from branch
   - Branch: main / master
   - Folder: root
3. Website akan live di `https://username.github.io/repo-name`

## 📊 Data yang Dikumpulkan

### Page Views
- Session ID & User ID (anonymous)
- URL halaman & judul
- Referrer (sumber traffic)
- Resolusi layar
- User agent (browser/device)
- Timestamp

### Events
- Film card clicks (judul film)
- WhatsApp button clicks (lokasi tombol)
- External link clicks (social media)
- Questionnaire started & completed
- Time spent on page

### Questionnaire Responses
- Nama pengguna (dari input form)
- Divisi utama & sekunder yang direkomendasikan
- Status penempatan (Jelas/Hybrid/Eksplorasi/Perlu Diskusi)
- Skor per divisi
- Jawaban lengkap

## 🔒 Privacy Notes

- User ID disimpan di localStorage (persistent tapi anonymous)
- Session ID unik per kunjungan
- Nama hanya dikumpulkan saat user mengisi kuesioner secara sukarela
- Tidak ada cookies tracking pihak ketiga
- Semua data dikirim via HTTPS ke Supabase

## 🛠️ Troubleshooting

### Data tidak masuk ke Supabase?
1. Cek console browser untuk error
2. Pastikan URL dan Key sudah benar di `tracker.js`
3. Verifikasi tabel sudah dibuat di Supabase
4. Cek RLS policy sudah benar

### CORS error?
- Supabase sudah support CORS by default
- Pastikan menggunakan HTTPS untuk production

### Tracker tidak load?
- Pastikan `tracker.js` di-load sebelum script lain
- Cek path file benar (`src="tracker.js"`)

## 📈 Cara Lihat Data

Di Supabase Dashboard:
1. **Table Editor** → Pilih tabel (page_views, events, questionnaire_responses)
2. **SQL Editor** → Buat query custom
3. **Data API** → Akses via REST API atau client libraries

Contoh query untuk lihat response kuesioner:
```sql
SELECT name, primary_division, status, completed_at 
FROM questionnaire_responses 
ORDER BY completed_at DESC;
```
