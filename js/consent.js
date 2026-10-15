// AdSense consent banner + Consent Mode v2 signaling + ad slot injection.
//
// Flow:
//   1. base.html pushes default-denied { ad_storage: 'denied' } to dataLayer
//      BEFORE adsbygoogle.js loads, so AdSense boots in NPA mode.
//   2. This script reads localStorage 'adsense_consent':
//        - 'granted' → push { ad_storage: 'granted' }, fill ads
//        - 'denied'  → push { ad_storage: 'denied' }, leave NPA
//        - absent    → show banner, default stays 'denied'
//   3. Banner buttons write choice to localStorage and signal AdSense.
//   4. Ad slots injected by data-ad-slot IDs from <script id="adsense-config">.

(function () {
    'use strict';

    var CONSENT_KEY = 'adsense_consent';
    var CONSENT_GRANTED = 'granted';
    var CONSENT_DENIED = 'denied';
    var INTRO_INSERTION_AFTER = 'h2';
    var HOME_INSERTION_AFTER = 3; // 0-indexed: insert after 4th item

    function readConsent() {
        try { return window.localStorage.getItem(CONSENT_KEY); }
        catch (e) { return null; }
    }

    function writeConsent(value) {
        try { window.localStorage.setItem(CONSENT_KEY, value); }
        catch (e) { /* private mode / quota — ignore */ }
    }

    function pushDataLayer(payload) {
        var dl = window.dataLayer;
        if (!Array.isArray(dl)) dl = window.dataLayer = [];
        dl.push(payload);
    }

    function applyConsent(value) {
        if (value !== CONSENT_GRANTED && value !== CONSENT_DENIED) return;
        pushDataLayer({ ad_storage: value });
    }

    function fillAds() {
        var queue = window.adsbygoogle;
        if (Array.isArray(queue)) queue.push({});
    }

    function readConfig() {
        var el = document.getElementById('adsense-config');
        if (!el) return null;
        try { return JSON.parse(el.textContent); }
        catch (e) { return null; }
    }

    function makeAdSlot(client, slotId, extraClass) {
        var ins = document.createElement('ins');
        ins.className = 'adsbygoogle ad-slot' + (extraClass ? ' ' + extraClass : '');
        ins.style.display = 'block';
        ins.setAttribute('data-ad-client', client);
        ins.setAttribute('data-ad-slot', slotId);
        ins.setAttribute('data-ad-format', 'auto');
        ins.setAttribute('data-full-width-responsive', 'true');
        return ins;
    }

    function injectArticleIntroAd(client, slotId) {
        var content = document.querySelector('.article-content');
        if (!content) return false;
        var anchor = content.querySelector(INTRO_INSERTION_AFTER);
        if (!anchor) return false;
        var wrapper = document.createElement('div');
        wrapper.className = 'ad-slot ad-slot--inline ad-slot--article-intro';
        wrapper.appendChild(makeAdSlot(client, slotId, 'ad-slot--article-intro-ins'));
        anchor.parentNode.insertBefore(wrapper, anchor.nextSibling);
        return true;
    }

    function injectHomeAd(client, slotId) {
        var list = document.getElementById('article-list');
        if (!list) return false;
        var items = list.children;
        if (items.length < HOME_INSERTION_AFTER + 1) return false;
        var wrapper = document.createElement('li');
        wrapper.className = 'ad-slot ad-slot--home';
        wrapper.appendChild(makeAdSlot(client, slotId, 'ad-slot--home-ins'));
        var target = items[HOME_INSERTION_AFTER];
        list.insertBefore(wrapper, target.nextSibling);
        return true;
    }

    function injectAdSlots(cfg) {
        var slots = cfg.slots || {};
        var injected = [];
        if (slots.articleIntro) {
            if (injectArticleIntroAd(cfg.client, slots.articleIntro)) {
                injected.push('articleIntro');
            }
        }
        if (slots.home) {
            if (injectHomeAd(cfg.client, slots.home)) {
                injected.push('home');
            }
        }
        return injected;
    }

    function initBanner() {
        var banner = document.getElementById('consent-banner');
        if (!banner) return;

        var stored = readConsent();
        if (stored === CONSENT_GRANTED || stored === CONSENT_DENIED) {
            applyConsent(stored);
            banner.hidden = true;
            return;
        }

        banner.hidden = false;

        var acceptBtn = banner.querySelector('[data-consent-accept]');
        var rejectBtn = banner.querySelector('[data-consent-reject]');

        function onAccept() {
            writeConsent(CONSENT_GRANTED);
            applyConsent(CONSENT_GRANTED);
            fillAds();
            banner.hidden = true;
        }

        function onReject() {
            writeConsent(CONSENT_DENIED);
            applyConsent(CONSENT_DENIED);
            banner.hidden = true;
        }

        if (acceptBtn) acceptBtn.addEventListener('click', onAccept);
        if (rejectBtn) rejectBtn.addEventListener('click', onReject);
    }

    function init() {
        var cfg = readConfig();
        if (!cfg || !cfg.client) return;

        var stored = readConsent();
        if (stored === CONSENT_GRANTED) {
            applyConsent(CONSENT_GRANTED);
        }
        // 'denied' or null: default-denied signal already in dataLayer from base.html

        var injected = injectAdSlots(cfg);
        if (injected.length > 0) fillAds();

        initBanner();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();