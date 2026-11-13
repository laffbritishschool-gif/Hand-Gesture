import "maplibre-gl/dist/maplibre-gl.css";
import { createHoloMap, searchPlace } from "./map.js";
import { HandTracking } from "./handTracking.js";
import { createHologram } from "./hologram.js";

const $ = (id) => document.getElementById(id);
const mapController = createHoloMap();
// Keep the map and camera controls working even if a device cannot create
// the optional Three.js hologram WebGL layer.
let hologram;
try {
  hologram = createHologram($("hologram-layer"));
} catch (error) {
  console.warn("Holographic effects are unavailable on this device:", error);
  hologram = { setVisible() {}, destroy() {} };
  $("hologram-layer").style.display = "none";
}
let tracker = null;
let toastTimer = null;

function setGestureLabel(label, feedback = label) {
  $("gesture-state").textContent = label;
  $("gesture-feedback").textContent = feedback;
}

function showToast(message) {
  const toast = $("selection-toast");
  toast.textContent = message;
  toast.classList.add("visible");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove("visible"), 3200);
}

$("camera-button").addEventListener("click", async () => {
  if (tracker) {
    tracker.stop();
    tracker = null;
    $("camera-button").textContent = "START CAMERA";
    $("camera-state").textContent = "Camera offline";
    $("camera-placeholder").classList.remove("hidden");
    $("camera-live").classList.remove("visible");
    setGestureLabel("Waiting for activation", "Awaiting hands");
    return;
  }

  $("camera-button").disabled = true;
  $("camera-button").textContent = "STARTING…";
  tracker = new HandTracking({
    video: $("webcam"),
    onStatus: (message) => {
      $("camera-state").textContent = message;
      if (message === "Camera online") {
        $("camera-placeholder").classList.add("hidden");
        $("camera-live").classList.add("visible");
        $("camera-button").textContent = "STOP CAMERA";
        setGestureLabel("Loading hand tracking", "Camera preview is live");
      }
    },
    onTrackingStatus: (message) => {
      $("gesture-state").textContent = message;
      $("gesture-feedback").textContent = message;
    },
    onGesture: (gesture) => {
      switch (gesture.type) {
        case "pinch": mapController.zoom(gesture.delta); setGestureLabel("Pinch detected", "Zooming map"); break;
        case "pinch-start": setGestureLabel("Pinch detected", "Adjust finger distance to zoom"); break;
        case "rotate": mapController.rotate(gesture.delta); setGestureLabel("Open palm detected", "Rotating map"); break;
        case "open-palm": setGestureLabel("Open palm detected", "Move hand left or right"); break;
        case "point": mapController.selectAt(gesture.x, gesture.y); setGestureLabel("Point detected", "Selecting location"); break;
        case "none": setGestureLabel("No hand detected", "Show your hand to the camera"); break;
        case "hand": setGestureLabel("Hand detected", "Try an open palm, pinch or point"); break;
      }
    }
  });

  try {
    await tracker.start();
  } catch (error) {
    tracker?.stop();
    tracker = null;
    $("camera-state").textContent = "Camera could not start";
    $("camera-placeholder").classList.remove("hidden");
    $("camera-live").classList.remove("visible");
    $("camera-button").textContent = "TRY AGAIN";
    showToast(error.message || "Unable to start the camera. Check browser permissions.");
  } finally {
    $("camera-button").disabled = false;
  }
});

$("reset-view").addEventListener("click", () => mapController.reset());
$("buildings-toggle").addEventListener("change", (event) => mapController.toggleBuildings(event.target.checked));
$("labels-toggle").addEventListener("change", (event) => mapController.toggleLabels(event.target.checked));
$("effects-toggle").addEventListener("change", (event) => hologram.setVisible(event.target.checked));

$("search-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const query = $("location-search").value.trim();
  if (!query) return;
  const button = $("search-form").querySelector("button");
  button.disabled = true;
  try {
    const places = await searchPlace(query);
    if (!places.length) { showToast("No matching location found. Try another search."); return; }
    const place = places[0];
    mapController.flyTo(place.center, 14);
    $("map-location").textContent = [place.name, place.place].filter(Boolean).join(", ");
    showToast("Moving to " + [place.name, place.place].filter(Boolean).join(", "));
  } catch (error) {
    showToast(error.message || "Location search failed.");
  } finally {
    button.disabled = false;
  }
});

$("locate-button").addEventListener("click", () => {
  if (!navigator.geolocation) { showToast("Location services are not available in this browser."); return; }
  $("locate-button").textContent = "◎ Finding your location…";
  navigator.geolocation.getCurrentPosition(
    ({ coords }) => {
      mapController.flyTo([coords.longitude, coords.latitude], 15);
      $("map-location").textContent = "Your current location";
      $("locate-button").textContent = "◎ Use my current location";
      showToast("Map centered on your location.");
    },
    (error) => {
      $("locate-button").textContent = "◎ Use my current location";
      showToast(error.code === 1 ? "Location permission was denied." : "Could not get your location.");
    },
    { enableHighAccuracy: true, timeout: 10000 }
  );
});

$("help-button").addEventListener("click", () => { $("help-panel").hidden = false; });
$("close-help").addEventListener("click", () => { $("help-panel").hidden = true; });
$("help-panel").addEventListener("click", (event) => {
  if (event.target === $("help-panel")) $("help-panel").hidden = true;
});

window.addEventListener("holodesk:location", ({ detail }) => {
  showToast(`Selected: ${detail.lat.toFixed(5)}°, ${detail.lng.toFixed(5)}°`);
});
window.addEventListener("beforeunload", () => { tracker?.stop(); hologram.destroy(); });
window.addEventListener("resize", () => mapController.map.resize());

mapController.map.on("load", () => {
  $("map-location").textContent = "Lagos, Nigeria";
  mapController.map.resize();
});
mapController.map.on("error", (event) => {
  console.error("HoloDesk map error:", event.error || event);
});
