// main.js
// No manifests. No workflows.
// Auto-loads everything that matches:
//   assets/photos/img (N).(png|jpg|jpeg|webp)  for N=1..PHOTO_MAX_SCAN
//   assets/poems/img (N).(png|jpg|jpeg|webp)   for N=1..POEM_MAX_SCAN
// Loads ALL duplicates (img (1).png AND img (1).jpg both show).
// Starts small (3 each) so you can test, then raise the scan limits later.

import * as THREE from "https://unpkg.com/three@0.159.0/build/three.module.js";
import { PointerLockControls } from "https://unpkg.com/three@0.159.0/examples/jsm/controls/PointerLockControls.js";

// =====================
// CONFIG (change later)
// =====================
const EXTENSIONS = ["png", "jpg", "jpeg", "webp"];

// Start small for testing:
const PHOTO_MAX_SCAN = 3;  // try img (1..3) in assets/photos/
const POEM_MAX_SCAN  = 3;  // try img (1..3) in assets/poems/

// Visual tuning
const ARENA_RADIUS = 22;
const PHOTO_RING_RADIUS = 9.0;
const PHOTO_RING_JITTER = 2.5;
const PHOTO_Y_MIN = 1.4;
const PHOTO_Y_MAX = 4.8;

const POEM_RADIUS = 1.15;     // how far from center poems sit on water
const POEM_Y = 0.825;         // slightly above water plane
const POEM_SIZE_W = 0.95;
const POEM_SIZE_H = 0.75;

const PHOTO_SIZE_W = 1.55;
const PHOTO_SIZE_H = 1.15;

const MOVE_SPEED = 4.2;
const LIFT_SPEED = 2.8;

// =====================
// BOOT
// =====================
const overlay = document.getElementById("overlay");

// Scene
const scene = new THREE.Scene();
scene.fog = new THREE.FogExp2(0x000000, 0.03);

const camera = new THREE.PerspectiveCamera(75, innerWidth / innerHeight, 0.05, 500);
camera.position.set(0, 1.7, 6);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(innerWidth, innerHeight);
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
document.body.appendChild(renderer.domElement);

// Controls (desktop pointer lock)
const controls = new PointerLockControls(camera, document.body);
let canPointerLock = true;

overlay.addEventListener("click", () => {
  overlay.classList.add("hidden");
  if (canPointerLock && "pointerLockElement" in document) controls.lock();
});

controls.addEventListener("lock", () => overlay.classList.add("hidden"));
controls.addEventListener("unlock", () => overlay.classList.remove("hidden"));

// Movement state
const move = { forward:false, backward:false, left:false, right:false, up:false, down:false };
addKeyboard();
addMobileUI();

// =====================
// LIGHTS + STARS
// =====================
scene.add(new THREE.AmbientLight(0xffffff, 0.25));

const keyLight = new THREE.DirectionalLight(0xffffff, 0.7);
keyLight.position.set(4, 10, 6);
scene.add(keyLight);

const rim = new THREE.PointLight(0x88aaff, 1.2, 40, 2);
rim.position.set(0, 4, -8);
scene.add(rim);

scene.add(makeStars());

// =====================
// GROUND + BOUNDARY
// =====================
const ground = new THREE.Mesh(
  new THREE.CircleGeometry(24, 64),
  new THREE.MeshStandardMaterial({ color: 0x05060f, roughness: 0.95, metalness: 0.0 })
);
ground.rotation.x = -Math.PI / 2;
ground.position.y = 0;
scene.add(ground);

const boundaryRing = new THREE.Mesh(
  new THREE.RingGeometry(23.5, 24, 96),
  new THREE.MeshBasicMaterial({ color: 0x4466ff, transparent: true, opacity: 0.08 })
);
boundaryRing.rotation.x = -Math.PI / 2;
boundaryRing.position.y = 0.01;
scene.add(boundaryRing);

// =====================
// FOUNTAIN + WATER
// =====================
const fountainGroup = new THREE.Group();
scene.add(fountainGroup);

const pedestal = new THREE.Mesh(
  new THREE.CylinderGeometry(2.4, 2.8, 0.8, 48),
  new THREE.MeshStandardMaterial({ color: 0x101326, roughness: 0.75, metalness: 0.2 })
);
pedestal.position.y = 0.4;
fountainGroup.add(pedestal);

const lip = new THREE.Mesh(
  new THREE.TorusGeometry(2.1, 0.12, 20, 80),
  new THREE.MeshStandardMaterial({ color: 0x1a1f3b, roughness: 0.55, metalness: 0.35 })
);
lip.rotation.x = Math.PI / 2;
lip.position.y = 0.82;
fountainGroup.add(lip);

const waterGeo = new THREE.CircleGeometry(2.0, 64);
const waterMat = new THREE.MeshStandardMaterial({
  color: 0x2244aa,
  roughness: 0.15,
  metalness: 0.05,
  transparent: true,
  opacity: 0.55
});
const water = new THREE.Mesh(waterGeo, waterMat);
water.rotation.x = -Math.PI / 2;
water.position.y = 0.81;
fountainGroup.add(water);

const glow = new THREE.PointLight(0x6aa3ff, 1.6, 18, 2.2);
glow.position.set(0, 2.0, 0);
fountainGroup.add(glow);

// =====================
// ASSET LOADING (AUTO)
// =====================
const textureLoader = new THREE.TextureLoader();

function loadPlane(url, w, h) {
  return new Promise((resolve, reject) => {
    textureLoader.load(
      url,
      (tex) => {
        tex.colorSpace = THREE.SRGBColorSpace;
        tex.minFilter = THREE.LinearMipmapLinearFilter;
        tex.magFilter = THREE.LinearFilter;
        const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true });
        const geo = new THREE.PlaneGeometry(w, h);
        resolve(new THREE.Mesh(geo, mat));
      },
      undefined,
      (err) => reject(err)
    );
  });
}

// Load ALL matches for img (N).ext for N=1..maxScan
async function loadAllSequential(folderBase, maxScan, w, h, onSpawn) {
  const tasks = [];
  for (let i = 1; i <= maxScan; i++) {
    for (const ext of EXTENSIONS) {
      const url = `${folderBase}img (${i}).${ext}`;
      // Try loading; if it 404s, TextureLoader calls error callback and we ignore.
      tasks.push(
        loadPlane(url, w, h)
          .then((mesh) => onSpawn(mesh, url, i, ext))
          .catch(() => null)
      );
    }
  }
  await Promise.all(tasks);
}

// Groups
const photoGroup = new THREE.Group();
scene.add(photoGroup);

const poemGroup = new THREE.Group();
fountainGroup.add(poemGroup);

// Spawn behavior: photos float around fountain
function spawnPhoto(mesh, url, index) {
  // Spread around ring, but allow randomness
  const a = (index / Math.max(1, PHOTO_MAX_SCAN)) * Math.PI * 2 + Math.random() * 0.25;
  const r = PHOTO_RING_RADIUS + (Math.random() * PHOTO_RING_JITTER - PHOTO_RING_JITTER / 2);

  mesh.position.set(
    Math.cos(a) * r,
    PHOTO_Y_MIN + Math.random() * (PHOTO_Y_MAX - PHOTO_Y_MIN),
    Math.sin(a) * r
  );

  mesh.userData.floatSeed = Math.random() * 1000;
  mesh.userData.baseY = mesh.position.y;
  mesh.userData.kind = "photo";
  mesh.userData.url = url;

  photoGroup.add(mesh);
}

// Spawn behavior: poems lie on water
function spawnPoem(mesh, url, idx) {
  const a = (idx / Math.max(1, POEM_MAX_SCAN)) * Math.PI * 2;
  mesh.position.set(Math.cos(a) * POEM_RADIUS, POEM_Y, Math.sin(a) * POEM_RADIUS);

  mesh.rotation.x = -Math.PI / 2;
  mesh.rotation.z = (Math.random() * 0.4 - 0.2);

  mesh.userData.kind = "poem";
  mesh.userData.url = url;

  poemGroup.add(mesh);
}

// Kick off loads
(async function bootAssets() {
  console.log("Loading photos...");
  await loadAllSequential("./assets/photos/", PHOTO_MAX_SCAN, PHOTO_SIZE_W, PHOTO_SIZE_H, (mesh, url, i) => {
    spawnPhoto(mesh, url, i);
  });

  console.log("Loading poems...");
  await loadAllSequential("./assets/poems/", POEM_MAX_SCAN, POEM_SIZE_W, POEM_SIZE_H, (mesh, url, i) => {
    spawnPoem(mesh, url, i);
  });

  console.log("Loaded photos:", photoGroup.children.length, "Loaded poems:", poemGroup.children.length);
})();

// =====================
// ANIMATION LOOP
// =====================
const clock = new THREE.Clock();
const velocity = new THREE.Vector3();

function clampToArena(pos) {
  const r = Math.sqrt(pos.x * pos.x + pos.z * pos.z);
  if (r > ARENA_RADIUS) {
    pos.x = (pos.x / r) * ARENA_RADIUS;
    pos.z = (pos.z / r) * ARENA_RADIUS;
  }
  pos.y = Math.max(0.6, Math.min(8, pos.y));
}

function animate() {
  requestAnimationFrame(animate);
  const dt = Math.min(0.05, clock.getDelta());
  const t = clock.elapsedTime;

  // Water pulse
  water.material.opacity = 0.50 + Math.sin(t * 1.6) * 0.05;

  // Float + face camera for photos
  for (const m of photoGroup.children) {
    const s = m.userData.floatSeed || 0;
    m.position.y = (m.userData.baseY || m.position.y) + Math.sin(t * 0.9 + s) * 0.12;
    m.rotation.z = Math.sin(t * 0.7 + s) * 0.04;
    const target = new THREE.Vector3(camera.position.x, m.position.y, camera.position.z);
    m.lookAt(target);
  }

  // Movement
  const dir = new THREE.Vector3();
  const right = new THREE.Vector3();

  camera.getWorldDirection(dir);
  dir.y = 0;
  dir.normalize();
  right.crossVectors(dir, camera.up).normalize();

  velocity.set(0, 0, 0);
  if (move.forward) velocity.add(dir);
  if (move.backward) velocity.sub(dir);
  if (move.right) velocity.add(right);
  if (move.left) velocity.sub(right);

  if (velocity.lengthSq() > 0) velocity.normalize().multiplyScalar(MOVE_SPEED * dt);
  camera.position.add(velocity);

  if (move.up) camera.position.y += LIFT_SPEED * dt;
  if (move.down) camera.position.y -= LIFT_SPEED * dt;

  clampToArena(camera.position);

  renderer.render(scene, camera);
}
animate();

// =====================
// RESIZE
// =====================
addEventListener("resize", () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});

// =====================
// INPUT HELPERS
// =====================
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

function addMobileUI() {
  const isTouch = matchMedia("(pointer: coarse)").matches || "ontouchstart" in window;
  if (!isTouch) return;

  canPointerLock = false;
  const p = overlay.querySelector("p");
  if (p) p.textContent = "Tap to begin";

  // Touch look (drag anywhere)
  let lookActive = false;
  let lastX = 0, lastY = 0;
  const lookSensitivity = 0.0022;

  renderer.domElement.addEventListener("touchstart", (e) => {
    overlay.classList.add("hidden");
    lookActive = true;
    const t = e.touches[0];
    lastX = t.clientX;
    lastY = t.clientY;
  }, { passive: true });

  renderer.domElement.addEventListener("touchmove", (e) => {
    if (!lookActive) return;
    const t = e.touches[0];
    const dx = t.clientX - lastX;
    const dy = t.clientY - lastY;
    lastX = t.clientX;
    lastY = t.clientY;

    camera.rotation.y -= dx * lookSensitivity;
    camera.rotation.x -= dy * lookSensitivity;
    camera.rotation.x = Math.max(-1.2, Math.min(1.2, camera.rotation.x));
  }, { passive: true });

  renderer.domElement.addEventListener("touchend", () => { lookActive = false; }, { passive: true });

  // Move pad (bottom-left)
  const pad = document.createElement("div");
  pad.style.cssText = `
    position: fixed;
    left: 16px;
    bottom: 16px;
    width: 140px;
    height: 140px;
    border-radius: 18px;
    background: rgba(255,255,255,0.06);
    border: 1px solid rgba(255,255,255,0.14);
    backdrop-filter: blur(8px);
    touch-action: none;
    z-index: 20;
  `;

  const nub = document.createElement("div");
  nub.style.cssText = `
    position: absolute;
    left: 50%;
    top: 50%;
    width: 54px;
    height: 54px;
    border-radius: 16px;
    transform: translate(-50%,-50%);
    background: rgba(255,255,255,0.10);
    border: 1px solid rgba(255,255,255,0.18);
  `;

  pad.appendChild(nub);
  document.body.appendChild(pad);

  let padActive = false;
  let padCenter = { x: 0, y: 0 };

  function setMoveFromPad(dx, dy) {
    const nx = Math.max(-1, Math.min(1, dx / 45));
    const ny = Math.max(-1, Math.min(1, dy / 45));

    move.forward = ny < -0.2;
    move.backward = ny > 0.2;
    move.left = nx < -0.2;
    move.right = nx > 0.2;
  }

  pad.addEventListener("pointerdown", (e) => {
    padActive = true;
    const r = pad.getBoundingClientRect();
    padCenter.x = r.left + r.width / 2;
    padCenter.y = r.top + r.height / 2;
    pad.setPointerCapture(e.pointerId);
  });

  pad.addEventListener("pointermove", (e) => {
    if (!padActive) return;
    const dx = e.clientX - padCenter.x;
    const dy = e.clientY - padCenter.y;

    const clampedX = Math.max(-45, Math.min(45, dx));
    const clampedY = Math.max(-45, Math.min(45, dy));

    nub.style.transform = `translate(${clampedX - 27}px, ${clampedY - 27}px)`;
    setMoveFromPad(clampedX, clampedY);
  });

  function resetPad() {
    padActive = false;
    nub.style.transform = "translate(-50%,-50%)";
    move.forward = move.backward = move.left = move.right = false;
  }

  pad.addEventListener("pointerup", resetPad);
  pad.addEventListener("pointercancel", resetPad);

  // Vertical lift slider (right side)
  const lift = document.createElement("input");
  lift.type = "range";
  lift.min = "-1";
  lift.max = "1";
  lift.step = "0.01";
  lift.value = "0";
  lift.style.cssText = `
    position: fixed;
    right: 18px;
    bottom: 28px;
    width: 160px;
    transform: rotate(-90deg);
    transform-origin: right bottom;
    z-index: 20;
    opacity: 0.9;
  `;
  document.body.appendChild(lift);

  lift.addEventListener("input", () => {
    const v = parseFloat(lift.value);
    move.up = v > 0.15;
    move.down = v < -0.15;
    if (Math.abs(v) <= 0.15) { move.up = false; move.down = false; }
  });
}

// =====================
// VISUAL HELPERS
// =====================
function makeStars() {
  const starsGeo = new THREE.BufferGeometry();
  const starCount = 1800;
  const starPos = new Float32Array(starCount * 3);

  for (let i = 0; i < starCount; i++) {
    const r = 80 + Math.random() * 220;
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.acos(2 * Math.random() - 1);
    starPos[i * 3 + 0] = r * Math.sin(phi) * Math.cos(theta);
    starPos[i * 3 + 1] = r * Math.cos(phi);
    starPos[i * 3 + 2] = r * Math.sin(phi) * Math.sin(theta);
  }

  starsGeo.setAttribute("position", new THREE.BufferAttribute(starPos, 3));
  return new THREE.Points(
    starsGeo,
    new THREE.PointsMaterial({ color: 0xffffff, size: 0.6, sizeAttenuation: true })
  );
}
