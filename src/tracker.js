/**
 * tracker.js — 3MC Visitor Tracker
 * Collects comprehensive visitor data and sends it to Supabase.
 *
 * Public API (called from other scripts):
 *   window.TrackerUpdateNama(nama, result)
 *     → Updates the current session record with nama + questionnaire result.
 *       Call with result = null when only nama is known.
 */
(function () {
  'use strict';

  // ── Helpers ────────────────────────────────────────────────────────────────

  /** Generate a v4-like UUID without crypto dependency */
  function uuid() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
      const r = (Math.random() * 16) | 0;
      return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
    });
  }

  /** Parse browser name + major version from UA string */
  function parseBrowser(ua) {
    if (/Edg\/(\d+)/.test(ua))       return 'Edge '       + RegExp.$1;
    if (/OPR\/(\d+)/.test(ua))       return 'Opera '      + RegExp.$1;
    if (/SamsungBrowser\/(\d+)/.test(ua)) return 'Samsung Browser ' + RegExp.$1;
    if (/Chrome\/(\d+)/.test(ua))    return 'Chrome '     + RegExp.$1;
    if (/Firefox\/(\d+)/.test(ua))   return 'Firefox '    + RegExp.$1;
    if (/Safari\/(\d+)/.test(ua) && /Version\/(\d+)/.test(ua)) return 'Safari ' + RegExp.$1;
    return 'Unknown';
  }

  /** Parse OS from UA string */
  function parseOS(ua) {
    if (/Windows NT 10\.0/.test(ua)) return 'Windows 10/11';
    if (/Windows NT 6\.3/.test(ua))  return 'Windows 8.1';
    if (/Windows NT 6\.1/.test(ua))  return 'Windows 7';
    if (/Windows/.test(ua))          return 'Windows';
    if (/Android (\d+)/.test(ua))    return 'Android ' + RegExp.$1;
    if (/iPhone OS ([\d_]+)/.test(ua)) return 'iOS ' + RegExp.$1.replace(/_/g, '.');
    if (/iPad.*OS ([\d_]+)/.test(ua))  return 'iPadOS ' + RegExp.$1.replace(/_/g, '.');
    if (/Mac OS X ([\d_]+)/.test(ua))  return 'macOS ' + RegExp.$1.replace(/_/g, '.');
    if (/Linux/.test(ua))            return 'Linux';
    return 'Unknown';
  }

  /** Detect device type */
  function parseDevice(ua) {
    if (/Mobi|Android|iPhone|iPod/.test(ua)) return 'mobile';
    if (/Tablet|iPad/.test(ua))              return 'tablet';
    return 'desktop';
  }

  /** Parse UTM params from current URL */
  function getUTM() {
    const p = new URLSearchParams(window.location.search);
    return {
      utm_source:   p.get('utm_source')   || null,
      utm_medium:   p.get('utm_medium')   || null,
      utm_campaign: p.get('utm_campaign') || null,
    };
  }

  /** Generate a canvas fingerprint hash */
  function canvasFingerprint() {
    try {
      const c = document.createElement('canvas');
      const ctx = c.getContext('2d');
      ctx.textBaseline = 'top';
      ctx.font = '14px Arial';
      ctx.fillStyle = '#f60';
      ctx.fillRect(125, 1, 62, 20);
      ctx.fillStyle = '#069';
      ctx.fillText('3MC Tracker 🎬', 2, 15);
      ctx.fillStyle = 'rgba(102,204,0,0.7)';
      ctx.fillText('3MC Tracker 🎬', 4, 17);
      const data = c.toDataURL();
      // Simple djb2-style hash
      let h = 5381;
      for (let i = 0; i < data.length; i++) {
        h = (h * 33) ^ data.charCodeAt(i);
      }
      return (h >>> 0).toString(16);
    } catch (_) { return null; }
  }

  /** Generate an audio context fingerprint hash */
  async function audioFingerprint() {
    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) return null;
      const ctx = new AudioCtx();
      const osc = ctx.createOscillator();
      const analyser = ctx.createAnalyser();
      const gain = ctx.createGain();
      gain.gain.value = 0; // silent
      osc.connect(analyser);
      analyser.connect(gain);
      gain.connect(ctx.destination);
      osc.start(0);
      const data = new Float32Array(analyser.frequencyBinCount);
      analyser.getFloatFrequencyData(data);
      osc.stop();
      await ctx.close();
      let h = 5381;
      for (let i = 0; i < data.length; i++) {
        h = (h * 33) ^ Math.round(data[i] * 1000);
      }
      return (h >>> 0).toString(16);
    } catch (_) { return null; }
  }

  /** Combine canvas + audio into a single fingerprint string */
  async function generateFingerprint() {
    const cf = canvasFingerprint();
    const af = await audioFingerprint();
    const raw = `${cf}|${af}|${navigator.language}|${screen.colorDepth}|${screen.width}x${screen.height}`;
    let h = 5381;
    for (let i = 0; i < raw.length; i++) h = (h * 33) ^ raw.charCodeAt(i);
    return (h >>> 0).toString(16);
  }

  /** Get or create a persistent session_id in sessionStorage */
  function getSessionId() {
    let sid = sessionStorage.getItem('3mc_sid');
    if (!sid) { sid = uuid(); sessionStorage.setItem('3mc_sid', sid); }
    return sid;
  }

  // ── Supabase REST helpers ──────────────────────────────────────────────────

  function supabaseHeaders() {
    return {
      'Content-Type':  'application/json',
      'apikey':        window.SUPABASE_ANON,
      'Authorization': 'Bearer ' + window.SUPABASE_ANON,
      'Prefer':        'return=representation',
    };
  }

  async function supabaseInsert(payload) {
    const url = window.SUPABASE_URL + '/rest/v1/visitor_logs';
    const res = await fetch(url, {
      method:  'POST',
      headers: supabaseHeaders(),
      body:    JSON.stringify(payload),
    });
    if (!res.ok) {
      console.warn('[3MC Tracker] Insert failed:', res.status, await res.text());
      return null;
    }
    const rows = await res.json();
    return Array.isArray(rows) ? rows[0] : rows;
  }

  async function supabaseUpdate(id, patch) {
    const url = window.SUPABASE_URL + '/rest/v1/visitor_logs?id=eq.' + id;
    const res = await fetch(url, {
      method:  'PATCH',
      headers: supabaseHeaders(),
      body:    JSON.stringify(patch),
    });
    if (!res.ok) {
      console.warn('[3MC Tracker] Update failed:', res.status, await res.text());
    }
  }

  // ── Main tracking logic ────────────────────────────────────────────────────

  const SESSION_ID = getSessionId();
  const START_TIME = Date.now();
  let   RECORD_ID  = null; // set after successful INSERT

  async function track() {
    // Bail early if config is still placeholder
    if (!window.SUPABASE_URL || window.SUPABASE_URL.includes('YOUR_PROJECT_REF')) {
      console.warn('[3MC Tracker] Supabase not configured — tracking skipped.');
      return;
    }

    const ua = navigator.userAgent;
    const utm = getUTM();
    const fingerprint = await generateFingerprint();

    // Fetch IP (ipify) — gracefully skip on failure
    let ip = null;
    try {
      const r = await fetch('https://api.ipify.org?format=json', { cache: 'no-store' });
      if (r.ok) ip = (await r.json()).ip;
    } catch (_) {}

    // Fetch Geo via ip-api.com (free, no key, HTTPS on paid plan only — use HTTP)
    let country = null, city = null;
    try {
      // ip-api requires HTTP for free tier; will still work from HTTPS pages via CORS
      const r = await fetch(`http://ip-api.com/json/${ip || ''}?fields=country,city,status`, { cache: 'no-store' });
      if (r.ok) {
        const geo = await r.json();
        if (geo.status === 'success') { country = geo.country; city = geo.city; }
      }
    } catch (_) {}

    // Connection info
    const conn = navigator.connection || navigator.mozConnection || navigator.webkitConnection;

    const payload = {
      session_id:         SESSION_ID,
      page:               window.location.pathname || '/',
      ip_address:         ip,
      country:            country,
      city:               city,
      user_agent:         ua,
      browser:            parseBrowser(ua),
      os:                 parseOS(ua),
      device_type:        parseDevice(ua),
      screen_resolution:  screen.width + 'x' + screen.height,
      viewport_size:      window.innerWidth + 'x' + window.innerHeight,
      color_depth:        screen.colorDepth,
      timezone:           Intl.DateTimeFormat().resolvedOptions().timeZone,
      language:           navigator.language,
      referrer:           document.referrer || null,
      utm_source:         utm.utm_source,
      utm_medium:         utm.utm_medium,
      utm_campaign:       utm.utm_campaign,
      fingerprint:        fingerprint,
      cookie_enabled:     navigator.cookieEnabled,
      do_not_track:       navigator.doNotTrack || null,
      connection_type:    conn ? (conn.effectiveType || null) : null,
      nama:               null,
      questionnaire_result: null,
      time_on_page_seconds: null,
      visited_at:         new Date().toISOString(),
    };

    const row = await supabaseInsert(payload);
    if (row && row.id) RECORD_ID = row.id;
  }

  // ── Public API ─────────────────────────────────────────────────────────────

  /**
   * Called from questionnaire.html to update nama and/or result.
   * @param {string|null} nama   - visitor's name
   * @param {string|null} result - questionnaire division result, e.g. "Editing"
   */
  window.TrackerUpdateNama = async function (nama, result) {
    if (!RECORD_ID) return;
    const patch = {};
    if (nama   !== undefined) patch.nama                 = nama;
    if (result !== undefined) patch.questionnaire_result = result;
    if (Object.keys(patch).length) await supabaseUpdate(RECORD_ID, patch);
  };

  // ── Time on page ───────────────────────────────────────────────────────────

  window.addEventListener('beforeunload', () => {
    if (!RECORD_ID) return;
    const seconds = Math.round((Date.now() - START_TIME) / 1000);
    // Use sendBeacon for reliability on page exit
    const url = window.SUPABASE_URL + '/rest/v1/visitor_logs?id=eq.' + RECORD_ID;
    const body = JSON.stringify({ time_on_page_seconds: seconds });
    if (navigator.sendBeacon) {
      const blob = new Blob([body], { type: 'application/json' });
      // sendBeacon doesn't support custom headers, fallback to fetch with keepalive
    }
    fetch(url, {
      method:  'PATCH',
      headers: {
        'Content-Type':  'application/json',
        'apikey':        window.SUPABASE_ANON,
        'Authorization': 'Bearer ' + window.SUPABASE_ANON,
      },
      body:    body,
      keepalive: true, // ensures request completes even after page unloads
    }).catch(() => {});
  });

  // ── Boot ───────────────────────────────────────────────────────────────────

  // Run after DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', track);
  } else {
    track();
  }

})();
