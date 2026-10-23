(function () {
  "use strict";

  const C = (window.CommunityAtlas = window.CommunityAtlas || {});

  const MODES = [
    {
      id: "gnss",
      label: "Standard GNSS",
      meta: "Live device",
      mock: false,
      source: "browser",
      accuracy: null,
      note: "Accuracy comes from your browser's location services."
    },
    {
      id: "rtk-float",
      label: "RTK Float",
      meta: "Mock",
      mock: true,
      source: "mock-rtk",
      accuracy: 0.35,
      note: "Mock RTK — simulated float solution. Not survey-grade."
    },
    {
      id: "rtk-fixed",
      label: "RTK Fixed",
      meta: "Mock",
      mock: true,
      source: "mock-rtk",
      accuracy: 0.02,
      note: "Mock RTK — simulated fixed solution. Not survey-grade."
    },
    {
      id: "simulation",
      label: "Simulation",
      meta: "Simulated",
      mock: true,
      source: "simulation",
      accuracy: 5,
      note: "Simulated position for testing. Every report is labeled SIM."
    }
  ];

  const MODE_MAP = {};
  MODES.forEach(function (mode) {
    MODE_MAP[mode.id] = mode;
  });

  function BrowserGNSSProvider(onFix, onStatus) {
    this.onFix = onFix;
    this.onStatus = onStatus;
    this.watchId = null;
  }

  BrowserGNSSProvider.prototype.start = function () {
    if (this.watchId !== null) {
      return;
    }
    if (!navigator.geolocation) {
      this.onStatus("unavailable", "Geolocation is not available in this browser.");
      return;
    }

    const self = this;
    this.onStatus("locating", "Waiting for a GNSS fix…");
    this.watchId = navigator.geolocation.watchPosition(
      function (position) {
        self.onFix({
          lat: position.coords.latitude,
          lng: position.coords.longitude,
          accuracy: typeof position.coords.accuracy === "number" ? position.coords.accuracy : null,
          mode: "gnss",
          source: "browser",
          mock: false,
          timestamp: new Date(position.timestamp || Date.now()).toISOString()
        });
        self.onStatus("live", "Live device fix");
      },
      function (error) {
        if (error && error.code === 1) {
          self.onStatus("denied", "Location permission denied. GNSS accuracy is unavailable.");
        } else if (error && error.code === 3) {
          self.onStatus("timeout", "GNSS fix timed out. Accuracy will be recorded as unknown.");
        } else {
          self.onStatus("unavailable", "GNSS fix unavailable. Accuracy will be recorded as unknown.");
        }
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 0
      }
    );
  };

  BrowserGNSSProvider.prototype.stop = function () {
    if (this.watchId !== null && navigator.geolocation) {
      navigator.geolocation.clearWatch(this.watchId);
    }
    this.watchId = null;
  };

  function MockProvider(mode, onFix, onStatus) {
    this.mode = mode;
    this.onFix = onFix;
    this.onStatus = onStatus;
    this.timer = null;
  }

  MockProvider.prototype.start = function () {
    const self = this;
    this.onStatus(
      this.mode.id === "simulation" ? "simulated" : "mock",
      this.mode.id === "simulation" ? "Simulation active" : "Mock RTK active"
    );
    this.emit();
    this.timer = window.setInterval(function () {
      self.emit();
    }, 4000);
  };

  MockProvider.prototype.emit = function () {
    this.onFix({
      lat: null,
      lng: null,
      accuracy: this.mode.accuracy,
      mode: this.mode.id,
      source: this.mode.source,
      mock: true,
      timestamp: new Date().toISOString()
    });
  };

  MockProvider.prototype.stop = function () {
    if (this.timer !== null) {
      window.clearInterval(this.timer);
      this.timer = null;
    }
  };

  let provider = null;
  let modeId = MODES[0].id;
  let fix = null;
  let started = false;
  let status = { state: "idle", message: "Position provider idle." };
  const listeners = new Set();

  function notify() {
    listeners.forEach(function (handler) {
      handler();
    });
  }

  function handleFix(nextFix) {
    fix = nextFix;
    notify();
  }

  function handleStatus(state, message) {
    status = { state: state, message: message };
    notify();
  }

  function getMode() {
    return MODE_MAP[modeId] || MODES[0];
  }

  function createProvider(mode) {
    if (mode.id === "gnss") {
      return new BrowserGNSSProvider(handleFix, handleStatus);
    }
    return new MockProvider(mode, handleFix, handleStatus);
  }

  function activate(nextModeId) {
    const mode = MODE_MAP[nextModeId] || MODES[0];

    if (provider) {
      provider.stop();
    }

    modeId = mode.id;
    fix = null;
    status = { state: "idle", message: "Starting position provider…" };
    provider = createProvider(mode);
    provider.start();
    notify();
  }

  function start() {
    if (started) {
      return;
    }
    started = true;
    activate(modeId);
  }

  function setMode(nextModeId) {
    if (!MODE_MAP[nextModeId]) {
      return false;
    }
    if (provider && nextModeId === modeId) {
      return true;
    }
    started = true;
    activate(nextModeId);
    return true;
  }

  function getModeId() {
    return modeId;
  }

  function getSnapshot() {
    const mode = getMode();

    if (fix && fix.mode === mode.id) {
      return {
        lat: typeof fix.lat === "number" ? fix.lat : null,
        lng: typeof fix.lng === "number" ? fix.lng : null,
        accuracy: typeof fix.accuracy === "number" ? fix.accuracy : null,
        mode: mode.id,
        label: mode.label,
        source: fix.source || mode.source,
        mock: mode.mock,
        timestamp: mode.mock ? new Date().toISOString() : fix.timestamp || ""
      };
    }

    return {
      lat: null,
      lng: null,
      accuracy: mode.mock ? mode.accuracy : null,
      mode: mode.id,
      label: mode.label,
      source: mode.source,
      mock: mode.mock,
      timestamp: new Date().toISOString()
    };
  }

  function getStatus() {
    return { state: status.state, message: status.message };
  }

  function subscribe(handler) {
    listeners.add(handler);
    return function () {
      listeners.delete(handler);
    };
  }

  function modeLabel(id) {
    const mode = MODE_MAP[id];
    return mode ? mode.label : "Unspecified";
  }

  function modeNote(id) {
    const mode = MODE_MAP[id];
    return mode ? mode.note : "Accuracy was not recorded for this report.";
  }

  function isMockMode(id) {
    const mode = MODE_MAP[id];
    return mode ? mode.mock : false;
  }

  function formatAccuracy(accuracy) {
    if (typeof accuracy !== "number" || !isFinite(accuracy) || accuracy < 0) {
      return "± —";
    }
    if (accuracy < 1) {
      return "± " + accuracy.toFixed(2) + " m";
    }
    if (accuracy < 10) {
      return "± " + (Math.round(accuracy * 10) / 10) + " m";
    }
    return "± " + Math.round(accuracy) + " m";
  }

  function badgeText(position) {
    const value = position && typeof position.accuracy === "number"
      ? position.accuracy
      : null;
    const base = formatAccuracy(value);

    if (!position || !position.mode || position.mode === "unknown" || value === null) {
      return base;
    }
    if (position.mode === "simulation") {
      return base + " SIM";
    }
    if (position.mock) {
      return base + " MOCK";
    }
    return base;
  }

  function badgeTitle(position) {
    if (!position || !position.mode || position.mode === "unknown") {
      return "Accuracy was not recorded for this report";
    }

    const label = position.label || modeLabel(position.mode);
    if (typeof position.accuracy !== "number") {
      return label + " — accuracy unavailable";
    }

    const mockNote = position.mock ? " (mock — not survey-grade)" : "";
    return label + " accuracy " + formatAccuracy(position.accuracy) + mockNote;
  }

  function isBadgeMock(position) {
    return !!(position && position.mock);
  }

  C.Position = {
    modes: MODES.map(function (mode) {
      return {
        id: mode.id,
        label: mode.label,
        meta: mode.meta,
        mock: mode.mock,
        note: mode.note
      };
    }),
    start: start,
    setMode: setMode,
    getModeId: getModeId,
    getMode: getMode,
    getSnapshot: getSnapshot,
    getStatus: getStatus,
    subscribe: subscribe,
    modeLabel: modeLabel,
    modeNote: modeNote,
    isMockMode: isMockMode,
    formatAccuracy: formatAccuracy,
    badgeText: badgeText,
    badgeTitle: badgeTitle,
    isBadgeMock: isBadgeMock
  };
})();
