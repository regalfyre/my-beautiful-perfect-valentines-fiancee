// main.js
// Three.js scene: walkable shrine + floating photos + poem images on water.
// Works with:
//   data/photos.json => { "photos": [ { "url": "..." }, ... ] }
//   data/poems.json  => { "poems":  [ { "url": "..." }, ... ] }

import * as THREE from "https://unpkg.com/three@0.159.0/build/three.module.js";
import { PointerLockControls } from "https://unpkg.com/three@0.159.0/examples/jsm/controls/PointerLockControls.js";

const overlay = document.getElementById("overlay");

// ---------- Scene basics ----------
const scene = new THREE.Scene();
scene.fog = new THREE.FogExp2(0x000000, 0.03);

const camera = new THREE.PerspectiveCamera(
  75,
  window.innerWidth / window.innerHeight,
  0.05,
  500
);
camera.position.set(0, 1.7, 6);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
document.body.appendChild(renderer.domElement);

// ---------- Controls ----------
const controls = new PointerLockControls(camera, document.body);

// Movement state
const move = {
  forward: false,
  backward: false,
  left: false,
  right: false,
  up: false,
  down: false
};

let canPointerLock = true;

// Overlay click: pointer lock (desktop), on mobile we just hide overlay
overlay.addEventListener("click", () => {
  overlay.classList.add("hidden");

  // Pointer lock only makes sense on desktop
  if (canPointerLock && "pointerLockElement" in document) {
    controls.lock();
  }
});

// Desktop pointer lock behavior
controls.addEventListener("lock", () => overlay.classList.add("hidden"));
controls.addEventListener("unlock", () => overlay.classList.remove("hidden"));

// Keyboard
window.addEventListener("keydown", (e) => {
  const k = e.key.toLowerCase();

  if (k === "w") move.forward = true;
  if (k === "s") move.backward = true;
  if (k === "a") move.left = true;
  if (k === "d") move.right = true;

  // Up/down
  if (e.key === "ArrowUp" || k === "r") move.up = true;
  if (e.key === "ArrowDown" || k === "f") move.down = true;
});

window.addEventListener("keyup", (e) => {
  const k = e.key.toLowerCase();

  if (k === "w") move.forward = false;
  if (k === "s") move.backward = false;
  if (k === "a") move.left = false;
  if (k === "d") move.right = false;

  if (e.key === "ArrowUp" || k === "r") move.up = false;
  if (e.key === "ArrowDown" || k === "f") move.down = false;
});

// ---------- Mobile touch look + move UI ----------
const isTouch = matchMedia("(pointer: coarse)").matches || "ontouchstart" in window;
if (isTouch) {
  canPointerLock = false; // avoid pointer lock on mobile

  // Hide overlay on first tap so it feels like "Enter"
  overlay.querySelector("p").textContent = "Tap to begin";

  // Simple touch look:
  let lookActive = false;
  let lastX = 0, lastY = 0;

  const lookSensitivity = 0.0022;

  renderer.domElement.addEventListener("touchstart", (e) => {
    if (!overlay.classList.contains("hidden")) overlay.classList.add("hidden");
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

    // yaw (left/right)
    camera.rotation.y -= dx * lookSensitivity;

    // pitch (up/down), clamp
    camera.rotation.x -= dy * lookSensitivity;
    camera.rotation.x = Math.max(-1.2, Math.min(1.2, camera.rotation.x));
  }, { passive: true });

  renderer.domElement.addEventListener("touchend", () => {
    lookActive = false;
  }, { passive: true });

  // On-screen move pad (bottom-left)
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
    // Normalize to -1..1
    const nx = Math.max(-1, Math.min(1, dx / 45));
    const ny = Math.max(-1, Math.min(1, dy / 45));

    // Up on screen = forward
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

// ---------- Lights ----------
scene.add(new THREE.AmbientLight(0xffffff, 0.25));

const keyLight = new THREE.DirectionalLight(0xffffff, 0.7);
keyLight.position.set(4, 10, 6);
scene.add(keyLight);

const rim = new THREE.PointLight(0x88aaff, 1.2, 40, 2);
rim.position.set(0, 4, -8);
scene.add(rim);

// ---------- Star field ----------
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
const stars = new THREE.Points(
  starsGeo,
  new THREE.PointsMaterial({ color: 0xffffff, size: 0.6, sizeAttenuation: true })
);
scene.add(stars);

// ---------- Ground boundary (subtle) ----------
const ground = new THREE.Mesh(
  new THREE.CircleGeometry(24, 64),
  new THREE.MeshStandardMaterial({
    color: 0x05060f,
    roughness: 0.95,
    metalness: 0.0
  })
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

// ---------- Fountain + water ----------
const fountainGroup = new THREE.Group();
scene.add(fountainGroup);

// pedestal
const pedestal = new THREE.Mesh(
  new THREE.CylinderGeometry(2.4, 2.8, 0.8, 48),
  new THREE.MeshStandardMaterial({ color: 0x101326, roughness: 0.75, metalness: 0.2 })
);
pedestal.position.y = 0.4;
fountainGroup.add(pedestal);

// pool lip
const lip = new THREE.Mesh(
  new THREE.TorusGeometry(2.1, 0.12, 20, 80),
  new THREE.MeshStandardMaterial({ color: 0x1a1f3b, roughness: 0.55, metalness: 0.35 })
);
lip.rotation.x = Math.PI / 2;
lip.position.y = 0.82;
fountainGroup.add(lip);

// water plane (simple animated shader-ish via opacity + normal-ish texture)
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

// glow
const glow = new THREE.PointLight(0x6aa3ff, 1.6, 18, 2.2);
glow.position.set(0, 2.0, 0);
fountainGroup.add(glow);

// ---------- Helpers ----------
const loader = new THREE.TextureLoader();

function makeImagePlane(url, w = 1.4, h = 1.0) {
  return new Promise((resolve, reject) => {
    loader.load(
      url,
      (tex) => {
        tex.colorSpace = THREE.SRGBColorSpace;
        tex.minFilter = THREE.LinearMipmapLinearFilter;
        tex.magFilter = THREE.LinearFilter;

        const mat = new THREE.MeshBasicMaterial({
          map: tex,
          transparent: true
        });

        const geo = new THREE.PlaneGeometry(w, h);
        const mesh = new THREE.Mesh(geo, mat);
        resolve(mesh);
      },
      undefined,
      (err) => reject(err)
    );
  });
}

function clampToArena(pos) {
  // keep within radius 22 on XZ
  const r = Math.sqrt(pos.x * pos.x + pos.z * pos.z);
  const maxR = 22;
  if (r > maxR) {
    pos.x = (pos.x / r) * maxR;
    pos.z = (pos.z / r) * maxR;
  }
  // keep above ground
  pos.y = Math.max(0.6, Math.min(8, pos.y));
}

// ---------- Load JSON + spawn art ----------
async function loadManifests() {
  const [photosRes, poemsRes] = await Promise.all([
    fetch("./data/photos.json", { cache: "no-store" }),
    fetch("./data/poems.json", { cache: "no-store" })
  ]);

  if (!photosRes.ok) throw new Error(`photos.json HTTP ${photosRes.status}`);
  if (!poemsRes.ok) throw new Error(`poems.json HTTP ${poemsRes.status}`);

  const photosJson = await photosRes.json();
  const poemsJson = await poemsRes.json();

  const photos = Array.isArray(photosJson.photos) ? photosJson.photos : [];
  const poems = Array.isArray(poemsJson.poems) ? poemsJson.poems : [];

  console.log("photos:", photos.length, "poems:", poems.length);

  // Floating photos around fountain
  const photoGroup = new THREE.Group();
  scene.add(photoGroup);

  const radius = 8.5;
  const heightMin = 1.4;
  const heightMax = 4.8;

  for (let i = 0; i < photos.length; i++) {
    const url = photos[i]?.url;
    if (!url) continue;

    try {
      const plane = await makeImagePlane(url, 1.55, 1.15);

      // arrange in a loose spiral ring with depth variation
      const a = (i / Math.max(1, photos.length)) * Math.PI * 2;
      const r = radius + (Math.random() * 2.6 - 1.3);
      plane.position.set(
        Math.cos(a) * r,
        heightMin + Math.random() * (heightMax - heightMin),
        Math.sin(a) * r
      );

      plane.rotation.y = -a + Math.PI; // roughly face inward
      plane.userData.floatSeed = Math.random() * 1000;
      plane.userData.baseY = plane.position.y;

      photoGroup.add(plane);
    } catch (e) {
      console.error("FAILED photo:", url, e);
    }
  }

  // Poem images on water surface
  const poemGroup = new THREE.Group();
  fountainGroup.add(poemGroup);

  const poemY = 0.825; // just above water
  const poemRadius = 1.2;

  for (let i = 0; i < poems.length; i++) {
    const url = poems[i]?.url;
    if (!url) continue;

    try {
      const plane = await makeImagePlane(url, 0.95, 0.75);
      plane.position.set(
        Math.cos((i / Math.max(1, poems.length)) * Math.PI * 2) * poemRadius,
        poemY,
        Math.sin((i / Math.max(1, poems.length)) * Math.PI * 2) * poemRadius
      );
      plane.rotation.x = -Math.PI / 2; // lay flat
      plane.rotation.z = (Math.random() * 0.4 - 0.2); // slight angle
      poemGroup.add(plane);
    } catch (e) {
      console.error("FAILED poem:", url, e);
    }
  }

  // Store groups for animation
  scene.userData.photoGroup = photoGroup;
  scene.userData.poemGroup = poemGroup;
}

loadManifests().catch((e) => {
  console.error("Manifest load failed:", e);
});

// ---------- Animation loop ----------
const clock = new THREE.Clock();
const velocity = new THREE.Vector3();

function animate() {
  requestAnimationFrame(animate);
  const dt = Math.min(0.05, clock.getDelta());
  const t = clock.elapsedTime;

  // Subtle water pulse
  water.material.opacity = 0.50 + Math.sin(t * 1.6) * 0.05;

  // Float photos
  const pg = scene.userData.photoGroup;
  if (pg) {
    pg.children.forEach((m) => {
      const s = m.userData.floatSeed || 0;
      m.position.y = (m.userData.baseY || m.position.y) + Math.sin(t * 0.9 + s) * 0.12;
      // tiny sway
      m.rotation.z = Math.sin(t * 0.7 + s) * 0.04;
      // always gently face camera
      const target = new THREE.Vector3(camera.position.x, m.position.y, camera.position.z);
      m.lookAt(target);
    });
  }

  // Movement
  const speed = 4.2;      // horizontal
  const liftSpeed = 2.8;  // vertical

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

  if (velocity.lengthSq() > 0) velocity.normalize().multiplyScalar(speed * dt);

  // vertical
  if (move.up) camera.position.y += liftSpeed * dt;
  if (move.down) camera.position.y -= liftSpeed * dt;

  // apply horizontal
  camera.position.add(velocity);

  // bounds
  clampToArena(camera.position);

  renderer.render(scene, camera);
}

animate();

// ---------- Resize ----------
window.addEventListener("resize", () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});
