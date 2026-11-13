import maplibregl from "maplibre-gl";

const LAGOS = { center: [3.3792, 6.5244], zoom: 11.2, bearing: -12, pitch: 58 };

export function createHoloMap() {
  const map = new maplibregl.Map({
    container: "map",
    style: "https://tiles.openfreemap.org/styles/liberty",
    center: LAGOS.center,
    zoom: LAGOS.zoom,
    bearing: LAGOS.bearing,
    pitch: LAGOS.pitch,
    maxPitch: 85,
    attributionControl: true,
    cooperativeGestures: true
  });

  map.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), "bottom-right");
  map.addControl(new maplibregl.ScaleControl({ maxWidth: 100, unit: "metric" }), "bottom-left");

  map.on("load", () => {
    const style = map.getStyle();
    const buildingLayer = style.layers?.find((layer) => layer["source-layer"] === "building" && layer.type === "fill");
    if (buildingLayer && !map.getLayer("holodesk-3d-buildings")) {
      map.addLayer({
        id: "holodesk-3d-buildings",
        source: buildingLayer.source,
        "source-layer": buildingLayer["source-layer"],
        type: "fill-extrusion",
        minzoom: 13,
        filter: ["all", ["==", ["geometry-type"], "Polygon"]],
        paint: {
          "fill-extrusion-color": "#16b9d5",
          "fill-extrusion-height": ["coalesce", ["get", "render_height"], 8],
          "fill-extrusion-base": ["coalesce", ["get", "render_min_height"], 0],
          "fill-extrusion-opacity": 0.48,
          "fill-extrusion-vertical-gradient": true
        }
      });
    }
  });

  map.on("move", () => {
    const center = map.getCenter();
    const lat = Math.abs(center.lat).toFixed(4) + "° " + (center.lat >= 0 ? "N" : "S");
    const lng = Math.abs(center.lng).toFixed(4) + "° " + (center.lng >= 0 ? "E" : "W");
    const coordinateNode = document.getElementById("coordinates");
    if (coordinateNode) coordinateNode.textContent = lat + ", " + lng;
  });

  map.on("click", (event) => {
    const { lng, lat } = event.lngLat;
    const popup = new maplibregl.Popup({ closeButton: true, maxWidth: "240px" })
      .setLngLat(event.lngLat)
      .setHTML(`<div class="map-popup"><b>LOCATION SELECTED</b><span>${lat.toFixed(5)}°, ${lng.toFixed(5)}°</span></div>`)
      .addTo(map);
    window.dispatchEvent(new CustomEvent("holodesk:location", { detail: { lng, lat } }));
    return popup;
  });

  return {
    map,
    reset() { map.flyTo({ center: LAGOS.center, zoom: LAGOS.zoom, bearing: LAGOS.bearing, pitch: LAGOS.pitch, duration: 1300 }); },
    rotate(delta) { map.rotateTo(map.getBearing() + delta, { duration: 0 }); },
    zoom(delta) { map.setZoom(Math.max(2, Math.min(19, map.getZoom() + delta))); },
    selectAt(normalizedX, normalizedY) {
      const rect = map.getContainer().getBoundingClientRect();
      const point = new maplibregl.Point(
        Math.max(0, Math.min(rect.width, normalizedX * rect.width)),
        Math.max(0, Math.min(rect.height, normalizedY * rect.height))
      );
      map.fire("click", { point, lngLat: map.unproject(point) });
    },
    flyTo(center, zoom = 14) { map.flyTo({ center, zoom, pitch: 58, duration: 1800 }); },
    toggleBuildings(visible) {
      if (map.getLayer("holodesk-3d-buildings")) map.setLayoutProperty("holodesk-3d-buildings", "visibility", visible ? "visible" : "none");
    },
    toggleLabels(visible) {
      for (const layer of map.getStyle().layers || []) {
        if (layer.type === "symbol" && map.getLayer(layer.id)) map.setLayoutProperty(layer.id, "visibility", visible ? "visible" : "none");
      }
    }
  };
}

export async function searchPlace(query) {
  const url = "https://photon.komoot.io/api/?limit=5&q=" + encodeURIComponent(query);
  const response = await fetch(url);
  if (!response.ok) throw new Error("Location search is temporarily unavailable.");
  const data = await response.json();
  return (data.features || []).map((feature) => ({
    name: feature.properties.name || feature.properties.city || query,
    place: [feature.properties.city, feature.properties.state, feature.properties.country].filter(Boolean).join(", "),
    center: feature.geometry.coordinates
  }));
}