// Supabase Configuration
const SUPABASE_URL = "https://rjuekbopbloulhihqjpy.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJqdWVrYm9wYmxvdWxoaWhxanB5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODM4NTI3NDQsImV4cCI6MjA5OTQyODc0NH0.I411S9pq4GHFpIdrqVkLGtqL2q2jYfYUPldJ75tP40g";

// Initialize Supabase Client lazily
let supabaseClient = null;

function getSupabase() {
  if (!supabaseClient) {
    if (typeof supabase === 'undefined') {
      console.error("Tracker Error: Supabase library not loaded yet.");
      return null;
    }
    supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  }
  return supabaseClient;
}

// Generate Session ID
function getSessionId() {
  let sessionId = sessionStorage.getItem('tracking_session_id');
  if (!sessionId) {
    sessionId = 'sess_' + Math.random().toString(36).substr(2, 9) + '_' + Date.now();
    sessionStorage.setItem('tracking_session_id', sessionId);
  }
  return sessionId;
}

// Collect Hardware & Browser Data
function getHardwareProfile() {
  const conn = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
  
  return {
    screen_width: window.screen.width,
    screen_height: window.screen.height,
    avail_width: window.screen.availWidth,
    avail_height: window.screen.availHeight,
    color_depth: window.screen.colorDepth,
    pixel_ratio: window.devicePixelRatio,
    inner_width: window.innerWidth,
    inner_height: window.innerHeight,
    user_agent: navigator.userAgent,
    language: navigator.language,
    languages: JSON.stringify(navigator.languages),
    platform: navigator.platform,
    vendor: navigator.vendor,
    cookie_enabled: navigator.cookieEnabled,
    do_not_track: navigator.doNotTrack,
    cpu_cores: navigator.hardwareConcurrency || 'unknown',
    ram_estimate: navigator.deviceMemory || 'unknown',
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    network_type: conn ? conn.effectiveType : 'unknown',
    network_downlink: conn ? conn.downlink : 'unknown',
    network_rtt: conn ? conn.rtt : 'unknown',
    battery_level: 'pending', 
    gpu_renderer: 'pending'   
  };
}

// Get GPU Renderer via WebGL
function getGPUInfo() {
  try {
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
    if (!gl) return 'No WebGL';
    const debugInfo = gl.getExtension('WEBGL_debug_renderer_info');
    if (debugInfo) {
      return gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL);
    }
    return 'Unknown GPU';
  } catch (e) {
    return 'Error detecting GPU';
  }
}

// Get Battery Status
async function getBatteryInfo() {
  try {
    if ('getBattery' in navigator) {
      const battery = await navigator.getBattery();
      return battery.level;
    }
  } catch (e) {
    // Ignore errors
  }
  return 'unknown';
}

// Send Data to Supabase
async function sendToSupabase(table, data) {
  const client = getSupabase();
  if (!client) return;

  // Fill async data before sending
  if (data.gpu_renderer === 'pending') {
    data.gpu_renderer = getGPUInfo();
  }
  if (data.battery_level === 'pending') {
    data.battery_level = await getBatteryInfo();
  }

  try {
    const { error } = await client
      .from(table)
      .insert([data]);

    if (error) {
      console.warn(`Tracker: Failed to send to ${table}:`, error.message);
    } else {
      console.log(`Tracker: Sent to ${table} successfully`);
    }
  } catch (err) {
    console.error(`Tracker: Network error sending to ${table}:`, err);
  }
}

// Track Page View
async function trackPageView() {
  const profile = getHardwareProfile();
  const data = {
    session_id: getSessionId(),
    page_url: window.location.href,
    page_title: document.title,
    referrer: document.referrer || 'direct',
    timestamp: new Date().toISOString(),
    ...profile
  };
  
  await sendToSupabase('page_views', data);
}

// Track Custom Events (Clicks, Interactions)
async function trackEvent(eventType, extraData = {}) {
  const profile = getHardwareProfile();
  const data = {
    session_id: getSessionId(),
    event_type: eventType,
    page_url: window.location.href,
    event_data: JSON.stringify(extraData),
    timestamp: new Date().toISOString(),
    ...profile
  };

  await sendToSupabase('user_interactions', data);
}

// Track Questionnaire Submission
async function trackQuestionnaireSubmit() {
  const profile = getHardwareProfile();
  
  // Try to get name from form
  const nameInput = document.querySelector('input[name="name"], input[id="name"], input[placeholder*="Nama"]');
  const fullName = nameInput ? nameInput.value : 'Anonymous';

  // Try to get answers from form
  let answers = {};
  const form = document.getElementById('questionnaire-form');
  if (form) {
    const formData = new FormData(form);
    for (let [key, value] of formData.entries()) {
      answers[key] = value;
    }
  }

  const data = {
    session_id: getSessionId(),
    full_name: fullName,
    answers: JSON.stringify(answers),
    result_score: 'Unknown',
    page_url: window.location.href,
    timestamp: new Date().toISOString(),
    ...profile
  };

  await sendToSupabase('questionnaire_results', data);
}

// Expose functions to window so other scripts can call them
window.trackEvent = trackEvent;
window.trackQuestionnaireSubmit = trackQuestionnaireSubmit;

// Initialize Tracking when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
  trackPageView();
  
  // Track external link clicks globally
  document.querySelectorAll('a[href^="http"]').forEach(link => {
    if (!link.href.includes(window.location.hostname)) {
      link.addEventListener('click', (e) => {
        trackEvent('external_link_click', { url: link.href });
      });
    }
  });
});

// Track page exit (best effort - fire and forget)
window.addEventListener('beforeunload', () => {
  const client = getSupabase();
  if (client) {
    const data = {
      session_id: getSessionId(),
      event_type: 'page_exit',
      page_url: window.location.href,
      timestamp: new Date().toISOString()
    };
    client.from('user_interactions').insert([data]);
  }
});
