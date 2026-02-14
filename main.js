



import * as THREE from "https://unpkg.com/three@0.159.0/build/three.module.js";
import { PointerLockControls } from "https://unpkg.com/three@0.159.0/examples/jsm/controls/PointerLockControls.js";

/** ===== CONFIG ===== */
const WORKER_URL = "https://atlas-list-worker.regalfyre.workers.dev";
const PHOTO_PREFIX = "cards/";           // change if needed
const MAX_PHOTOS = 60;                  // start small, raise later
const PUBLIC_BASE = "https://pub-XXXXXXXXXXXX.r2.dev"; // <- set your real public base

/** Visual */
const PLATFORM_RADIUS = 7.5;
const RING_RADIUS_MIN = 9.5;
const RING_RADIUS_MAX = 15.5;
const FLOAT_Y_MIN = 1.7;
const FLOAT_Y_MAX = 5.5;

/** Movement */
const MOVE_SPEED = 4.2;
const LIFT_SPEED = 2.8;

/** ===== Overlay ===== */
const overlay = document.getElementById("overlay");
const overlayH1 = overlay?.querySelector("h1");
const overlayP = overlay?.querySelector("p");

function setOverlay(h1, p) {
  if (overlayH1) overlayH1.textContent = h1;
  if (overlayP) overlayP.textContent = p || "";
}
function hideOverlay() { overlay?.classList.add("hidden"); }
function showOverlay() { overlay?.classList.remove("hidden"); }

/** ===== Three Setup ===== */
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x000000);
scene.fog = new THREE.FogExp2(0x000000, 0.055);

const camera = new THREE.PerspectiveCamera(75, innerWidth / innerHeight, 0.05, 400);
camera.position.set(0, 1.75, 11);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(innerWidth, innerHeight);
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
document.body.appendChild(renderer.domElement);

// Minimal moody lights
scene.add(new THREE.AmbientLight(0xffffff, 0.20));
const key = new THREE.PointLight(0xffffff, 1.1, 45, 2.2);
key.position.set(0, 7, 7);
scene.add(key);

const rim = new THREE.PointLight(0x88aaff, 1.0, 55, 2.0);
rim.position.set(0, 3, -14);
scene.add(rim);

// Stars (cheap)
scene.add(makeStars());

// Platform in center
scene.add(makePlatform());

// Groups
const photoGroup = new THREE.Group();
scene.add(photoGroup);

/** ===== Controls ===== */
const controls = new PointerLockControls(camera, document.body);
let canPointerLock = true;

controls.addEventListener("lock", () => hideOverlay());
controls.addEventListener("unlock", () => showOverlay());

const move = { forward:false, backward:false, left:false, right:false, up:false, down:false };
addKeyboard();
addMobileUI();

/** ===== Start ===== */
let started = false;

setOverlay("Enter", "Click to walk");
overlay?.addEventListener("click", async () => {
  if (started) return;
  started = true;

  hideOverlay();
  try { if (canPointerLock) controls.lock(); } catch {}

  // Load and spawn photos
  const keys = await listKeys(PHOTO_PREFIX);
  const picked = shuffle(keys).slice(0, MAX_PHOTOS);

  await spawnFloatingRing(picked);

  // If pointer lock didn’t happen on desktop, still hide overlay
  setTimeout(() => hideOverlay(), 150);
});

/** ===== Cloudflare list ===== */
async function listKeys(prefix) {
  const url = `${WORKER_URL}?prefix=${encodeURIComponent(prefix)}&t=${Date.now()}`;
  const data = await fetch(url).then(r => r.json());
  const items = Array.isArray(data.items) ? data.items : [];

  return items
    .map(x => x.key || x)
    .filter(Boolean)
    .filter(k => k.startsWith(prefix))
    .filter(k => /\.(png|jpg|jpeg|webp)$/i.test(k));
}

function objectURL(key) {
  // If your worker returns full URLs, swap to that.
  return `${PUBLIC_BASE}/${key}`;
}

/** ===== Spawn Layout: Aesthetic Floating Ring ===== */
const texLoader = new THREE.TextureLoader();

async function spawnFloatingRing(keys) {
  // Clear existing
  while (photoGroup.children.length) photoGroup.remove(photoGroup.children[0]);

  // Evenly distribute around ring, with slight randomness
  const n = keys.length;
  const promises = keys.map((key, i) => {
    const url = objectURL(key);

    return new Promise((resolve) => {
      texLoader.load(
        url,
        (tex) => {
          tex.colorSpace = THREE.SRGBColorSpace;

          const aspect = (tex.image?.width && tex.image?.height)
            ? (tex.image.width / tex.image.height)
            : 1;

          // Keep cards roughly same height for “gallery” feel
          const cardH = 1.5;
          const cardW = cardH * aspect;

          const geo = new THREE.PlaneGeometry(cardW, cardH);
          const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true });
          const mesh = new THREE.Mesh(geo, mat);

          // Angle placement
          const baseAngle = (i / Math.max(1, n)) * Math.PI * 2;

          // Organic offsets
          const angle = baseAngle + rand(-0.18, 0.18);
          const radius = rand(RING_RADIUS_MIN, RING_RADIUS_MAX);
          const y = rand(FLOAT_Y_MIN, FLOAT_Y_MAX);

          mesh.position.set(Math.cos(angle) * radius, y, Math.sin(angle) * radius);

          // Store motion traits
          mesh.userData.angle = angle;
          mesh.userData.radius = radius;
          mesh.userData.baseY = y;

          // Different rates: haunted + beautiful
          mesh.userData.orbitSpeed = rand(0.01, 0.06);     // each photo drifts around at its own rate
          mesh.userData.spinZ = rand(-0.10, 0.10);         // gentle paper tilt
          mesh.userData.bobSpeed = rand(0.7, 1.2);
          mesh.userData.bobAmp = rand(0.05, 0.22);
          mesh.userData.seed = Math.random() * 999;

          photoGroup.add(mesh);
          resolve(true);
        },
        undefined,
        () => resolve(false)
      );
    });
  });

  await Promise.all(promises);
}

/** ===== Animation Loop ===== */
const clock = new THREE.Clock();

function animate() {
  requestAnimationFrame(animate);
  const t = clock.getElapsedTime();
  const dt = Math.min(0.05, clock.getDelta());

  // Animate photos: orbit drift + bob + face viewer
  for (const m of photoGroup.children) {
    const s = m.userData.seed || 0;

    m.userData.angle += (m.userData.orbitSpeed || 0.03) * dt;
    const a = m.userData.angle;
    const r = m.userData.radius;

    m.position.x = Math.cos(a) * r;
    m.position.z = Math.sin(a) * r;

    m.position.y = (m.userData.baseY || m.position.y) + Math.sin(t * (m.userData.bobSpeed || 1) + s) * (m.userData.bobAmp || 0.12);

    // Always face viewer for readability
    const target = new THREE.Vector3(camera.position.x, m.position.y, camera.position.z);
    m.lookAt(target);

    // Slight haunted tilt
    m.rotation.z = Math.sin(t * 0.65 + s) * (m.userData.spinZ || 0.06);
  }

  // Movement
  applyMovement(dt);

  renderer.render(scene, camera);
}
animate();

/** ===== Movement ===== */
function applyMovement(dt) {
  const dir = new THREE.Vector3();
  const right = new THREE.Vector3();
  camera.getWorldDirection(dir);
  dir.y = 0;
  dir.normalize();
  right.crossVectors(dir, camera.up).normalize();

  const v = new THREE.Vector3();
  if (move.forward) v.add(dir);
  if (move.backward) v.sub(dir);
  if (move.right) v.add(right);
  if (move.left) v.sub(right);

  if (v.lengthSq() > 0) {
    v.normalize().multiplyScalar(MOVE_SPEED * dt);
    camera.position.add(v);
  }

  if (move.up) camera.position.y += LIFT_SPEED * dt;
  if (move.down) camera.position.y -= LIFT_SPEED * dt;

  // Keep you near the shrine
  const arena = 26;
  const r = Math.hypot(camera.position.x, camera.position.z);
  if (r > arena) {
    camera.position.x = (camera.position.x / r) * arena;
    camera.position.z = (camera.position.z / r) * arena;
  }
  camera.position.y = Math.max(0.9, Math.min(10, camera.position.y));
}

/** ===== Input ===== */
function addKeyboard() {
  addEventListener("keydown", (e) => {
    const k = e.key.toLowerCase();
    if (k === "w") move.forward = true;
    if (k === "s") move.backward = true;
    if (k === "a") move.left = true;
    if (k === "d") move.right = true;
    if (e.key === "ArrowUp") move.up = true;
    if (e.key === "ArrowDown") move.down = true;
  });
  addEventListener("keyup", (e) => {
    const k = e.key.toLowerCase();
    if (k === "w") move.forward = false;
    if (k === "s") move.backward = false;
    if (k === "a") move.left = false;
    if (k === "d") move.right = false;
    if (e.key === "ArrowUp") move.up = false;
    if (e.key === "ArrowDown") move.down = false;
  });
}

function addMobileUI() {
  const isTouch = matchMedia("(pointer: coarse)").matches || "ontouchstart" in window;
  if (!isTouch) return;

  canPointerLock = false;
  if (overlayP) overlayP.textContent = "Tap to begin, drag to look";

  // touch look
  let looking = false;
  let lx = 0, ly = 0;
  const sens = 0.0022;

  renderer.domElement.addEventListener("touchstart", (e) => {
    hideOverlay();
    looking = true;
    const t = e.touches[0];
    lx = t.clientX; ly = t.clientY;
  }, { passive: true });

  renderer.domElement.addEventListener("touchmove", (e) => {
    if (!looking) return;
    const t = e.touches[0];
    const dx = t.clientX - lx;
    const dy = t.clientY - ly;
    lx = t.clientX; ly = t.clientY;

    camera.rotation.y -= dx * sens;
    camera.rotation.x -= dy * sens;
    camera.rotation.x = Math.max(-1.15, Math.min(1.15, camera.rotation.x));
  }, { passive: true });

  renderer.domElement.addEventListener("touchend", () => looking = false, { passive: true });
}

/** ===== Visual Helpers ===== */
function makePlatform() {
  const group = new THREE.Group();

  const base = new THREE.Mesh(
    new THREE.CylinderGeometry(PLATFORM_RADIUS, PLATFORM_RADIUS, 0.5, 80),
    new THREE.MeshStandardMaterial({ color: 0x0e1020, roughness: 0.92, metalness: 0.06 })
  );
  base.position.y = 0.25;
  group.add(base);

  const rim = new THREE.Mesh(
    new THREE.RingGeometry(PLATFORM_RADIUS * 0.98, PLATFORM_RADIUS * 1.08, 120),
    new THREE.MeshBasicMaterial({ color: 0x88aaff, transparent: true, opacity: 0.06 })
  );
  rim.rotation.x = -Math.PI / 2;
  rim.position.y = 0.51;
  group.add(rim);

  return group;
}

function makeStars() {
  const geo = new THREE.BufferGeometry();
  const n = 1200;
  const pos = new Float32Array(n * 3);

  for (let i = 0; i < n; i++) {
    const r = 70 + Math.random() * 200;
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.acos(2 * Math.random() - 1);

    pos[i * 3 + 0] = r * Math.sin(phi) * Math.cos(theta);
    pos[i * 3 + 1] = r * Math.cos(phi);
    pos[i * 3 + 2] = r * Math.sin(phi) * Math.sin(theta);
  }
  geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  return new THREE.Points(geo, new THREE.PointsMaterial({ color: 0xffffff, size: 0.6, sizeAttenuation: true }));
}

/** ===== Utils ===== */
function rand(a, b) { return a + Math.random() * (b - a); }

function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = (Math.random() * (i + 1)) | 0;
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

addEventListener("resize", () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});
