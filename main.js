

import * as THREE from "https://unpkg.com/three@0.159.0/build/three.module.js";
import { PointerLockControls } from "https://unpkg.com/three@0.159.0/examples/jsm/controls/PointerLockControls.js";

// ===== DEBUG HUD (shows even if everything else breaks) =====
const hud = document.createElement("div");
hud.style.cssText = `
  position:fixed; left:12px; top:12px; z-index:99999;
  background:rgba(0,0,0,.55); color:#fff; padding:10px 12px;
  font:12px/1.35 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  border:1px solid rgba(255,255,255,.15); border-radius:10px;
  max-width: 360px; white-space: pre-wrap;
`;
hud.textContent = "main.js loaded ✅\nWaiting for click…";
document.body.appendChild(hud);

window.addEventListener("error", (e) => {
  hud.textContent += `\n\n❌ ERROR:\n${e.message}\n${e.filename}:${e.lineno}:${e.colno}`;
});
window.addEventListener("unhandledrejection", (e) => {
  hud.textContent += `\n\n❌ PROMISE REJECTION:\n${e.reason}`;
});

// ===== OVERLAY WIRING =====
const overlay = document.getElementById("overlay");
if (!overlay) {
  hud.textContent += "\n\n❌ Could not find #overlay in index.html";
  throw new Error("Missing #overlay");
}

const overlayH1 = overlay.querySelector("h1");
const overlayP = overlay.querySelector("p");

function hideOverlay() {
  overlay.classList.add("hidden");
}

function showOverlay() {
  overlay.classList.remove("hidden");
}

hud.textContent += "\n#overlay found ✅";

// ===== THREE BASICS =====
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x000000);
scene.fog = new THREE.FogExp2(0x000000, 0.03);

const camera = new THREE.PerspectiveCamera(75, innerWidth / innerHeight, 0.05, 500);
camera.position.set(0, 1.7, 6);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(innerWidth, innerHeight);
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
document.body.appendChild(renderer.domElement);

scene.add(new THREE.AmbientLight(0xffffff, 0.28));
const dir = new THREE.DirectionalLight(0xffffff, 0.75);
dir.position.set(4, 10, 6);
scene.add(dir);

// Ground
const ground = new THREE.Mesh(
  new THREE.CircleGeometry(24, 64),
  new THREE.MeshStandardMaterial({ color: 0x05060f, roughness: 0.95 })
);
ground.rotation.x = -Math.PI / 2;
scene.add(ground);

// Simple fountain placeholder (so you see something)
const fountain = new THREE.Mesh(
  new THREE.CylinderGeometry(2.4, 2.8, 0.8, 48),
  new THREE.MeshStandardMaterial({ color: 0x101326, roughness: 0.75, metalness: 0.2 })
);
fountain.position.y = 0.4;
scene.add(fountain);

// ===== CONTROLS =====
const controls = new PointerLockControls(camera, document.body);
let started = false;

controls.addEventListener("lock", () => {
  hud.textContent += "\nPointerLock: locked ✅";
  hideOverlay();
});
controls.addEventListener("unlock", () => {
  hud.textContent += "\nPointerLock: unlocked";
  showOverlay();
});

const move = { forward:false, backward:false, left:false, right:false, up:false, down:false };
addKeyboard();

// Start on overlay click (always visible feedback)
overlay.addEventListener("click", async () => {
  hud.textContent += "\nOverlay clicked ✅";
  if (overlayH1) overlayH1.textContent = "Loading…";
  if (overlayP) overlayP.textContent = "If this changes, click is working.";

  started = true;

  // Try pointer lock, but if it fails, still run
  try {
    controls.lock();
    hud.textContent += "\nAttempting pointer lock…";
  } catch (e) {
    hud.textContent += "\nPointer lock not available (mobile ok).";
    hideOverlay();
  }

  // Also hide overlay even if pointer lock doesn’t happen
  setTimeout(() => hideOverlay(), 150);

  // Spawn a test floating “photo” so you SEE it
  spawnTestCard();
});

function addKeyboard() {
  addEventListener("keydown", (e) => {
    const k = e.key.toLowerCase();
    if (k === "w") move.forward = true;
    if (k === "s") move.backward = true;
    if (k === "a") move.left = true;
    if (k === "d") move.right = true;
    if (e.key === "ArrowUp" || k === "r") move.up = true;
    if (e.key === "ArrowDown" || k === "f") move.down = true;
  });
  addEventListener("keyup", (e) => {
    const k = e.key.toLowerCase();
    if (k === "w") move.forward = false;
    if (k === "s") move.backward = false;
    if (k === "a") move.left = false;
    if (k === "d") move.right = false;
    if (e.key === "ArrowUp" || k === "r") move.up = false;
    if (e.key === "ArrowDown" || k === "f") move.down = false;
  });
}

// ===== TEST CARD (to prove rendering works) =====
let testCard;
function spawnTestCard() {
  if (testCard) return;
  const mat = new THREE.MeshBasicMaterial({ color: 0xffffff });
  const geo = new THREE.PlaneGeometry(1.5, 1.0);
  testCard = new THREE.Mesh(geo, mat);
  testCard.position.set(0, 2.2, -2.5);
  scene.add(testCard);
  hud.textContent += "\nSpawned test card ✅";
}

// ===== LOOP =====
const clock = new THREE.Clock();
const vel = new THREE.Vector3();

function animate() {
  requestAnimationFrame(animate);
  const dt = Math.min(0.05, clock.getDelta());

  if (testCard) testCard.lookAt(camera.position);

  // Move camera (works even without pointer lock)
  const dir = new THREE.Vector3();
  const right = new THREE.Vector3();
  camera.getWorldDirection(dir);
  dir.y = 0; dir.normalize();
  right.crossVectors(dir, camera.up).normalize();

  vel.set(0,0,0);
  if (move.forward) vel.add(dir);
  if (move.backward) vel.sub(dir);
  if (move.right) vel.add(right);
  if (move.left) vel.sub(right);

  if (vel.lengthSq() > 0) vel.normalize().multiplyScalar(4.2 * dt);
  camera.position.add(vel);

  if (move.up) camera.position.y += 2.8 * dt;
  if (move.down) camera.position.y -= 2.8 * dt;

  renderer.render(scene, camera);
}
animate();

addEventListener("resize", () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});
