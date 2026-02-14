// main.js (drop-in fix)
// Goal: make Enter/overlay click ALWAYS work + show a visible scene

console.log("✅ main.js loaded");

const overlay = document.getElementById("overlay");
if (!overlay) {
  console.error("❌ #overlay not found. Check index.html has <div id='overlay'>");
}

const isTouch =
  "ontouchstart" in window ||
  navigator.maxTouchPoints > 0 ||
  window.matchMedia?.("(pointer:coarse)")?.matches;

let scene, camera, renderer;
let controls = null;
let started = false;

// Touch look variables
let yaw = 0;
let pitch = 0;
let dragging = false;
let lastX = 0, lastY = 0;

// Basic movement
const keys = { w: false, a: false, s: false, d: false };

function hideOverlay() {
  overlay.classList.add("hidden");
  console.log("✅ overlay hidden");
}

function start() {
  if (started) return;
  started = true;
  hideOverlay();
  boot();
}

overlay?.addEventListener("click", () => {
  console.log("✅ overlay clicked");
  start();
});

overlay?.addEventListener("touchend", (e) => {
  e.preventDefault();
  console.log("✅ overlay tapped");
  start();
}, { passive: false });

// --- BOOT SCENE ---
function boot() {
  // Make sure THREE exists (your index.html loads three.min.js)
  const THREE = window.THREE;
  if (!THREE) {
    console.error("❌ THREE is undefined. three.min.js isn't loading in index.html.");
    return;
  }

  scene = new THREE.Scene();
  scene.fog = new THREE.Fog(0x000000, 8, 80);

  camera = new THREE.PerspectiveCamera(70, innerWidth / innerHeight, 0.1, 300);
  camera.position.set(0, 1.6, 7);

  renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setSize(innerWidth, innerHeight);
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  document.body.appendChild(renderer.domElement);

  // Lights
  scene.add(new THREE.AmbientLight(0xffffff, 0.35));
  const key = new THREE.DirectionalLight(0xffffff, 0.9);
  key.position.set(4, 9, 3);
  scene.add(key);

  // Ground
  const ground = new THREE.Mesh(
    new THREE.CircleGeometry(40, 64),
    new THREE.MeshStandardMaterial({ color: 0x05060a, roughness: 1 })
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = 0;
  scene.add(ground);

  // Fountain (simple “pool”)
  const rim = new THREE.Mesh(
    new THREE.CylinderGeometry(3.2, 3.2, 0.45, 64, 1, true),
    new THREE.MeshStandardMaterial({ color: 0x0a0b12, roughness: 0.7, metalness: 0.2 })
  );
  rim.position.y = 0.22;
  scene.add(rim);

  const water = new THREE.Mesh(
    new THREE.CircleGeometry(3.05, 64),
    new THREE.MeshStandardMaterial({
      color: 0x3355ff,
      emissive: 0x091026,
      roughness: 0.15,
      transparent: true,
      opacity: 0.55
    })
  );
  water.rotation.x = -Math.PI / 2;
  water.position.y = 0.26;
  water.userData.isWater = true;
  scene.add(water);

  const glow = new THREE.PointLight(0xaab6ff, 1.25, 14);
  glow.position.set(0, 1.25, 0);
  scene.add(glow);

  // Stars
  const starGeo = new THREE.BufferGeometry();
  const starCount = 1400;
  const starPos = new Float32Array(starCount * 3);
  for (let i = 0; i < starCount; i++) {
    const r = 70 + Math.random() * 90;
    const a = Math.random() * Math.PI * 2;
    const y = (Math.random() - 0.5) * 70 + 10;
    starPos[i * 3 + 0] = Math.cos(a) * r;
    starPos[i * 3 + 1] = y;
    starPos[i * 3 + 2] = Math.sin(a) * r;
  }
  starGeo.setAttribute("position", new THREE.BufferAttribute(starPos, 3));
  const stars = new THREE.Points(
    starGeo,
    new THREE.PointsMaterial({ color: 0xffffff, size: 0.06 })
  );
  scene.add(stars);

  // Controls: desktop pointer lock if available
  if (!isTouch && window.THREE.PointerLockControls) {
    controls = new window.THREE.PointerLockControls(camera, document.body);
    scene.add(controls.getObject());

    document.body.addEventListener("click", () => {
      // only try locking after overlay hidden
      if (overlay.classList.contains("hidden")) {
        controls.lock();
        console.log("✅ trying pointer lock");
      }
    });

    window.addEventListener("keydown", (e) => {
      if (e.code === "KeyW") keys.w = true;
      if (e.code === "KeyA") keys.a = true;
      if (e.code === "KeyS") keys.s = true;
      if (e.code === "KeyD") keys.d = true;
    });

    window.addEventListener("keyup", (e) => {
      if (e.code === "KeyW") keys.w = false;
      if (e.code === "KeyA") keys.a = false;
      if (e.code === "KeyS") keys.s = false;
      if (e.code === "KeyD") keys.d = false;
    });
  } else {
    // Touch fallback: swipe to look, tap-hold left side to move forward
    console.log("📱 touch mode enabled");

    window.addEventListener("pointerdown", (e) => {
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

      yaw -= dx * 0.003;
      pitch -= dy * 0.0025;
      pitch = Math.max(-1.2, Math.min(1.2, pitch));

      camera.rotation.order = "YXZ";
      camera.rotation.y = yaw;
      camera.rotation.x = pitch;
    });

    window.addEventListener("pointerup", () => (dragging = false));
  }

  window.addEventListener("resize", onResize);

  console.log("✅ scene booted");
  animate();
}

function onResize() {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
}

function animate() {
  requestAnimationFrame(animate);

  const t = performance.now() * 0.001;

  // shimmer water
  scene.traverse((obj) => {
    if (obj.isMesh && obj.userData.isWater) {
      obj.material.opacity = 0.52 + Math.sin(t * 1.3) * 0.04;
    }
  });

  // basic movement (desktop)
  if (controls && controls.isLocked) {
    const THREE = window.THREE;
    const speed = 0.07;

    const forward = new THREE.Vector3();
    controls.getObject().getWorldDirection(forward);
    forward.y = 0;
    forward.normalize();

    const right = new THREE.Vector3().crossVectors(forward, new THREE.Vector3(0, 1, 0)).normalize();

    const moveF = (keys.w ? 1 : 0) - (keys.s ? 1 : 0);
    const moveS = (keys.d ? 1 : 0) - (keys.a ? 1 : 0);

    controls.getObject().position.addScaledVector(forward, moveF * speed);
    controls.getObject().position.addScaledVector(right, moveS * speed);
  }

  renderer.render(scene, camera);
}
