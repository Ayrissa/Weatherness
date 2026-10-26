/**
 * Weatherness — weather widget for SillyTavern roleplay.
 * Author: Ayrissa. License: MIT.
 *
 * Privacy: this extension uses ONLY its own API settings (entered in the extension panel).
 * It never reads SillyTavern's API connections, secrets or keys.
 */
import { LOC } from './locales.js';

const MODULE = 'rp_weather';
const KEY = 'rp_weather';
const getContext = () => SillyTavern.getContext();

const COND = ['clear', 'partly_cloudy', 'cloudy', 'rain', 'storm', 'snow', 'fog', 'windy'];
const MOON = ['new', 'waxing_crescent', 'first_quarter', 'waxing_gibbous', 'full', 'waning_gibbous', 'last_quarter', 'waning_crescent'];
const DIRS = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];

const DEFAULTS = {
    enabled: true,
    lang: 'ru',
    api: { url: '', key: '', model: '', temperature: 0.6, maxTokens: 1500 },
    auto: true,
    every: 1,
    contextMessages: 6,
    tempUnit: 'C',
    windUnit: 'ms',
    hint: '',
    layout: 'compact',
    position: 'before',
    theme: 'auto',
    customColor: '#4a6fa5',
    transparency: 10,
    timeFormat: '24',
    showStorm: false,
    showMoon: false,
    showWind: false,
};

/* ---------------------------------------------------------------- helpers */

function fillDefaults(target, def) {
    for (const k of Object.keys(def)) {
        if (def[k] && typeof def[k] === 'object' && !Array.isArray(def[k])) {
            if (!target[k] || typeof target[k] !== 'object') target[k] = {};
            fillDefaults(target[k], def[k]);
        } else if (target[k] === undefined) {
            target[k] = def[k];
        }
    }
}

function getSettings() {
    const root = getContext().extensionSettings;
    if (!root[MODULE]) root[MODULE] = {};
    return root[MODULE];
}

const saveSettings = () => getContext().saveSettingsDebounced();

function getPath(obj, path) {
    return path.split('.').reduce((o, k) => (o == null ? o : o[k]), obj);
}

function setPath(obj, path, value) {
    const parts = path.split('.');
    const last = parts.pop();
    const target = parts.reduce((o, k) => o[k], obj);
    target[last] = value;
}

function t(key) {
    const lang = getSettings().lang;
    return LOC[lang]?.[key] ?? LOC.en[key] ?? key;
}

function esc(v) {
    return String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', '\'': '&#39;' }[c]));
}

const pad = n => String(n).padStart(2, '0');

function hash(str) {
    let h = 0;
    for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) | 0;
    return String(h);
}

function hexToRgb(hex) {
    const m = /^#?([0-9a-f]{6})$/i.exec(hex || '');
    const n = parseInt(m ? m[1] : '4a6fa5', 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function rgbToHex([r, g, b]) {
    return '#' + [r, g, b].map(x => Math.max(0, Math.min(255, Math.round(x))).toString(16).padStart(2, '0')).join('');
}

function mix(a, b, k) {
    const A = hexToRgb(a), B = hexToRgb(b);
    return rgbToHex(A.map((x, i) => x + (B[i] - x) * k));
}

function luminance(hex) {
    const [r, g, b] = hexToRgb(hex);
    return (0.299 * r + 0.587 * g + 0.114 * b) / 255;
}

/* ---------------------------------------------------------------- time */

const isNightHour = h => h < 6 || h >= 20;
const toMin = tm => { const [h, m] = tm.split(':').map(Number); return h * 60 + m; };

function fmtTime(tm, f) {
    const [h, m] = tm.split(':').map(Number);
    if (f === '12') return `${h % 12 || 12}:${pad(m)} ${h >= 12 ? 'PM' : 'AM'}`;
    return `${pad(h)}:${pad(m)}`;
}

function fmtHour(tm, f) {
    const [h, m] = tm.split(':').map(Number);
    if (m !== 0) return fmtTime(tm, f);
    if (f === '12') return `${h % 12 || 12}${h >= 12 ? 'PM' : 'AM'}`;
    return pad(h);
}

/* ---------------------------------------------------------------- icons */

const svg = (inner, vb = '0 0 32 32') => `<svg class="stw-ico" viewBox="${vb}" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">${inner}</svg>`;

const CLOUD_D = 'M9 25h14a5 5 0 0 0 .5-9.97A7 7 0 0 0 10 14.5 5.3 5.3 0 0 0 9 25z';
const P = {
    sun: '<g stroke="#FFC93C" stroke-width="2" stroke-linecap="round"><path d="M16 3v3M16 26v3M3 16h3M26 16h3M6.8 6.8l2.1 2.1M23.1 23.1l2.1 2.1M6.8 25.2l2.1-2.1M23.1 8.9l2.1-2.1"/></g><circle cx="16" cy="16" r="6" fill="#FFC93C"/>',
    moon: '<path d="M21 5a11 11 0 1 0 6 18A9 9 0 0 1 21 5z" fill="#F4E9B8"/>',
    cloud: `<path d="${CLOUD_D}" fill="#EEF3F9"/>`,
    cloudDark: `<path d="${CLOUD_D}" fill="#8F9DAE"/>`,
    rain: '<g stroke="#5BB4FF" stroke-width="2" stroke-linecap="round"><path d="M11 24l-1 4M17 24l-1 4M23 24l-1 4"/></g>',
    snow: '<g fill="#fff"><circle cx="11" cy="25" r="1.6"/><circle cx="17" cy="28" r="1.6"/><circle cx="23" cy="25" r="1.6"/></g>',
    bolt: '<path d="M17 17l-5 8h4l-1 5 6-9h-4z" fill="#FFD23C"/>',
    fog: '<g stroke="#D5DDE7" stroke-width="2.4" stroke-linecap="round"><path d="M6 11h20M4 17h22M8 23h18"/></g>',
    wind: '<g fill="none" stroke="#E2E8F0" stroke-width="2.2" stroke-linecap="round"><path d="M4 12h15a3.5 3.5 0 1 0-3.5-3.5M4 18h20a3.5 3.5 0 1 1-3.5 3.5M4 24h10"/></g>',
};

function weatherIcon(cond, night) {
    const body = night ? P.moon : P.sun;
    switch (cond) {
        case 'clear': return svg(body);
        case 'partly_cloudy': return svg(`<g transform="translate(-2 -4) scale(.8)">${body}</g><g transform="translate(2 2)">${P.cloud}</g>`);
        case 'cloudy': return svg(`<g transform="translate(-3 -4)">${P.cloudDark}</g><g transform="translate(2 1)">${P.cloud}</g>`);
        case 'rain': return svg(`<g transform="translate(0 -4)">${P.cloud}</g>${P.rain}`);
        case 'storm': return svg(`<g transform="translate(0 -5)">${P.cloudDark}</g>${P.bolt}`);
        case 'snow': return svg(`<g transform="translate(0 -4)">${P.cloud}</g>${P.snow}`);
        case 'fog': return svg(`<g transform="translate(0 -6)">${P.cloud}</g>${P.fog.replace('M6 11h20M4 17h22M8 23h18', 'M6 20h20M4 25h22')}`);
        case 'windy': return svg(P.wind);
        default: return svg(P.cloud);
    }
}

function sunEventIcon(type) {
    const arrow = type === 'sunrise' ? 'M16 12V5M13 8l3-3 3 3' : 'M16 5v7M13 9l3 3 3-3';
    return svg(`<path d="M4 23h24" stroke="#E2E8F0" stroke-width="2" stroke-linecap="round"/><path d="M9 23a7 7 0 0 1 14 0z" fill="#FFC93C"/><path d="${arrow}" fill="none" stroke="#FFC93C" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>`);
}

const warnIcon = () => svg('<path d="M16 4L3 27h26z" fill="#FFB020" stroke="#FFB020" stroke-width="2" stroke-linejoin="round"/><path d="M16 12v8" stroke="#2b2b2b" stroke-width="2.6" stroke-linecap="round"/><circle cx="16" cy="24" r="1.7" fill="#2b2b2b"/>');
const windIcon = () => svg(P.wind);

function moonIcon(ph) {
    const lf = '#F4E9B8';
    const base = '<circle cx="12" cy="12" r="10" fill="rgba(255,255,255,.22)" stroke="rgba(255,255,255,.5)" stroke-width="1"/>';
    const paths = {
        full: `<circle cx="12" cy="12" r="10" fill="${lf}"/>`,
        new: '',
        first_quarter: `<path d="M12 2A10 10 0 0 1 12 22z" fill="${lf}"/>`,
        last_quarter: `<path d="M12 2A10 10 0 0 0 12 22z" fill="${lf}"/>`,
        waxing_crescent: `<path d="M12 2A10 10 0 0 1 12 22A5 10 0 0 0 12 2z" fill="${lf}"/>`,
        waxing_gibbous: `<path d="M12 2A10 10 0 0 1 12 22A5 10 0 0 1 12 2z" fill="${lf}"/>`,
        waning_crescent: `<path d="M12 2A10 10 0 0 0 12 22A5 10 0 0 1 12 2z" fill="${lf}"/>`,
        waning_gibbous: `<path d="M12 2A10 10 0 0 0 12 22A5 10 0 0 0 12 2z" fill="${lf}"/>`,
    };
    return svg(base + (paths[ph] || ''), '0 0 24 24');
}

/* ---------------------------------------------------------------- themes */

function skyColors(cond, night) {
    const day = {
        clear: ['#3d86e0', '#7db8f7'], partly_cloudy: ['#4f86cf', '#8fb4e2'], cloudy: ['#66788f', '#8b9bb0'],
        rain: ['#3f5368', '#5b7690'], storm: ['#2b303f', '#4b5068'], snow: ['#8199b5', '#c1d0e2'],
        fog: ['#7a8693', '#a5afba'], windy: ['#4f86cf', '#8fb4e2'],
    };
    const nt = {
        clear: ['#0d1836', '#2b4180'], partly_cloudy: ['#17224a', '#3a4a76'], cloudy: ['#283043', '#454f65'],
        rain: ['#1d2735', '#33475b'], storm: ['#171a26', '#35384d'], snow: ['#36455f', '#66788f'],
        fog: ['#2d3641', '#505b68'], windy: ['#17224a', '#3a4a76'],
    };
    return (night ? nt : day)[cond] || day.cloudy;
}

function themeVars(d, s) {
    let c1, c2, fg = '#ffffff';
    switch (s.theme) {
        case 'dark': c1 = '#1b2130'; c2 = '#3a4666'; break;
        case 'light': c1 = '#f7fafd'; c2 = '#d6e0ec'; fg = '#1b2433'; break;
        case 'blue': c1 = '#2f66d0'; c2 = '#6aa5f5'; break;
        case 'pink': c1 = '#c27f91'; c2 = '#e4b8c3'; break;
        case 'violet': c1 = '#52389f'; c2 = '#9272de'; break;
        case 'green': c1 = '#2a7459'; c2 = '#5fb592'; break;
        case 'custom':
            c1 = /^#[0-9a-f]{6}$/i.test(s.customColor) ? s.customColor : '#4a6fa5';
            c2 = mix(c1, '#ffffff', 0.28);
            fg = luminance(c1) > 0.62 ? '#1b2433' : '#ffffff';
            break;
        default: [c1, c2] = skyColors(d.condition, d.is_night);
    }
    const light = fg !== '#ffffff';
    return { c1, c2, fg, light, line: light ? 'rgba(0,0,0,.14)' : 'rgba(255,255,255,.28)' };
}

/* ---------------------------------------------------------------- widget render */

const unitLabel = u => t('u_' + u);

function extrasHtml(d, s) {
    const chips = [];
    if (s.showStorm && d.storm_warning?.active) {
        chips.push(`<span class="stw-chip stw-warn">${warnIcon()}${esc(d.storm_warning.text || t('stormDefault'))}</span>`);
    }
    if (s.showWind && d.wind) {
        const dir = d.wind.dir ? ' ' + t('dir_' + d.wind.dir) : '';
        chips.push(`<span class="stw-chip">${windIcon()}${Math.round(d.wind.speed)} ${unitLabel(d.units?.wind || s.windUnit)}${dir}</span>`);
    }
    if (s.showMoon && d.moon) {
        chips.push(`<span class="stw-chip">${moonIcon(d.moon)}${t('moon_' + d.moon)}</span>`);
    }
    return chips;
}

function forecastHtml(d, s) {
    const items = d.forecast.map(f => ({
        label: fmtHour(f.time, s.timeFormat),
        icon: weatherIcon(f.condition, isNightHour(+f.time.slice(0, 2))),
        value: `${Math.round(f.temp)}°`,
        rel: (toMin(f.time) - toMin(d.time) + 1440) % 1440,
    }));
    let sunLeft = d.sun_event;
    if (sunLeft && items.length) {
        const rel = (toMin(sunLeft.time) - toMin(d.time) + 1440) % 1440;
        if (rel <= items[items.length - 1].rel) {
            const idx = items.findIndex(i => i.rel > rel);
            const sunItem = { label: fmtTime(sunLeft.time, s.timeFormat), icon: sunEventIcon(sunLeft.type), value: t(sunLeft.type), rel, sun: true };
            items.splice(idx < 0 ? items.length : idx, 0, sunItem);
            sunLeft = null;
        }
    }
    const row = items.slice(0, 7).map(i => `<div class="stw-fc-i${i.sun ? ' stw-fc-sun' : ''}"><span class="stw-fc-time">${esc(i.label)}</span>${i.icon}<span class="stw-fc-t">${esc(i.value)}</span></div>`).join('');
    return { row, sunLeft };
}

function buildWidget(d, s) {
    const v = themeVars(d, s);
    const op = Math.max(0.15, Math.min(1, 1 - (s.transparency || 0) / 100));
    const style = `--stw-c1:${v.c1};--stw-c2:${v.c2};--stw-fg:${v.fg};--stw-line:${v.line};--stw-op:${op}`;
    const ext = s.layout === 'extended';
    const cls = `stw-widget ${ext ? 'stw-extended' : 'stw-compact'}${v.light ? '' : ' stw-shadowed'}`;
    const sub = esc([fmtTime(d.time, s.timeFormat), d.date].filter(Boolean).join(' · '));
    const cond = `<div class="stw-cond">${weatherIcon(d.condition, d.is_night)}<span>${esc(t('cond_' + d.condition))}</span></div>`;
    const hl = `<div class="stw-hl">${Math.round(d.low)}°/${Math.round(d.high)}°</div>`;
    const temp = `<div class="stw-temp">${Math.round(d.temp)}°</div>`;
    const chips = extrasHtml(d, s);

    let body;
    if (!ext) {
        body = `<div class="stw-top"><div class="stw-left"><div class="stw-loc">${esc(d.location)}</div><div class="stw-sub">${sub}</div></div>${temp}</div>
<div class="stw-bottom">${cond}${hl}</div>`;
    } else {
        const fc = forecastHtml(d, s);
        if (fc.sunLeft) chips.unshift(`<span class="stw-chip">${sunEventIcon(fc.sunLeft.type)}${t(fc.sunLeft.type)} ${esc(fmtTime(fc.sunLeft.time, s.timeFormat))}</span>`);
        body = `<div class="stw-top"><div class="stw-left"><div class="stw-loc">${esc(d.location)}</div><div class="stw-sub">${sub}</div>${cond}</div>
<div class="stw-right">${temp}${hl}</div></div>
${fc.row ? `<div class="stw-line"></div><div class="stw-fc">${fc.row}</div>` : ''}`;
    }
    const extras = chips.length ? `${ext ? '<div class="stw-line"></div>' : ''}<div class="stw-extras">${chips.join('')}</div>` : '';
    return `<div class="${cls}" style="${style}"><div class="stw-bg"></div><div class="stw-body">${body}${extras}</div></div>`;
}

function widgetSig(d, s) {
    return hash(JSON.stringify([d, s.layout, s.position, s.theme, s.customColor, s.transparency, s.timeFormat, s.lang, s.showStorm, s.showMoon, s.showWind]));
}

/* ---------------------------------------------------------------- chat rendering */

function renderMessage(id) {
    const s = getSettings();
    const $mes = $(`#chat .mes[mesid="${id}"]`);
    if (!$mes.length) return;
    const m = getContext().chat[id];
    const d = m?.extra?.[KEY];
    const $old = $mes.find('.stw-widget');
    if (!s.enabled || !d || m.is_user) { $old.remove(); return; }
    const sig = widgetSig(d, s);
    if ($old.length && $old.attr('data-sig') === sig) return;
    $old.remove();
    const $el = $(buildWidget(d, s)).attr('data-sig', sig);
    const $text = $mes.find('.mes_text').first();
    if (s.position === 'after') $text.after($el); else $text.before($el);
}

function injectButtons() {
    const s = getSettings();
    $('#chat .mes:not([is_user="true"]) .extraMesButtons').each(function () {
        const $box = $(this);
        if (!s.enabled) { $box.find('.stw-btn').remove(); return; }
        if ($box.find('.stw-gen-btn').length) return;
        $box.append(`<div class="mes_button stw-btn stw-gen-btn fa-solid fa-cloud-sun interactable" title="${esc(t('btnGen'))}" tabindex="0"></div>`);
        $box.append(`<div class="mes_button stw-btn stw-del-btn fa-solid fa-eraser interactable" title="${esc(t('btnClear'))}" tabindex="0"></div>`);
    });
    $('#chat .stw-gen-btn').attr('title', t('btnGen'));
    $('#chat .stw-del-btn').attr('title', t('btnClear'));
}

function renderAll() {
    injectButtons();
    $('#chat .mes').each(function () {
        const id = $(this).attr('mesid');
        if (id !== undefined) renderMessage(Number(id));
    });
}

let renderTimer = null;
const renderAllSoon = (ms = 150) => { clearTimeout(renderTimer); renderTimer = setTimeout(renderAll, ms); };

/* ---------------------------------------------------------------- API (own settings only) */

function chatEndpoint(url) {
    let u = String(url || '').trim().replace(/\/+$/, '');
    if (!/\/chat\/completions$/i.test(u)) u += '/chat/completions';
    return u;
}

function modelsEndpoint(url) {
    return String(url || '').trim().replace(/\/+$/, '').replace(/\/chat\/completions$/i, '') + '/models';
}

function authHeaders(api, json = true) {
    const h = {};
    if (json) h['Content-Type'] = 'application/json';
    if (api.key) h['Authorization'] = 'Bearer ' + api.key;
    return h;
}

async function callApi(messages, override = {}) {
    const api = getSettings().api;
    const res = await fetch(chatEndpoint(api.url), {
        method: 'POST',
        headers: authHeaders(api),
        credentials: 'omit',
        body: JSON.stringify({
            model: api.model,
            messages,
            temperature: api.temperature,
            max_tokens: override.maxTokens ?? api.maxTokens,
            stream: false,
        }),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
    const j = await res.json();
    const c = j?.choices?.[0]?.message?.content;
    return Array.isArray(c) ? c.map(p => p?.text || '').join('') : String(c ?? '');
}

async function loadModels() {
    const api = getSettings().api;
    const res = await fetch(modelsEndpoint(api.url), { headers: authHeaders(api, false), credentials: 'omit' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const j = await res.json();
    const list = (j.data || j.models || []).map(x => x.id || x.name).filter(Boolean);
    $('#stw_models').html(list.map(id => `<option value="${esc(id)}"></option>`).join(''));
    return list.length;
}

/* ---------------------------------------------------------------- prompt + parsing */

function cleanText(s) {
    return String(s || '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 2000);
}

function findPrevious(chat, id) {
    for (let i = id - 1; i >= 0; i--) {
        const d = chat[i]?.extra?.[KEY];
        if (d) return d;
    }
    return null;
}

function buildPrompt(id) {
    const s = getSettings();
    const chat = getContext().chat;
    const tu = s.tempUnit === 'F' ? '°F' : '°C';
    const wu = { ms: 'm/s', kmh: 'km/h', mph: 'mph' }[s.windUnit] || 'm/s';

    const schema = [
        '"location": short place name (in the language of the chat)',
        '"date": short date or weekday in the chat language, or null if unknown',
        '"time": "HH:MM" 24h, the current time in the scene',
        '"is_night": boolean',
        `"condition": one of ${COND.join(' | ')}`,
        `"temp": number, current temperature in ${tu}`,
        `"high": number, today's maximum in ${tu}`,
        `"low": number, today's minimum in ${tu}`,
        `"forecast": array of EXACTLY 7 objects {"time":"HH:MM","condition":<condition>,"temp":number}, hourly, starting at the next full hour after the scene time (may pass midnight)`,
        '"sun_event": {"type":"sunrise"|"sunset","time":"HH:MM"} for the next sunrise or sunset, or null',
    ];
    if (s.showWind) schema.push(`"wind": {"speed": number in ${wu}, "dir": one of ${DIRS.join(' | ')}}`);
    if (s.showMoon) schema.push(`"moon": one of ${MOON.join(' | ')}`);
    if (s.showStorm) schema.push('"storm_warning": {"active": boolean, "text": short warning text in the chat language, or null}  (active only for real danger: thunderstorm, hurricane, blizzard, etc.)');

    const system = [
        'You create data for a weather widget in a roleplay chat.',
        'Read the recent messages and determine where the scene takes place, the time, and the weather (explicit or implied by the text; if not stated, infer plausibly from setting, season and previous widget).',
        'Reply with ONE JSON object only. No markdown, no comments, no extra keys.',
        'JSON fields:',
        ...schema.map(x => '- ' + x),
        'Stay consistent with the previous widget unless the story clearly changed place, time or weather. Time only moves forward with the story.',
        'For fantasy or sci-fi settings adapt names and values, but keep the schema and allowed values.',
        s.hint ? `Extra info from the user: ${s.hint}` : '',
    ].filter(Boolean).join('\n');

    const slice = chat.slice(Math.max(0, id - s.contextMessages + 1), id + 1).filter(m => !m.is_system);
    const history = slice.map(m => `${m.name}: ${cleanText(m.mes)}`).join('\n\n');
    const prev = findPrevious(chat, id);
    const prevText = prev ? JSON.stringify({ location: prev.location, date: prev.date, time: prev.time, is_night: prev.is_night, condition: prev.condition, temp: prev.temp }) : 'none';

    return [
        { role: 'system', content: system },
        { role: 'user', content: `Previous widget: ${prevText}\n\nRecent chat:\n${history}\n\nReturn the JSON object now.` },
    ];
}

function extractJson(text) {
    const clean = String(text).replace(/<think>[\s\S]*?<\/think>/gi, '').replace(/```(?:json)?/gi, '');
    const a = clean.indexOf('{');
    const b = clean.lastIndexOf('}');
    if (a < 0 || b <= a) throw new Error(t('badData'));
    return JSON.parse(clean.slice(a, b + 1));
}

function normTime(v) {
    const m = String(v ?? '').match(/(\d{1,2})[:.](\d{2})/);
    if (!m) return null;
    const h = +m[1], mi = +m[2];
    return h > 23 || mi > 59 ? null : `${pad(h)}:${pad(mi)}`;
}

const normCond = v => {
    const k = String(v || '').toLowerCase().replace(/[\s-]+/g, '_');
    return COND.includes(k) ? k : 'cloudy';
};

const num = (v, def = null) => { const n = parseFloat(v); return Number.isFinite(n) ? n : def; };

function normalize(r, s) {
    const time = normTime(r.time);
    const temp = num(r.temp);
    if (!r.location || time === null || temp === null) throw new Error(t('badData'));
    let high = num(r.high, temp), low = num(r.low, temp);
    if (high < low) [high, low] = [low, high];

    const out = {
        location: String(r.location).slice(0, 60),
        date: r.date ? String(r.date).slice(0, 40) : null,
        time,
        is_night: typeof r.is_night === 'boolean' ? r.is_night : isNightHour(+time.slice(0, 2)),
        condition: normCond(r.condition),
        temp, high, low,
        forecast: (Array.isArray(r.forecast) ? r.forecast : []).slice(0, 7)
            .map(f => ({ time: normTime(f?.time), condition: normCond(f?.condition), temp: num(f?.temp) }))
            .filter(f => f.time && f.temp !== null),
        sun_event: null, wind: null, moon: null, storm_warning: null,
        units: { temp: s.tempUnit, wind: s.windUnit },
    };

    const se = r.sun_event;
    if (se && ['sunrise', 'sunset'].includes(se.type) && normTime(se.time)) out.sun_event = { type: se.type, time: normTime(se.time) };

    if (r.wind && num(r.wind.speed) !== null) {
        const dir = String(r.wind.dir || '').toUpperCase();
        out.wind = { speed: num(r.wind.speed), dir: DIRS.includes(dir) ? dir : null };
    }

    const moon = String(r.moon || '').toLowerCase().replace(/[\s-]+/g, '_');
    if (MOON.includes(moon)) out.moon = moon;

    if (r.storm_warning && r.storm_warning.active === true) {
        out.storm_warning = { active: true, text: r.storm_warning.text ? String(r.storm_warning.text).slice(0, 60) : null };
    }
    return out;
}

/* ---------------------------------------------------------------- generation */

const busy = new Set();

async function saveChatSafe() {
    try {
        const ctx = getContext();
        await (ctx.saveChat || ctx.saveChatConditional)?.call(ctx);
    } catch (e) { console.warn('[Weatherness] saveChat failed', e); }
}

async function generateFor(id, { manual = false } = {}) {
    const s = getSettings();
    const chatRef = getContext().chat;
    const m = chatRef[id];
    if (!m || m.is_user || m.is_system) { if (manual) toastr.warning(t('noBot')); return; }
    if (!s.api.url || !s.api.model) { if (manual) toastr.warning(t('noApi')); return; }
    if (busy.has(id)) return;
    busy.add(id);
    const $btn = $(`#chat .mes[mesid="${id}"] .stw-gen-btn`).addClass('fa-fade');
    try {
        const raw = await callApi(buildPrompt(id));
        const data = normalize(extractJson(raw), s);
        if (getContext().chat !== chatRef || chatRef[id] !== m) return;
        m.extra = m.extra || {};
        m.extra[KEY] = data;
        renderMessage(id);
        await saveChatSafe();
    } catch (e) {
        console.error('[Weatherness]', e);
        toastr.error(t('errGen') + (e?.message || e));
    } finally {
        busy.delete(id);
        $btn.removeClass('fa-fade');
    }
}

function shouldAutoGenerate(id) {
    const s = getSettings();
    if (!s.enabled || !s.auto) return false;
    const chat = getContext().chat;
    let botSince = 1;
    for (let i = id - 1; i >= 0; i--) {
        if (chat[i]?.extra?.[KEY]) return botSince >= s.every;
        if (!chat[i].is_user && !chat[i].is_system) botSince++;
    }
    return true;
}

function onMessageReceived(id) {
    const m = getContext().chat[id];
    if (!m || m.is_user || m.is_system) return;
    if (shouldAutoGenerate(id)) generateFor(id);
}

function lastBotId() {
    const chat = getContext().chat;
    for (let i = chat.length - 1; i >= 0; i--) if (!chat[i].is_user && !chat[i].is_system) return i;
    return -1;
}

/* ---------------------------------------------------------------- settings UI */

function sampleData() {
    const s = getSettings();
    return {
        location: t('sampleLoc'), date: null, time: '17:05', is_night: false, condition: 'partly_cloudy',
        temp: 18, high: 21, low: 13,
        forecast: [
            { time: '18:00', condition: 'partly_cloudy', temp: 17 }, { time: '19:00', condition: 'cloudy', temp: 16 },
            { time: '20:00', condition: 'rain', temp: 15 }, { time: '21:00', condition: 'rain', temp: 15 },
            { time: '22:00', condition: 'storm', temp: 14 }, { time: '23:00', condition: 'cloudy', temp: 14 },
            { time: '00:00', condition: 'cloudy', temp: 13 },
        ],
        sun_event: { type: 'sunset', time: '18:32' },
        wind: { speed: 6, dir: 'NE' }, moon: 'waxing_gibbous',
        storm_warning: { active: true, text: null },
        units: { temp: s.tempUnit, wind: s.windUnit },
    };
}

function refreshPreview() {
    $('#stw_preview').html(buildWidget(sampleData(), getSettings()));
}

function settingsBody() {
    const s = getSettings();
    const g = k => getPath(s, k);
    const row = (label, inner) => `<label class="stw-row"><span>${label}</span>${inner}</label>`;
    const sel = (k, opts) => `<select class="text_pole stw-in" data-k="${k}">${opts.map(([v, l]) => `<option value="${v}"${String(v) === String(g(k)) ? ' selected' : ''}>${l}</option>`).join('')}</select>`;
    const chk = (k, label) => `<label class="checkbox_label"><input type="checkbox" class="stw-in" data-k="${k}"${g(k) ? ' checked' : ''}><span>${label}</span></label>`;
    const inp = (k, type = 'text', extra = '') => `<input class="text_pole stw-in" type="${type}" data-k="${k}" value="${esc(g(k))}" ${extra}>`;
    const range = (k, min, max, unit = '') => `<span class="stw-range"><input type="range" class="stw-in" data-k="${k}" min="${min}" max="${max}" value="${g(k)}"><span class="stw-val">${g(k)}${unit}</span></span>`;

    return `
<div class="stw-sec">
  ${chk('enabled', t('enabled'))}
  ${row(t('language'), sel('lang', [['ru', 'Русский'], ['en', 'English']]))}
</div>

<div class="stw-sec"><h4>${t('secApi')}</h4>
  ${row(t('apiUrl'), inp('api.url', 'text', 'placeholder="https://api.openai.com/v1" autocomplete="off"'))}
  ${row(t('apiKey'), inp('api.key', 'password', 'autocomplete="new-password"'))}
  ${row(t('model'), inp('api.model', 'text', 'list="stw_models" autocomplete="off"'))}
  <datalist id="stw_models"></datalist>
  ${row(t('apiTemp'), inp('api.temperature', 'number', 'min="0" max="2" step="0.1"'))}
  ${row(t('maxTok'), inp('api.maxTokens', 'number', 'min="200" max="8000" step="100"'))}
  <div class="stw-btns">
    <div id="stw_load_models" class="menu_button">${t('loadModels')}</div>
    <div id="stw_test" class="menu_button">${t('test')}</div>
  </div>
  <small class="stw-note">${t('apiNote')}</small>
</div>

<div class="stw-sec"><h4>${t('secGen')}</h4>
  ${chk('auto', t('auto'))}
  ${row(t('every'), inp('every', 'number', 'min="1" max="50"'))}
  ${row(t('ctxMsgs'), inp('contextMessages', 'number', 'min="1" max="30"'))}
  ${row(t('tempUnit'), sel('tempUnit', [['C', '°C'], ['F', '°F']]))}
  ${row(t('windUnit'), sel('windUnit', [['ms', t('u_ms')], ['kmh', t('u_kmh')], ['mph', t('u_mph')]]))}
  <label class="stw-col"><span>${t('hint')}</span><textarea class="text_pole stw-in" data-k="hint" rows="2" placeholder="${esc(t('hintPh'))}">${esc(s.hint)}</textarea></label>
  <div class="stw-btns"><div id="stw_gen_last" class="menu_button">${t('genLast')}</div><div id="stw_clear" class="menu_button">${t('clearChat')}</div></div>
</div>

<div class="stw-sec"><h4>${t('secWidget')}</h4>
  ${row(t('layout'), sel('layout', [['compact', t('layoutCompact')], ['extended', t('layoutExt')]]))}
  ${row(t('position'), sel('position', [['before', t('posBefore')], ['after', t('posAfter')]]))}
  ${row(t('theme'), sel('theme', [['auto', t('themeAuto')], ['dark', t('themeDark')], ['light', t('themeLight')], ['blue', t('themeBlue')], ['pink', t('themePink')], ['violet', t('themeViolet')], ['green', t('themeGreen')], ['custom', t('themeCustom')]]))}
  ${row(t('color'), `<input type="color" class="stw-in" data-k="customColor" value="${esc(s.customColor)}">`)}
  ${row(t('transparency'), range('transparency', 0, 85, '%'))}
  ${row(t('timeFormat'), sel('timeFormat', [['24', '24h'], ['12', '12h AM/PM']]))}
</div>

<div class="stw-sec"><h4>${t('secExtras')}</h4>
  ${chk('showStorm', t('showStorm'))}
  ${chk('showMoon', t('showMoon'))}
  ${chk('showWind', t('showWind'))}
</div>

<div class="stw-sec"><h4>${t('preview')}</h4><div id="stw_preview" class="stw-preview"></div></div>`;
}

function rebuildSettings() {
    $('#stw_title').text(t('title'));
    $('#stw_body').html(settingsBody());
    refreshPreview();
}

function bindSettingsEvents() {
    $(document).on('input change', '.stw-in', function () {
        const k = $(this).attr('data-k');
        let v;
        if (this.type === 'checkbox') v = this.checked;
        else if (this.type === 'number' || this.type === 'range') { v = Number(this.value); if (!Number.isFinite(v)) return; }
        else v = this.value;
        setPath(getSettings(), k, v);
        saveSettings();
        if (this.type === 'range') $(this).siblings('.stw-val').text(v + '%');
        if (k === 'lang') rebuildSettings();
        refreshPreview();
        renderAllSoon(50);
    });

    $(document).on('click', '#stw_load_models', async () => {
        try { toastr.success(t('modelsLoaded') + await loadModels()); }
        catch (e) { toastr.error(t('errGen') + (e?.message || e)); }
    });

    $(document).on('click', '#stw_test', async () => {
        try { await callApi([{ role: 'user', content: 'Reply with: OK' }], { maxTokens: 200 }); toastr.success(t('okTest')); }
        catch (e) { toastr.error(t('errGen') + (e?.message || e)); }
    });

    $(document).on('click', '#stw_gen_last', () => {
        const id = lastBotId();
        if (id < 0) return toastr.warning(t('noBot'));
        generateFor(id, { manual: true });
    });

    $(document).on('click', '#stw_clear', async () => {
        getContext().chat.forEach(m => { if (m.extra) delete m.extra[KEY]; });
        renderAll();
        await saveChatSafe();
        toastr.success(t('cleared'));
    });

    $(document).on('click', '#chat .stw-gen-btn', function () {
        const id = Number($(this).closest('.mes').attr('mesid'));
        if (Number.isInteger(id)) generateFor(id, { manual: true });
    });

    $(document).on('click', '#chat .stw-del-btn', async function () {
        const id = Number($(this).closest('.mes').attr('mesid'));
        const m = getContext().chat[id];
        if (m?.extra) { delete m.extra[KEY]; renderMessage(id); await saveChatSafe(); }
    });
}

/* ---------------------------------------------------------------- init */

jQuery(() => {
    fillDefaults(getSettings(), DEFAULTS);

    $('#extensions_settings2').append(`
<div class="stw-settings">
  <div class="inline-drawer">
    <div class="inline-drawer-toggle inline-drawer-header">
      <b id="stw_title">${t('title')}</b>
      <div class="inline-drawer-icon fa-solid fa-circle-chevron-down down"></div>
    </div>
    <div class="inline-drawer-content"><div id="stw_body"></div></div>
  </div>
</div>`);
    rebuildSettings();
    bindSettingsEvents();

    const ctx = getContext();
    const ET = ctx.eventTypes || ctx.event_types;
    const es = ctx.eventSource;
    es.on(ET.MESSAGE_RECEIVED, onMessageReceived);
    es.on(ET.CHARACTER_MESSAGE_RENDERED, id => { injectButtons(); renderMessage(Number(id)); });
    es.on(ET.CHAT_CHANGED, () => { renderAllSoon(300); setTimeout(renderAll, 1000); });
    for (const name of ['MESSAGE_SWIPED', 'MESSAGE_UPDATED', 'MESSAGE_EDITED']) {
        if (ET[name]) es.on(ET[name], id => { renderMessage(Number(id)); });
    }

    const chatEl = document.getElementById('chat');
    if (chatEl) new MutationObserver(() => renderAllSoon(150)).observe(chatEl, { childList: true });

    renderAllSoon(500);
});
