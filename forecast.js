// --- Patscherkofel wind forecast widget (GeoSphere Austria Dataset API) ---
// Fetches the AROME 2.5km point forecast for the Patscherkofel summit and
// renders a 48h meteogram (mean wind + gusts + direction) as inline SVG.
// API docs: https://dataset.api.hub.geosphere.at/v1/docs/

(function () {
    'use strict';

    const LAT = 47.209, LON = 11.461; // Patscherkofel summit
    const API_BASE = 'https://dataset.api.hub.geosphere.at/v1/timeseries/forecast/nwp-v1-1h-2500m';
    const PARAMS_FULL = 'u10m,v10m,ugust,vgust';
    const PARAMS_WIND_ONLY = 'u10m,v10m'; // fallback if gust params are rejected
    const CACHE_KEY = 'pkWindForecastV1';
    const CACHE_TTL_MS = 25 * 60 * 1000;   // model updates every 3h; re-fetch at most every 25min
    const HOURS_SHOWN = 48;

    const COLORS = {
        wind: '#2a78d6',
        gust: '#1baf7a',
        ink: '#0b0b0b',
        ink2: '#52514e',
        muted: '#898781',
        grid: '#e8e7e2',
        axis: '#c3c2b7',
        surface: '#ffffff'
    };

    const root = document.getElementById('pk-wind-forecast');
    if (!root) return;

    let points = null;   // parsed forecast points
    let runTime = null;  // model reference time (Date)

    // ---------- data loading ----------

    async function load() {
        const cached = readCache();
        if (cached) {
            applyData(cached.json);
            return;
        }
        try {
            let response = await fetch(apiUrl(PARAMS_FULL));
            if (!response.ok && response.status === 400) {
                // parameter names may change; retry with the essential pair
                response = await fetch(apiUrl(PARAMS_WIND_ONLY));
            }
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            const json = await response.json();
            writeCache(json);
            applyData(json);
        } catch (err) {
            console.error('Wind forecast fetch failed:', err);
            const stale = readCache(true);
            if (stale) {
                applyData(stale.json);
            } else {
                showError();
            }
        }
    }

    function apiUrl(params) {
        return `${API_BASE}?parameters=${params}&lat_lon=${LAT},${LON}`;
    }

    function readCache(allowStale) {
        try {
            const raw = localStorage.getItem(CACHE_KEY);
            if (!raw) return null;
            const entry = JSON.parse(raw);
            if (!allowStale && Date.now() - entry.fetchedAt > CACHE_TTL_MS) return null;
            return entry;
        } catch (e) {
            return null;
        }
    }

    function writeCache(json) {
        try {
            localStorage.setItem(CACHE_KEY, JSON.stringify({ fetchedAt: Date.now(), json }));
        } catch (e) { /* storage full/blocked - not critical */ }
    }

    function applyData(json) {
        const parsed = parseForecast(json);
        if (!parsed || parsed.points.length < 2) {
            showError();
            return;
        }
        points = parsed.points;
        runTime = parsed.runTime;
        render();
    }

    // ---------- parsing ----------

    function parseForecast(json) {
        const feature = json && json.features && json.features[0];
        const params = feature && feature.properties && feature.properties.parameters;
        if (!params || !params.u10m || !params.v10m || !Array.isArray(json.timestamps)) return null;

        // units are m/s ("m s-1") unless the API says otherwise
        const factor = (p) => (/km/.test(p.unit || '') ? 1 : 3.6);
        const fU = factor(params.u10m);
        const fG = params.ugust ? factor(params.ugust) : fU;

        const start = new Date();
        start.setMinutes(0, 0, 0); // include the current hour
        const end = new Date(start.getTime() + HOURS_SHOWN * 3600 * 1000);

        const pts = [];
        json.timestamps.forEach((ts, i) => {
            const t = new Date(ts);
            if (t < start || t > end) return;
            const u = params.u10m.data[i], v = params.v10m.data[i];
            if (typeof u !== 'number' || typeof v !== 'number') return;
            const speed = Math.hypot(u, v) * fU;
            const dir = (270 - Math.atan2(v, u) * 180 / Math.PI) % 360;
            let gust = null;
            if (params.ugust && params.vgust) {
                const ug = params.ugust.data[i], vg = params.vgust.data[i];
                if (typeof ug === 'number' && typeof vg === 'number') {
                    gust = Math.hypot(ug, vg) * fG;
                }
            }
            pts.push({ t, speed, gust, dir: (dir + 360) % 360 });
        });
        return { points: pts, runTime: json.reference_time ? new Date(json.reference_time) : null };
    }

    function degToCompass(deg) {
        const arr = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];
        return arr[Math.floor((deg / 22.5) + 0.5) % 16];
    }

    // ---------- rendering ----------

    function showError() {
        root.textContent = '';
        const div = document.createElement('div');
        div.className = 'wf-error';
        div.textContent = 'Wind forecast unavailable (GeoSphere API). ';
        const a = document.createElement('a');
        a.href = 'https://data.hub.geosphere.at/dataset/nwp-v1-1h-2500m';
        a.target = '_blank';
        a.textContent = 'Check dataset status';
        div.appendChild(a);
        root.appendChild(div);
    }

    function render() {
        if (!points) return;
        root.textContent = '';

        const hasGust = points.some(p => p.gust !== null);

        // legend
        const legend = document.createElement('div');
        legend.className = 'wf-legend';
        legend.appendChild(legendKey('Wind', COLORS.wind));
        if (hasGust) legend.appendChild(legendKey('Gusts', COLORS.gust));
        root.appendChild(legend);

        // chart area
        const chart = document.createElement('div');
        chart.className = 'wf-chart';
        root.appendChild(chart);

        // footer: model run info + attribution + table view
        root.appendChild(buildFooter(hasGust));

        drawSvg(chart, hasGust);
    }

    function legendKey(label, color) {
        const key = document.createElement('span');
        key.className = 'wf-key';
        const swatch = document.createElement('span');
        swatch.className = 'wf-swatch';
        swatch.style.borderTopColor = color;
        key.appendChild(swatch);
        key.appendChild(document.createTextNode(label));
        return key;
    }

    function buildFooter(hasGust) {
        const footer = document.createElement('div');
        footer.className = 'wf-footer';

        const info = document.createElement('span');
        const runStr = runTime
            ? runTime.toLocaleString([], { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false })
            : '?';
        info.appendChild(document.createTextNode(`AROME · run ${runStr} · `));
        const link = document.createElement('a');
        link.href = 'https://data.hub.geosphere.at/dataset/nwp-v1-1h-2500m';
        link.target = '_blank';
        link.textContent = 'GeoSphere Austria';
        info.appendChild(link);
        info.appendChild(document.createTextNode(' (CC BY 4.0)'));
        footer.appendChild(info);

        // table view (accessible, non-hover access to every value)
        const details = document.createElement('details');
        details.className = 'wf-table';
        const summary = document.createElement('summary');
        summary.textContent = 'Table';
        details.appendChild(summary);
        const panel = document.createElement('div');
        panel.className = 'wf-table-panel';
        const table = document.createElement('table');
        const head = table.insertRow();
        ['Time', 'Wind km/h', hasGust ? 'Gusts km/h' : null, 'Dir'].filter(Boolean).forEach(h => {
            const th = document.createElement('th');
            th.textContent = h;
            head.appendChild(th);
        });
        points.forEach(p => {
            const row = table.insertRow();
            row.insertCell().textContent = p.t.toLocaleString([], { weekday: 'short', hour: '2-digit', minute: '2-digit', hour12: false });
            row.insertCell().textContent = Math.round(p.speed);
            if (hasGust) row.insertCell().textContent = p.gust === null ? '-' : Math.round(p.gust);
            row.insertCell().textContent = `${degToCompass(p.dir)} (${Math.round(p.dir)}°)`;
        });
        panel.appendChild(table);
        details.appendChild(panel);
        footer.appendChild(details);
        return footer;
    }

    const SVG_NS = 'http://www.w3.org/2000/svg';

    function el(name, attrs, parent) {
        const node = document.createElementNS(SVG_NS, name);
        for (const k in attrs) node.setAttribute(k, attrs[k]);
        if (parent) parent.appendChild(node);
        return node;
    }

    function drawSvg(chart, hasGust) {
        const W = Math.max(chart.clientWidth, 260);
        const H = Math.max(chart.clientHeight, 200);
        const m = { top: 26, right: 12, bottom: 32, left: 36 }; // top band holds direction arrows
        const plotW = W - m.left - m.right;
        const plotH = H - m.top - m.bottom;

        const svg = el('svg', { width: W, height: H, viewBox: `0 0 ${W} ${H}`, role: 'img' });
        svg.setAttribute('aria-label', 'Patscherkofel 48 hour wind forecast chart');
        chart.appendChild(svg);

        const t0 = points[0].t.getTime();
        const t1 = points[points.length - 1].t.getTime();
        const x = (t) => m.left + (t.getTime() - t0) / (t1 - t0) * plotW;

        // y scale: 0 .. nice ceiling above max value, 4-6 clean ticks
        const maxVal = Math.max(...points.map(p => Math.max(p.speed, p.gust || 0)));
        const step = [5, 10, 20, 25, 50, 100].find(s => Math.ceil(maxVal * 1.08 / s) <= 6) || 100;
        const yMax = Math.max(step, Math.ceil(maxVal * 1.08 / step) * step);
        const y = (v) => m.top + plotH - (v / yMax) * plotH;

        // horizontal gridlines + y tick labels
        for (let v = 0; v <= yMax; v += step) {
            el('line', {
                x1: m.left, x2: m.left + plotW, y1: y(v), y2: y(v),
                stroke: v === 0 ? COLORS.axis : COLORS.grid, 'stroke-width': 1
            }, svg);
            if (v > 0) {
                const label = el('text', {
                    x: m.left - 6, y: y(v) + 3.5, 'text-anchor': 'end',
                    fill: COLORS.muted, 'font-size': 10, 'font-family': 'sans-serif'
                }, svg);
                label.style.fontVariantNumeric = 'tabular-nums';
                label.textContent = v;
            }
        }
        const unit = el('text', {
            x: m.left - 6, y: m.top - 8, 'text-anchor': 'end',
            fill: COLORS.muted, 'font-size': 9, 'font-family': 'sans-serif'
        }, svg);
        unit.textContent = 'km/h';

        // x axis: hour labels every 6h, midnight separators, day names
        const midnights = [];
        points.forEach(p => {
            const hr = p.t.getHours();
            if (hr % 6 === 0) {
                const label = el('text', {
                    x: x(p.t), y: m.top + plotH + 13, 'text-anchor': 'middle',
                    fill: COLORS.muted, 'font-size': 10, 'font-family': 'sans-serif'
                }, svg);
                label.textContent = String(hr).padStart(2, '0');
            }
            if (hr === 0) {
                el('line', {
                    x1: x(p.t), x2: x(p.t), y1: m.top, y2: m.top + plotH,
                    stroke: COLORS.axis, 'stroke-width': 1
                }, svg);
                midnights.push(p.t);
            }
        });
        // day labels centered within each visible day span
        const dayEdges = [new Date(t0), ...midnights, new Date(t1)];
        for (let i = 0; i < dayEdges.length - 1; i++) {
            const a = dayEdges[i].getTime(), b = dayEdges[i + 1].getTime();
            if (b - a < 5 * 3600 * 1000) continue; // too narrow for a label
            const label = el('text', {
                x: m.left + ((a + b) / 2 - t0) / (t1 - t0) * plotW,
                y: m.top + plotH + 27, 'text-anchor': 'middle',
                fill: COLORS.ink2, 'font-size': 10, 'font-weight': 'bold', 'font-family': 'sans-serif'
            }, svg);
            label.textContent = new Date(a).toLocaleDateString([], { weekday: 'short', day: 'numeric', month: 'short' });
        }

        // area wash + lines
        const linePath = (vals) => vals.map((p, i) =>
            `${i === 0 ? 'M' : 'L'}${x(p.t).toFixed(1)},${y(p.v).toFixed(1)}`).join('');
        const speedPts = points.map(p => ({ t: p.t, v: p.speed }));
        el('path', {
            d: linePath(speedPts) + `L${x(points[points.length - 1].t).toFixed(1)},${y(0)}L${x(points[0].t).toFixed(1)},${y(0)}Z`,
            fill: COLORS.wind, 'fill-opacity': 0.1, stroke: 'none'
        }, svg);
        if (hasGust) {
            const gustPts = points.filter(p => p.gust !== null).map(p => ({ t: p.t, v: p.gust }));
            el('path', {
                d: linePath(gustPts), fill: 'none', stroke: COLORS.gust,
                'stroke-width': 2, 'stroke-linejoin': 'round', 'stroke-linecap': 'round'
            }, svg);
        }
        el('path', {
            d: linePath(speedPts), fill: 'none', stroke: COLORS.wind,
            'stroke-width': 2, 'stroke-linejoin': 'round', 'stroke-linecap': 'round'
        }, svg);

        // label the extreme: peak gust (or peak wind when gusts are missing)
        const peakSeries = hasGust ? points.filter(p => p.gust !== null) : points;
        const peakVal = (p) => hasGust ? p.gust : p.speed;
        const peak = peakSeries.reduce((best, p) => peakVal(p) > peakVal(best) ? p : best, peakSeries[0]);
        const px = x(peak.t), py = y(peakVal(peak));
        el('circle', {
            cx: px, cy: py, r: 4, fill: hasGust ? COLORS.gust : COLORS.wind,
            stroke: COLORS.surface, 'stroke-width': 2
        }, svg);
        const peakLabel = el('text', {
            x: Math.min(Math.max(px, m.left + 14), m.left + plotW - 14),
            y: Math.max(py - 9, m.top + 10), 'text-anchor': 'middle',
            fill: COLORS.ink2, 'font-size': 10, 'font-weight': 'bold', 'font-family': 'sans-serif'
        }, svg);
        peakLabel.textContent = Math.round(peakVal(peak));

        // direction arrows in the top band, pointing where the wind blows TO
        const everyH = plotW / (points.length / 3) >= 22 ? 3 : 6;
        points.forEach(p => {
            if (p.t.getHours() % everyH !== 0) return;
            el('path', {
                d: 'M0,5 L0,-5 M0,-5 L-3.2,-1.2 M0,-5 L3.2,-1.2',
                stroke: COLORS.muted, 'stroke-width': 1.5, 'stroke-linecap': 'round', fill: 'none',
                transform: `translate(${x(p.t).toFixed(1)},${m.top - 12}) rotate(${((p.dir + 180) % 360).toFixed(0)})`
            }, svg);
        });

        attachHover(chart, svg, { x, y, m, plotW, plotH, hasGust });
    }

    // crosshair + tooltip (values also available via the table view)
    function attachHover(chart, svg, g) {
        const crosshair = el('line', {
            y1: g.m.top, y2: g.m.top + g.plotH,
            stroke: COLORS.muted, 'stroke-width': 1, visibility: 'hidden'
        }, svg);
        const overlay = el('rect', {
            x: g.m.left, y: g.m.top, width: g.plotW, height: g.plotH,
            fill: 'transparent'
        }, svg);

        const tip = document.createElement('div');
        tip.className = 'wf-tooltip';
        chart.appendChild(tip);

        function show(clientX) {
            const rect = svg.getBoundingClientRect();
            const mx = clientX - rect.left;
            let best = 0, bestDist = Infinity;
            points.forEach((p, i) => {
                const d = Math.abs(g.x(p.t) - mx);
                if (d < bestDist) { bestDist = d; best = i; }
            });
            const p = points[best];
            const cx = g.x(p.t);
            crosshair.setAttribute('x1', cx);
            crosshair.setAttribute('x2', cx);
            crosshair.setAttribute('visibility', 'visible');

            tip.textContent = '';
            const time = document.createElement('div');
            time.className = 'wf-tt-time';
            time.textContent = p.t.toLocaleString([], { weekday: 'short', hour: '2-digit', minute: '2-digit', hour12: false });
            tip.appendChild(time);
            tip.appendChild(tipRow(COLORS.wind, `${Math.round(p.speed)} km/h`, 'wind'));
            if (p.gust !== null) tip.appendChild(tipRow(COLORS.gust, `${Math.round(p.gust)} km/h`, 'gusts'));
            tip.appendChild(tipRow(null, `${degToCompass(p.dir)} (${Math.round(p.dir)}°)`, 'from'));

            tip.style.display = 'block';
            const chartW = chart.clientWidth;
            const tipW = tip.offsetWidth;
            tip.style.left = (cx + 10 + tipW > chartW ? cx - tipW - 10 : cx + 10) + 'px';
            tip.style.top = (g.m.top + 4) + 'px';
        }

        function tipRow(color, value, label) {
            const row = document.createElement('div');
            row.className = 'wf-tt-row';
            if (color) {
                const key = document.createElement('span');
                key.className = 'wf-swatch';
                key.style.borderTopColor = color;
                row.appendChild(key);
            }
            const val = document.createElement('span');
            val.className = 'wf-tt-val';
            val.textContent = value;
            row.appendChild(val);
            row.appendChild(document.createTextNode(' ' + label));
            return row;
        }

        function hide() {
            crosshair.setAttribute('visibility', 'hidden');
            tip.style.display = 'none';
        }

        overlay.addEventListener('pointermove', (e) => show(e.clientX));
        overlay.addEventListener('pointerdown', (e) => show(e.clientX));
        overlay.addEventListener('pointerleave', hide);
    }

    // ---------- boot ----------

    // re-render on container resize (debounced)
    let resizeTimer = null;
    new ResizeObserver(() => {
        if (!points) return;
        clearTimeout(resizeTimer);
        resizeTimer = setTimeout(render, 150);
    }).observe(root);

    load();
    setInterval(load, 30 * 60 * 1000);
})();
