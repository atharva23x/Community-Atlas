(function () {
  "use strict";

  const C = (window.CommunityAtlas = window.CommunityAtlas || {});

  const REQUEST_KEY = "communityatlas.assetRequests.v1";
  const CAMPAIGN_KEY = "communityatlas.campaigns.v1";
  const FOLLOW_KEY = "communityatlas.campaignFollows.v1";

  const ASSET_TYPES = [
    {
      id: "streetlight",
      label: "Street light",
      icon: "Lightbulb",
      color: "#B45309",
      example: "Street light needed at the bus stop"
    },
    {
      id: "wifi",
      label: "Public WiFi",
      icon: "Wifi",
      color: "#2563EB",
      example: "Public WiFi for the community library"
    },
    {
      id: "toilet",
      label: "Public toilet",
      icon: "Bath",
      color: "#7C3AED",
      example: "Public toilet needed near the market"
    },
    {
      id: "water",
      label: "Drinking water",
      icon: "Droplets",
      color: "#0E7490",
      example: "Drinking water point at the bus stand"
    }
  ];

  const REQUEST_STATUSES = [
    { id: "open", label: "Open" },
    { id: "review", label: "Under review" },
    { id: "planned", label: "Planned" },
    { id: "done", label: "Resolved" }
  ];

  const CAMPAIGN_TYPES = [
    { id: "blood", label: "Blood donation", icon: "HeartPulse", color: "#BE123C", example: "Blood donation camp" },
    { id: "eye", label: "Eye checkup", icon: "Eye", color: "#0369A1", example: "Free eye checkup camp" },
    { id: "clean", label: "Cleanliness drive", icon: "Sparkles", color: "#15803D", example: "Neighbourhood cleanliness drive" },
    { id: "health", label: "Health camp", icon: "Stethoscope", color: "#7C3AED", example: "Free health checkup camp" },
    { id: "other", label: "Other event", icon: "Megaphone", color: "#B45309", example: "Community awareness drive" }
  ];

  const state = {
    requests: [],
    campaigns: [],
    follows: {},
    requestFilter: "all",
    campaignFilter: "all",
    campaignWhen: "upcoming",
    activeTab: "requests",
    lastFocused: null,
    map: null,
    requestLayer: null,
    campaignLayer: null,
    pendingLocation: null,
    locationSource: "map",
    pick: null,
    initialized: false
  };

  let els = {};

  function getUser() {
    return C.Auth && typeof C.Auth.getCurrentUser === "function"
      ? C.Auth.getCurrentUser()
      : null;
  }

  function isAdmin() {
    const user = getUser();
    return Boolean(user && user.role === "admin");
  }

  function assetType(id) {
    return ASSET_TYPES.find(function (type) { return type.id === id; }) || ASSET_TYPES[0];
  }

  function campaignType(id) {
    return CAMPAIGN_TYPES.find(function (type) { return type.id === id; }) || CAMPAIGN_TYPES[0];
  }

  function requestStatus(id) {
    return REQUEST_STATUSES.find(function (status) { return status.id === id; }) || REQUEST_STATUSES[0];
  }

  function createId(prefix) {
    if (window.crypto && typeof window.crypto.randomUUID === "function") {
      return prefix + "-" + window.crypto.randomUUID();
    }
    return prefix + "-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 9);
  }

  function loadJson(key, fallback) {
    try {
      const raw = window.localStorage.getItem(key);
      if (!raw) return fallback;
      return JSON.parse(raw);
    } catch (error) {
      return fallback;
    }
  }

  function saveJson(key, value) {
    try {
      window.localStorage.setItem(key, JSON.stringify(value));
      return true;
    } catch (error) {
      toast("Could not save. Browser storage may be full.", "warn");
      return false;
    }
  }

  function refreshIcons() {
    if (window.lucide && typeof window.lucide.createIcons === "function") {
      window.lucide.createIcons();
    }
  }

  function icon(name) {
    const element = document.createElement("i");
    element.setAttribute("data-lucide", name);
    element.setAttribute("aria-hidden", "true");
    return element;
  }

  function element(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined && text !== null) node.textContent = text;
    return node;
  }

  function toast(message, tone) {
    if (!els.toastRegion) return;
    const node = document.createElement("div");
    node.className = "toast" + (tone === "warn" ? " is-warn" : "");
    node.appendChild(icon(tone === "warn" ? "triangle-alert" : "check"));
    node.appendChild(element("span", null, message));
    els.toastRegion.appendChild(node);
    refreshIcons();
    window.setTimeout(function () {
      node.classList.add("is-leaving");
      window.setTimeout(function () { node.remove(); }, 220);
    }, 3200);
  }

  function getMap() {
    return C.MapView && typeof C.MapView.getMap === "function" ? C.MapView.getMap() : null;
  }

  function getMapCenter() {
    const map = getMap();
    if (map) {
      const center = map.getCenter();
      if (center && Number.isFinite(center.lat) && Number.isFinite(center.lng)) {
        return { lat: center.lat, lng: center.lng };
      }
    }
    return { lat: 28.6139, lng: 77.209 };
  }

  function getAnchor() {
    try {
      if (C.MapView && typeof C.MapView.getAnchorLatLng === "function") {
        const anchor = C.MapView.getAnchorLatLng();
        if (anchor && Number.isFinite(anchor.lat) && Number.isFinite(anchor.lng)) {
          return anchor;
        }
      }
    } catch (error) {
      /* Fall through to the map center. */
    }
    return getMapCenter();
  }

  function hasCoords(item) {
    return item && Number.isFinite(item.lat) && Number.isFinite(item.lng);
  }

  function distanceMeters(a, b) {
    const radius = 6371000;
    const toRadians = Math.PI / 180;
    const dLat = (b.lat - a.lat) * toRadians;
    const dLng = (b.lng - a.lng) * toRadians;
    const lat1 = a.lat * toRadians;
    const lat2 = b.lat * toRadians;
    const h = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
    return 2 * radius * Math.asin(Math.min(1, Math.sqrt(h)));
  }

  function formatDistance(meters) {
    if (!Number.isFinite(meters)) return "";
    if (meters < 950) return Math.max(10, Math.round(meters / 10) * 10) + " m away";
    return (meters / 1000).toFixed(1) + " km away";
  }

  function itemDistance(item) {
    if (!hasCoords(item)) return null;
    const anchor = getAnchor();
    if (!anchor) return null;
    return distanceMeters(anchor, { lat: item.lat, lng: item.lng });
  }

  function formatCoords(location) {
    if (!location) return "";
    return Number(location.lat).toFixed(5) + ", " + Number(location.lng).toFixed(5);
  }

  function relativeAge(value) {
    const time = new Date(value).getTime();
    if (!Number.isFinite(time)) return "";
    const minutes = Math.max(0, Math.floor((Date.now() - time) / 60000));
    if (minutes < 1) return "Just now";
    if (minutes < 60) return minutes + " min ago";
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return hours + (hours === 1 ? " hr ago" : " hrs ago");
    const days = Math.floor(hours / 24);
    if (days < 7) return days + (days === 1 ? " day ago" : " days ago");
    return new Date(value).toLocaleDateString(undefined, { day: "numeric", month: "short" });
  }

  function localDateISO(date) {
    return date.getFullYear() + "-" +
      String(date.getMonth() + 1).padStart(2, "0") + "-" +
      String(date.getDate()).padStart(2, "0");
  }

  function dateOffset(days) {
    const date = new Date();
    date.setDate(date.getDate() + days);
    return localDateISO(date);
  }

  function campaignStart(campaign) {
    if (!campaign || !campaign.date || !campaign.time) return null;
    const start = new Date(campaign.date + "T" + campaign.time + ":00");
    return Number.isFinite(start.getTime()) ? start : null;
  }

  function isCampaignPast(campaign) {
    const start = campaignStart(campaign);
    if (!start) return false;
    return start.getTime() + 3 * 60 * 60 * 1000 < Date.now();
  }

  function formatCampaignWhen(campaign) {
    const start = campaignStart(campaign);
    if (!start) return campaign && campaign.date ? campaign.date : "";
    const today = new Date();
    const startDay = new Date(start.getFullYear(), start.getMonth(), start.getDate());
    const todayDay = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    const dayDiff = Math.round((startDay - todayDay) / 86400000);
    let dayLabel;
    if (dayDiff === 0) {
      dayLabel = "Today";
    } else if (dayDiff === 1) {
      dayLabel = "Tomorrow";
    } else {
      dayLabel = start.toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" });
    }
    return dayLabel + " · " + start.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  }

  function normalizeRequest(raw) {
    if (!raw || typeof raw !== "object" || typeof raw.id !== "string" || !raw.id) return null;
    const type = ASSET_TYPES.some(function (item) { return item.id === raw.type; })
      ? raw.type
      : "streetlight";
    const status = REQUEST_STATUSES.some(function (item) { return item.id === raw.status; })
      ? raw.status
      : "open";
    const lat = Number(raw.lat);
    const lng = Number(raw.lng);
    const baseSupport = Number(raw.baseSupport);
    return {
      id: raw.id,
      type: type,
      title: typeof raw.title === "string" ? raw.title.slice(0, 90) : "",
      notes: typeof raw.notes === "string" ? raw.notes.slice(0, 500) : "",
      place: typeof raw.place === "string" ? raw.place.slice(0, 120) : "",
      lat: Number.isFinite(lat) ? lat : null,
      lng: Number.isFinite(lng) ? lng : null,
      status: status,
      supporters: Array.isArray(raw.supporters)
        ? raw.supporters.filter(function (id) { return typeof id === "string"; })
        : [],
      baseSupport: Number.isFinite(baseSupport) ? Math.max(0, Math.floor(baseSupport)) : 0,
      createdBy: typeof raw.createdBy === "string" ? raw.createdBy : "",
      createdByName: typeof raw.createdByName === "string" && raw.createdByName.trim()
        ? raw.createdByName.trim().slice(0, 80)
        : "Community member",
      createdAt: typeof raw.createdAt === "string" && Number.isFinite(new Date(raw.createdAt).getTime())
        ? raw.createdAt
        : new Date().toISOString(),
      isSample: raw.isSample === true
    };
  }

  function normalizeCampaign(raw) {
    if (!raw || typeof raw !== "object" || typeof raw.id !== "string" || !raw.id) return null;
    const type = CAMPAIGN_TYPES.some(function (item) { return item.id === raw.type; })
      ? raw.type
      : "other";
    const lat = Number(raw.lat);
    const lng = Number(raw.lng);
    return {
      id: raw.id,
      type: type,
      title: typeof raw.title === "string" ? raw.title.slice(0, 90) : "",
      notes: typeof raw.notes === "string" ? raw.notes.slice(0, 500) : "",
      venue: typeof raw.venue === "string" ? raw.venue.slice(0, 120) : "",
      date: typeof raw.date === "string" ? raw.date.slice(0, 10) : "",
      time: typeof raw.time === "string" ? raw.time.slice(0, 5) : "",
      lat: Number.isFinite(lat) ? lat : null,
      lng: Number.isFinite(lng) ? lng : null,
      createdBy: typeof raw.createdBy === "string" ? raw.createdBy : "",
      createdByName: typeof raw.createdByName === "string" && raw.createdByName.trim()
        ? raw.createdByName.trim().slice(0, 80)
        : "Community member",
      createdAt: typeof raw.createdAt === "string" && Number.isFinite(new Date(raw.createdAt).getTime())
        ? raw.createdAt
        : new Date().toISOString(),
      isSample: raw.isSample === true
    };
  }

  function loadData() {
    const requests = loadJson(REQUEST_KEY, []);
    state.requests = Array.isArray(requests)
      ? requests.map(normalizeRequest).filter(Boolean)
      : [];

    const campaigns = loadJson(CAMPAIGN_KEY, []);
    state.campaigns = Array.isArray(campaigns)
      ? campaigns.map(normalizeCampaign).filter(Boolean)
      : [];

    const follows = loadJson(FOLLOW_KEY, {});
    state.follows = {};
    if (follows && typeof follows === "object" && !Array.isArray(follows)) {
      Object.keys(follows).forEach(function (userId) {
        if (Array.isArray(follows[userId])) {
          state.follows[userId] = follows[userId].filter(function (id) {
            return typeof id === "string";
          });
        }
      });
    }
  }

  function saveRequests() {
    saveJson(REQUEST_KEY, state.requests);
  }

  function saveCampaigns() {
    saveJson(CAMPAIGN_KEY, state.campaigns);
  }

  function saveFollows() {
    saveJson(FOLLOW_KEY, state.follows);
  }

  function requestSupporters(request) {
    return Array.isArray(request.supporters) ? request.supporters : [];
  }

  function supportCount(request) {
    return (request.baseSupport || 0) + requestSupporters(request).length;
  }

  function upcomingCampaigns() {
    return state.campaigns.filter(function (campaign) {
      return !isCampaignPast(campaign);
    });
  }

  function openRequests() {
    return state.requests.filter(function (request) {
      return request.status !== "done";
    });
  }

  function followedCampaigns(user) {
    if (!user) return [];
    const ids = state.follows[user.id] || [];
    return state.campaigns
      .filter(function (campaign) {
        return ids.indexOf(campaign.id) !== -1 && !isCampaignPast(campaign);
      })
      .sort(function (a, b) {
        const left = campaignStart(a);
        const right = campaignStart(b);
        return (left ? left.getTime() : Infinity) - (right ? right.getTime() : Infinity);
      });
  }

  function cacheElements() {
    els = {
      appShell: document.getElementById("appShell"),
      toastRegion: document.getElementById("toastRegion"),
      requestsBtn: document.getElementById("hubRequestsBtn"),
      campaignsBtn: document.getElementById("hubCampaignsBtn"),
      requestsMeta: document.getElementById("hubRequestsMeta"),
      campaignsMeta: document.getElementById("hubCampaignsMeta"),
      requestsCount: document.getElementById("hubRequestsCount"),
      campaignsCount: document.getElementById("hubCampaignsCount"),
      modal: document.getElementById("communityHubModal"),
      close: document.getElementById("hubClose"),
      closeBtn: document.getElementById("hubCloseBtn"),
      tabRequests: document.getElementById("hubTabRequests"),
      tabCampaigns: document.getElementById("hubTabCampaigns"),
      tabRequestCount: document.getElementById("hubTabRequestCount"),
      tabCampaignCount: document.getElementById("hubTabCampaignCount"),
      requestsPanel: document.getElementById("hubRequestsPanel"),
      campaignsPanel: document.getElementById("hubCampaignsPanel"),
      requestFilters: document.getElementById("requestFilters"),
      campaignFilters: document.getElementById("campaignFilters"),
      newRequestBtn: document.getElementById("newRequestBtn"),
      newCampaignBtn: document.getElementById("newCampaignBtn"),
      requestForm: document.getElementById("requestForm"),
      requestType: document.getElementById("requestType"),
      requestPlace: document.getElementById("requestPlace"),
      requestTitle: document.getElementById("requestTitle"),
      requestTitleError: document.getElementById("requestTitleError"),
      requestNotes: document.getElementById("requestNotes"),
      requestLocationLabel: document.getElementById("requestLocationLabel"),
      requestLocationCoords: document.getElementById("requestLocationCoords"),
      requestPickBtn: document.getElementById("requestPickBtn"),
      requestLocateBtn: document.getElementById("requestLocateBtn"),
      requestCancelBtn: document.getElementById("requestCancelBtn"),
      requestList: document.getElementById("requestList"),
      requestEmpty: document.getElementById("requestEmpty"),
      requestSampleBtn: document.getElementById("requestSampleBtn"),
      campaignForm: document.getElementById("campaignForm"),
      campaignType: document.getElementById("campaignType"),
      campaignOrganizer: document.getElementById("campaignOrganizer"),
      campaignTitle: document.getElementById("campaignTitle"),
      campaignTitleError: document.getElementById("campaignTitleError"),
      campaignDate: document.getElementById("campaignDate"),
      campaignDateError: document.getElementById("campaignDateError"),
      campaignTime: document.getElementById("campaignTime"),
      campaignTimeError: document.getElementById("campaignTimeError"),
      campaignVenue: document.getElementById("campaignVenue"),
      campaignVenueError: document.getElementById("campaignVenueError"),
      campaignNotes: document.getElementById("campaignNotes"),
      campaignLocationLabel: document.getElementById("campaignLocationLabel"),
      campaignLocationCoords: document.getElementById("campaignLocationCoords"),
      campaignPickBtn: document.getElementById("campaignPickBtn"),
      campaignLocateBtn: document.getElementById("campaignLocateBtn"),
      campaignCancelBtn: document.getElementById("campaignCancelBtn"),
      campaignDateFilter: document.getElementById("campaignDateFilter"),
      campaignReminders: document.getElementById("campaignReminders"),
      campaignList: document.getElementById("campaignList"),
      campaignEmpty: document.getElementById("campaignEmpty"),
      campaignSampleBtn: document.getElementById("campaignSampleBtn"),
      pickBanner: document.getElementById("hubPickBanner"),
      pickText: document.getElementById("hubPickText"),
      pickCancel: document.getElementById("hubPickCancel")
    };
  }

  function buildSelects() {
    ASSET_TYPES.forEach(function (type) {
      const option = document.createElement("option");
      option.value = type.id;
      option.textContent = type.label;
      els.requestType.appendChild(option);
    });

    CAMPAIGN_TYPES.forEach(function (type) {
      const option = document.createElement("option");
      option.value = type.id;
      option.textContent = type.label;
      els.campaignType.appendChild(option);
    });
  }

  function buildFilter(container, options, active, onSelect) {
    container.textContent = "";
    options.forEach(function (option) {
      const button = element("button", "hub-chip");
      button.type = "button";
      button.dataset.filter = option.id;
      if (option.color) button.style.setProperty("--chip-color", option.color);
      if (option.icon) button.appendChild(icon(option.icon));
      button.appendChild(element("span", null, option.label));
      button.setAttribute("aria-pressed", option.id === active ? "true" : "false");
      if (option.id === active) button.classList.add("is-active");
      button.addEventListener("click", function () {
        onSelect(option.id);
      });
      container.appendChild(button);
    });
  }

  function syncChips(container, active) {
    Array.from(container.children).forEach(function (button) {
      const isActive = button.dataset.filter === active;
      button.classList.toggle("is-active", isActive);
      button.setAttribute("aria-pressed", isActive ? "true" : "false");
    });
  }

  function buildFilters() {
    buildFilter(
      els.requestFilters,
      [{ id: "all", label: "All", icon: "layout-grid" }].concat(ASSET_TYPES),
      state.requestFilter,
      function (id) {
        state.requestFilter = id;
        syncChips(els.requestFilters, id);
        renderRequestList();
        refreshIcons();
      }
    );

    buildFilter(
      els.campaignFilters,
      [{ id: "all", label: "All", icon: "layout-grid" }].concat(CAMPAIGN_TYPES),
      state.campaignFilter,
      function (id) {
        state.campaignFilter = id;
        syncChips(els.campaignFilters, id);
        renderCampaignList();
        refreshIcons();
      }
    );
  }

  function setTab(tab, focusTab) {
    const campaigns = tab === "campaigns";
    state.activeTab = campaigns ? "campaigns" : "requests";
    els.tabRequests.classList.toggle("is-active", !campaigns);
    els.tabCampaigns.classList.toggle("is-active", campaigns);
    els.tabRequests.setAttribute("aria-selected", campaigns ? "false" : "true");
    els.tabCampaigns.setAttribute("aria-selected", campaigns ? "true" : "false");
    els.tabRequests.tabIndex = campaigns ? -1 : 0;
    els.tabCampaigns.tabIndex = campaigns ? 0 : -1;
    els.requestsPanel.hidden = campaigns;
    els.campaignsPanel.hidden = !campaigns;
    if (focusTab) {
      (campaigns ? els.tabCampaigns : els.tabRequests).focus();
    }
  }

  function openHub(tab, focusId) {
    if (!els.modal) return;

    if (!els.modal.hidden) {
      setTab(tab, false);
      if (focusId) focusItem(state.activeTab, focusId);
      return;
    }

    const active = document.activeElement;
    state.lastFocused = active && active !== document.body && active.offsetParent !== null
      ? active
      : els.requestsBtn;

    if (focusId) {
      state.requestFilter = "all";
      state.campaignFilter = "all";
      state.campaignWhen = "upcoming";
      els.campaignDateFilter.value = "upcoming";
      syncChips(els.requestFilters, "all");
      syncChips(els.campaignFilters, "all");
    }

    setTab(tab, false);
    renderAll();
    els.modal.hidden = false;
    if (els.appShell) els.appShell.inert = true;
    refreshIcons();

    if (focusId) {
      window.setTimeout(function () {
        focusItem(state.activeTab, focusId);
      }, 60);
    } else {
      const target = state.activeTab === "campaigns" ? els.tabCampaigns : els.tabRequests;
      window.setTimeout(function () { target.focus(); }, 0);
    }
  }

  function closeHub(options) {
    if (!els.modal || els.modal.hidden) return;
    const skipFocus = options && options.skipFocus;
    els.modal.hidden = true;
    if (els.appShell) els.appShell.inert = false;
    closeRequestForm();
    closeCampaignForm();
    state.pendingLocation = null;
    state.locationSource = "map";
    hidePickBanner();
    if (!skipFocus) {
      const target = state.lastFocused;
      state.lastFocused = null;
      if (target && target.isConnected && typeof target.focus === "function") {
        target.focus({ preventScroll: true });
      }
    } else {
      state.lastFocused = null;
    }
  }

  function focusItem(tab, id) {
    const isCampaign = tab === "campaigns";
    const container = isCampaign ? els.campaignList : els.requestList;
    const attribute = isCampaign ? "campaignId" : "requestId";
    const cards = Array.from(container.querySelectorAll(".hub-item"));
    const card = cards.find(function (item) {
      return item.dataset[attribute] === id;
    });
    if (!card) return;
    setTab(tab, false);
    card.tabIndex = -1;
    card.classList.add("is-focused");
    card.scrollIntoView({ block: "nearest", behavior: "smooth" });
    card.focus({ preventScroll: true });
    window.setTimeout(function () {
      card.classList.remove("is-focused");
    }, 2400);
  }

  function renderAll() {
    renderRequestList();
    renderCampaignList();
    renderReminders();
    renderCounts();
    if (els.newRequestBtn) {
      els.newRequestBtn.hidden = isAdmin() || !els.requestForm.hidden;
    }
    renderMapLayers();
    refreshIcons();
  }

  function renderCounts() {
    const openCount = openRequests().length;
    const upcomingCount = upcomingCampaigns().length;
    const user = getUser();
    const reminders = followedCampaigns(user).length;

    els.requestsCount.textContent = String(openCount);
    els.campaignsCount.textContent = String(upcomingCount);
    els.tabRequestCount.textContent = String(state.requests.length);
    els.tabCampaignCount.textContent = String(upcomingCount);

    els.requestsMeta.textContent = openCount
      ? openCount + " open · support a neighbour"
      : "Street lights, WiFi & toilets";
    if (upcomingCount) {
      els.campaignsMeta.textContent = upcomingCount + " upcoming" +
        (reminders ? " · " + reminders + " reminder" + (reminders === 1 ? "" : "s") : " · camps & drives");
    } else {
      els.campaignsMeta.textContent = "Blood drives, eye camps & more";
    }
  }

  function requestSort(a, b) {
    const aDone = a.status === "done" ? 1 : 0;
    const bDone = b.status === "done" ? 1 : 0;
    if (aDone !== bDone) return aDone - bDone;
    const supportDiff = supportCount(b) - supportCount(a);
    if (supportDiff) return supportDiff;
    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
  }

  function filteredRequests() {
    const list = state.requestFilter === "all"
      ? state.requests.slice()
      : state.requests.filter(function (request) { return request.type === state.requestFilter; });
    return list.sort(requestSort);
  }

  function canDelete(item) {
    const user = getUser();
    if (!user) return false;
    if (isAdmin()) return true;
    return item.createdBy === user.id && !item.isSample;
  }

  function renderRequestList() {
    const requests = filteredRequests();
    els.requestList.textContent = "";

    if (!state.requests.length) {
      els.requestEmpty.hidden = !els.requestForm.hidden;
    } else {
      els.requestEmpty.hidden = true;
    }

    if (!requests.length) {
      if (state.requests.length) {
        els.requestList.appendChild(buildFilteredEmpty(
          "No requests match this filter.",
          function () {
            state.requestFilter = "all";
            syncChips(els.requestFilters, "all");
            renderRequestList();
            refreshIcons();
          }
        ));
      }
      return;
    }

    requests.forEach(function (request) {
      els.requestList.appendChild(buildRequestCard(request));
    });
  }

  function buildFilteredEmpty(message, onClear) {
    const wrap = element("div", "hub-empty is-inline");
    wrap.appendChild(element("strong", null, message));
    const clear = element("button", "text-btn", "Show all");
    clear.type = "button";
    clear.addEventListener("click", onClear);
    wrap.appendChild(clear);
    return wrap;
  }

  function buildRequestCard(request) {
    const type = assetType(request.type);
    const card = element("article", "hub-item");
    card.dataset.requestId = request.id;
    card.style.setProperty("--hub-color", type.color);
    if (request.status === "done") card.classList.add("is-done");

    const iconWrap = element("div", "hub-item-icon");
    iconWrap.style.setProperty("--hub-color", type.color);
    iconWrap.appendChild(icon(type.icon));

    const main = element("div", "hub-item-main");
    const top = element("div", "hub-item-top");
    top.appendChild(element("span", "hub-type", type.label));
    top.appendChild(element("span", "hub-status is-" + request.status, requestStatus(request.status).label));
    const distance = itemDistance(request);
    if (distance !== null) top.appendChild(element("span", "hub-distance", formatDistance(distance)));
    main.appendChild(top);

    main.appendChild(element("h3", "hub-item-title", request.title));
    if (request.place) {
      main.appendChild(element("p", "hub-item-place", request.place));
    }
    if (request.notes) {
      main.appendChild(element("p", "hub-item-notes", request.notes));
    }

    const supporters = supportCount(request);
    const meta = element("div", "hub-item-meta");
    meta.appendChild(element("span", null, supporters + (supporters === 1 ? " supporter" : " supporters")));
    meta.appendChild(element("span", null, "By " + request.createdByName));
    meta.appendChild(element("span", null, relativeAge(request.createdAt)));
    if (request.isSample) meta.appendChild(element("span", "hub-sample", "Sample"));
    main.appendChild(meta);

    const actions = element("div", "hub-item-actions");
    const user = getUser();

    if (isAdmin()) {
      const select = document.createElement("select");
      select.className = "hub-status-select";
      select.setAttribute("aria-label", "Update request status");
      REQUEST_STATUSES.forEach(function (status) {
        const option = document.createElement("option");
        option.value = status.id;
        option.textContent = status.label;
        option.selected = status.id === request.status;
        select.appendChild(option);
      });
      select.addEventListener("change", function () {
        updateRequestStatus(request.id, select.value);
      });
      actions.appendChild(select);
    } else {
      const supported = Boolean(user && requestSupporters(request).indexOf(user.id) !== -1);
      const supportButton = element("button", "btn btn-small " + (supported ? "btn-ghost is-supported" : "btn-primary"));
      supportButton.type = "button";
      supportButton.appendChild(icon(supported ? "check" : "hand-heart"));
      supportButton.appendChild(element("span", null,
        (supported ? "Supported · " : "Support · ") + supporters));
      supportButton.addEventListener("click", function () {
        toggleSupport(request.id);
      });
      actions.appendChild(supportButton);
    }

    const locate = element("button", "text-btn");
    locate.type = "button";
    locate.appendChild(icon("locate-fixed"));
    locate.appendChild(element("span", null, "Show on map"));
    locate.addEventListener("click", function () {
      showOnMap(request, "request");
    });
    actions.appendChild(locate);

    if (canDelete(request)) {
      const remove = element("button", "text-btn hub-delete");
      remove.type = "button";
      remove.appendChild(icon("trash-2"));
      remove.appendChild(element("span", null, "Delete"));
      remove.addEventListener("click", function () {
        armDelete(remove, function () {
          deleteRequest(request.id);
        });
      });
      actions.appendChild(remove);
    }

    main.appendChild(actions);
    card.append(iconWrap, main);
    return card;
  }

  function updateRequestStatus(id, status) {
    const request = state.requests.find(function (item) { return item.id === id; });
    if (!request) return;
    request.status = status;
    saveRequests();
    renderAll();
    toast("Request marked " + requestStatus(status).label.toLowerCase() + ".");
  }

  function toggleSupport(id) {
    const request = state.requests.find(function (item) { return item.id === id; });
    if (!request) return;

    const user = getUser();
    if (!user) {
      requireUser("Sign in to support a local need.", function () {
        toggleSupport(id);
      });
      return;
    }
    if (isAdmin()) {
      toast("Moderator accounts can't support requests.", "warn");
      return;
    }

    const supporters = request.supporters || (request.supporters = []);
    const index = supporters.indexOf(user.id);
    if (index === -1) {
      supporters.push(user.id);
    } else {
      supporters.splice(index, 1);
    }
    saveRequests();
    renderRequestList();
    renderCounts();
    refreshIcons();
    toast(index === -1 ? "Support added — thanks for backing this need." : "Support removed.");
  }

  function deleteRequest(id) {
    const request = state.requests.find(function (item) { return item.id === id; });
    if (!request) return;
    state.requests = state.requests.filter(function (item) { return item.id !== id; });
    saveRequests();
    renderAll();
    toast("Request deleted.");
  }

  function filteredCampaigns() {
    let list = state.campaigns.slice();
    if (state.campaignFilter !== "all") {
      list = list.filter(function (campaign) { return campaign.type === state.campaignFilter; });
    }
    if (state.campaignWhen === "upcoming") {
      list = list.filter(function (campaign) { return !isCampaignPast(campaign); });
    }
    return list.sort(function (a, b) {
      const aPast = isCampaignPast(a);
      const bPast = isCampaignPast(b);
      if (aPast !== bPast) return aPast ? 1 : -1;
      const left = campaignStart(a);
      const right = campaignStart(b);
      const leftTime = left ? left.getTime() : 0;
      const rightTime = right ? right.getTime() : 0;
      return aPast ? rightTime - leftTime : leftTime - rightTime;
    });
  }

  function renderCampaignList() {
    const campaigns = filteredCampaigns();
    els.campaignList.textContent = "";

    if (!state.campaigns.length) {
      els.campaignEmpty.hidden = !els.campaignForm.hidden;
    } else {
      els.campaignEmpty.hidden = true;
    }

    if (!campaigns.length) {
      if (state.campaigns.length) {
        els.campaignList.appendChild(buildFilteredEmpty(
          "No campaigns match these filters.",
          function () {
            state.campaignFilter = "all";
            state.campaignWhen = "upcoming";
            els.campaignDateFilter.value = "upcoming";
            syncChips(els.campaignFilters, "all");
            renderCampaignList();
            refreshIcons();
          }
        ));
      }
      return;
    }

    campaigns.forEach(function (campaign) {
      els.campaignList.appendChild(buildCampaignCard(campaign));
    });
  }

  function buildCampaignCard(campaign) {
    const type = campaignType(campaign.type);
    const start = campaignStart(campaign);
    const past = isCampaignPast(campaign);
    const user = getUser();
    const following = Boolean(user && (state.follows[user.id] || []).indexOf(campaign.id) !== -1);

    const card = element("article", "hub-item hub-campaign");
    card.dataset.campaignId = campaign.id;
    card.style.setProperty("--hub-color", type.color);
    if (past) card.classList.add("is-past");

    const dateBadge = element("div", "hub-date-badge");
    dateBadge.style.setProperty("--hub-color", type.color);
    if (start) {
      dateBadge.appendChild(element("strong", null, String(start.getDate()).padStart(2, "0")));
      dateBadge.appendChild(element("span", null, start.toLocaleDateString(undefined, { month: "short" })));
    } else {
      dateBadge.appendChild(element("strong", null, "—"));
      dateBadge.appendChild(element("span", null, "date"));
    }

    const main = element("div", "hub-item-main");
    const top = element("div", "hub-item-top");
    top.appendChild(element("span", "hub-type", type.label));
    if (past) {
      top.appendChild(element("span", "hub-status is-past", "Ended"));
    } else {
      const when = element("span", "hub-when");
      when.appendChild(icon("clock"));
      when.appendChild(element("span", null, formatCampaignWhen(campaign)));
      top.appendChild(when);
    }
    const distance = itemDistance(campaign);
    if (distance !== null) top.appendChild(element("span", "hub-distance", formatDistance(distance)));
    main.appendChild(top);

    main.appendChild(element("h3", "hub-item-title", campaign.title));
    if (campaign.venue) {
      const venue = element("p", "hub-item-place");
      venue.appendChild(icon("map-pin"));
      venue.appendChild(element("span", null, campaign.venue));
      main.appendChild(venue);
    }
    if (campaign.notes) {
      main.appendChild(element("p", "hub-item-notes", campaign.notes));
    }

    const meta = element("div", "hub-item-meta");
    meta.appendChild(element("span", null, "By " + campaign.createdByName));
    if (campaign.isSample) meta.appendChild(element("span", "hub-sample", "Sample"));
    main.appendChild(meta);

    const actions = element("div", "hub-item-actions");
    if (!past) {
      const notify = element("button", "btn btn-small " + (following ? "btn-ghost is-supported" : "btn-primary"));
      notify.type = "button";
      notify.appendChild(icon(following ? "bell-ring" : "bell"));
      notify.appendChild(element("span", null, following ? "Notifications on" : "Notify me"));
      notify.addEventListener("click", function () {
        toggleFollow(campaign.id);
      });
      actions.appendChild(notify);
    }

    if (start) {
      const calendar = element("button", "text-btn");
      calendar.type = "button";
      calendar.appendChild(icon("calendar-days"));
      calendar.appendChild(element("span", null, "Add to calendar"));
      calendar.addEventListener("click", function () {
        downloadCampaignCalendar(campaign);
      });
      actions.appendChild(calendar);
    }

    const share = element("button", "text-btn");
    share.type = "button";
    share.appendChild(icon("share-2"));
    share.appendChild(element("span", null, "Share"));
    share.addEventListener("click", function () {
      shareCampaign(campaign);
    });
    actions.appendChild(share);

    if (hasCoords(campaign)) {
      const locate = element("button", "text-btn");
      locate.type = "button";
      locate.appendChild(icon("locate-fixed"));
      locate.appendChild(element("span", null, "Show on map"));
      locate.addEventListener("click", function () {
        showOnMap(campaign, "campaign");
      });
      actions.appendChild(locate);
    }

    if (canDelete(campaign)) {
      const remove = element("button", "text-btn hub-delete");
      remove.type = "button";
      remove.appendChild(icon("trash-2"));
      remove.appendChild(element("span", null, "Delete"));
      remove.addEventListener("click", function () {
        armDelete(remove, function () {
          deleteCampaign(campaign.id);
        });
      });
      actions.appendChild(remove);
    }

    main.appendChild(actions);
    card.append(dateBadge, main);
    return card;
  }

  function toggleFollow(id) {
    const campaign = state.campaigns.find(function (item) { return item.id === id; });
    if (!campaign) return;

    requireUser("Sign in to follow campaigns and see reminders.", function (user) {
      const list = state.follows[user.id] || (state.follows[user.id] = []);
      const index = list.indexOf(id);
      let following;
      if (index === -1) {
        list.push(id);
        following = true;
      } else {
        list.splice(index, 1);
        following = false;
      }
      saveFollows();
      renderCampaignList();
      renderReminders();
      renderCounts();
      refreshIcons();
      if (following) {
        toast("Reminder saved for " + campaign.title + ".");
        askForBrowserNotification(campaign);
      } else {
        toast("Campaign notifications turned off.");
      }
    });
  }

  function askForBrowserNotification(campaign) {
    if (!("Notification" in window)) return;
    try {
      if (Notification.permission === "granted") {
        new Notification("CommunityAtlas reminder saved", {
          body: campaign.title + " · " + formatCampaignWhen(campaign),
          tag: "communityatlas-" + campaign.id
        });
      } else if (Notification.permission === "default") {
        Notification.requestPermission().then(function (permission) {
          if (permission === "granted") {
            new Notification("CommunityAtlas reminder saved", {
              body: campaign.title + " · " + formatCampaignWhen(campaign),
              tag: "communityatlas-" + campaign.id
            });
          }
        }).catch(function () {
          /* In-app reminders still work. */
        });
      }
    } catch (error) {
      /* Notification API can be blocked; in-app reminders still work. */
    }
  }

  function renderReminders() {
    const user = getUser();
    const reminders = followedCampaigns(user);
    els.campaignReminders.textContent = "";
    if (!reminders.length) {
      els.campaignReminders.hidden = true;
      return;
    }

    const visible = reminders.slice(0, 2);
    visible.forEach(function (campaign) {
      const row = element("div", "hub-reminder");
      row.appendChild(icon("bell-ring"));
      const copy = element("div", "hub-reminder-copy");
      copy.appendChild(element("strong", null, "Reminder · " + formatCampaignWhen(campaign)));
      copy.appendChild(element("span", null,
        campaign.title + (campaign.venue ? " · " + campaign.venue : "")));
      row.appendChild(copy);
      const view = element("button", "text-btn", "View");
      view.type = "button";
      view.addEventListener("click", function () {
        setTab("campaigns", false);
        focusItem("campaigns", campaign.id);
      });
      row.appendChild(view);
      els.campaignReminders.appendChild(row);
    });

    if (reminders.length > visible.length) {
      els.campaignReminders.appendChild(element(
        "p",
        "hub-reminders-more",
        "+" + (reminders.length - visible.length) + " more followed campaign" +
          (reminders.length - visible.length === 1 ? "" : "s")
      ));
    }
    els.campaignReminders.hidden = false;
  }

  function deleteCampaign(id) {
    const campaign = state.campaigns.find(function (item) { return item.id === id; });
    if (!campaign) return;
    state.campaigns = state.campaigns.filter(function (item) { return item.id !== id; });
    Object.keys(state.follows).forEach(function (userId) {
      state.follows[userId] = (state.follows[userId] || []).filter(function (followId) {
        return followId !== id;
      });
    });
    saveCampaigns();
    saveFollows();
    renderAll();
    toast("Campaign deleted.");
  }

  function armDelete(button, action) {
    if (button.dataset.armed === "true") {
      window.clearTimeout(button._deleteTimer);
      button.dataset.armed = "false";
      action();
      return;
    }
    button.dataset.armed = "true";
    button.classList.add("is-armed");
    const label = button.querySelector("span");
    if (label) label.textContent = "Confirm";
    window.clearTimeout(button._deleteTimer);
    button._deleteTimer = window.setTimeout(function () {
      button.dataset.armed = "false";
      button.classList.remove("is-armed");
      if (label) label.textContent = "Delete";
    }, 3000);
  }

  function showOnMap(item, kind) {
    if (!hasCoords(item)) {
      toast("This item doesn't have a pinned location.", "warn");
      return;
    }
    closeHub();
    if (C.MapView && typeof C.MapView.centerOn === "function") {
      C.MapView.centerOn(item.lat, item.lng, 17, true);
      toast((kind === "campaign" ? "Campaign" : "Request") + " shown on the map.");
    }
  }

  function renderMapLayers() {
    const map = state.map || getMap();
    if (!map || !window.L) return;
    state.map = map;

    if (!state.requestLayer) {
      state.requestLayer = window.L.layerGroup().addTo(map);
    }
    if (!state.campaignLayer) {
      state.campaignLayer = window.L.layerGroup().addTo(map);
    }

    state.requestLayer.clearLayers();
    state.campaignLayer.clearLayers();

    state.requests.forEach(function (request) {
      if (!hasCoords(request)) return;
      const type = assetType(request.type);
      const marker = window.L.marker([request.lat, request.lng], {
        icon: window.L.divIcon({
          className: "hub-pin-wrap",
          html: '<span class="hub-pin' + (request.status === "done" ? " is-done" : "") +
            '" style="--hub-pin:' + type.color + '"><i data-lucide="' + type.icon + '"></i></span>',
          iconSize: [30, 30],
          iconAnchor: [15, 15]
        }),
        title: request.title,
        riseOnHover: true
      });
      marker.on("click", function () {
        openHub("requests", request.id);
      });
      const tooltip = document.createElement("span");
      tooltip.textContent = request.title;
      marker.bindTooltip(tooltip, { direction: "top", offset: [0, -16] });
      marker.addTo(state.requestLayer);
    });

    state.campaigns.forEach(function (campaign) {
      if (!hasCoords(campaign) || isCampaignPast(campaign)) return;
      const type = campaignType(campaign.type);
      const marker = window.L.marker([campaign.lat, campaign.lng], {
        icon: window.L.divIcon({
          className: "hub-pin-wrap",
          html: '<span class="hub-pin is-campaign" style="--hub-pin:' + type.color +
            '"><i data-lucide="' + type.icon + '"></i></span>',
          iconSize: [30, 30],
          iconAnchor: [15, 15]
        }),
        title: campaign.title,
        riseOnHover: true
      });
      marker.on("click", function () {
        openHub("campaigns", campaign.id);
      });
      const tooltip = document.createElement("span");
      tooltip.textContent = campaign.title;
      marker.bindTooltip(tooltip, { direction: "top", offset: [0, -16] });
      marker.addTo(state.campaignLayer);
    });
  }

  function requireUser(message, callback) {
    const user = getUser();
    if (user) {
      callback(user);
      return;
    }
    const tab = state.activeTab;
    closeHub({ skipFocus: true });
    if (C.Auth && typeof C.Auth.open === "function") {
      C.Auth.open("signin", {
        message: message,
        onAuthenticated: function () {
          openHub(tab);
          const signedIn = getUser();
          if (signedIn) callback(signedIn);
        }
      });
    } else {
      toast("Sign in to continue.", "warn");
    }
  }

  function updateLocationUi(kind) {
    const label = kind === "campaign" ? els.campaignLocationLabel : els.requestLocationLabel;
    const coords = kind === "campaign" ? els.campaignLocationCoords : els.requestLocationCoords;
    if (!label || !coords) return;
    const text = state.locationSource === "picked"
      ? "Picked on the map"
      : state.locationSource === "device"
        ? "Using your current location"
        : "Using the current map center";
    label.textContent = text;
    coords.textContent = state.pendingLocation ? formatCoords(state.pendingLocation) : "";
  }

  function defaultLocation() {
    state.pendingLocation = getMapCenter();
    state.locationSource = "map";
  }

  function locateForForm(kind) {
    if (!navigator.geolocation) {
      toast("Location isn't available in this browser. Pick the spot on the map instead.", "warn");
      return;
    }
    toast("Getting your location…");
    navigator.geolocation.getCurrentPosition(
      function (position) {
        const location = {
          lat: position.coords.latitude,
          lng: position.coords.longitude
        };
        state.pendingLocation = location;
        state.locationSource = "device";
        if (C.MapView && typeof C.MapView.centerOn === "function") {
          C.MapView.centerOn(location.lat, location.lng, 17, true);
        }
        updateLocationUi(kind);
        toast("Location updated.");
      },
      function () {
        toast("Couldn't get your location. Pick the spot on the map instead.", "warn");
      },
      { enableHighAccuracy: true, timeout: 7000, maximumAge: 0 }
    );
  }

  function readRequestDraft() {
    return {
      type: els.requestType.value,
      title: els.requestTitle.value,
      place: els.requestPlace.value,
      notes: els.requestNotes.value,
      location: state.pendingLocation,
      source: state.locationSource
    };
  }

  function readCampaignDraft() {
    return {
      type: els.campaignType.value,
      title: els.campaignTitle.value,
      organizer: els.campaignOrganizer.value,
      date: els.campaignDate.value,
      time: els.campaignTime.value,
      venue: els.campaignVenue.value,
      notes: els.campaignNotes.value,
      location: state.pendingLocation,
      source: state.locationSource
    };
  }

  function clearFieldError(input, error) {
    if (input) input.removeAttribute("aria-invalid");
    if (error) error.hidden = true;
  }

  function showFieldError(input, error) {
    if (input) input.setAttribute("aria-invalid", "true");
    if (error) error.hidden = false;
  }

  function openRequestForm(draft) {
    if (!getUser()) {
      requireUser("Sign in to request an asset for your locality.", function () {
        openRequestForm(draft);
      });
      return;
    }
    if (isAdmin()) {
      toast("Moderator accounts can review requests but not create them.", "warn");
      return;
    }

    setTab("requests", false);
    els.requestForm.hidden = false;
    els.newRequestBtn.hidden = true;
    els.requestEmpty.hidden = true;

    const value = draft || {};
    if (value.location) {
      state.pendingLocation = value.location;
      state.locationSource = value.source || "picked";
    } else {
      defaultLocation();
    }

    els.requestType.value = value.type || (state.requestFilter !== "all" ? state.requestFilter : "streetlight");
    els.requestTitle.value = value.title || "";
    els.requestPlace.value = value.place || "";
    els.requestNotes.value = value.notes || "";
    clearFieldError(els.requestTitle, els.requestTitleError);
    updateRequestPlaceholder();
    updateLocationUi("request");
    refreshIcons();
    window.setTimeout(function () { els.requestTitle.focus(); }, 0);
  }

  function closeRequestForm() {
    if (!els.requestForm) return;
    const wasOpen = !els.requestForm.hidden;
    els.requestForm.hidden = true;
    if (els.newRequestBtn) els.newRequestBtn.hidden = isAdmin();
    els.requestTitle.value = "";
    els.requestPlace.value = "";
    els.requestNotes.value = "";
    clearFieldError(els.requestTitle, els.requestTitleError);
    if (els.requestEmpty && !state.requests.length) {
      els.requestEmpty.hidden = false;
    }
    if (wasOpen && els.modal && !els.modal.hidden && !isAdmin() && els.newRequestBtn) {
      els.newRequestBtn.focus({ preventScroll: true });
    }
  }

  function updateRequestPlaceholder() {
    const type = assetType(els.requestType.value);
    els.requestTitle.placeholder = "e.g., " + type.example;
  }

  function submitRequest(event) {
    event.preventDefault();
    clearFieldError(els.requestTitle, els.requestTitleError);

    const user = getUser();
    if (!user) {
      const draft = readRequestDraft();
      closeRequestForm();
      requireUser("Sign in to post this request.", function () {
        openRequestForm(draft);
      });
      return;
    }
    if (isAdmin()) {
      toast("Moderator accounts can review requests but not create them.", "warn");
      return;
    }

    const title = els.requestTitle.value.trim();
    if (!title) {
      showFieldError(els.requestTitle, els.requestTitleError);
      els.requestTitle.focus();
      return;
    }

    const location = state.pendingLocation || getMapCenter();
    const request = {
      id: createId("request"),
      type: els.requestType.value,
      title: title,
      place: els.requestPlace.value.trim(),
      notes: els.requestNotes.value.trim(),
      lat: location.lat,
      lng: location.lng,
      status: "open",
      supporters: [],
      baseSupport: 0,
      createdBy: user.id,
      createdByName: user.name || "Community member",
      createdAt: new Date().toISOString(),
      isSample: false
    };

    state.requests.unshift(request);
    saveRequests();
    closeRequestForm();
    state.requestFilter = "all";
    syncChips(els.requestFilters, "all");
    state.pendingLocation = null;
    state.locationSource = "map";
    renderAll();
    setTab("requests", false);
    focusItem("requests", request.id);
    toast("Request posted — neighbours can now support it.");
  }

  function openCampaignForm(draft) {
    if (!getUser()) {
      requireUser("Sign in to publish a campaign for your locality.", function () {
        openCampaignForm(draft);
      });
      return;
    }

    setTab("campaigns", false);
    els.campaignForm.hidden = false;
    els.newCampaignBtn.hidden = true;
    els.campaignEmpty.hidden = true;

    const value = draft || {};
    if (value.location) {
      state.pendingLocation = value.location;
      state.locationSource = value.source || "picked";
    } else {
      defaultLocation();
    }

    els.campaignType.value = value.type || (state.campaignFilter !== "all" ? state.campaignFilter : "blood");
    els.campaignTitle.value = value.title || "";
    els.campaignOrganizer.value = value.organizer || (getUser() ? getUser().name : "");
    els.campaignDate.value = value.date || dateOffset(1);
    els.campaignTime.value = value.time || "10:00";
    els.campaignVenue.value = value.venue || "";
    els.campaignNotes.value = value.notes || "";
    els.campaignDate.min = localDateISO(new Date());
    clearFieldError(els.campaignTitle, els.campaignTitleError);
    clearFieldError(els.campaignDate, els.campaignDateError);
    clearFieldError(els.campaignTime, els.campaignTimeError);
    clearFieldError(els.campaignVenue, els.campaignVenueError);
    updateLocationUi("campaign");
    refreshIcons();
    window.setTimeout(function () { els.campaignTitle.focus(); }, 0);
  }

  function closeCampaignForm() {
    if (!els.campaignForm) return;
    const wasOpen = !els.campaignForm.hidden;
    els.campaignForm.hidden = true;
    if (els.newCampaignBtn) els.newCampaignBtn.hidden = false;
    els.campaignTitle.value = "";
    els.campaignOrganizer.value = "";
    els.campaignVenue.value = "";
    els.campaignNotes.value = "";
    clearFieldError(els.campaignTitle, els.campaignTitleError);
    clearFieldError(els.campaignDate, els.campaignDateError);
    clearFieldError(els.campaignTime, els.campaignTimeError);
    clearFieldError(els.campaignVenue, els.campaignVenueError);
    if (els.campaignEmpty && !state.campaigns.length) {
      els.campaignEmpty.hidden = false;
    }
    if (wasOpen && els.modal && !els.modal.hidden && els.newCampaignBtn) {
      els.newCampaignBtn.focus({ preventScroll: true });
    }
  }

  function submitCampaign(event) {
    event.preventDefault();
    clearFieldError(els.campaignTitle, els.campaignTitleError);
    clearFieldError(els.campaignDate, els.campaignDateError);
    clearFieldError(els.campaignTime, els.campaignTimeError);
    clearFieldError(els.campaignVenue, els.campaignVenueError);

    const user = getUser();
    if (!user) {
      const draft = readCampaignDraft();
      closeCampaignForm();
      requireUser("Sign in to publish this campaign.", function () {
        openCampaignForm(draft);
      });
      return;
    }

    const title = els.campaignTitle.value.trim();
    const venue = els.campaignVenue.value.trim();
    const date = els.campaignDate.value;
    const time = els.campaignTime.value;
    let valid = true;

    if (!title) {
      showFieldError(els.campaignTitle, els.campaignTitleError);
      valid = false;
    }
    if (!venue) {
      showFieldError(els.campaignVenue, els.campaignVenueError);
      valid = false;
    }
    if (!date || !time) {
      if (!date) showFieldError(els.campaignDate, els.campaignDateError);
      if (!time) showFieldError(els.campaignTime, els.campaignTimeError);
      valid = false;
    } else {
      const start = new Date(date + "T" + time + ":00");
      if (!Number.isFinite(start.getTime())) {
        showFieldError(els.campaignDate, els.campaignDateError);
        valid = false;
      } else if (start.getTime() < Date.now() - 60000) {
        showFieldError(els.campaignTime, els.campaignTimeError);
        els.campaignTimeError.textContent = "Choose a future date and time.";
        valid = false;
      }
    }
    if (!valid) return;

    const location = state.pendingLocation || getMapCenter();
    const campaign = {
      id: createId("campaign"),
      type: els.campaignType.value,
      title: title,
      organizer: els.campaignOrganizer.value.trim(),
      venue: venue,
      date: date,
      time: time,
      notes: els.campaignNotes.value.trim(),
      lat: location.lat,
      lng: location.lng,
      createdBy: user.id,
      createdByName: els.campaignOrganizer.value.trim() || user.name || "Community member",
      createdAt: new Date().toISOString(),
      isSample: false
    };

    state.campaigns.unshift(campaign);
    const follows = state.follows[user.id] || (state.follows[user.id] = []);
    if (follows.indexOf(campaign.id) === -1) follows.push(campaign.id);
    saveCampaigns();
    saveFollows();
    closeCampaignForm();
    state.campaignFilter = "all";
    state.campaignWhen = "upcoming";
    els.campaignDateFilter.value = "upcoming";
    syncChips(els.campaignFilters, "all");
    state.pendingLocation = null;
    state.locationSource = "map";
    renderAll();
    setTab("campaigns", false);
    focusItem("campaigns", campaign.id);
    toast("Campaign published — you'll get a reminder.");
  }

  function startPick(kind) {
    if (!state.map) state.map = getMap();
    if (!state.map) {
      toast("The map isn't ready yet. Try again in a moment.", "warn");
      return;
    }

    const draft = kind === "request" ? readRequestDraft() : readCampaignDraft();
    state.pick = { kind: kind, draft: draft };
    closeHub({ skipFocus: true });
    if (C.Draw && typeof C.Draw.deactivate === "function") {
      C.Draw.deactivate();
    }
    state.map.once("click", handleMapPick);
    els.pickText.textContent = kind === "request"
      ? "Click the map to pin this request."
      : "Click the map to pin this campaign.";
    els.pickBanner.hidden = false;
    document.body.classList.add("is-picking-location");
    refreshIcons();
    els.pickCancel.focus({ preventScroll: true });
  }

  function handleMapPick(event) {
    if (!state.pick) return;
    const pick = state.pick;
    state.pick = null;
    hidePickBanner();
    document.body.classList.remove("is-picking-location");
    state.pendingLocation = { lat: event.latlng.lat, lng: event.latlng.lng };
    state.locationSource = "picked";
    if (pick.draft) {
      pick.draft.location = state.pendingLocation;
      pick.draft.source = "picked";
    }
    openHub(pick.kind === "request" ? "requests" : "campaigns");
    if (pick.kind === "request") {
      openRequestForm(pick.draft);
    } else {
      openCampaignForm(pick.draft);
    }
    toast("Location picked.");
  }

  function hidePickBanner() {
    if (!els.pickBanner) return;
    els.pickBanner.hidden = true;
    document.body.classList.remove("is-picking-location");
  }

  function cancelPick() {
    if (!state.pick) {
      hidePickBanner();
      return;
    }
    const pick = state.pick;
    state.pick = null;
    if (state.map) state.map.off("click", handleMapPick);
    hidePickBanner();
    openHub(pick.kind === "request" ? "requests" : "campaigns");
    if (pick.kind === "request") {
      openRequestForm(pick.draft);
    } else {
      openCampaignForm(pick.draft);
    }
  }

  function escapeIcs(value) {
    return String(value || "")
      .replace(/\\/g, "\\\\")
      .replace(/;/g, "\\;")
      .replace(/,/g, "\\,")
      .replace(/\r?\n/g, "\\n");
  }

  function icsStamp(date) {
    return date.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
  }

  function downloadCampaignCalendar(campaign) {
    const start = campaignStart(campaign);
    if (!start) return;
    const end = new Date(start.getTime() + 2 * 60 * 60 * 1000);
    const description = (campaign.notes || "") +
      (campaign.createdByName ? (campaign.notes ? "\n" : "") + "Organised by " + campaign.createdByName : "");
    const lines = [
      "BEGIN:VCALENDAR",
      "VERSION:2.0",
      "PRODID:-//CommunityAtlas//Campaigns//EN",
      "BEGIN:VEVENT",
      "UID:" + campaign.id + "@communityatlas.local",
      "DTSTAMP:" + icsStamp(new Date()),
      "DTSTART:" + icsStamp(start),
      "DTEND:" + icsStamp(end),
      "SUMMARY:" + escapeIcs(campaign.title),
      "LOCATION:" + escapeIcs(campaign.venue),
      "DESCRIPTION:" + escapeIcs(description),
      "END:VEVENT",
      "END:VCALENDAR"
    ];
    const blob = new Blob([lines.join("\r\n")], { type: "text/calendar;charset=utf-8" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = "communityatlas-" + campaign.id + ".ics";
    link.click();
    window.setTimeout(function () { URL.revokeObjectURL(link.href); }, 1000);
    toast("Calendar file downloaded.");
  }

  function shareCampaign(campaign) {
    const text = campaign.title + "\n" +
      formatCampaignWhen(campaign) +
      (campaign.venue ? "\n" + campaign.venue : "") +
      (campaign.notes ? "\n" + campaign.notes : "") +
      "\nShared from CommunityAtlas";
    if (navigator.share) {
      navigator.share({ title: campaign.title, text: text }).catch(function () {
        /* The user cancelled the share sheet. */
      });
      return;
    }
    if (navigator.clipboard && typeof navigator.clipboard.writeText === "function") {
      navigator.clipboard.writeText(text).then(function () {
        toast("Campaign details copied — paste them in your class group.");
      }).catch(function () {
        window.prompt("Copy these campaign details:", text);
      });
      return;
    }
    window.prompt("Copy these campaign details:", text);
  }

  function loadSampleRequests() {
    const anchor = getAnchor();
    const samples = [
      {
        type: "streetlight",
        title: "Street light needed at the bus stop",
        place: "Bus stop, Sector 5",
        notes: "The stretch is dark after 7 pm and students walk home from the library.",
        offset: [0.012, 0.014],
        baseSupport: 18,
        ageDays: 2
      },
      {
        type: "wifi",
        title: "Public WiFi for the community library",
        place: "Community library, Main Road",
        notes: "Students need a quiet place to study online without using mobile data.",
        offset: [-0.008, 0.014],
        baseSupport: 11,
        ageDays: 4
      },
      {
        type: "water",
        title: "Drinking water point near the market",
        place: "Market entrance, Gandhi Chowk",
        notes: "A refill point would help shoppers and delivery workers during the day.",
        offset: [0.016, -0.012],
        baseSupport: 24,
        ageDays: 6
      }
    ];

    let added = 0;
    samples.forEach(function (sample) {
      if (state.requests.some(function (request) { return request.title === sample.title; })) return;
      state.requests.push({
        id: createId("request"),
        type: sample.type,
        title: sample.title,
        place: sample.place,
        notes: sample.notes,
        lat: anchor.lat + sample.offset[0],
        lng: anchor.lng + sample.offset[1],
        status: "open",
        supporters: [],
        baseSupport: sample.baseSupport,
        createdBy: "sample",
        createdByName: "Community demo",
        createdAt: new Date(Date.now() - sample.ageDays * 86400000).toISOString(),
        isSample: true
      });
      added += 1;
    });

    if (!added) {
      toast("Sample requests are already on the map.");
      return;
    }
    saveRequests();
    state.requestFilter = "all";
    syncChips(els.requestFilters, "all");
    renderAll();
    setTab("requests", false);
    toast(added + " sample request" + (added === 1 ? "" : "s") + " added.");
  }

  function loadSampleCampaigns() {
    const anchor = getAnchor();
    const samples = [
      {
        type: "blood",
        title: "Blood donation camp",
        venue: "Community Hall, Main Road",
        date: dateOffset(3),
        time: "10:00",
        notes: "Walk-ins welcome. Bring a government ID and have a light meal before donating.",
        offset: [-0.014, -0.010],
        organizer: "NSS Community Cell"
      },
      {
        type: "eye",
        title: "Free eye checkup camp",
        venue: "Primary Health Centre, Sector 4",
        date: dateOffset(6),
        time: "09:30",
        notes: "Free vision screening, eye pressure checks, and spectacles referral for students.",
        offset: [-0.014, 0.005],
        organizer: "Vision Care Foundation"
      },
      {
        type: "clean",
        title: "Neighbourhood cleanliness drive",
        venue: "Lake garden, Gate 2",
        date: dateOffset(9),
        time: "07:30",
        notes: "Gloves and bags will be provided. Bring a reusable water bottle.",
        offset: [0.002, -0.018],
        organizer: "Green Neighbourhood Group"
      }
    ];

    let added = 0;
    samples.forEach(function (sample) {
      if (state.campaigns.some(function (campaign) { return campaign.title === sample.title; })) return;
      state.campaigns.push({
        id: createId("campaign"),
        type: sample.type,
        title: sample.title,
        venue: sample.venue,
        date: sample.date,
        time: sample.time,
        notes: sample.notes,
        lat: anchor.lat + sample.offset[0],
        lng: anchor.lng + sample.offset[1],
        createdBy: "sample",
        createdByName: sample.organizer,
        createdAt: new Date().toISOString(),
        isSample: true
      });
      added += 1;
    });

    if (!added) {
      toast("Sample campaigns are already on the map.");
      return;
    }
    saveCampaigns();
    state.campaignFilter = "all";
    state.campaignWhen = "upcoming";
    els.campaignDateFilter.value = "upcoming";
    syncChips(els.campaignFilters, "all");
    renderAll();
    setTab("campaigns", false);
    toast(added + " sample campaign" + (added === 1 ? "" : "s") + " added.");
  }

  function handleModalKeydown(event) {
    if (event.key !== "Tab") return;
    const focusable = Array.from(els.modal.querySelectorAll(
      'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
    )).filter(function (node) {
      return node.offsetParent !== null && !node.closest("[hidden]");
    });
    if (!focusable.length) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      last.focus();
      event.preventDefault();
    } else if (!event.shiftKey && document.activeElement === last) {
      first.focus();
      event.preventDefault();
    }
  }

  function handleTabKeydown(event) {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
    event.preventDefault();
    const next = state.activeTab === "campaigns" ? "requests" : "campaigns";
    setTab(next, true);
  }

  function handleGlobalKeydown(event) {
    if (event.key !== "Escape") return;
    if (state.pick) {
      event.preventDefault();
      cancelPick();
      return;
    }
    if (!els.modal || els.modal.hidden) return;
    if (els.requestForm && !els.requestForm.hidden) {
      closeRequestForm();
      event.preventDefault();
      return;
    }
    if (els.campaignForm && !els.campaignForm.hidden) {
      closeCampaignForm();
      event.preventDefault();
      return;
    }
    closeHub();
    event.preventDefault();
  }

  function bindEvents() {
    els.requestsBtn.addEventListener("click", function () { openHub("requests"); });
    els.campaignsBtn.addEventListener("click", function () { openHub("campaigns"); });
    els.close.addEventListener("click", function () { closeHub(); });
    els.closeBtn.addEventListener("click", function () { closeHub(); });
    els.modal.addEventListener("click", function (event) {
      if (event.target === els.modal) closeHub();
    });
    els.modal.addEventListener("keydown", handleModalKeydown);

    els.tabRequests.addEventListener("click", function () { setTab("requests", false); });
    els.tabCampaigns.addEventListener("click", function () { setTab("campaigns", false); });
    els.tabRequests.addEventListener("keydown", handleTabKeydown);
    els.tabCampaigns.addEventListener("keydown", handleTabKeydown);

    els.newRequestBtn.addEventListener("click", function () { openRequestForm(); });
    els.newCampaignBtn.addEventListener("click", function () { openCampaignForm(); });
    els.requestCancelBtn.addEventListener("click", closeRequestForm);
    els.campaignCancelBtn.addEventListener("click", closeCampaignForm);

    els.requestForm.addEventListener("submit", submitRequest);
    els.campaignForm.addEventListener("submit", submitCampaign);

    els.requestType.addEventListener("change", updateRequestPlaceholder);
    els.requestTitle.addEventListener("input", function () {
      clearFieldError(els.requestTitle, els.requestTitleError);
    });
    els.campaignTitle.addEventListener("input", function () {
      clearFieldError(els.campaignTitle, els.campaignTitleError);
    });
    els.campaignVenue.addEventListener("input", function () {
      clearFieldError(els.campaignVenue, els.campaignVenueError);
    });
    els.campaignDate.addEventListener("input", function () {
      clearFieldError(els.campaignDate, els.campaignDateError);
    });
    els.campaignTime.addEventListener("input", function () {
      clearFieldError(els.campaignTime, els.campaignTimeError);
      els.campaignTimeError.textContent = "Add a start time.";
    });

    els.requestPickBtn.addEventListener("click", function () { startPick("request"); });
    els.campaignPickBtn.addEventListener("click", function () { startPick("campaign"); });
    els.requestLocateBtn.addEventListener("click", function () { locateForForm("request"); });
    els.campaignLocateBtn.addEventListener("click", function () { locateForForm("campaign"); });

    els.campaignDateFilter.addEventListener("change", function () {
      state.campaignWhen = els.campaignDateFilter.value === "all" ? "all" : "upcoming";
      renderCampaignList();
      refreshIcons();
    });

    els.requestSampleBtn.addEventListener("click", loadSampleRequests);
    els.campaignSampleBtn.addEventListener("click", loadSampleCampaigns);

    els.pickCancel.addEventListener("click", cancelPick);
    document.addEventListener("keydown", handleGlobalKeydown);
    document.addEventListener("atlas:authchange", function () {
      renderAll();
    });
  }

  function boot() {
    if (state.initialized) return;
    if (!document.getElementById("communityHubModal")) return;
    state.initialized = true;
    cacheElements();
    state.map = getMap();
    loadData();
    buildSelects();
    buildFilters();
    bindEvents();
    els.campaignDateFilter.value = state.campaignWhen;
    setTab("requests", false);
    renderAll();
    refreshIcons();
  }

  C.CommunityHub = {
    init: boot,
    open: openHub,
    refresh: renderAll
  };

  document.addEventListener("atlas:ready", boot);

  window.addEventListener("load", function () {
    if (!state.initialized) boot();
  });
})();
