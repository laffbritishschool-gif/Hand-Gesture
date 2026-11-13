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
let cameraStream = null;
let cameraStarting = false;

async function requestCamera() {
  if (cameraStarting) return;

  // Stop only when a real stream is already active.
  if (cameraStream) {
    tracker?.stop();
    tracker = null;
    cameraStream.getTracks().forEach((track) => track.stop());
    cameraStream = null;
    const video = $("webcam");
    video.pause();
    video.srcObject = null;
    $("camera-button").textContent = "ENABLE CAMERA";
    $("onboarding-camera").textContent = "ENABLE CAMERA";
    $("camera-state").textContent = "Camera offline";
    $("camera-placeholder").classList.remove("hidden");
    $("camera-live").classList.remove("visible");
    $("permission-camera-status").textContent = "Camera stopped";
    return;
  }

  const buttons = [$("camera-button"), $("onboarding-camera")].filter(Boolean);
  if (!window.isSecureContext) {
    const message = "Camera access needs HTTPS. Open this website using its secure https:// address.";
    $("camera-state").textContent = "Secure connection required";
    $("permission-camera-status").textContent = message;
    showToast(message);
    return;
  }
  if (!navigator.mediaDevices?.getUserMedia) {
    const message = "This browser cannot access a camera. Use the latest Chrome and allow camera access.";
    $("camera-state").textContent = "Camera not supported";
    $("permission-camera-status").textContent = message;
    showToast(message);
    return;
  }

  cameraStarting = true;
  buttons.forEach((button) => { button.disabled = true; });
  $("camera-state").textContent = "Waiting for camera permission…";
  $("permission-camera-status").textContent = "Waiting for browser permission…";
  let pendingStream = null;

  try {
    // This call is deliberately made directly inside the user's button click flow.
    pendingStream = await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: { facingMode: "user", width: { ideal: 640 }, height: { ideal: 480 } }
    });

    const video = $("webcam");
    cameraStream = pendingStream;
    video.muted = true;
    video.playsInline = true;
    video.srcObject = cameraStream;
    await video.play();

    // Confirm the actual video track is live before reporting success.
    const videoTrack = cameraStream.getVideoTracks()[0];
    if (!videoTrack || videoTrack.readyState !== "live") {
      throw new Error("The webcam opened but did not provide a live video track.");
    }

    $("camera-placeholder").classList.add("hidden");
    $("camera-live").classList.add("visible");
    $("camera-state").textContent = "Camera online";
    $("permission-camera-status").textContent = "Camera enabled";
    $("onboarding-camera").textContent = "CAMERA ENABLED";
    $("camera-button").textContent = "STOP CAMERA";

    // Gesture tracking is optional: it must never switch off a working webcam.
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
    tracker.stream = cameraStream;
    tracker.start().catch((error) => {
      console.warn("Hand tracking could not start; webcam remains active:", error);
      setGestureLabel("Camera is on — gesture tracking unavailable", error.message || "Hand tracking could not start");
      $("camera-state").textContent = "Camera online";
    });
  } catch (error) {
    pendingStream?.getTracks().forEach((track) => track.stop());
    cameraStream = null;
    const reason = error.name === "NotAllowedError"
      ? "Camera permission was denied. Click the camera icon in Chrome's address bar and set Camera to Allow."
      : error.name === "NotFoundError"
        ? "No camera was found. Connect or enable a webcam."
        : error.name === "NotReadableError"
          ? "The camera is busy in another app. Close other camera apps and try again."
          : error.name === "OverconstrainedError"
            ? "The webcam does not support the requested video settings. Try another camera."
            : (error.message || "Unable to start camera.");
    $("camera-state").textContent = "Camera unavailable";
    $("permission-camera-status").textContent = reason;
    $("gesture-state").textContent = reason;
    showToast(reason);
  } finally {
    cameraStarting = false;
    buttons.forEach((button) => { button.disabled = false; });
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
