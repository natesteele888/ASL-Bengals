// ---------------------------------------------------------------------------
// Weather -- Nathan: "Let's also add in projected weather for the event when
// available." Free, no-API-key forecast via Open-Meteo -- same "no keyed
// paid API on a static GitHub Pages site" reasoning as the Google Maps
// embed in schedule.js/practices.js (a keyed weather API would need a
// backend to hide the key). Two calls per lookup: Open-Meteo's geocoding
// endpoint turns a city/state into lat/lon, then the forecast endpoint
// covers up to 16 days out -- "when available" means: skip silently if the
// event is further out than that, in the past, or the location can't be
// geocoded, rather than showing an error.
//
// Only wired into game/practice DETAIL pages (js/schedule.js,
// js/practices.js), not list rows -- opening the Schedule list shouldn't
// fire a network call per card.
// ---------------------------------------------------------------------------
(function () {

  const cache = {}; // "City, ST|date|time" -> forecast object | null

  // Best-effort "City, ST" extraction from a free-text address. Open-
  // Meteo's free geocoder matches place names, not full street addresses,
  // and a practice field's forecast doesn't meaningfully differ block to
  // block anyway -- e.g. "570 MA-110, Clinton MA, 01510" -> "Clinton, MA".
  function extractCityState(address) {
    if (!address) return '';
    const m = address.match(/([A-Za-z .'-]+?)[, ]+([A-Z]{2})(?:[, ]+\d{5})?\s*$/);
    if (m) return `${m[1].trim()}, ${m[2]}`;
    // Fallback: last comma-separated segment that isn't just a zip code.
    const parts = address.split(',').map(s => s.trim()).filter(Boolean).filter(s => !/^\d+$/.test(s));
    return parts.length ? parts[parts.length - 1] : address;
  }

  // WMO weather codes, as returned by Open-Meteo.
  const WEATHER_LABELS = {
    0: ['☀️', 'Clear'], 1: ['🌤️', 'Mostly Clear'], 2: ['⛅', 'Partly Cloudy'], 3: ['☁️', 'Cloudy'],
    45: ['🌫️', 'Fog'], 48: ['🌫️', 'Fog'],
    51: ['🌦️', 'Light Drizzle'], 53: ['🌦️', 'Drizzle'], 55: ['🌦️', 'Heavy Drizzle'],
    61: ['🌧️', 'Light Rain'], 63: ['🌧️', 'Rain'], 65: ['🌧️', 'Heavy Rain'],
    66: ['🌧️', 'Freezing Rain'], 67: ['🌧️', 'Freezing Rain'],
    71: ['🌨️', 'Light Snow'], 73: ['🌨️', 'Snow'], 75: ['🌨️', 'Heavy Snow'], 77: ['🌨️', 'Snow Grains'],
    80: ['🌦️', 'Rain Showers'], 81: ['🌧️', 'Rain Showers'], 82: ['⛈️', 'Heavy Showers'],
    85: ['🌨️', 'Snow Showers'], 86: ['🌨️', 'Snow Showers'],
    95: ['⛈️', 'Thunderstorm'], 96: ['⛈️', 'Thunderstorm'], 99: ['⛈️', 'Thunderstorm'],
  };
  function weatherLabel(code) {
    return WEATHER_LABELS[code] || ['🌡️', 'Weather'];
  }
  function escapeHtml(s) {
    const d = document.createElement('div');
    d.textContent = s || '';
    return d.innerHTML;
  }

  function fetchForecast(address, dateStr, timeStr) {
    const cityState = extractCityState(address);
    const cacheKey = `${cityState}|${dateStr}|${timeStr || ''}`;
    if (!cityState || !dateStr) return Promise.resolve(null);
    if (Object.prototype.hasOwnProperty.call(cache, cacheKey)) return Promise.resolve(cache[cacheKey]);

    const today = new Date(); today.setHours(0, 0, 0, 0);
    const parts = dateStr.split('-').map(Number);
    if (parts.length !== 3 || parts.some(isNaN)) return Promise.resolve(null);
    const eventDate = new Date(parts[0], parts[1] - 1, parts[2]);
    const daysOut = Math.round((eventDate - today) / 86400000);
    if (daysOut < 0 || daysOut > 15) { cache[cacheKey] = null; return Promise.resolve(null); }

    const geoUrl = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(cityState)}&count=1&language=en&format=json`;
    return fetch(geoUrl).then(r => r.ok ? r.json() : null).then(geo => {
      const hit = geo && geo.results && geo.results[0];
      if (!hit) { cache[cacheKey] = null; return null; }
      const fUrl = `https://api.open-meteo.com/v1/forecast?latitude=${hit.latitude}&longitude=${hit.longitude}` +
        `&hourly=temperature_2m,precipitation_probability,weathercode` +
        `&daily=temperature_2m_max,temperature_2m_min,precipitation_probability_max,weathercode` +
        `&temperature_unit=fahrenheit&timezone=auto&forecast_days=16`;
      return fetch(fUrl).then(r => r.ok ? r.json() : null).then(fc => {
        if (!fc) { cache[cacheKey] = null; return null; }
        const place = `${hit.name}${hit.admin1 ? ', ' + hit.admin1 : ''}`;
        let result = null;

        if (timeStr && fc.hourly && Array.isArray(fc.hourly.time)) {
          const targetH = Number(timeStr.split(':')[0]);
          let bestIdx = -1, bestDiff = Infinity;
          fc.hourly.time.forEach((t, i) => {
            if (!t.startsWith(dateStr)) return;
            const h = Number(t.slice(11, 13));
            const diff = Math.abs(h - targetH);
            if (diff < bestDiff) { bestDiff = diff; bestIdx = i; }
          });
          if (bestIdx !== -1) {
            const [icon, label] = weatherLabel(fc.hourly.weathercode[bestIdx]);
            result = {
              temp: Math.round(fc.hourly.temperature_2m[bestIdx]),
              precip: fc.hourly.precipitation_probability[bestIdx],
              icon, label, place,
            };
          }
        }
        if (!result && fc.daily && Array.isArray(fc.daily.time)) {
          const idx = fc.daily.time.indexOf(dateStr);
          if (idx !== -1) {
            const [icon, label] = weatherLabel(fc.daily.weathercode[idx]);
            result = {
              tempHigh: Math.round(fc.daily.temperature_2m_max[idx]),
              tempLow: Math.round(fc.daily.temperature_2m_min[idx]),
              precip: fc.daily.precipitation_probability_max[idx],
              icon, label, place,
            };
          }
        }
        cache[cacheKey] = result;
        return result;
      });
    }).catch(err => { console.error('Weather lookup failed:', err); cache[cacheKey] = null; return null; });
  }

  function renderInto(wrap, data) {
    if (!wrap) return;
    if (!data) { wrap.style.display = 'none'; wrap.innerHTML = ''; return; }
    const tempPart = data.temp != null ? `${data.temp}°F` : `${data.tempHigh}°F / ${data.tempLow}°F`;
    const precipPart = (data.precip != null && data.precip > 0) ? ` &middot; ${data.precip}% precip` : '';
    wrap.style.display = '';
    wrap.innerHTML = `<div class="weatherBox"><span class="weatherIcon">${data.icon}</span><span class="weatherText"><b>${tempPart}</b> ${escapeHtml(data.label)}${precipPart}<div class="lbSub" style="margin-top:2px;">Forecast for ${escapeHtml(data.place)}</div></span></div>`;
  }

  // wrapEl: container to render into (or hide if weather isn't available).
  // address/dateStr/timeStr: event location text, 'YYYY-MM-DD', 'HH:MM'
  // (timeStr may be blank -- falls back to that day's high/low).
  window.loadWeatherInto = function (wrapEl, address, dateStr, timeStr) {
    if (!wrapEl) return;
    if (!address || !dateStr) { wrapEl.style.display = 'none'; wrapEl.innerHTML = ''; return; }
    fetchForecast(address, dateStr, timeStr).then(data => renderInto(wrapEl, data));
  };
})();
