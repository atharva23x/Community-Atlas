(function () {
  "use strict";

  const C = (window.CommunityAtlas = window.CommunityAtlas || {});

  const CATEGORIES = [
    { name: "Road", color: "#2563EB", icon: "route" },
    { name: "Park", color: "#16805B", icon: "trees" },
    { name: "Utility", color: "#C77A10", icon: "utility-pole" },
    { name: "Hazard", color: "#D14343", icon: "triangle-alert" },
    { name: "Accessibility", color: "#7C5CC4", icon: "accessibility" },
    { name: "Other", color: "#5D6B7D", icon: "map-pin" }
  ];

  const CATEGORY_MAP = {};
  CATEGORIES.forEach(function (category) {
    CATEGORY_MAP[category.name] = category;
  });

  C.categories = CATEGORIES;
  C.categoryMap = CATEGORY_MAP;
  C.getCategory = function (name) {
    return CATEGORY_MAP[name] || CATEGORY_MAP.Other;
  };

  const FALLBACK_CENTER = [28.6139, 77.2090];
  const FALLBACK_ZOOM = 12;

  const ESRI_ATTRIBUTION = 'Tiles &copy; <a href="https://www.esri.com/" target="_blank" rel="noopener">Esri</a>';
  const ESRI_IMAGERY_ATTRIBUTION = ESRI_ATTRIBUTION + ", Maxar, Earthstar Geographics";
  const OSM_ATTRIBUTION = '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> contributors';

  const BASEMAPS = [
    {
      id: "streets",
      label: "Streets",
      description: "Streets and local roads",
      url: "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
      attribution: OSM_ATTRIBUTION,
      maxNativeZoom: 19
    },
    {
      id: "satellite",
      label: "Satellite",
      description: "Aerial and satellite imagery",
      url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
      attribution: ESRI_IMAGERY_ATTRIBUTION,
      maxNativeZoom: 19
    },
    {
      id: "hybrid",
      label: "Hybrid",
      description: "Imagery with street labels",
      layers: [
        {
          url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
          attribution: ESRI_IMAGERY_ATTRIBUTION + ", labels &copy; Esri"
        },
        {
          url: "https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Transportation/MapServer/tile/{z}/{y}/{x}",
          opacity: 0.95
        },
        {
          url: "https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}",
          opacity: 0.95
        }
      ],
      maxNativeZoom: 19
    },
    {
      id: "topo",
      label: "Terrain",
      description: "Topographic contours",
      url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Topo_Map/MapServer/tile/{z}/{y}/{x}",
      attribution: ESRI_ATTRIBUTION,
      maxNativeZoom: 19
    },
    {
      id: "light",
      label: "Light",
      description: "Clean canvas for overlays",
      url: "https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Base/MapServer/tile/{z}/{y}/{x}",
      attribution: ESRI_ATTRIBUTION,
      maxNativeZoom: 16
    },
    {
      id: "dark",
      label: "Dark",
      description: "Dim canvas for markers",
      url: "https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}",
      attribution: ESRI_ATTRIBUTION,
      maxNativeZoom: 16
    }
  ];

  const DEFAULT_BASEMAP = "streets";
  const BASEMAP_MAP = {};
  BASEMAPS.forEach(function (basemap) {
    BASEMAP_MAP[basemap.id] = basemap;
  });

  let map = null;
  let userLocation = null;
  let userMarker = null;
  let userAccuracyCircle = null;
  let searchMarker = null;
  let previewLayer = null;
  let previewGeometry = null;
  let basemapLayers = [];
  let activeBasemapId = null;
  let basemapWarningCallback = null;
  const featureLayers = new Map();
  let tileErrorTimes = [];
  let tileWarningShown = false;

  function init(containerId, options) {
    const settings = options || {};
    basemapWarningCallback = settings.onTileWarning;

    map = L.map(containerId, {
      zoomControl: false,
      attributionControl: true,
      minZoom: 2,
      maxZoom: 19,
      worldCopyJump: true
    });

    map.setView(FALLBACK_CENTER, FALLBACK_ZOOM);
    if (map.attributionControl && typeof map.attributionControl.setPrefix === "function") {
      map.attributionControl.setPrefix(false);
    }
    applyBasemap(settings.basemap);

    const zoomControl = L.control.zoom({
      position: "bottomright",
      zoomInTitle: "Zoom in",
      zoomOutTitle: "Zoom out"
    }).addTo(map);

    L.control.scale({
      position: "bottomleft",
      metric: true,
      imperial: false,
      maxWidth: 120
    }).addTo(map);

    arrangeMapControls(zoomControl);

    return map;
  }

  function arrangeMapControls(zoomControl) {
    if (!map.attributionControl) {
      return;
    }
    const attributionContainer = map.attributionControl.getContainer();
    const zoomContainer = zoomControl.getContainer();
    if (!attributionContainer || !zoomContainer) {
      return;
    }
    if (zoomContainer.parentNode === attributionContainer.parentNode) {
      attributionContainer.parentNode.insertBefore(zoomContainer, attributionContainer);
    }
  }

  function applyBasemap(id) {
    if (!map) {
      return null;
    }

    const config = BASEMAP_MAP[id] || BASEMAP_MAP[DEFAULT_BASEMAP];
    if (!config) {
      return null;
    }
    if (
      activeBasemapId === config.id &&
      basemapLayers.length &&
      basemapLayers.every(function (layer) {
        return map.hasLayer(layer);
      })
    ) {
      return activeBasemapId;
    }

    basemapLayers.forEach(function (layer) {
      if (map.hasLayer(layer)) {
        map.removeLayer(layer);
      }
    });
    basemapLayers = [];

    const configs = config.layers || [config];
    basemapLayers = configs.map(function (layerConfig, index) {
      const layer = L.tileLayer(layerConfig.url, {
        minZoom: 1,
        maxZoom: 19,
        maxNativeZoom: layerConfig.maxNativeZoom || config.maxNativeZoom,
        attribution: layerConfig.attribution || config.attribution || "",
        opacity: typeof layerConfig.opacity === "number" ? layerConfig.opacity : 1,
        zIndex: index + 1,
        keepBuffer: 4,
        updateWhenIdle: false
      });

      bindLayerErrors(layer, basemapWarningCallback);
      layer.addTo(map);
      return layer;
    });
    activeBasemapId = config.id;
    return activeBasemapId;
  }

  function bindLayerErrors(tileLayer, onWarning) {
    tileLayer.on("tileerror", function () {
      registerTileFailure(onWarning);
    });
  }

  function notifyTileWarning(onWarning) {
    if (tileWarningShown) {
      return;
    }
    tileWarningShown = true;
    if (typeof onWarning === "function") {
      onWarning();
    }
  }

  function registerTileFailure(onWarning) {
    const now = Date.now();
    tileErrorTimes.push(now);
    tileErrorTimes = tileErrorTimes.filter(function (time) {
      return now - time <= 10000;
    });

    if (tileErrorTimes.length > 3) {
      tileErrorTimes = [];
      notifyTileWarning(onWarning);
    }
  }



  function pointStyle(category) {
    return {
      radius: 8,
      color: category.color,
      weight: 3,
      opacity: 1,
      fillColor: "#FFFFFF",
      fillOpacity: 1
    };
  }

  function pathStyle(category, isArea) {
    return {
      color: category.color,
      weight: 4,
      opacity: 0.95,
      fillColor: category.color,
      fillOpacity: isArea ? 0.18 : 0,
      lineCap: "round",
      lineJoin: "round"
    };
  }

  function styleForCategory(category, geometryType) {
    if (geometryType === "Point" || geometryType === "MultiPoint") {
      return pointStyle(category);
    }
    return pathStyle(category, geometryType === "Polygon" || geometryType === "MultiPolygon");
  }

  function addFeature(feature) {
    if (!map || !feature || !feature.geometry) {
      return false;
    }

    const category = C.getCategory(feature.category);
    const geometryType = feature.geometry.type;
    const geoJsonFeature = {
      type: "Feature",
      properties: {
        id: feature.id,
        name: feature.name,
        category: category.name
      },
      geometry: feature.geometry
    };

    try {
      const layer = L.geoJSON(geoJsonFeature, {
        pointToLayer: function (item, latlng) {
          return L.circleMarker(latlng, pointStyle(category));
        },
        style: function () {
          return styleForCategory(category, geometryType);
        },
        onEachFeature: function (item, featureLayer) {
          bindFeatureTooltip(featureLayer, feature, category);
          featureLayer.on("click", function () {
            C.bus.emit("feature:select", { id: feature.id });
          });
        }
      });

      layer.addTo(map);
      featureLayers.set(feature.id, { feature: feature, layer: layer });
      return true;
    } catch (error) {
      return false;
    }
  }

  function bindFeatureTooltip(featureLayer, feature, category) {
    const content = document.createElement("div");
    content.className = "map-tooltip";

    const title = document.createElement("strong");
    title.textContent = feature.name;

    const meta = document.createElement("span");
    meta.textContent = category.name;

    content.appendChild(title);
    content.appendChild(meta);

    if (C.Position && typeof C.Position.badgeText === "function") {
      const accuracy = document.createElement("span");
      accuracy.className = "map-tooltip-accuracy";
      accuracy.textContent = "Accuracy " + C.Position.badgeText(feature.position);
      if (feature.position && feature.position.mock) {
        accuracy.classList.add("is-mock");
      }
      content.appendChild(accuracy);
    }

    const commentCount = Array.isArray(feature.comments) ? feature.comments.length : 0;
    if (commentCount > 0) {
      const comments = document.createElement("span");
      comments.className = "map-tooltip-comments";
      comments.textContent = commentCount + (commentCount === 1 ? " comment" : " comments");
      content.appendChild(comments);
    }

    featureLayer.bindTooltip(content, {
      direction: "top",
      sticky: true,
      opacity: 0.96,
      offset: [0, -4]
    });
  }

  function removeFeature(id) {
    const entry = featureLayers.get(id);
    if (!entry) {
      return;
    }
    if (map && map.hasLayer(entry.layer)) {
      map.removeLayer(entry.layer);
    }
    featureLayers.delete(id);
  }

  function normalizeFeature(geoJson) {
    if (!geoJson) {
      return null;
    }
    if (geoJson.type === "Feature") {
      return geoJson;
    }
    if (geoJson.type === "FeatureCollection" && geoJson.features && geoJson.features.length) {
      return geoJson.features[0];
    }
    if (geoJson.type && geoJson.coordinates) {
      return { type: "Feature", properties: {}, geometry: geoJson };
    }
    return null;
  }

  function getFeatureGeometry(featureOrId) {
    const id = typeof featureOrId === "string" ? featureOrId : featureOrId && featureOrId.id;
    const entry = featureLayers.get(id);

    if (entry) {
      try {
        const liveFeature = normalizeFeature(entry.layer.toGeoJSON(false));
        if (liveFeature && liveFeature.geometry) {
          return liveFeature.geometry;
        }
      } catch (error) {
        if (entry.feature && entry.feature.geometry) {
          return entry.feature.geometry;
        }
      }
    }

    if (featureOrId && typeof featureOrId === "object" && featureOrId.geometry) {
      return featureOrId.geometry;
    }
    return null;
  }

  function representativeCoordinate(geometry) {
    if (!geometry || !geometry.coordinates) {
      return null;
    }

    const coordinates = geometry.coordinates;

    if (geometry.type === "Point") {
      return coordinates;
    }

    if (geometry.type === "MultiPoint") {
      return coordinates[0] || null;
    }

    if (geometry.type === "LineString") {
      return coordinates[Math.floor(coordinates.length / 2)] || coordinates[0] || null;
    }

    if (geometry.type === "MultiLineString") {
      const line = coordinates[0] || [];
      return line[Math.floor(line.length / 2)] || line[0] || null;
    }

    if (geometry.type === "Polygon") {
      return averageRing(coordinates[0]);
    }

    if (geometry.type === "MultiPolygon") {
      return averageRing(coordinates[0] && coordinates[0][0]);
    }

    return null;
  }

  function averageRing(ring) {
    if (!Array.isArray(ring) || ring.length === 0) {
      return null;
    }

    let points = ring;
    if (
      ring.length > 1 &&
      ring[0][0] === ring[ring.length - 1][0] &&
      ring[0][1] === ring[ring.length - 1][1]
    ) {
      points = ring.slice(0, -1);
    }

    let lng = 0;
    let lat = 0;
    points.forEach(function (point) {
      lng += point[0];
      lat += point[1];
    });

    return [lng / points.length, lat / points.length];
  }

  function isValidLatLng(lat, lng) {
    return typeof lat === "number" &&
      typeof lng === "number" &&
      isFinite(lat) &&
      isFinite(lng) &&
      lat >= -90 &&
      lat <= 90 &&
      lng >= -180 &&
      lng <= 180;
  }

  function coordinateToLatLng(coordinate) {
    if (!Array.isArray(coordinate) || coordinate.length < 2) {
      return null;
    }
    const lng = Number(coordinate[0]);
    const lat = Number(coordinate[1]);
    if (!isValidLatLng(lat, lng)) {
      return null;
    }
    return { lat: lat, lng: lng };
  }

  function getFeatureLatLng(feature) {
    if (!feature) {
      return null;
    }
    const geometry = getFeatureGeometry(feature);
    return coordinateToLatLng(representativeCoordinate(geometry));
  }

  function getGeometryLatLng(geometry) {
    return coordinateToLatLng(representativeCoordinate(geometry));
  }

  function pulseAt(latlng, color) {
    if (!map) {
      return;
    }
    const pulseMarker = L.marker(latlng, {
      interactive: false,
      keyboard: false,
      zIndexOffset: 1000,
      icon: L.divIcon({
        className: "map-pulse-wrap",
        html: '<span class="map-pulse" style="--pulse-color:' + color + '"></span>',
        iconSize: [36, 36],
        iconAnchor: [18, 18]
      })
    }).addTo(map);

    window.setTimeout(function () {
      if (map.hasLayer(pulseMarker)) {
        map.removeLayer(pulseMarker);
      }
    }, 1650);
  }

  function focusFeature(feature) {
    if (!map || !feature) {
      return;
    }

    const entry = featureLayers.get(feature.id);
    const geometry = getFeatureGeometry(feature);
    const latlng = getFeatureLatLng(feature);

    if (!latlng) {
      return;
    }

    if (geometry && geometry.type !== "Point" && entry && entry.layer.getBounds) {
      const bounds = entry.layer.getBounds();
      if (bounds && bounds.isValid()) {
        map.flyToBounds(bounds, {
          padding: [54, 54],
          maxZoom: 17,
          duration: 0.9
        });
      } else {
        map.flyTo(latlng, Math.max(map.getZoom(), 16), { duration: 0.9 });
      }
    } else {
      map.flyTo(latlng, Math.max(map.getZoom(), 16), { duration: 0.9 });
    }

    pulseAt(latlng, C.getCategory(feature.category).color);

    if (entry && entry.layer.setStyle) {
      entry.layer.setStyle({ weight: 6, opacity: 1 });
      window.setTimeout(function () {
        if (featureLayers.has(feature.id)) {
          entry.layer.resetStyle();
        }
      }, 1400);
    }
  }

  function previewStyle(category, geometryType) {
    if (geometryType === "Point" || geometryType === "MultiPoint") {
      return {
        radius: 9,
        color: category.color,
        weight: 3,
        opacity: 1,
        fillColor: "#FFFFFF",
        fillOpacity: 1,
        dashArray: "4 4"
      };
    }
    return {
      color: category.color,
      weight: 3,
      opacity: 0.9,
      fillColor: category.color,
      fillOpacity: geometryType === "Polygon" ? 0.14 : 0,
      dashArray: "7 6",
      lineCap: "round",
      lineJoin: "round"
    };
  }

  function showPreview(geometry, categoryName) {
    clearPreview();
    if (!map || !geometry) {
      return;
    }

    previewGeometry = geometry;
    const category = C.getCategory(categoryName);

    try {
      previewLayer = L.geoJSON(
        { type: "Feature", properties: { preview: true }, geometry: geometry },
        {
          interactive: false,
          pointToLayer: function (item, latlng) {
            return L.circleMarker(latlng, previewStyle(category, geometry.type));
          },
          style: function () {
            return previewStyle(category, geometry.type);
          }
        }
      ).addTo(map);
    } catch (error) {
      previewLayer = null;
    }
  }

  function setPreviewCategory(categoryName) {
    if (!previewLayer || !previewGeometry) {
      return;
    }
    const category = C.getCategory(categoryName);
    previewLayer.setStyle(function () {
      return previewStyle(category, previewGeometry.type);
    });
  }

  function clearPreview() {
    if (previewLayer && map && map.hasLayer(previewLayer)) {
      map.removeLayer(previewLayer);
    }
    previewLayer = null;
    previewGeometry = null;
  }

  function getAnchorLatLng() {
    if (userLocation) {
      return { lat: userLocation.lat, lng: userLocation.lng };
    }
    if (map) {
      const center = map.getCenter();
      return { lat: center.lat, lng: center.lng };
    }
    return { lat: FALLBACK_CENTER[0], lng: FALLBACK_CENTER[1] };
  }

  function centerOn(lat, lng, zoom, animate) {
    if (!map || !isValidLatLng(lat, lng)) {
      return;
    }
    const targetZoom = typeof zoom === "number" ? zoom : map.getZoom();
    if (animate) {
      map.flyTo([lat, lng], targetZoom, { duration: 0.9 });
    } else {
      map.setView([lat, lng], targetZoom);
    }
  }

  function clearSearchResult() {
    if (searchMarker && map && map.hasLayer(searchMarker)) {
      map.removeLayer(searchMarker);
    }
    searchMarker = null;
  }

  function showSearchResult(result) {
    if (!map || !result || !isValidLatLng(result.lat, result.lng)) {
      return;
    }

    clearSearchResult();

    const icon = L.divIcon({
      className: "search-pin-wrap",
      html: '<svg class="search-pin" viewBox="0 0 32 42" aria-hidden="true" focusable="false"><path d="M16 1C7.7 1 1 7.7 1 16c0 11 15 25 15 25s15-14 15-25C31 7.7 24.3 1 16 1z" fill="#1358C7" stroke="#FFFFFF" stroke-width="2"/><circle cx="16" cy="16" r="5.5" fill="#FFFFFF"/></svg>',
      iconSize: [32, 42],
      iconAnchor: [16, 42]
    });

    searchMarker = L.marker([result.lat, result.lng], {
      icon: icon,
      interactive: false,
      keyboard: false,
      zIndexOffset: 800
    }).addTo(map);

    const bounds = result.bounds;
    if (bounds) {
      const south = Math.min(bounds.south, bounds.north);
      const north = Math.max(bounds.south, bounds.north);
      const west = Math.min(bounds.west, bounds.east);
      const east = Math.max(bounds.west, bounds.east);
      if (north !== south && east !== west) {
        const mobile = window.matchMedia("(max-width: 767px)").matches;
        map.fitBounds([[south, west], [north, east]], {
          maxZoom: 17,
          animate: true,
          paddingTopLeft: mobile ? [20, 104] : [28, 68],
          paddingBottomRight: mobile ? [20, 60] : [28, 44]
        });
        return;
      }
    }

    map.setView([result.lat, result.lng], 17, { animate: true });
  }

  function setUserLocation(lat, lng, accuracy) {
    if (!map || !isValidLatLng(lat, lng)) {
      return;
    }

    userLocation = { lat: lat, lng: lng };

    if (userMarker && map.hasLayer(userMarker)) {
      map.removeLayer(userMarker);
    }
    if (userAccuracyCircle && map.hasLayer(userAccuracyCircle)) {
      map.removeLayer(userAccuracyCircle);
    }

    if (typeof accuracy === "number" && isFinite(accuracy) && accuracy > 0) {
      userAccuracyCircle = L.circle([lat, lng], {
        radius: accuracy,
        color: "#1358C7",
        weight: 1,
        opacity: 0.5,
        fillColor: "#14B8A6",
        fillOpacity: 0.08,
        interactive: false
      }).addTo(map);
    }

    userMarker = L.circleMarker([lat, lng], {
      radius: 7,
      color: "#FFFFFF",
      weight: 2,
      opacity: 1,
      fillColor: "#1358C7",
      fillOpacity: 1,
      interactive: false
    }).addTo(map);
  }

  function locate(onLocated) {
    if (!map || !navigator.geolocation) {
      return;
    }

    navigator.geolocation.getCurrentPosition(
      function (position) {
        userLocation = {
          lat: position.coords.latitude,
          lng: position.coords.longitude
        };
        map.setView([userLocation.lat, userLocation.lng], 15);
        if (typeof onLocated === "function") {
          onLocated(userLocation);
        }
      },
      function () {
        userLocation = null;
      },
      {
        enableHighAccuracy: true,
        timeout: 5000,
        maximumAge: 0
      }
    );
  }

  const listeners = new Map();

  C.bus = {
    on: function (eventName, handler) {
      if (!listeners.has(eventName)) {
        listeners.set(eventName, new Set());
      }
      listeners.get(eventName).add(handler);
      return function () {
        listeners.get(eventName).delete(handler);
      };
    },
    emit: function (eventName, payload) {
      const handlers = listeners.get(eventName);
      if (!handlers) {
        return;
      }
      handlers.forEach(function (handler) {
        handler(payload);
      });
    }
  };

  C.MapView = {
    init: init,
    getMap: function () {
      return map;
    },
    basemaps: BASEMAPS.map(function (basemap) {
      return {
        id: basemap.id,
        label: basemap.label,
        description: basemap.description
      };
    }),
    setBasemap: applyBasemap,
    getBasemap: function () {
      return activeBasemapId;
    },
    addFeature: addFeature,
    removeFeature: removeFeature,
    getFeatureGeometry: getFeatureGeometry,
    getFeatureLatLng: getFeatureLatLng,
    getGeometryLatLng: getGeometryLatLng,
    focusFeature: focusFeature,
    showPreview: showPreview,
    setPreviewCategory: setPreviewCategory,
    clearPreview: clearPreview,
    getAnchorLatLng: getAnchorLatLng,
    centerOn: centerOn,
    setUserLocation: setUserLocation,
    showSearchResult: showSearchResult,
    clearSearchResult: clearSearchResult,
    locate: locate
  };
})();
