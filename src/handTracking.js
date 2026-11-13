import { FilesetResolver, HandLandmarker } from "@mediapipe/tasks-vision";

const WASM_VERSION = "0.10.14";
const MODEL_URL = "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task";

export class HandTracking {
  constructor({ video, onGesture, onStatus }) {
    this.video = video;
    this.onGesture = onGesture;
    this.onStatus = onStatus;
    this.landmarker = null;
    this.stream = null;
    this.running = false;
    this.frameId = null;
    this.previousPinch = null;
    this.previousPalmX = null;
    this.lastPointAt = 0;
    this.lastVideoTime = -1;
  }

  async start() {
    if (!navigator.mediaDevices?.getUserMedia) {
      throw new Error("Camera access requires HTTPS or localhost and a supported browser.");
    }
    this.onStatus?.("Loading hand-tracking model…");
    const vision = await FilesetResolver.forVisionTasks(
      `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${WASM_VERSION}/wasm`
    );
    this.landmarker = await HandLandmarker.createFromOptions(vision, {
      baseOptions: { modelAssetPath: MODEL_URL, delegate: "GPU" },
      runningMode: "VIDEO",
      numHands: 1,
      minHandDetectionConfidence: 0.55,
      minHandPresenceConfidence: 0.55,
      minTrackingConfidence: 0.5
    });

    this.stream = await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: { facingMode: "user", width: { ideal: 640 }, height: { ideal: 480 } }
    });
    this.video.srcObject = this.stream;
    await this.video.play();
    this.running = true;
    this.onStatus?.("Camera active — show one hand");
    this.detect();
  }

  detect = () => {
    if (!this.running) return;
    if (this.video.readyState >= 2 && this.video.currentTime !== this.lastVideoTime) {
      this.lastVideoTime = this.video.currentTime;
      const result = this.landmarker.detectForVideo(this.video, performance.now());
      const hand = result.landmarks?.[0];
      if (hand) this.processHand(hand);
      else {
        this.previousPinch = null;
        this.previousPalmX = null;
        this.onGesture?.({ type: "none" });
      }
    }
    this.frameId = requestAnimationFrame(this.detect);
  };

  processHand(landmarks) {
    const thumb = landmarks[4];
    const index = landmarks[8];
    const middle = landmarks[12];
    const ring = landmarks[16];
    const pinky = landmarks[20];
    const wrist = landmarks[0];
    const palmWidth = Math.max(0.04, Math.hypot(landmarks[5].x - landmarks[17].x, landmarks[5].y - landmarks[17].y));
    const pinchDistance = Math.hypot(thumb.x - index.x, thumb.y - index.y) / palmWidth;
    const pinch = pinchDistance < 0.42;
    const fingersUp = [index, middle, ring, pinky].filter((tip, i) => tip.y < landmarks[[6, 10, 14, 18][i]].y).length;
    const pointing = index.y < landmarks[6].y && middle.y > landmarks[10].y && ring.y > landmarks[14].y && pinky.y > landmarks[18].y;
    const openPalm = fingersUp >= 4 && !pinch;
    const palmX = (landmarks[5].x + landmarks[17].x) / 2;

    if (pinch) {
      if (this.previousPinch !== null) {
        const delta = (this.previousPinch - pinchDistance) * 1.7;
        if (Math.abs(delta) > 0.008) this.onGesture?.({ type: "pinch", delta, landmarks });
      } else {
        this.onGesture?.({ type: "pinch-start", landmarks });
      }
      this.previousPinch = pinchDistance;
      this.previousPalmX = null;
    } else if (openPalm) {
      if (this.previousPalmX !== null) {
        const delta = (this.previousPalmX - palmX) * 150;
        if (Math.abs(delta) > 0.12) this.onGesture?.({ type: "rotate", delta, landmarks });
      } else {
        this.onGesture?.({ type: "open-palm", landmarks });
      }
      this.previousPalmX = palmX;
      this.previousPinch = null;
    } else if (pointing) {
      this.previousPinch = null;
      this.previousPalmX = null;
      const now = performance.now();
      if (now - this.lastPointAt > 900) {
        this.onGesture?.({ type: "point", x: 1 - index.x, y: index.y, landmarks });
        this.lastPointAt = now;
      }
    } else {
      this.previousPinch = null;
      this.previousPalmX = null;
      this.onGesture?.({ type: "hand", landmarks });
    }
  }

  stop() {
    this.running = false;
    if (this.frameId) cancelAnimationFrame(this.frameId);
    this.stream?.getTracks().forEach((track) => track.stop());
    this.stream = null;
    this.video.srcObject = null;
    this.landmarker?.close();
    this.landmarker = null;
    this.onStatus?.("Camera offline");
  }
}