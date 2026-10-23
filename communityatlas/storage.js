(function () {
  "use strict";

  const C = (window.CommunityAtlas = window.CommunityAtlas || {});
  const KEY = "communityatlas.features.v1";
  const SAVED_AT_KEY = "communityatlas.lastSaved.v1";

  function load() {
    try {
      const raw = window.localStorage.getItem(KEY);
      const savedAt = window.localStorage.getItem(SAVED_AT_KEY);
      if (!raw) {
        return { ok: true, features: [], savedAt: savedAt || null };
      }
      const parsed = JSON.parse(raw);
      let features = [];
      if (Array.isArray(parsed)) {
        features = parsed;
      } else if (parsed && Array.isArray(parsed.features)) {
        features = parsed.features;
      }
      return { ok: true, features: features, savedAt: savedAt || null };
    } catch (error) {
      return { ok: false, features: [], savedAt: null };
    }
  }

  function save(features) {
    try {
      const savedAt = new Date().toISOString();
      window.localStorage.setItem(KEY, JSON.stringify(features));
      window.localStorage.setItem(SAVED_AT_KEY, savedAt);
      return { ok: true, savedAt: savedAt };
    } catch (error) {
      return { ok: false, savedAt: null };
    }
  }

  function clear() {
    try {
      window.localStorage.removeItem(KEY);
      window.localStorage.removeItem(SAVED_AT_KEY);
      return true;
    } catch (error) {
      return false;
    }
  }

  C.Storage = {
    KEY: KEY,
    SAVED_AT_KEY: SAVED_AT_KEY,
    load: load,
    save: save,
    clear: clear
  };
})();
