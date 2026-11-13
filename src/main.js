import "maplibre-gl/dist/maplibre-gl.css";
import { createHoloMap, searchPlace } from "./map.js";
import { HandTracking } from "./handTracking.js";
import { createHologram } from "./hologram.js";

const $ = (id) => document.getElementById(id);
let mapController = {
  map: { resize() {}, on() {} },
  reset() {}, rotate() {}, zoom() {}, selectAt() {}, flyTo() {},
  toggleBuildings() {}, toggleLabels() {}
};
let hologram = { setVisible() {}, destroy() {} };
let tracker = null;
let toastTimer = null;

function showToast(message) {
  const node = $("selection-toast");
  if (!node) { console.warn(message); return; }
  node.textContent = message;
  node.classList.add("visible");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => node.classList.remove("visible"), 4000);
}
function setGestureLabel(label, feedback = label) {
  $("gesture-state").textContent = label;
  $("gesture-feedback").textContent = feedback;
}

// Bind device permission actions before initializing optional 3D/map features.
async function requestCamera() {
  if (tracker) {
    tracker.stop();
    tracker = null;
    $("camera-button").textContent = "ENABLE CAMERA";
    $("camera-state").textContent = "Camera offline";
    $("camera-placeholder").classList.remove("hidden");
    $("camera-live").classList.remove("visible");
    $("permission-camera-status").textContent = "Camera stopped";
    return;
  }
  const buttons = [$("camera-button"), $("onboarding-camera")];
  buttons.forEach((button) => { if (button) button.disabled = true; });
  $("camera-state").textContent = "Waiting for browser permission…";
  $("permission-camera-status").textContent = "Waiting for browser permission…";
  try {
    // getUserMedia is invoked immediately from this real button click.
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: { facingMode: "user", width: { ideal: 640 }, height: { ideal: 480 } }
    });
    const video = $("webcam");
    video.srcObject = stream;
    await video.play();
    $("camera-placeholder").classList.add("hidden");
    $("camera-live").classList.add("visible");
    $("camera-state").textContent = "Camera online";
    $("permission-camera-status").textContent = "Camera enabled";
    $("onboarding-camera").textContent = "CAMERA ENABLED";
    $("camera-button").textContent = "STOP CAMERA";
    // The stream is now visibly active. Start gesture tracking using the
    // existing stream rather than requesting camera permission a second time.
    tracker = new HandTracking({
      video,
      onStatus: (message) => { $("camera-state").textContent = message; },
      onTrackingStatus: (message) => setGestureLabel(message),
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
    tracker.stream = stream;
    tracker.running = true;
    tracker.videoTrack = stream.getVideoTracks()[0];
    tracker.videoTrack?.addEventListener("ended", () => {
      tracker = null;
      $("camera-state").textContent = "Camera disconnected";
      $("permission-camera-status").textContent = "Camera disconnected";
      $("camera-placeholder").classList.remove("hidden");
      $("camera-live").classList.remove("visible");
    }, { once: true });
    // Load hand model after preview is already running.
    tracker.startTrackingOnly?.();
    const tracking = tracker;
    (async () => {
      try {
        await tracking.loadModelAndDetect?.();
      } catch (e) { console.error("Gesture model error:", e); }
    })();
  } catch (error) {
    const reason = error.name === "NotAllowedError"
      ? "Camera permission was blocked. Set Camera to Allow in Chrome site settings and try again."
      : error.name === "NotFoundError"
        ? "No camera was found. Connect or enable a webcam."
        : error.name === "NotReadableError"
          ? "The camera is busy in another app. Close other camera apps and retry."
          : !navigator.mediaDevices?.getUserMedia
            ? "Camera requires HTTPS (or localhost) in a supported browser."
            : (error.message || "Unable to start camera.");
    $("camera-state").textContent = "Camera unavailable";
    $("permission-camera-status").textContent = reason;
    $("gesture-state").textContent = reason;
    showToast(reason);
  } finally {
    buttons.forEach((button) => { if (button) button.disabled = false; });
  }
}
function requestLocation() {
  $("permission-location-status").textContent = "Requesting browser permission…";
  if (!navigator.geolocation) {
    $("permission-location-status").textContent = "Location is not supported by this browser.";
    showToast("Location is not supported by this browser.");
    return;
  }
  $("onboarding-location").disabled = true;
  navigator.geolocation.getCurrentPosition(({ coords }) => {
    mapController.flyTo([coords.longitude, coords.latitude], 15);
    $("map-location").textContent = "Your current location";
    $("permission-location-status").textContent = "Location shared successfully";
    $("onboarding-location").textContent = "LOCATION ENABLED";
    $("locate-button").textContent = "◎ Use my current location";
    $("onboarding-location").disabled = false;
  }, (error) => {
    const message = error.code === 1
      ? "Location permission was denied. Allow Location in Chrome site settings."
      : "Could not get your location. Check device location services and try again.";
    $("permission-location-status").textContent = message;
    $("onboarding-location").disabled = false;
    showToast(message);
  }, { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 });
}
$("camera-button").addEventListener("click", requestCamera);
$("onboarding-camera").addEventListener("click", requestCamera);
$("onboarding-location").addEventListener("click", requestLocation);
$("locate-button").addEventListener("click", requestLocation);
$("onboarding-continue").addEventListener("click", () => $("permission-welcome").classList.add("hidden"));

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
    if (!places.length) { showToast("No matching location found."); return; }
    const place = places[0];
    mapController.flyTo(place.center, 14);
    $("map-location").textContent = [place.name, place.place].filter(Boolean).join(", ");
  } catch (error) { showToast(error.message || "Location search failed."); }
  finally { button.disabled = false; }
});
$("help-button").addEventListener("click", () => { $("help-panel").hidden = false; });
$("close-help").addEventListener("click", () => { $("help-panel").hidden = true; });
$("help-panel").addEventListener("click", (event) => { if (event.target === $("help-panel")) $("help-panel").hidden = true; });
window.addEventListener("holodesk:location", ({ detail }) => showToast(`Selected: ${detail.lat.toFixed(5)}°, ${detail.lng.toFixed(5)}°`));
window.addEventListener("beforeunload", () => { tracker?.stop(); hologram.destroy(); });
$("camera-state").textContent = "Camera permission needed";
$("permission-camera-status").textContent = "Waiting for permission";
$("permission-location-status").textContent = "Waiting for permission";
$("gesture-state").textContent = "Choose Enable Camera to allow access.";
$("camera-button").textContent = "ENABLE CAMERA";

// Initialize map and decorative hologram only after all controls are live.
try {
  mapController = createHoloMap();
  mapController.map.on("load", () => {
    $("map-location").textContent = "Lagos, Nigeria";
    $("map-status").textContent = "MAP READY";
    mapController.map.resize();
  });
  mapController.map.on("error", (event) => {
    $("map-status").textContent = "MAP ISSUE";
    showToast(event.error?.message || "Map tiles could not load.");
  });
} catch (error) {
  console.error("Map initialization failed:", error);
  $("map-status").textContent = "MAP UNAVAILABLE";
  showToast("Map could not initialize. Camera and location controls remain available.");
}
try {
  hologram = createHologram($("hologram-layer"));
} catch (error) {
  console.warn("Hologram unavailable:", error);
  $("hologram-layer").style.display = "none";
}
window.addEventListener("resize", () => mapController.map.resize());
