(function () {
  "use strict";

  const C = (window.CommunityAtlas = window.CommunityAtlas || {});

  const TOOL_SHAPES = {
    point: "Marker",
    line: "Line",
    area: "Polygon"
  };

  const SHAPE_TO_TOOL = {
    Marker: "point",
    Line: "line",
    Polygon: "area"
  };

  let map = null;
  let activeTool = null;
  let paused = false;
  let callbacks = {};
  let lastPointerLatLng = null;
  let lastPointerAt = 0;

  function notify() {
    if (typeof callbacks.onChange === "function") {
      callbacks.onChange(activeTool);
    }
  }

  function disableDraw() {
    if (!map || !map.pm) {
      return;
    }
    try {
      map.pm.disableDraw();
    } catch (error) {
      return;
    }
  }

  function drawOptions() {
    return {
      snappable: false,
      allowSelfIntersection: true,
      finishOn: "dblclick",
      templineStyle: {
        color: "#0F766E",
        weight: 3,
        dashArray: "6 6"
      },
      hintlineStyle: {
        color: "#0F766E",
        weight: 2,
        dashArray: "6 6"
      },
      pathOptions: {
        color: "#0F766E",
        weight: 3,
        fillColor: "#0F766E",
        fillOpacity: 0.12
      }
    };
  }

  function recordPointer(event) {
    if (!map || !activeTool || paused || !event) {
      return;
    }
    if (typeof event.button === "number" && event.button !== 0) {
      return;
    }
    const latlng = map.mouseEventToLatLng(event);
    if (
      !latlng ||
      typeof latlng.lat !== "number" ||
      typeof latlng.lng !== "number" ||
      !isFinite(latlng.lat) ||
      !isFinite(latlng.lng) ||
      latlng.lat < -90 ||
      latlng.lat > 90 ||
      latlng.lng < -180 ||
      latlng.lng > 180
    ) {
      return;
    }
    lastPointerLatLng = { lat: latlng.lat, lng: latlng.lng };
    lastPointerAt = Date.now();
  }

  function startDrawing(tool) {
    const shape = TOOL_SHAPES[tool];
    if (!map || !map.pm || !shape) {
      return false;
    }

    disableDraw();
    activeTool = tool;
    paused = false;
    lastPointerLatLng = null;
    lastPointerAt = 0;

    try {
      map.pm.enableDraw(shape, drawOptions());
    } catch (error) {
      activeTool = null;
      return false;
    }

    notify();
    return true;
  }

  function handleCreate(event) {
    if (paused || !event || !event.layer) {
      return;
    }

    const tool = SHAPE_TO_TOOL[event.shape];
    paused = true;
    disableDraw();

    if (!tool) {
      if (map.hasLayer(event.layer)) {
        map.removeLayer(event.layer);
      }
      activeTool = null;
      notify();
      return;
    }

    let geometry = null;
    if (
      tool === "point" &&
      lastPointerLatLng &&
      Date.now() - lastPointerAt <= 3000
    ) {
      geometry = {
        type: "Point",
        coordinates: [lastPointerLatLng.lng, lastPointerLatLng.lat]
      };
    } else {
      try {
        const geoJson = event.layer.toGeoJSON(false);
        geometry = geoJson && geoJson.geometry;
      } catch (error) {
        geometry = null;
      }
    }
    lastPointerLatLng = null;
    lastPointerAt = 0;

    if (map.hasLayer(event.layer)) {
      map.removeLayer(event.layer);
    }

    if (!geometry) {
      activeTool = null;
      paused = false;
      notify();
      if (typeof callbacks.onError === "function") {
        callbacks.onError();
      }
      return;
    }

    if (typeof callbacks.onComplete === "function") {
      callbacks.onComplete({ tool: tool, geometry: geometry });
    }
  }

  function init(options) {
    callbacks = options || {};
    map = C.MapView.getMap();

    if (!map || !map.pm) {
      activeTool = null;
      return api;
    }

    map.on("pm:create", handleCreate);
    const container = map.getContainer();
    if (container) {
      container.addEventListener("pointerdown", recordPointer, true);
      container.addEventListener("pointerup", recordPointer, true);
    }
    return api;
  }

  function activate(tool) {
    if (!TOOL_SHAPES[tool]) {
      return false;
    }

    if (activeTool === tool && !paused) {
      deactivate();
      return false;
    }

    return startDrawing(tool);
  }

  function resume() {
    if (!activeTool) {
      return false;
    }

    paused = false;
    if (!map || !map.pm) {
      notify();
      return false;
    }

    disableDraw();
    try {
      map.pm.enableDraw(TOOL_SHAPES[activeTool], drawOptions());
    } catch (error) {
      return false;
    }
    notify();
    return true;
  }

  function deactivate() {
    disableDraw();
    const hadTool = activeTool !== null;
    activeTool = null;
    paused = false;
    if (hadTool) {
      notify();
    }
  }

  function pause() {
    if (activeTool && !paused) {
      disableDraw();
      paused = true;
    }
    return paused;
  }

  function cancelActive() {
    if (!activeTool || paused) {
      return false;
    }
    deactivate();
    return true;
  }

  const api = {
    init: init,
    activate: activate,
    resume: resume,
    deactivate: deactivate,
    pause: pause,
    cancelActive: cancelActive,
    isDrawing: function () {
      return activeTool !== null && !paused;
    },
    getActiveTool: function () {
      return activeTool;
    }
  };

  C.Draw = api;
})();
