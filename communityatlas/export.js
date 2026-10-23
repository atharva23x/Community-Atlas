(function () {
  "use strict";

  const C = (window.CommunityAtlas = window.CommunityAtlas || {});

  function pad(value) {
    return String(value).padStart(2, "0");
  }

  function dateStamp() {
    const now = new Date();
    return now.getFullYear() + "-" + pad(now.getMonth() + 1) + "-" + pad(now.getDate());
  }

  function liveGeometry(feature) {
    if (C.MapView && typeof C.MapView.getFeatureGeometry === "function") {
      const geometry = C.MapView.getFeatureGeometry(feature);
      if (geometry) {
        return geometry;
      }
    }
    return feature.geometry || null;
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

  function featureLatLng(feature) {
    if (C.MapView && typeof C.MapView.getFeatureLatLng === "function") {
      const latlng = C.MapView.getFeatureLatLng(feature);
      if (latlng) {
        return latlng;
      }
    }
    const coordinate = representativeCoordinate(liveGeometry(feature));
    if (!coordinate) {
      return null;
    }
    return { lat: coordinate[1], lng: coordinate[0] };
  }

  function positionOf(feature) {
    const raw = feature && feature.position;
    if (!raw || typeof raw !== "object") {
      return {
        mode: "unknown",
        label: "Unspecified",
        source: "",
        accuracy: null,
        mock: false,
        timestamp: ""
      };
    }
    return {
      mode: typeof raw.mode === "string" && raw.mode ? raw.mode : "unknown",
      label: typeof raw.label === "string" && raw.label ? raw.label : "Unspecified",
      source: typeof raw.source === "string" ? raw.source : "",
      accuracy: typeof raw.accuracy === "number" && isFinite(raw.accuracy) ? raw.accuracy : null,
      mock: raw.mock === true,
      timestamp: typeof raw.timestamp === "string" ? raw.timestamp : ""
    };
  }

  function accuracyLabel(accuracy) {
    if (C.Position && typeof C.Position.formatAccuracy === "function") {
      return C.Position.formatAccuracy(accuracy);
    }
    return "± —";
  }

  function buildFeatureCollection(features) {
    const collectionFeatures = features
      .map(function (feature) {
        const geometry = liveGeometry(feature);
        if (!geometry) {
          return null;
        }
        const position = positionOf(feature);
        const properties = {
          id: feature.id,
          name: feature.name,
          category: feature.category,
          notes: feature.notes || "",
          createdAt: feature.createdAt || "",
          accuracyMeters: position.accuracy,
          accuracyLabel: accuracyLabel(position.accuracy),
          positionMode: position.mode,
          positionModeLabel: position.label,
          positionSource: position.source,
          positionMock: position.mock,
          positionTimestamp: position.timestamp,
          votes: Number.isFinite(feature.votes) && feature.votes > 0 ? Math.floor(feature.votes) : 0,
          status: typeof feature.status === "string" && feature.status ? feature.status : "open",
          createdBy: feature.createdBy || "",
          createdByName: feature.createdByName || ""
        };
        if (feature.photo) {
          properties.photo = feature.photo;
        }
        return {
          type: "Feature",
          id: feature.id,
          properties: properties,
          geometry: geometry
        };
      })
      .filter(Boolean);

    return {
      type: "FeatureCollection",
      crs: {
        type: "name",
        properties: {
          name: "urn:ogc:def:crs:OGC:1.3:CRS84"
        }
      },
      features: collectionFeatures
    };
  }

  function coordinatePair(coordinate) {
    return coordinate[0] + " " + coordinate[1];
  }

  function ringWkt(ring) {
    return "(" + ring.map(coordinatePair).join(", ") + ")";
  }

  function geometryToWkt(geometry) {
    if (!geometry || !geometry.coordinates) {
      return "";
    }

    const coordinates = geometry.coordinates;

    if (geometry.type === "Point") {
      return "POINT (" + coordinatePair(coordinates) + ")";
    }

    if (geometry.type === "LineString") {
      return "LINESTRING (" + coordinates.map(coordinatePair).join(", ") + ")";
    }

    if (geometry.type === "Polygon") {
      return "POLYGON (" + coordinates.map(ringWkt).join(", ") + ")";
    }

    if (geometry.type === "MultiPoint") {
      return "MULTIPOINT (" + coordinates.map(coordinatePair).join(", ") + ")";
    }

    if (geometry.type === "MultiLineString") {
      return "MULTILINESTRING (" + coordinates.map(function (line) {
        return "(" + line.map(coordinatePair).join(", ") + ")";
      }).join(", ") + ")";
    }

    if (geometry.type === "MultiPolygon") {
      return "MULTIPOLYGON (" + coordinates.map(function (polygon) {
        return "(" + polygon.map(ringWkt).join(", ") + ")";
      }).join(", ") + ")";
    }

    return "";
  }

  function csvEscape(value) {
    if (value === null || typeof value === "undefined") {
      return "";
    }
    const text = String(value);
    if (/[",\r\n]/.test(text)) {
      return '"' + text.replace(/"/g, '""') + '"';
    }
    return text;
  }

  function buildCsv(features) {
    const header = [
      "id",
      "name",
      "category",
      "geometry_type",
      "latitude",
      "longitude",
      "notes",
      "createdAt",
      "geometry_wkt",
      "accuracy_m",
      "position_mode",
      "position_source",
      "position_mock",
      "votes",
      "status",
      "reporter"
    ];

    const rows = features.map(function (feature) {
      const geometry = liveGeometry(feature);
      const latlng = featureLatLng(feature);
      const position = positionOf(feature);
      return [
        feature.id,
        feature.name,
        feature.category,
        geometry ? geometry.type : "",
        latlng ? latlng.lat : "",
        latlng ? latlng.lng : "",
        feature.notes || "",
        feature.createdAt || "",
        geometryToWkt(geometry),
        position.accuracy === null ? "" : position.accuracy,
        position.mode,
        position.source,
        position.mock ? "true" : "false",
        Number.isFinite(feature.votes) && feature.votes > 0 ? Math.floor(feature.votes) : 0,
        feature.status || "open",
        feature.createdByName || ""
      ].map(csvEscape).join(",");
    });

    return "\uFEFF" + [header.join(",")].concat(rows).join("\r\n");
  }

  function download(filename, content, mimeType) {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");

    link.href = url;
    link.download = filename;
    link.rel = "noopener";
    link.style.display = "none";
    document.body.appendChild(link);
    link.click();

    window.setTimeout(function () {
      URL.revokeObjectURL(url);
      link.remove();
    }, 1000);
  }

  function exportGeoJSON(features) {
    if (!features || features.length === 0) {
      return false;
    }
    const collection = buildFeatureCollection(features);
    download(
      "communityatlas-" + dateStamp() + ".geojson",
      JSON.stringify(collection, null, 2),
      "application/geo+json;charset=utf-8"
    );
    return true;
  }

  function exportCsv(features) {
    if (!features || features.length === 0) {
      return false;
    }
    download(
      "communityatlas-" + dateStamp() + ".csv",
      buildCsv(features),
      "text/csv;charset=utf-8"
    );
    return true;
  }

  function openInGeoJsonIo(features) {
    if (!features || features.length === 0) {
      return false;
    }

    const collection = buildFeatureCollection(features);
    collection.features.forEach(function (feature) {
      if (feature.properties) {
        delete feature.properties.photo;
      }
    });
    const dataUri = "data:application/json," + encodeURIComponent(JSON.stringify(collection));
    const url = "https://geojson.io/#data=" + dataUri;
    const link = document.createElement("a");

    link.href = url;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    link.style.display = "none";
    document.body.appendChild(link);
    link.click();
    link.remove();
    return true;
  }

  C.Export = {
    buildFeatureCollection: buildFeatureCollection,
    buildCsv: buildCsv,
    exportGeoJSON: exportGeoJSON,
    exportCsv: exportCsv,
    openInGeoJsonIo: openInGeoJsonIo
  };
})();
