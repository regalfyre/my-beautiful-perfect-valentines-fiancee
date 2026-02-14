// main.js
const overlay = document.getElementById("overlay");
const mobileUI = document.getElementById("mobileUI");
const stickBase = document.getElementById("stickBase");
const stick = document.getElementById("stick");

const isTouch =
  "ontouchstart" in window ||
  navigator.maxTouchPoints > 0 ||
  window.matchMedia?.("(pointer:coarse)")?.matches;

let scene, camera, renderer;
let controls = null;

let yaw = 0;
let pitch = 0;

let moveF = 0; // forward/back
let moveS = 0; // strafe
let velocity = new THREE.Vector3();

let started = false;

overlay.addEventListener("click", () => start());
overlay.addEventListener("touchend", (e) => {
  e.preventDefault();
  start();
}, { passive: false });

function start() {
  if (started) return;
  started = true;

  overlay.classList.add("hidden");
  init();
}

function init() {
  scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(0x000000, 0.055);

  camera = new THREE.PerspectiveCamera(
    70,
    window.innerWidth / window.innerHeight,
    0.05,
    200
  );
  camera.position.set(0, 1.6, 6);

  renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  document.body.appendChild(renderer.domElement);

  // Star field
  addStars();

  // Soft ambient + key
  scene.add(new THREE.AmbientLight(0xffffff, 0.35));
  const key = new THREE.DirectionalLight(0xffffff, 0.85);
  key.position.set(6, 10, 5);
  scene.add(key);

  // Ground (subtle)
  const ground = new THREE.Mesh(
    new THREE.CircleGeometry(40, 64),
    new THREE.MeshStandardMaterial({
      color: 0x05060a,
      roughness: 1,
      metalness: 0
    })
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = 0;
  scene.add(ground);

  // Fountain/pool
  addFountain();

  // Controls
  if (!isTouch) {
    controls = new THREE.PointerLockControls(camera, document.body);
    document.body.addEventListener("click", () => {
      // only lock if overlay already gone
      if (overlay.classList.contains("hidden")) controls.lock();
    });
    scene.add(controls.getObject());

    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
  } else {
    mobileUI.classList.remove("hidden");
    setupTouchLook();
    setupJoystick();
  }

  // Load media
  loadAndPlace();

  window.addEventListener("resize", onResize);
  animate();
}

function addStars() {
  const starGeo = new THREE.BufferGeometry();
  const count = 1200;
  const pos = new Float32Array(count * 3);

  for (let i = 0; i < count; i++) {
    const r = 60 + Math.random() * 80;
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.acos(2 * Math.random() - 1);
    pos[i * 3 + 0] = r * Math.sin(phi) * Math.cos(theta);
    pos[i * 3 + 1] = Math.abs(r * Math.cos(phi)) + 2;
    pos[i * 3 + 2] = r * Math.sin(phi) * Math.sin(theta);
  }

  starGeo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  const stars = new THREE.Points(
    starGeo,
    new THREE.PointsMaterial({ color: 0xffffff, size: 0.06 })
  );
  scene.add(stars);
}

function addFountain() {
  // Pool rim
  const rim = new THREE.Mesh(
    new THREE.CylinderGeometry(3.2, 3.2, 0.45, 64, 1, true),
    new THREE.MeshStandardMaterial({
      color: 0x0b0c14,
      metalness: 0.2,
      roughness: 0.8
    })
  );
  rim.position.y = 0.22;
  scene.add(rim);

  // Water (simple animated shimmer)
  const waterMat = new THREE.MeshStandardMaterial({
    color: 0x1b3cff,
    emissive: 0x071027,
    roughness: 0.15,
    metalness: 0.0,
    transparent: true,
    opacity: 0.55
  });

  const water = new THREE.Mesh(
    new THREE.CircleGeometry(3.05, 64),
    waterMat
  );
  water.rotation.x = -Math.PI / 2;
  water.position.y = 0.26;
  water.userData.isWater = true;
  scene.add(water);

  // Center column
  const col = new THREE.Mesh(
    new THREE.CylinderGeometry(0.35, 0.55, 1.1, 28),
    new THREE.MeshStandardMaterial({
      color: 0x0c0d16,
      roughness: 0.6,
      metalness: 0.25
    })
  );
  col.position.y = 0.55;
  scene.add(col);

  // Tiny “still fountain” glow
  const glow = new THREE.PointLight(0xa7b6ff, 1.2, 12);
  glow.position.set(0, 1.2, 0);
  scene.add(glow);
}

async function loadAndPlace() {
  // These paths MUST match your repo layout
  const photosUrl = "./data/photos.json";
  const poemsUrl = "./data/poems.json";

  let photos = [];
  let poems = [];

  try {
    const p = await fetch(photosUrl, { cache: "no-store" }).then(r => r.json());
    photos = Array.isArray(p.items) ? p.items : [];
  } catch (e) {
    console.warn("Could not load photos.json", e);
  }

  try {
    const q = await fetch(poemsUrl, { cache: "no-store" }).then(r => r.json());
    poems = Array.isArray(q.items) ? q.items : [];
  } catch (e) {
    console.warn("Could not load poems.json", e);
  }

  placeFloatingPhotos(photos);
  placePoemsOnWater(poems);
}

function placeFloatingPhotos(items) {
  const loader = new THREE.TextureLoader();
  const radius = 7.2;
  const baseY = 1.6;

  items.slice(0, 220).forEach((it, i) => {
    const angle = (i / Math.max(items.length, 1)) * Math.PI * 2;
    const r = radius + (Math.random() - 0.5) * 1.2;

    const tex = loader.load(it.src);
    tex.colorSpace = THREE.SRGBColorSpace;

    const w = 1.35;
    const h = 0.95;

    const plane = new THREE.Mesh(
      new THREE.PlaneGeometry(w, h),
      new THREE.MeshStandardMaterial({
        map: tex,
        transparent: true,
        roughness: 0.8,
        metalness: 0.0
      })
    );

    plane.position.set(
      Math.cos(angle) * r,
      baseY + (Math.random() - 0.5) * 1.1,
      Math.sin(angle) * r
    );

    // face center
    plane.lookAt(0, baseY, 0);

    // float animation params
    plane.userData.floatPhase = Math.random() * Math.PI * 2;
    plane.userData.floatSpeed = 0.6 + Math.random() * 0.7;
    plane.userData.baseY = plane.position.y;

    scene.add(plane);
  });
}

function placePoemsOnWater(items) {
  const loader = new THREE.TextureLoader();
  const waterY = 0.265;

  // Arrange poems in a gentle ring on the pool surface
  const ringR = 1.55;
  items.slice(0, 18).forEach((it, i) => {
    const angle = (i / Math.max(items.length, 1)) * Math.PI * 2;

    const tex = loader.load(it.src);
    tex.colorSpace = THREE.SRGBColorSpace;

    const plane = new THREE.Mesh(
      new THREE.PlaneGeometry(1.15, 0.75),
      new THREE.MeshStandardMaterial({
        map: tex,
        transparent: true,
        roughness: 0.9,
        metalness: 0.0,
        opacity: 0.95
      })
    );

    plane.rotation.x = -Math.PI / 2;
    plane.position.set(
      Math.cos(angle) * ringR,
      waterY + 0.01,
      Math.sin(angle) * ringR
    );

    scene.add(plane);
  });
}

function onResize() {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
}

function onKeyDown(e) {
  if (e.code === "KeyW") moveF = 1;
  if (e.code === "KeyS") moveF = -1;
  if (e.code === "KeyA") moveS = -1;
  if (e.code === "KeyD") moveS = 1;
}
function onKeyUp(e) {
  if (e.code === "KeyW" || e.code === "KeyS") moveF = 0;
  if (e.code === "KeyA" || e.code === "KeyD") moveS = 0;
}

// Touch look: drag on right side
function setupTouchLook() {
  let dragging = false;
  let lastX = 0, lastY = 0;

  window.addEventListener("pointerdown", (e) => {
    // ignore joystick area
    const rect = stickBase.getBoundingClientRect();
    if (e.clientX >= rect.left && e.clientX <= rect.right && e.clientY >= rect.top && e.clientY <= rect.bottom) return;

    dragging = true;
    lastX = e.clientX;
    lastY = e.clientY;
  });

  window.addEventListener("pointermove", (e) => {
    if (!dragging) return;
    const dx = e.clientX - lastX;
    const dy = e.clientY - lastY;
    lastX = e.clientX;
    lastY = e.clientY;

    yaw -= dx * 0.0032;
    pitch -= dy * 0.0028;
    pitch = Math.max(-1.2, Math.min(1.2, pitch));
  });

  window.addEventListener("pointerup", () => dragging = false);
}

function setupJoystick() {
  let active = false;
  let baseX = 0, baseY = 0;

  stickBase.addEventListener("pointerdown", (e) => {
    active = true;
    stickBase.setPointerCapture(e.pointerId);
    const rect = stickBase.getBoundingClientRect();
    baseX = rect.left + rect.width / 2;
    baseY = rect.top + rect.height / 2;
    updateStick(e.clientX, e.clientY);
  });

  stickBase.addEventListener("pointermove", (e) => {
    if (!active) return;
    updateStick(e.clientX, e.clientY);
  });

  stickBase.addEventListener("pointerup", () => {
    active = false;
    stick.style.left = "50%";
    stick.style.top = "50%";
    moveF = 0;
    moveS = 0;
  });

  function updateStick(x, y) {
    const dx = x - baseX;
    const dy = y - baseY;
    const max = 42;
    const mag = Math.min(max, Math.hypot(dx, dy));
    const ang = Math.atan2(dy, dx);

    const sx = Math.cos(ang) * mag;
    const sy = Math.sin(ang) * mag;

    stick.style.left = `calc(50% + ${sx}px)`;
    stick.style.top = `calc(50% + ${sy}px)`;

    // map to movement
    moveS = sx / max;      // left/right
    moveF = -sy / max;     // forward/back
  }
}

function animate() {
  requestAnimationFrame(animate);

  // animate float + water shimmer
  const t = performance.now() * 0.001;

  scene.traverse((obj) => {
    if (obj.isMesh && obj.userData.baseY != null) {
      obj.position.y = obj.userData.baseY + Math.sin(t * obj.userData.floatSpeed + obj.userData.floatPhase) * 0.12;
      obj.rotation.z = Math.sin(t * 0.45 + obj.userData.floatPhase) * 0.06;
    }
    if (obj.isMesh && obj.userData.isWater) {
      obj.material.opacity = 0.52 + Math.sin(t * 1.3) * 0.04;
    }
  });

  // movement
  const speed = 0.06;

  if (!isTouch && controls) {
    const obj = controls.getObject();
    const forward = new THREE.Vector3();
    obj.getWorldDirection(forward);
    forward.y = 0;
    forward.normalize();

    const right = new THREE.Vector3().crossVectors(forward, new THREE.Vector3(0, 1, 0)).normalize();

    velocity.set(0, 0, 0);
    velocity.addScaledVector(forward, moveF * speed);
    velocity.addScaledVector(right, moveS * speed);

    obj.position.add(velocity);
  }

  if (isTouch) {
    // apply yaw/pitch to camera
    camera.rotation.order = "YXZ";
    camera.rotation.y = yaw;
    camera.rotation.x = pitch;

    const forward = new THREE.Vector3(0, 0, -1).applyEuler(camera.rotation);
    forward.y = 0;
    forward.normalize();

    const right = new THREE.Vector3().crossVectors(forward, new THREE.Vector3(0, 1, 0)).normalize();

    velocity.set(0, 0, 0);
    velocity.addScaledVector(forward, moveF * speed);
    velocity.addScaledVector(right, moveS * speed);

    camera.position.add(velocity);
  }

  renderer.render(scene, camera);
}
