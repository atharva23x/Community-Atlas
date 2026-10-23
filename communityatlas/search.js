(function () {
  "use strict";

  const C = (window.CommunityAtlas = window.CommunityAtlas || {});
  const ENDPOINT = "https://photon.komoot.io/api/";
  const MIN_QUERY_LENGTH = 2;
  const DEBOUNCE_MS = 320;
  const MAX_RESULTS = 6;
  const CACHE_LIMIT = 20;

  const cache = new Map();
  let els = {};
  let map = null;
  let debounceTimer = null;
  let controller = null;
  let requestId = 0;
  let results = [];
  let activeIndex = -1;

  function init() {
    map = C.MapView && typeof C.MapView.getMap === "function" ? C.MapView.getMap() : null;
    els = {
      root: document.getElementById("mapSearch"),
      form: document.getElementById("searchForm"),
      input: document.getElementById("searchInput"),
      clear: document.getElementById("searchClear"),
      results: document.getElementById("searchResults"),
      status: document.getElementById("searchStatus")
    };

    if (!map || !els.root || !els.form || !els.input || !els.clear || !els.results) {
      return;
    }

    bindEvents();
    updateClear();
  }

  function bindEvents() {
    els.form.addEventListener("submit", handleSubmit);
    els.input.addEventListener("input", handleInput);
    els.input.addEventListener("keydown", handleKeydown);
    els.input.addEventListener("focus", handleFocus);
    els.clear.addEventListener("click", clearSearch);
    els.results.addEventListener("click", handleResultClick);
    els.results.addEventListener("mouseover", handleResultHover);
    els.root.addEventListener("keydown", handleRootKeydown);
    document.addEventListener("pointerdown", handleDocumentPointerDown);
  }

  function handleFocus() {
    if (!results.length) {
      return;
    }
    openResults();
    setActive(activeIndex >= 0 ? activeIndex : 0, false);
  }

  function handleInput() {
    const query = els.input.value.trim();
    updateClear();
    cancelPending();
    clearMarker();

    if (query.length < MIN_QUERY_LENGTH) {
      resetResults();
      closeResults();
      announce("");
      return;
    }

    debounceTimer = window.setTimeout(function () {
      debounceTimer = null;
      search(query);
    }, DEBOUNCE_MS);
  }

  function handleSubmit(event) {
    event.preventDefault();
    const query = els.input.value.trim();

    if (query.length < MIN_QUERY_LENGTH) {
      els.input.focus();
      return;
    }

    if (!els.results.hidden && results.length) {
      selectResult(results[activeIndex >= 0 ? activeIndex : 0]);
      return;
    }

    cancelPending();
    search(query);
  }

  function handleKeydown(event) {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      if (!results.length) {
        return;
      }
      event.preventDefault();
      if (els.results.hidden) {
        openResults();
      }
      const step = event.key === "ArrowDown" ? 1 : -1;
      const next = activeIndex < 0
        ? (step > 0 ? 0 : results.length - 1)
        : activeIndex + step;
      setActive(next);
      return;
    }

    if (event.key === "Enter") {
      if (!els.results.hidden && results.length) {
        event.preventDefault();
        selectResult(results[activeIndex >= 0 ? activeIndex : 0]);
      }
      return;
    }

    if (event.key === "Escape") {
      if (!els.results.hidden) {
        event.preventDefault();
        event.stopPropagation();
        closeResults();
        announce("Search results closed");
        return;
      }
      if (els.input.value.trim()) {
        event.preventDefault();
        event.stopPropagation();
        clearSearch();
        return;
      }
      els.input.blur();
    }
  }

  function handleRootKeydown(event) {
    if (event.key !== "Escape" || event.target === els.input) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    if (!els.results.hidden) {
      closeResults();
      els.input.focus({ preventScroll: true });
      return;
    }
    els.input.focus({ preventScroll: true });
  }

  function handleDocumentPointerDown(event) {
    if (!els.root.contains(event.target)) {
      closeResults();
    }
  }

  function handleResultClick(event) {
    const button = event.target.closest ? event.target.closest(".search-result") : null;
    if (!button) {
      return;
    }
    const index = Number(button.dataset.index);
    if (!Number.isInteger(index) || !results[index]) {
      return;
    }
    selectResult(results[index]);
  }

  function handleResultHover(event) {
    const button = event.target.closest ? event.target.closest(".search-result") : null;
    if (!button) {
      return;
    }
    const index = Number(button.dataset.index);
    if (Number.isInteger(index) && index !== activeIndex) {
      setActive(index, false);
    }
  }

  function search(query) {
    cancelPending();

    const cacheKey = query.toLowerCase();
    if (cache.has(cacheKey)) {
      renderResults(cache.get(cacheKey), query);
      return;
    }

    const id = requestId;
    const center = map.getCenter();
    const params = new URLSearchParams({
      q: query,
      limit: "8",
      lang: "en",
      lat: center.lat.toFixed(5),
      lon: center.lng.toFixed(5)
    });

    controller = new AbortController();
    renderMessage("Searching...", false);
    announce("Searching");

    fetch(ENDPOINT + "?" + params.toString(), {
      signal: controller.signal,
      headers: { Accept: "application/json" }
    })
      .then(function (response) {
        if (!response.ok) {
          throw new Error("search-" + response.status);
        }
        return response.json();
      })
      .then(function (data) {
        if (id !== requestId) {
          return;
        }
        const items = normalize(data).slice(0, MAX_RESULTS);
        cache.set(cacheKey, items);
        trimCache();
        renderResults(items, query);
      })
      .catch(function (error) {
        if (error && error.name === "AbortError") {
          return;
        }
        if (id !== requestId) {
          return;
        }
        renderMessage("Search is unavailable right now. Check your connection and try again.", true);
        announce("Search is unavailable");
      })
      .finally(function () {
        if (id === requestId) {
          controller = null;
        }
      });
  }

  function normalize(data) {
    if (!data || !Array.isArray(data.features)) {
      return [];
    }

    const seen = new Set();
    const items = [];

    data.features.forEach(function (feature) {
      if (!feature || !feature.geometry || !Array.isArray(feature.geometry.coordinates)) {
        return;
      }
      const coordinates = feature.geometry.coordinates;
      const lng = Number(coordinates[0]);
      const lat = Number(coordinates[1]);
      if (!isFinite(lat) || !isFinite(lng)) {
        return;
      }

      const properties = feature.properties || {};
      const name = resultName(properties);
      if (!name) {
        return;
      }

      const meta = buildMeta(properties, name);
      const type = typeLabel(properties);
      const dedupeKey = (name + "|" + meta + "|" + type).toLowerCase();
      if (seen.has(dedupeKey)) {
        return;
      }
      seen.add(dedupeKey);

      items.push({
        name: name,
        meta: meta,
        type: type,
        lat: lat,
        lng: lng,
        bounds: readBounds(properties.extent)
      });
    });

    return items;
  }

  function resultName(properties) {
    const name = clean(properties.name);
    if (name) {
      return name;
    }
    const street = clean(properties.street);
    const number = clean(properties.housenumber);
    return [number, street].filter(Boolean).join(" ");
  }

  function buildMeta(properties, name) {
    const fields = [
      [clean(properties.housenumber), clean(properties.street)].filter(Boolean).join(" "),
      properties.locality,
      properties.district,
      properties.city,
      properties.county,
      properties.state,
      properties.country
    ];

    const lowerName = name.toLowerCase();
    const seen = new Set();
    const parts = [];

    fields.forEach(function (value) {
      const text = clean(value);
      if (!text) {
        return;
      }
      const key = text.toLowerCase();
      if (key === lowerName || seen.has(key)) {
        return;
      }
      seen.add(key);
      parts.push(text);
    });

    return parts.join(", ");
  }

  function typeLabel(properties) {
    const value = clean(properties.osm_value).toLowerCase();
    const key = clean(properties.osm_key).toLowerCase();
    const type = clean(properties.type).toLowerCase();

    if (key === "highway" || type === "street") {
      return "Street";
    }
    if (value === "residential" || value === "apartment" || value === "apartments") {
      return "Society";
    }
    if (
      value === "station" ||
      value === "stop" ||
      value === "halt" ||
      value === "bus_stop" ||
      value === "tram_stop" ||
      value === "subway_entrance"
    ) {
      return "Transit";
    }
    if (
      value === "suburb" ||
      value === "neighbourhood" ||
      value === "locality" ||
      type === "locality" ||
      type === "district"
    ) {
      return "Area";
    }
    if (value === "park" || value === "garden" || value === "playground") {
      return "Park";
    }
    if (value === "school" || value === "college" || value === "university") {
      return "Education";
    }
    if (value === "hospital" || value === "clinic" || value === "doctors") {
      return "Health";
    }
    if (key === "shop" || type === "shop") {
      return "Shop";
    }
    if (type === "city") {
      return "City";
    }
    if (type === "county") {
      return "County";
    }
    if (type === "state") {
      return "State";
    }
    if (type === "country") {
      return "Country";
    }
    return value ? titleCase(value) : "Place";
  }

  function readBounds(extent) {
    if (!Array.isArray(extent) || extent.length !== 4) {
      return null;
    }
    const values = extent.map(Number);
    if (values.some(function (value) { return !isFinite(value); })) {
      return null;
    }
    return {
      west: Math.min(values[0], values[2]),
      east: Math.max(values[0], values[2]),
      south: Math.min(values[1], values[3]),
      north: Math.max(values[1], values[3])
    };
  }

  function renderResults(items, query) {
    results = items;
    activeIndex = items.length ? 0 : -1;
    els.results.replaceChildren();

    if (!items.length) {
      const empty = document.createElement("div");
      empty.className = "search-empty";
      empty.textContent = "No matches for \"" + query + "\". Try a nearby landmark, area, or city.";
      els.results.appendChild(empty);
      els.results.appendChild(buildSource());
      openResults();
      updateActiveDescendant();
      refreshIcons();
      announce("No results found");
      return;
    }

    items.forEach(function (item, index) {
      els.results.appendChild(buildResult(item, index));
    });
    els.results.appendChild(buildSource());
    openResults();
    setActive(0, false);
    refreshIcons();
    announce(items.length + (items.length === 1 ? " result found" : " results found"));
  }

  function renderMessage(text, isError) {
    results = [];
    activeIndex = -1;
    els.results.replaceChildren();

    const message = document.createElement("div");
    message.className = "search-empty" + (isError ? " is-error" : "");
    message.textContent = text;
    els.results.appendChild(message);
    els.results.appendChild(buildSource());
    openResults();
    updateActiveDescendant();
    refreshIcons();
  }

  function buildResult(item, index) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "search-result";
    button.id = "search-result-" + index;
    button.dataset.index = String(index);
    button.setAttribute("role", "option");
    button.setAttribute("aria-selected", "false");

    const iconWrap = document.createElement("span");
    iconWrap.className = "search-result-icon";
    iconWrap.setAttribute("aria-hidden", "true");
    const icon = document.createElement("i");
    icon.setAttribute("data-lucide", "map-pin");
    iconWrap.appendChild(icon);

    const copy = document.createElement("span");
    copy.className = "search-result-copy";
    const name = document.createElement("span");
    name.className = "search-result-name";
    name.textContent = item.name;
    const meta = document.createElement("span");
    meta.className = "search-result-meta";
    meta.textContent = [formatDistance(item), item.meta || "OpenStreetMap"]
      .filter(Boolean)
      .join(" · ");
    copy.appendChild(name);
    copy.appendChild(meta);

    const type = document.createElement("span");
    type.className = "search-result-type";
    type.textContent = item.type;

    button.appendChild(iconWrap);
    button.appendChild(copy);
    button.appendChild(type);
    return button;
  }

  function formatDistance(item) {
    if (!map || !isFinite(item.lat) || !isFinite(item.lng)) {
      return "";
    }
    const center = map.getCenter();
    const distance = haversine(center.lat, center.lng, item.lat, item.lng);
    if (distance < 1) {
      const meters = Math.max(10, Math.round((distance * 1000) / 10) * 10);
      return meters + " m";
    }
    if (distance < 10) {
      return distance.toFixed(1) + " km";
    }
    return Math.round(distance).toLocaleString("en-US") + " km";
  }

  function haversine(lat1, lng1, lat2, lng2) {
    const toRad = Math.PI / 180;
    const dLat = (lat2 - lat1) * toRad;
    const dLng = (lng2 - lng1) * toRad;
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(lat1 * toRad) *
        Math.cos(lat2 * toRad) *
        Math.sin(dLng / 2) *
        Math.sin(dLng / 2);
    return 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }

  function buildSource() {
    const source = document.createElement("div");
    source.className = "search-source";
    source.textContent = "Search by Photon · © OpenStreetMap contributors";
    return source;
  }

  function setActive(index, scroll) {
    if (!results.length) {
      activeIndex = -1;
      updateActiveDescendant();
      return;
    }

    activeIndex = index < 0 ? results.length - 1 : (index >= results.length ? 0 : index);
    const buttons = els.results.querySelectorAll(".search-result");
    buttons.forEach(function (button, buttonIndex) {
      button.setAttribute("aria-selected", buttonIndex === activeIndex ? "true" : "false");
    });
    updateActiveDescendant();

    if (scroll !== false) {
      const active = els.results.querySelector('[data-index="' + activeIndex + '"]');
      if (active) {
        active.scrollIntoView({ block: "nearest" });
      }
    }
  }

  function updateActiveDescendant() {
    if (els.results.hidden || activeIndex < 0) {
      els.input.removeAttribute("aria-activedescendant");
      return;
    }
    els.input.setAttribute("aria-activedescendant", "search-result-" + activeIndex);
  }

  function openResults() {
    els.results.hidden = false;
    els.input.setAttribute("aria-expanded", "true");
  }

  function closeResults() {
    els.results.hidden = true;
    els.input.setAttribute("aria-expanded", "false");
    els.input.removeAttribute("aria-activedescendant");
    activeIndex = -1;
    Array.from(els.results.querySelectorAll('[aria-selected="true"]')).forEach(function (button) {
      button.setAttribute("aria-selected", "false");
    });
  }

  function selectResult(item) {
    if (!item) {
      return;
    }
    els.input.value = item.name;
    updateClear();
    closeResults();
    if (C.MapView && typeof C.MapView.showSearchResult === "function") {
      C.MapView.showSearchResult(item);
    }
    announce("Showing " + item.name);
    els.input.blur();
  }

  function clearSearch() {
    cancelPending();
    els.input.value = "";
    updateClear();
    resetResults();
    closeResults();
    clearMarker();
    announce("Search cleared");
    els.input.focus({ preventScroll: true });
  }

  function resetResults() {
    results = [];
    activeIndex = -1;
    els.results.replaceChildren();
  }

  function updateClear() {
    els.clear.hidden = els.input.value.length === 0;
  }

  function cancelPending() {
    if (debounceTimer) {
      window.clearTimeout(debounceTimer);
      debounceTimer = null;
    }
    if (controller) {
      controller.abort();
      controller = null;
    }
    requestId += 1;
  }

  function clearMarker() {
    if (C.MapView && typeof C.MapView.clearSearchResult === "function") {
      C.MapView.clearSearchResult();
    }
  }

  function trimCache() {
    while (cache.size > CACHE_LIMIT) {
      cache.delete(cache.keys().next().value);
    }
  }

  function announce(message) {
    if (!els.status) {
      return;
    }
    els.status.textContent = "";
    window.setTimeout(function () {
      els.status.textContent = message;
    }, 30);
  }

  function refreshIcons() {
    if (window.lucide && typeof window.lucide.createIcons === "function") {
      window.lucide.createIcons();
    }
  }

  function focusSearch() {
    if (!els.input) {
      return;
    }
    els.input.focus({ preventScroll: true });
    els.input.select();
  }

  function clean(value) {
    return typeof value === "string" ? value.trim() : "";
  }

  function titleCase(value) {
    return value
      .replace(/_/g, " ")
      .replace(/\b[a-z]/g, function (letter) { return letter.toUpperCase(); });
  }

  C.Search = {
    init: init,
    focus: focusSearch
  };
})();
