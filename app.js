/* ===========================================
   Constants and state
=========================================== */
const API_WX  = 'https://api.open-meteo.com/v1/forecast';
const API_GEO = 'https://geocoding-api.open-meteo.com/v1/search';
const PARAMS  = 'wind_speed_10m,wind_speed_80m,wind_speed_120m,wind_speed_180m,wind_direction_10m,wind_direction_80m,wind_direction_120m,wind_direction_180m,wind_gusts_10m,boundary_layer_height,precipitation,precipitation_probability,cape,weather_code';

const WINDOW_START_HOUR = 9;
const WINDOW_END_HOUR = 20;   // fallback when sunrise/sunset data is missing
const SUN_OFFSET_HOURS = 1;   // flying window = sunrise + 1h .. sunset + 1h

// Flying window for a date as decimal local hours, from Open-Meteo daily sunrise/sunset
function flyWindow(daily, date) {
    const i = daily && daily.time ? daily.time.indexOf(date) : -1;
    if (i < 0 || !daily.sunrise || !daily.sunset || !daily.sunrise[i] || !daily.sunset[i]) {
        return { start: WINDOW_START_HOUR, end: WINDOW_END_HOUR };
    }
    function dec(iso) { const t = iso.split('T')[1].split(':'); return parseInt(t[0], 10) + parseInt(t[1], 10) / 60; }
    return { start: dec(daily.sunrise[i]) + SUN_OFFSET_HOURS, end: dec(daily.sunset[i]) + SUN_OFFSET_HOURS };
}
function inFlyWindow(win, isoTime) {
    const hour = parseInt(isoTime.split('T')[1].slice(0, 2), 10);
    return hour >= win.start && hour <= win.end;
}
const DEFAULT_CARD_HOUR = 9;

const CFG_DEFAULTS = {
    speedMin: 10,
    speedOpt: 15,
    speedMod: 25,
    speedStr: 35,
    gustOk:   20,
    gustMod:  30,
    shearOk:  25,
    shearMod: 50,
};
let CFG = { ...CFG_DEFAULTS };

const SITE_GROUPS = {
    andalusia: [
        { name: 'Algodonales', lat: 36.8976, lon: -5.3935, dirFilter: { enabled: true, deg: 270, tol: 15 } },
        { name: 'El Bosque', lat: 36.7541, lon: -5.4891, dirFilter: { enabled: true, deg: 270, tol: 15 } },
        { name: 'Matalascañas', lat: 37.0104, lon: -6.5731, dirFilter: { enabled: true, deg: 225, tol: 15 } },
        { name: 'Montellano', lat: 37.0054, lon: -5.54693, dirFilter: { enabled: true, deg: 45, tol: 15 } }
    ],
    algarve: [
        { name: 'Porto de Mós', lat: 37.0853, lon: -8.6837, dirFilter: { enabled: true, deg: 135, tol: 15 } },
        { name: 'Praia da Cordoama', lat: 37.110035, lon: -8.936134, dirFilter: { enabled: true, deg: 315, tol: 35 } }
    ]
};
const EXTERNAL_SITES = [];
const EXTERNAL_GROUPS = {};
const SITE_DATA_FILES = ['data/paraglidingEarthSpain.json', 'data/paraglidingEarthPortugal.json'];
const EXTERNAL_REGION_LABELS = {};
let EXTERNAL_REGION_ORDER = [];
let activeExternalGroup = null;

let activeSiteGroup = 'andalusia';
let locations = [];

function cloneLocation(loc) {
    return { ...loc, dirFilter: loc.dirFilter ? { ...loc.dirFilter } : null, selectedDay: 0 };
}

function preferredDirection(properties) {
    const dirs = [['N', 0], ['NE', 45], ['E', 90], ['SE', 135], ['S', 180], ['SW', 225], ['W', 270], ['NW', 315]];
    const specified = dirs.filter(function(item) { return Number(properties[item[0]]) > 0; });
    if (!specified.length) return null;
    const total = specified.reduce(function(sum, item) { return sum + Number(properties[item[0]]); }, 0);
    const weighted = specified.reduce(function(sum, item) { return sum + item[1] * Number(properties[item[0]]); }, 0);
    return { enabled: true, deg: (weighted / total + 360) % 360, tol: specified.length === 1 ? 22.5 : 67.5 };
}

// Free-text ParaglidingEarth fields shown in the card's info panel, in display order
const SITE_INFO_FIELDS = [
    { key: 'takeoff_description', title: 'Despegue' },
    { key: 'going_there',         title: 'Como llegar' },
    { key: 'flight_rules',        title: 'Normas de vuelo' },
    { key: 'weather',             title: 'Meteo local' },
    { key: 'comments',            title: 'Comentarios' }
];

function normalizeName(name) {
    return String(name).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}

// Core sites are hardcoded in SITE_GROUPS; borrow the descriptive fields from the matching JSON site
function attachInfoToCoreSite(site) {
    const jsonName = normalizeName(site.name);
    Object.keys(SITE_GROUPS).forEach(function(group) {
        SITE_GROUPS[group].forEach(function(core) {
            const coreName = normalizeName(core.name);
            if (core.info !== undefined || (jsonName !== coreName && jsonName.indexOf(coreName) !== 0)) return;
            core.altitude = site.altitude;
            core.info = site.info;
        });
    });
}

function buildSiteGroups(features) {
    features.forEach(function(feature) {
        const props = feature.properties;
        const site = {
            name: props.name || 'Sin nombre',
            lat: feature.geometry.coordinates[1],
            lon: feature.geometry.coordinates[0],
            dirFilter: preferredDirection(props),
            province: props.province || null,
            altitude: props.takeoff_altitude || null,
            info: {}
        };
        SITE_INFO_FIELDS.forEach(function(field) {
            if (props[field.key]) site.info[field.key] = props[field.key];
        });
        const name = String(site.name).toLowerCase();
        const isCore = name === 'el bosque'
            || name.indexOf('algodonales - levante') === 0
            || name.indexOf('matalascanas') === 0
            || name.indexOf('porto de mós') === 0
            || name.indexOf('praia da cordoama') === 0;
        if (isCore) {
            attachInfoToCoreSite(site);
            return;
        }
        const group = props.regionCode || props.region || 'unknown';
        EXTERNAL_REGION_LABELS[group] = props.region || 'Sin región';
        EXTERNAL_SITES.push(site);
        if (!EXTERNAL_GROUPS[group]) EXTERNAL_GROUPS[group] = [];
        EXTERNAL_GROUPS[group].push(site);
    });
    // Spanish regions first, Portuguese ones (incl. Algarve) at the bottom; alphabetical within each
    const isPortugal = function(group) { return group.indexOf('PT-') === 0; };
    EXTERNAL_REGION_ORDER = Object.keys(EXTERNAL_GROUPS).sort(function(a, b) {
        if (isPortugal(a) !== isPortugal(b)) return isPortugal(a) ? 1 : -1;
        return EXTERNAL_REGION_LABELS[a].localeCompare(EXTERNAL_REGION_LABELS[b], 'es');
    });
    activeExternalGroup = EXTERNAL_REGION_ORDER[0] || null;
}

function renderSiteTabs() {
    const tabs = document.getElementById('siteTabs');
    tabs.innerHTML = ''
        + '<button class="site-tab ' + (activeSiteGroup === 'andalusia' ? 'active' : '') + '" type="button" onclick="switchSiteGroup(\'andalusia\')">Andalucía</button>'
        + '<button class="site-tab ' + (activeSiteGroup === 'algarve' ? 'active' : '') + '" type="button" onclick="switchSiteGroup(\'algarve\')">Algarve</button>'
        + '<button class="site-tab ' + (activeSiteGroup === 'external' ? 'active' : '') + '" type="button" onclick="switchSiteGroup(\'external\')">External</button>'
        + '<label class="external-picker' + (activeSiteGroup === 'external' ? ' visible' : '') + '"><select class="external-select" onchange="selectExternalGroup(this.value)">' + buildExternalOptions() + '</select></label>';
}

function buildExternalOptions() {
    return EXTERNAL_REGION_ORDER.filter(function(group) { return EXTERNAL_GROUPS[group] && EXTERNAL_GROUPS[group].length; }).map(function(group) {
        return '<option value="' + group + '"' + (group === activeExternalGroup ? ' selected' : '') + '>' + escHtml(EXTERNAL_REGION_LABELS[group]) + '</option>';
    }).join('');
}

function selectExternalGroup(group) {
    if (!EXTERNAL_GROUPS[group]) return;
    activeExternalGroup = group;
    activeSiteGroup = 'external';
    locations = EXTERNAL_GROUPS[group].map(cloneLocation);
    renderSiteTabs();
    renderAll();
}

async function loadParaglidingSites() {
    const collections = await Promise.all(SITE_DATA_FILES.map(function(file) {
        return fetch(file).then(function(r) {
            if (!r.ok) throw new Error(file + ': HTTP ' + r.status);
            return r.json();
        });
    }));
    buildSiteGroups(collections.flatMap(function(c) { return c.features; }));
    locations = SITE_GROUPS.andalusia.map(cloneLocation);
    renderSiteTabs();
    renderAll();
}
let currentModel = '';

const wxCache      = new Map();
const weatherStore = new Map();

let geoTimer     = null;
let infoOpen     = false;
let settingsOpen = false;

/* ===========================================
   Flyability scoring
=========================================== */
function dirShear(a, b) {
    const d = Math.abs(a - b) % 360;
    return d > 180 ? 360 - d : d;
}

function flyScore(ws10, gusts, dir10, dir120) {
    const sSpeed = ws10 < CFG.speedOpt ? 0 : ws10 < CFG.speedMod ? 1 : ws10 < CFG.speedStr ? 2 : 3;
    const sGust  = gusts < CFG.gustOk ? 0 : gusts < CFG.gustMod ? 1 : 2;
    const shear  = dirShear(dir10, dir120);
    const sShear = shear < CFG.shearOk ? 0 : shear < CFG.shearMod ? 1 : 2;
    return Math.max(sSpeed, sGust, sShear);
}

function arrowRotationDeg(deg) {
    const base = Number(deg) || 0;
    return (base + 180) % 360;
}

const FLY_LABELS  = ['Optimo', 'Moderado', 'Fuerte', 'Peligroso'];
const FLY_COLORS  = ['#22c55e', '#eab308', '#f97316', '#ef4444'];

/* ===========================================
   Helpers
=========================================== */
function escHtml(s) {
    return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function formatCoordinateLabel(lat, lon) {
    const latLabel = lat >= 0 ? 'N' : 'S';
    const lonLabel = lon >= 0 ? 'E' : 'W';
    return Math.abs(lat).toFixed(4) + '°' + latLabel + ' · ' + Math.abs(lon).toFixed(4) + '°' + lonLabel;
}

const COMPASS_DIRS = [
    { label: 'N', deg: 0 }, { label: 'NNE', deg: 23 }, { label: 'NE', deg: 45 },
    { label: 'ENE', deg: 68 }, { label: 'E', deg: 90 }, { label: 'ESE', deg: 113 },
    { label: 'SE', deg: 135 }, { label: 'SSE', deg: 158 }, { label: 'S', deg: 180 },
    { label: 'SSO', deg: 203 }, { label: 'SO', deg: 225 }, { label: 'OSO', deg: 248 },
    { label: 'O', deg: 270 }, { label: 'ONO', deg: 293 }, { label: 'NO', deg: 315 },
    { label: 'NNO', deg: 338 },
];

function compassDir(deg) {
    const dirs = ['N','NNE','NE','ENE','E','ESE','SE','SSE','S','SSO','SO','OSO','O','ONO','NO','NNO'];
    return dirs[Math.round(deg / 22.5) % 16];
}

function buildDirOptions(selectedDeg) {
    const closest = COMPASS_DIRS.reduce((a, b) => {
        const da = Math.abs(((a.deg - selectedDeg) + 180) % 360 - 180);
        const db = Math.abs(((b.deg - selectedDeg) + 180) % 360 - 180);
        return da <= db ? a : b;
    });
    return COMPASS_DIRS.map(d =>
        '<option value="' + d.deg + '"' + (d.deg === closest.deg ? ' selected' : '') + '>' + d.label + '</option>'
    ).join('');
}

function dayLabelShort(isoDate) {
    const parts = isoDate.split('-').map(Number);
    return new Date(parts[0], parts[1] - 1, parts[2]).toLocaleDateString('es-ES', { weekday: 'short', day: 'numeric' });
}

function getDays(times) {
    const days = [];
    times.forEach(function(t) { const d = t.split('T')[0]; if (!days.includes(d)) days.push(d); });
    return days;
}

function dirMatchesFilter(windDeg, filterDeg, tol) {
    return Math.abs(((windDeg - filterDeg) + 180) % 360 - 180) <= tol;
}

function bestWindows(idx, scores, times, dirs, speeds, daily) {
    const df = locations[idx] && locations[idx].dirFilter;
    const days = {};
    times.forEach(function(t, i) {
        const day = t.split('T')[0];
        if (!days[day]) days[day] = [];
        const dirOk = !df || !df.enabled || dirMatchesFilter(dirs[i], df.deg, df.tol);
        days[day].push({ t: t, s: scores[i], dirOk: dirOk, speedOk: !speeds || speeds[i] >= CFG.speedMin });
    });
    return Object.entries(days).map(function(entry) {
        const date = entry[0]; const hrs = entry[1];
        const fw = flyWindow(daily, date);
        let bestStart = null, bestEnd = null, bestLen = 0;
        let curStart = null, curEnd = null, curLen = 0;
        hrs.forEach(function(h) {
            const favorable = h.s <= 2 && h.dirOk && h.speedOk && inFlyWindow(fw, h.t);
            if (favorable) {
                if (!curStart) curStart = h.t;
                curEnd = h.t;
                curLen++;
                if (curLen > bestLen) {
                    bestStart = curStart;
                    bestEnd = curEnd;
                    bestLen = curLen;
                }
            } else {
                curStart = null;
                curEnd = null;
                curLen = 0;
            }
        });
        return bestLen > 0
            ? {
                date: date,
                startIso: bestStart,
                label: dayLabelShort(date),
                start: bestStart.split('T')[1].slice(0, 5),
                end: bestEnd.split('T')[1].slice(0, 5),
                hours: bestLen
            }
            : null;
    }).filter(Boolean);
}

/* ===========================================
   CBL / Thermal colour helpers
=========================================== */
function cblColor(blh) {
    if (blh == null || blh < 50) return '#374151';
    if (blh < 300)  return '#4b5563';
    if (blh < 700)  return '#0ea5e9';
    if (blh < 1500) return '#22c55e';
    if (blh < 2500) return '#f59e0b';
    return '#ef4444';
}

function cblStrength(blh) {
    if (blh == null || blh < 50) return '-';
    if (blh < 300)  return 'Muy debil';
    if (blh < 700)  return 'Debil';
    if (blh < 1500) return 'Activas';
    if (blh < 2500) return 'Fuertes';
    return 'Muy fuertes';
}

function cblShortLabel(blh) {
    if (blh == null) return '-';
    if (blh < 1000) return Math.round(blh) + 'm';
    return (blh / 1000).toFixed(1) + 'k';
}

/* ===========================================
   API
=========================================== */
const WX_TTL_MS    = 60 * 60 * 1000;
const WX_LS_PREFIX = 'wx:';
const FORECAST_DAYS = 7;

function wxKey(loc) {
    return loc.lat + ',' + loc.lon + ',' + currentModel + ',' + FORECAST_DAYS + ',v3';
}

function wxCacheGet(key) {
    let entry = wxCache.get(key);
    if (!entry) {
        try { entry = JSON.parse(localStorage.getItem(WX_LS_PREFIX + key)); } catch (e) { entry = null; }
        if (entry) wxCache.set(key, entry);
    }
    if (!entry || !entry.data || Date.now() - entry.ts > WX_TTL_MS) return null;
    return entry.data;
}

function wxCacheSet(key, data) {
    const entry = { ts: Date.now(), data: data };
    wxCache.set(key, entry);
    const json = JSON.stringify(entry);
    try {
        localStorage.setItem(WX_LS_PREFIX + key, json);
    } catch (e) {
        // Storage full or unavailable: drop stored forecasts and retry once
        pruneWxStorage(true);
        try { localStorage.setItem(WX_LS_PREFIX + key, json); } catch (e2) {}
    }
}

function wxCacheDelete(key) {
    wxCache.delete(key);
    try { localStorage.removeItem(WX_LS_PREFIX + key); } catch (e) {}
}

function pruneWxStorage(all) {
    try {
        const stale = [];
        for (let i = 0; i < localStorage.length; i++) {
            const k = localStorage.key(i);
            if (!k || k.indexOf(WX_LS_PREFIX) !== 0) continue;
            let expired = all;
            if (!expired) {
                try { expired = Date.now() - JSON.parse(localStorage.getItem(k)).ts > WX_TTL_MS; } catch (e) { expired = true; }
            }
            if (expired) stale.push(k);
        }
        stale.forEach(function(k) { localStorage.removeItem(k); });
    } catch (e) {}
}
pruneWxStorage(false);

/* ===========================================
   Rain / storm hazard: 0 none, 1 rain, 2 storm
=========================================== */
function hourVal(h, k, i) { return (h[k] && h[k][i] != null) ? h[k][i] : null; }
function wxHazard(h, i) {
    const code = hourVal(h, 'weather_code', i), cape = hourVal(h, 'cape', i);
    const precip = hourVal(h, 'precipitation', i), prob = hourVal(h, 'precipitation_probability', i);
    if ((code !== null && code >= 95) || (cape !== null && cape >= 1500 && ((precip || 0) > 0 || (prob || 0) >= 30))) return 2;
    if ((code !== null && code >= 51 && code <= 86) || (precip !== null && precip >= 0.2) || (prob !== null && prob >= 60)) return 1;
    return 0;
}
const HAZ_ICON = ['', '🌧', '⛈'];
const HAZ_LABEL = ['Sin lluvia', 'Lluvia', 'Tormenta'];

async function fetchWeather(loc) {
    const key = wxKey(loc);
    const cached = wxCacheGet(key);
    if (cached) return cached;
    const modelParam = currentModel ? '&models=' + encodeURIComponent(currentModel) : '';
    const url = API_WX + '?latitude=' + loc.lat + '&longitude=' + loc.lon + '&hourly=' + PARAMS + '&daily=sunrise,sunset&timezone=auto&forecast_days=' + FORECAST_DAYS + modelParam;
    const r = await fetch(url);
    if (!r.ok) throw new Error('HTTP ' + r.status);
    const data = await r.json();
    // Short-range models return nulls past their horizon: trim them off.
    const hr = data.hourly;
    if (hr && hr.wind_speed_10m) {
        let n = hr.time.length;
        while (n > 0 && (hr.wind_speed_10m[n - 1] == null || hr.wind_gusts_10m[n - 1] == null)) n--;
        if (n < hr.time.length) Object.keys(hr).forEach(function(k) { if (Array.isArray(hr[k])) hr[k] = hr[k].slice(0, n); });
    }
    wxCacheSet(key, data);
    return data;
}

function onModelChange() {
    currentModel = document.getElementById('modelSelect').value;
    weatherStore.clear();
    renderAll();
}

/* ===========================================
   Summary bar
=========================================== */
function buildSummary(idx, scores, times, dirs, speeds, daily) {
    const wins = bestWindows(idx, scores, times, dirs, speeds, daily);
    if (!wins.length) return '<span class="chip"><span class="chip-dot" style="background:var(--f3)"></span>Sin ventanas favorables</span>';
    return wins.slice(0, 3).map(function(w) {
        return '<span class="chip"><span class="chip-dot" style="background:var(--f0)"></span>' + escHtml(w.label) + ' · ' + escHtml(w.start) + '–' + escHtml(w.end) + ' (' + w.hours + 'h)</span>';
    }).join('');
}

/* ===========================================
   Day tabs
=========================================== */
function buildDayTabs(idx, days, scores, times, selDay, hData, daily) {
    return days.map(function(d, i) {
        const dayHourIndices = [];
        times.forEach(function(t, hi) { if (t.startsWith(d)) dayHourIndices.push(hi); });
        const step = Math.max(1, Math.floor(dayHourIndices.length / 6));
        const sample = dayHourIndices.filter(function(_, j) { return j % step === 0; }).slice(0, 6);
        const dots = sample.map(function(hi) {
            return '<span class="day-tab-dot" style="background:' + FLY_COLORS[scores[hi]] + '"></span>';
        }).join('');
        let dayHaz = 0;
        const fw = flyWindow(daily, d);
        dayHourIndices.forEach(function(hi) {
            if (inFlyWindow(fw, times[hi])) dayHaz = Math.max(dayHaz, wxHazard(hData, hi));
        });
        return '<button class="day-tab ' + (i === selDay ? 'active' : '') + '" onclick="selectDay(' + idx + ', ' + i + ')">'
            + '<span>' + dayLabelShort(d) + (dayHaz ? ' <span class="day-haz" title="' + HAZ_LABEL[dayHaz] + '">' + HAZ_ICON[dayHaz] + '</span>' : '') + '</span>'
            + '<div class="day-tab-dots">' + dots + '</div>'
            + '</button>';
    }).join('');
}

/* ===========================================
   Hourly cards
=========================================== */
function buildHourCards(idx, h, scores, selDay) {
    const df = locations[idx] && locations[idx].dirFilter;
    const days = getDays(h.time);
    const dayDate = days[selDay];
    const maxBLH = 3000;

    return h.time.map(function(t, i) {
        if (!t.startsWith(dayDate)) return '';

        const s      = scores[i];
        const dir10  = h.wind_direction_10m[i];
        const dir120 = h.wind_direction_120m[i];
        const ws10   = h.wind_speed_10m[i];
        const gust   = h.wind_gusts_10m[i];
        const blh    = (h.boundary_layer_height && h.boundary_layer_height[i] != null) ? h.boundary_layer_height[i] : null;
        const shear  = dirShear(dir10, dir120);

        const dirOk = !df || !df.enabled || dirMatchesFilter(dir10, df.deg, df.tol);
        const cls   = !dirOk ? 'dir-filtered' : ws10 < CFG.speedMin ? 'score-' + s + ' too-light' : 'score-' + s;

        const timeStr   = t.split('T')[1].slice(0, 5).replace(':00', 'h');
        const barH      = blh !== null ? Math.max(2, Math.round((Math.min(blh, maxBLH) / maxBLH) * 22)) : 2;
        const barClr    = cblColor(blh);
        const gustHigh  = gust > CFG.gustOk;
        const shearWarn = shear > CFG.shearOk;

        return '<div class="hour-card ' + cls + '" id="hc-' + idx + '-' + i + '" onclick="showDetail(' + idx + ', ' + i + ')">'
            + '<div class="hc-time">' + timeStr + '</div>'
            + '<div class="hc-badge" style="background:' + FLY_COLORS[s] + ';color:' + (s === 1 ? '#000' : '#fff') + '">' + FLY_LABELS[s].slice(0, 3) + '</div>'
            + '<div class="hc-arrows">'
            +   '<span class="hc-arr10"  style="display:inline-block;transform:rotate(' + arrowRotationDeg(dir10) + 'deg)">↑</span>'
            +   '<span class="hc-arr120" style="display:inline-block;transform:rotate(' + arrowRotationDeg(dir120) + 'deg)">↑</span>'
            + '</div>'
            + (wxHazard(h, i) ? '<div class="hc-haz haz-' + wxHazard(h, i) + '" title="' + HAZ_LABEL[wxHazard(h, i)] + '">' + HAZ_ICON[wxHazard(h, i)] + (hourVal(h, 'precipitation', i) ? '<small>' + hourVal(h, 'precipitation', i).toFixed(1) + '</small>' : '') + '</div>' : '')
            + '<div class="hc-spd">' + ws10.toFixed(0) + '<small>km/h</small></div>'
            + '<div class="hc-gust' + (gustHigh ? ' warn' : '') + '">↗' + gust.toFixed(0) + '</div>'
            + (shearWarn ? '<div class="hc-shear">⚡' + shear.toFixed(0) + '°</div>' : '')
            + '<div class="hc-cbl">'
            +   '<div class="hc-cbl-bg"><div class="hc-cbl-fill" style="height:' + barH + 'px;background:' + barClr + '"></div></div>'
            +   '<div class="hc-cbl-txt">' + cblShortLabel(blh) + '</div>'
            + '</div>'
            + '</div>';
    }).join('');
}

/* ===========================================
   Detail panel
=========================================== */
function showDetail(idx, hourIdx) {
    const card = document.getElementById('card-' + idx);
    if (!card) return;

    const wasActive = document.getElementById('hc-' + idx + '-' + hourIdx) &&
                      document.getElementById('hc-' + idx + '-' + hourIdx).classList.contains('active-detail');
    card.querySelectorAll('.hour-card.active-detail').forEach(function(c) { c.classList.remove('active-detail'); });
    const dp = card.querySelector('.detail-panel');
    if (wasActive) { dp.classList.remove('visible'); return; }

    const hcEl = document.getElementById('hc-' + idx + '-' + hourIdx);
    if (hcEl) hcEl.classList.add('active-detail');

    const data = weatherStore.get(idx);
    if (!data) return;
    const h = data.hourly;

    const ws10  = h.wind_speed_10m[hourIdx];
    const gust  = h.wind_gusts_10m[hourIdx];
    const ws80  = h.wind_speed_80m[hourIdx];
    const ws120 = h.wind_speed_120m[hourIdx];
    const ws180 = h.wind_speed_180m[hourIdx];
    const d10   = h.wind_direction_10m[hourIdx];
    const d80   = (h.wind_direction_80m  && h.wind_direction_80m[hourIdx]  != null) ? h.wind_direction_80m[hourIdx]  : d10;
    const d120  = h.wind_direction_120m[hourIdx];
    const d180  = (h.wind_direction_180m && h.wind_direction_180m[hourIdx] != null) ? h.wind_direction_180m[hourIdx] : d120;
    const blh   = (h.boundary_layer_height && h.boundary_layer_height[hourIdx] != null) ? h.boundary_layer_height[hourIdx] : null;
    const shear = dirShear(d10, d120);

    const sSpeed = ws10 < CFG.speedOpt ? 0 : ws10 < CFG.speedMod ? 1 : ws10 < CFG.speedStr ? 2 : 3;
    const sGust  = gust < CFG.gustOk ? 0 : gust < CFG.gustMod ? 1 : 2;
    const sShear = shear < CFG.shearOk ? 0 : shear < CFG.shearMod ? 1 : 2;
    const s = Math.max(sSpeed, sGust, sShear);

    const timeStr = h.time[hourIdx].replace('T', ' ').slice(0, 16);
    const df = locations[idx] && locations[idx].dirFilter;
    const reasons = [];
    if (df && df.enabled && !dirMatchesFilter(d10, df.deg, df.tol))
        reasons.push('Dir ' + compassDir(d10) + ' (' + d10 + '°) fuera del filtro');
    if (ws10 < CFG.speedMin) reasons.push('Viento ' + ws10.toFixed(1) + ' km/h < minimo ' + CFG.speedMin + ' km/h');
    if (sSpeed > 0) reasons.push('Viento ' + ws10.toFixed(1) + ' km/h > limite ' + CFG.speedOpt + ' km/h');
    if (sGust  > 0) reasons.push('Rachas ' + gust.toFixed(1) + ' km/h > limite ' + CFG.gustOk + ' km/h');
    if (sShear > 0) reasons.push('Cizalladura ' + shear.toFixed(0) + '° > limite ' + CFG.shearOk + '°');

    const haz = wxHazard(h, hourIdx);
    const precip = hourVal(h, 'precipitation', hourIdx), prob = hourVal(h, 'precipitation_probability', hourIdx), cape = hourVal(h, 'cape', hourIdx);
    if (haz === 2) reasons.push('Tormenta prevista (CAPE ' + (cape !== null ? Math.round(cape) : '-') + ' J/kg)');
    else if (haz === 1) reasons.push('Lluvia prevista' + (precip !== null ? ' (' + precip.toFixed(1) + ' mm)' : ''));

    const cblTxt = blh !== null ? Math.round(blh) + ' m' : '-';

    dp.innerHTML = ''
        + '<div class="dp-header">'
        +   '<div class="dp-time">' + escHtml(timeStr) + '</div>'
        +   '<span class="dp-badge" style="background:' + FLY_COLORS[s] + ';color:' + (s === 1 ? '#000' : '#fff') + '">' + FLY_LABELS[s] + '</span>'
        + '</div>'
        + '<div class="dp-grid">'
        +   '<div class="dp-row"><span class="dp-key">Viento 10m</span><span class="dp-val ' + (sSpeed >= 3 ? 'danger' : sSpeed >= 1 ? 'warn' : '') + '">' + ws10.toFixed(1) + ' km/h</span></div>'
        +   '<div class="dp-row"><span class="dp-key">Rachas</span><span class="dp-val ' + (sGust >= 1 ? 'warn' : '') + '">' + gust.toFixed(1) + ' km/h</span></div>'
        +   '<div class="dp-row"><span class="dp-key">Viento 80m</span><span class="dp-val">' + ws80.toFixed(1) + ' km/h</span></div>'
        +   '<div class="dp-row"><span class="dp-key">Viento 120m</span><span class="dp-val">' + ws120.toFixed(1) + ' km/h</span></div>'
        +   '<div class="dp-row"><span class="dp-key">Viento 180m</span><span class="dp-val">' + ws180.toFixed(1) + ' km/h</span></div>'
        +   '<div class="dp-row"><span class="dp-key">Cizalladura</span><span class="dp-val ' + (sShear >= 1 ? 'warn' : '') + '">' + shear.toFixed(0) + '°</span></div>'
        +   '<div class="dp-row"><span class="dp-key">Techo CBL</span><span class="dp-val" style="color:' + cblColor(blh) + '">' + cblTxt + '</span></div>'
        +   '<div class="dp-row"><span class="dp-key">Termicas</span><span class="dp-val" style="color:' + cblColor(blh) + '">' + cblStrength(blh) + '</span></div>'
        +   '<div class="dp-row"><span class="dp-key">Lluvia</span><span class="dp-val ' + (haz === 2 ? 'danger' : haz === 1 ? 'warn' : '') + '">' + (HAZ_ICON[haz] ? HAZ_ICON[haz] + ' ' : '') + HAZ_LABEL[haz] + (precip !== null ? ' · ' + precip.toFixed(1) + ' mm' : '') + '</span></div>'
        +   '<div class="dp-row"><span class="dp-key">Prob. lluvia / CAPE</span><span class="dp-val">' + (prob !== null ? prob + '%' : '-') + ' / ' + (cape !== null ? Math.round(cape) + ' J/kg' : '-') + '</span></div>'
        + '</div>'
        + '<div class="dp-dirs">'
        +   '<div class="dp-dir-item"><span class="dp-dir-arr" style="color:#7dd3fc;display:inline-block;transform:rotate(' + arrowRotationDeg(d10) + 'deg)">↑</span><div class="dp-dir-name">' + compassDir(d10) + '</div><div class="dp-dir-alt">10m · ' + d10 + '°</div></div>'
        +   '<div class="dp-dir-item"><span class="dp-dir-arr" style="color:#4ade80;display:inline-block;transform:rotate(' + arrowRotationDeg(d80) + 'deg)">↑</span><div class="dp-dir-name">' + compassDir(d80) + '</div><div class="dp-dir-alt">80m · ' + d80 + '°</div></div>'
        +   '<div class="dp-dir-item"><span class="dp-dir-arr" style="color:#c084fc;display:inline-block;transform:rotate(' + arrowRotationDeg(d120) + 'deg)">↑</span><div class="dp-dir-name">' + compassDir(d120) + '</div><div class="dp-dir-alt">120m · ' + d120 + '°</div></div>'
        +   '<div class="dp-dir-item"><span class="dp-dir-arr" style="color:#e879f9;display:inline-block;transform:rotate(' + arrowRotationDeg(d180) + 'deg)">↑</span><div class="dp-dir-name">' + compassDir(d180) + '</div><div class="dp-dir-alt">180m · ' + d180 + '°</div></div>'
        + '</div>'
        + '<div class="dp-reasons">'
        + (reasons.length === 0
            ? '<span style="color:var(--f0)">✓ Condiciones optimas</span>'
            : reasons.map(function(r) { return '<span>⚠ ' + escHtml(r) + '</span>'; }).join(''))
        + '</div>';

    dp.classList.add('visible');
    if (hcEl) hcEl.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
}

/* ===========================================
   Day selection
=========================================== */
function selectDay(idx, dayIdx) {
    locations[idx].selectedDay = dayIdx;
    const data = weatherStore.get(idx);
    if (data) rebuildHourly(idx, data);
}

function rebuildHourly(idx, data) {
    const card = document.getElementById('card-' + idx);
    if (!card) return;

    const body = card.querySelector('.loc-body');
    if (!body) return;

    const h = data.hourly;
    const scores = h.time.map(function(_, i) {
        return flyScore(h.wind_speed_10m[i], h.wind_gusts_10m[i], h.wind_direction_10m[i], h.wind_direction_120m[i]);
    });
    const days = getDays(h.time);
    const selDay = locations[idx].selectedDay != null ? locations[idx].selectedDay : 0;

    body.innerHTML = ''
        + '<div class="summary-bar">' + buildSummary(idx, scores, h.time, h.wind_direction_10m, h.wind_speed_10m, data.daily) + '</div>'
        + '<div class="day-tabs">' + buildDayTabs(idx, days, scores, h.time, selDay, h, data.daily) + '</div>'
        + '<div class="hourly-section">'
        +   '<div class="hourly-hint">← desliza · toca para detalles</div>'
        +   '<div class="hourly-scroll">' + buildHourCards(idx, h, scores, selDay) + '</div>'
        +   '<div class="detail-panel"></div>'
        + '</div>'
        + '<div class="loc-legend">'
        +   '<span class="lgi"><span class="lgdot" style="background:var(--f0)"></span>Optimo ' + CFG.speedMin + '–' + CFG.speedOpt + ' km/h</span>'
        +   '<span class="lgi"><span class="lgdot" style="background:var(--f1)"></span>Moderado</span>'
        +   '<span class="lgi"><span class="lgdot" style="background:var(--f2)"></span>Fuerte</span>'
        +   '<span class="lgi"><span class="lgdot" style="background:var(--f3)"></span>Peligroso</span>'
        +   '<span class="lgi"><span class="lgdot" style="background:#0ea5e9"></span>Term. leves</span>'
        +   '<span class="lgi"><span class="lgdot" style="background:#22c55e"></span>Term. activas</span>'
        +   '<span class="lgi"><span class="lgdot" style="background:#f59e0b"></span>Term. fuertes</span>'
        + '</div>';

    scrollToDefaultCard(idx, h, scores, days, selDay, data.daily);
}

function scrollToDefaultCard(idx, h, scores, days, selDay, daily) {
    const card = document.getElementById('card-' + idx);
    const scroller = card && card.querySelector('.hourly-scroll');
    if (!scroller) return;
    const dayDate = days[selDay];
    const win = bestWindows(idx, scores, h.time, h.wind_direction_10m, h.wind_speed_10m, daily)
        .find(function(w) { return w.date === dayDate; });
    const targetTime = win ? win.startIso : dayDate + 'T' + String(DEFAULT_CARD_HOUR).padStart(2, '0') + ':00';
    const i = h.time.indexOf(targetTime);
    const el = i >= 0 && document.getElementById('hc-' + idx + '-' + i);
    if (!el) return;
    scroller.scrollLeft = el.getBoundingClientRect().left - scroller.getBoundingClientRect().left + scroller.scrollLeft - 12;
}

/* ===========================================
   Render
=========================================== */
function buildNavLink(loc) {
    const url = 'https://www.google.com/maps/dir/?api=1&destination=' + loc.lat + ',' + loc.lon + '&travelmode=driving';
    return '<a class="nav-link" href="' + url + '" target="_blank" rel="noopener" title="Como llegar (Google Maps)" aria-label="Como llegar a ' + escHtml(loc.name) + ' en Google Maps">'
        + '<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path d="M12 2 4.5 20.3l.7.7L12 18l6.8 3 .7-.7z" fill="currentColor"/></svg></a>';
}

// Free text from ParaglidingEarth: escape it, then turn bare URLs into links
function formatInfoText(text) {
    let t = String(text);
    if (/[ÃÂ]/.test(t)) {
        try { t = decodeURIComponent(escape(t)); } catch (e) { /* not mojibake after all */ }
    }
    return escHtml(t.replace(/\r\n?/g, '\n').trim()).replace(/(https?:\/\/[^\s<]+)/g, function(u) {
        return '<a href="' + u + '" target="_blank" rel="noopener">' + u + '</a>';
    });
}

function buildInfoPanel(loc) {
    const info = loc.info || {};
    const blocks = SITE_INFO_FIELDS.filter(function(f) { return info[f.key]; }).map(function(f) {
        return '<div class="info-block"><h4>' + f.title + '</h4><p>' + formatInfoText(info[f.key]) + '</p></div>';
    });
    if (!blocks.length) return '';
    return '<details class="loc-info"><summary>ℹ Info del sitio</summary>' + blocks.join('') + '</details>';
}

function createCard(idx) {
    const loc = locations[idx];
    if (!loc.dirFilter)            loc.dirFilter   = { enabled: false, deg: 270, tol: 45 };
    if (loc.selectedDay == null)   loc.selectedDay = 0;
    const df = loc.dirFilter;
    const el = document.createElement('div');
    el.className = 'loc-card';
    el.id = 'card-' + idx;
    el.innerHTML = ''
        + '<div class="loc-header">'
        +   '<div class="loc-title">'
        +     '<div class="loc-name"><h2>' + escHtml(loc.name) + '</h2>' + buildNavLink(loc) + '</div>'
        +     '<div class="coord">' + formatCoordinateLabel(loc.lat, loc.lon) + (loc.altitude ? ' · ' + escHtml(loc.altitude) + ' m' : '') + '</div>'
        +   '</div>'
        +   '<div class="loc-actions">'
        +     '<button class="btn btn-ghost btn-sm" onclick="refreshCard(' + idx + ')">↻</button>'
        +     '<button class="btn btn-danger btn-sm" onclick="removeLocation(' + idx + ')">✕</button>'
        +   '</div>'
        + '</div>'
        + '<div class="dir-filter-bar">'
        +   '<label class="df-toggle"><input type="checkbox" id="df-on-' + idx + '" ' + (df.enabled ? 'checked' : '') + ' onchange="applyDirFilter(' + idx + ')"><span>Filtro direccion</span></label>'
        +   '<div class="df-controls">'
        +     '<span class="df-label">Desde</span>'
        +     '<select id="df-deg-' + idx + '" class="df-select" onchange="updateDirFilter(' + idx + ')">' + buildDirOptions(df.deg) + '</select>'
        +     '<span class="df-label">±</span>'
        +     '<input type="number" id="df-tol-' + idx + '" min="5" max="180" value="' + df.tol + '" class="df-input" oninput="updateDirFilter(' + idx + ')">'
        +     '<span class="df-label">°</span>'
        +   '</div>'
        + '</div>'
        + buildInfoPanel(loc)
        + '<div class="loc-body"></div>';
    return el;
}

async function renderLocation(idx) {
    const card = document.getElementById('card-' + idx);
    if (!card) return;
    const body = card.querySelector('.loc-body');
    body.innerHTML = '<div class="loc-loading">Cargando datos…</div>';
    try {
        const data = await fetchWeather(locations[idx]);
        weatherStore.set(idx, data);
        const h      = data.hourly;
        const scores = h.time.map(function(_, i) {
            return flyScore(h.wind_speed_10m[i], h.wind_gusts_10m[i], h.wind_direction_10m[i], h.wind_direction_120m[i]);
        });
        const days   = getDays(h.time);
        const selDay = locations[idx].selectedDay != null ? locations[idx].selectedDay : 0;

        rebuildHourly(idx, data);
    } catch (e) {
        body.innerHTML = '<div class="loc-error">Error al obtener datos: ' + escHtml(e.message) + '</div>';
    }
}

function switchSiteGroup(groupKey) {
    const key = groupKey || 'andalusia';
    if (key === 'external') {
        if (!EXTERNAL_GROUPS[activeExternalGroup]) {
            activeExternalGroup = EXTERNAL_REGION_ORDER.find(function(group) { return EXTERNAL_GROUPS[group] && EXTERNAL_GROUPS[group].length; });
        }
        if (!activeExternalGroup) return;
        activeSiteGroup = key;
        locations = EXTERNAL_GROUPS[activeExternalGroup].map(cloneLocation);
        renderSiteTabs();
        renderAll();
        return;
    }
    if (!SITE_GROUPS[key]) return;

    activeSiteGroup = key;
    locations = SITE_GROUPS[key].map(cloneLocation);
    renderSiteTabs();
    renderAll();
}

function renderAll() {
    weatherStore.clear();
    const main = document.getElementById('main');
    main.innerHTML = '';
    if (!locations.length) {
        main.innerHTML = '<div class="empty-state">Sin ubicaciones. Anade una con el buscador.</div>';
        return;
    }
    // Cached forecasts render straight away; only uncached places count towards the manual-fetch limit
    const cached = locations.map(function(loc) { return wxCacheGet(wxKey(loc)); });
    const pending = cached.filter(function(data) { return !data; }).length;
    // Built-in default groups always auto-load, whatever their size
    const isDefaultGroup = !!SITE_GROUPS[activeSiteGroup] && locations.length <= SITE_GROUPS[activeSiteGroup].length;
    const manualFetchRequired = !isDefaultGroup && pending > 3;
    if (manualFetchRequired) {
        main.innerHTML = '<div class="manual-fetch"><span>Hay ' + pending + ' lugares sin previsiones recientes. Pulsa para solicitarlas.</span><button class="btn btn-accent btn-sm" onclick="fetchSelectedLocations()">Solicitar previsiones</button></div>';
    }
    locations.forEach(function(_, i) {
        main.appendChild(createCard(i));
        if (cached[i]) {
            weatherStore.set(i, cached[i]);
            rebuildHourly(i, cached[i]);
        } else if (!manualFetchRequired) {
            renderLocation(i);
        }
    });
}

function fetchSelectedLocations() {
    const banner = document.querySelector('.manual-fetch');
    if (banner) banner.remove();
    locations.forEach(function(_, i) { if (!weatherStore.has(i)) renderLocation(i); });
}

function removeLocation(idx) {
    locations.splice(idx, 1);
    renderAll();
}

async function refreshCard(idx) {
    wxCacheDelete(wxKey(locations[idx]));
    weatherStore.delete(idx);
    await renderLocation(idx);
}

function appendLocation(loc) {
    locations.push(loc);
    renderAll();
    const card = document.getElementById('card-' + (locations.length - 1));
    if (card) card.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

/* ===========================================
   Direction filter
=========================================== */
function applyDirFilter(idx) {
    locations[idx].dirFilter.enabled = document.getElementById('df-on-' + idx).checked;
    const data = weatherStore.get(idx);
    if (data) rebuildHourly(idx, data);
}

function updateDirFilter(idx) {
    const df     = locations[idx].dirFilter;
    const degRaw = parseFloat(document.getElementById('df-deg-' + idx).value);
    const tolRaw = parseFloat(document.getElementById('df-tol-' + idx).value);
    df.deg = Number.isFinite(degRaw) ? degRaw : 270;
    df.tol = Number.isFinite(tolRaw) ? Math.max(0, Math.min(180, tolRaw)) : 45;
    const data = weatherStore.get(idx);
    if (data) rebuildHourly(idx, data);
}

/* ===========================================
   Geocoding search
=========================================== */
const searchInput = document.getElementById('searchInput');
const dropdown    = document.getElementById('dropdown');

searchInput.addEventListener('input', function() {
    clearTimeout(geoTimer);
    const q = searchInput.value.trim();
    if (q.length < 2) { dropdown.style.display = 'none'; return; }
    geoTimer = setTimeout(function() { doGeoSearch(q); }, 380);
});

searchInput.addEventListener('keydown', function(e) {
    if (e.key === 'Enter')  handleSearch();
    if (e.key === 'Escape') dropdown.style.display = 'none';
});

document.addEventListener('click', function(e) {
    if (!e.target.closest('.search-wrap')) dropdown.style.display = 'none';
});

async function doGeoSearch(q) {
    try {
        const r = await fetch(API_GEO + '?name=' + encodeURIComponent(q) + '&count=6&language=es&format=json');
        const d = await r.json();
        if (!d.results || !d.results.length) {
            dropdown.innerHTML = '<div style="color:var(--sub);cursor:default">Sin resultados</div>';
            dropdown.style.display = 'block';
            return;
        }
        dropdown.innerHTML = '';
        d.results.forEach(function(res) {
            const row = document.createElement('div');
            row.textContent = [res.name, res.admin1, res.country].filter(Boolean).join(', ');
            row.onclick = function() {
                dropdown.style.display = 'none';
                searchInput.value = '';
                appendLocation({ name: res.name, lat: res.latitude, lon: res.longitude });
            };
            dropdown.appendChild(row);
        });
        dropdown.style.display = 'block';
    } catch (e) { console.error('Geo:', e); }
}

async function handleSearch() {
    const q = searchInput.value.trim();
    if (q) await doGeoSearch(q);
}

/* ===========================================
   Info / Settings panels
=========================================== */
function toggleInfo() {
    infoOpen = !infoOpen;
    document.getElementById('infoPanel').classList.toggle('open', infoOpen);
}

function toggleSettings() {
    settingsOpen = !settingsOpen;
    if (settingsOpen) populateSettingsInputs();
    document.getElementById('settingsPanel').classList.toggle('open', settingsOpen);
}

function populateSettingsInputs() {
    document.getElementById('cfg-smin').value = CFG.speedMin;
    document.getElementById('cfg-s1').value  = CFG.speedOpt;
    document.getElementById('cfg-s2').value  = CFG.speedMod;
    document.getElementById('cfg-s3').value  = CFG.speedStr;
    document.getElementById('cfg-gf1').value = CFG.gustOk;
    document.getElementById('cfg-gf2').value = CFG.gustMod;
    document.getElementById('cfg-sh1').value = CFG.shearOk;
    document.getElementById('cfg-sh2').value = CFG.shearMod;
}

function readSettingsInputs() {
    const n = function(id) { return parseFloat(document.getElementById(id).value); };
    return {
        speedMin: n('cfg-smin'), speedOpt: n('cfg-s1'), speedMod: n('cfg-s2'), speedStr: n('cfg-s3'),
        gustOk: n('cfg-gf1'), gustMod: n('cfg-gf2'),
        shearOk: n('cfg-sh1'), shearMod: n('cfg-sh2'),
    };
}

function applySettings() {
    const v = readSettingsInputs();
    if (v.speedMin >= v.speedOpt || v.speedOpt >= v.speedMod || v.speedMod >= v.speedStr) {
        alert('Los limites de velocidad deben ser ascendentes (Minimo < Optimo < Moderado < Fuerte).');
        return;
    }
    if (v.gustOk >= v.gustMod) { alert('Los limites de rachas deben ser ascendentes.'); return; }
    if (v.shearOk >= v.shearMod) { alert('Los limites de cizalladura deben ser ascendentes.'); return; }
    CFG = v;
    renderAll();
}

function resetSettings() {
    CFG = { ...CFG_DEFAULTS };
    populateSettingsInputs();
    renderAll();
}

/* ===========================================
   Init
=========================================== */
loadParaglidingSites().catch(function(error) {
    document.getElementById('main').innerHTML = '<div class="empty-state">No se pudieron cargar las zonas de vuelo: ' + escHtml(error.message) + '</div>';
});
