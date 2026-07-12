/**
 * 3MC Tracker - Supabase Analytics
 * Tracks user interactions and sends data to Supabase
 */

class AnalyticsTracker {
    constructor(supabaseUrl, supabaseKey) {
        this.supabaseUrl = supabaseUrl;
        this.supabaseKey = supabaseKey;
        this.sessionId = this.generateSessionId();
        this.userId = this.getUserId();
        this.pageEntryTime = Date.now();
        this.initialized = false;
    }

    generateSessionId() {
        return 'sess_' + Math.random().toString(36).substr(2, 9) + '_' + Date.now();
    }

    getUserId() {
        let userId = localStorage.getItem('3mc_user_id');
        if (!userId) {
            userId = 'user_' + Math.random().toString(36).substr(2, 9) + '_' + Date.now();
            localStorage.setItem('3mc_user_id', userId);
        }
        return userId;
    }

    async init() {
        if (this.initialized) return;
        
        // Load Supabase client from CDN
        if (typeof window.supabase === 'undefined') {
            await this.loadSupabaseClient();
        }
        
        this.supabase = window.supabase.createClient(this.supabaseUrl, this.supabaseKey);
        this.initialized = true;
        
        // Track page view
        this.trackPageView();
    }

    loadSupabaseClient() {
        return new Promise((resolve, reject) => {
            const script = document.createElement('script');
            script.src = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2';
            script.onload = resolve;
            script.onerror = reject;
            document.head.appendChild(script);
        });
    }

    async trackPageView() {
        try {
            await this.sendToSupabase('page_views', {
                session_id: this.sessionId,
                user_id: this.userId,
                page_url: window.location.href,
                page_title: document.title,
                referrer: document.referrer || 'direct',
                screen_width: window.screen.width,
                screen_height: window.screen.height,
                user_agent: navigator.userAgent,
                timestamp: new Date().toISOString()
            });
        } catch (error) {
            console.log('Tracker:', error.message);
        }
    }

    async trackEvent(eventType, eventData = {}) {
        try {
            await this.sendToSupabase('events', {
                session_id: this.sessionId,
                user_id: this.userId,
                event_type: eventType,
                page_url: window.location.href,
                event_data: JSON.stringify(eventData),
                timestamp: new Date().toISOString()
            });
        } catch (error) {
            console.log('Tracker:', error.message);
        }
    }

    async sendToSupabase(table, data) {
        if (!this.supabase) {
            console.warn('Supabase not initialized');
            return;
        }

        const { error } = await this.supabase
            .from(table)
            .insert([data]);

        if (error) {
            throw new Error(`Failed to send to ${table}: ${error.message}`);
        }
    }

    trackFilmCardClick(filmTitle, filmYear) {
        this.trackEvent('film_card_click', {
            film_title: filmTitle,
            film_year: filmYear
        });
    }

    trackWhatsAppClick(source) {
        this.trackEvent('whatsapp_click', {
            source: source,
            click_time: new Date().toISOString()
        });
    }

    trackExternalLinkClick(url, linkText) {
        this.trackEvent('external_link_click', {
            url: url,
            link_text: linkText
        });
    }

    trackQuestionnaireStart() {
        this.trackEvent('questionnaire_started', {});
    }

    async trackQuestionnaireCompleted(name, divisionResult, status, scores, answers) {
        try {
            // Send to questionnaire_responses table
            await this.sendToSupabase('questionnaire_responses', {
                session_id: this.sessionId,
                user_id: this.userId,
                name: name,
                primary_division: divisionResult.primary,
                secondary_division: divisionResult.secondary,
                status: status,
                scores: JSON.stringify(scores),
                answers: JSON.stringify(answers),
                page_url: window.location.href,
                completed_at: new Date().toISOString()
            });

            // Also track as event
            this.trackEvent('questionnaire_completed', {
                name: name,
                primary_division: divisionResult.primary,
                status: status
            });
        } catch (error) {
            console.log('Tracker:', error.message);
        }
    }

    trackDivisionCardClick(divisionName) {
        this.trackEvent('division_card_view', {
            division_name: divisionName
        });
    }

    trackPageExit() {
        const timeSpent = Math.floor((Date.now() - this.pageEntryTime) / 1000);
        this.trackEvent('page_exit', {
            time_spent_seconds: timeSpent,
            page_url: window.location.href
        });
    }
}

// Initialize tracker when DOM is ready
(function() {
    // REPLACE THESE WITH YOUR SUPABASE CREDENTIALS
    const SUPABASE_URL = 'YOUR_SUPABASE_URL';
    const SUPABASE_KEY = 'YOUR_SUPABASE_ANON_KEY';

    const tracker = new AnalyticsTracker(SUPABASE_URL, SUPABASE_KEY);
    
    // Make tracker globally available
    window.tracker = tracker;

    // Initialize on page load
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => tracker.init());
    } else {
        tracker.init();
    }

    // Track page exit
    window.addEventListener('beforeunload', () => {
        tracker.trackPageExit();
    });

    // Track visibility change (tab close/minimize)
    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'hidden') {
            tracker.trackPageExit();
        }
    });
})();
