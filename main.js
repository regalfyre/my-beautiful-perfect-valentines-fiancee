// main.js (Three.js global build + PointerLockControls global build)
// Uses window.THREE and window.PointerLockControls from index.html scripts.

const { Scene, Color, PerspectiveCamera, WebGLRenderer, AmbientLight, PointLight,
        PlaneGeometry, MeshStandardMaterial, MeshBasicMaterial, Mesh,
        CylinderGeometry, Group, ShaderMaterial, TextureLoader,
        Vector2, Vector3, Raycaster } = THREE;

const overlay = document.getElementById("overlay");

// ---------- helpers ----------
async function loadJSON(url) {
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`Failed to load ${url}`);
  return await res.json();
}

function clamp(n, a, b) { return Math.max(a, Math.min(b, n)); }

// ---------- movement state ----------
const move = { f:false, b:false, l:false, r:false };
let controls;

// ---------- core scene ----------
const scene = new Scene();
scene.background = new Color(0x05060c);

const camera = new PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.1, 500);
camera.position.set(0, 1.65, 14);

const renderer = new WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.6));
document.body.appendChild(renderer.domElement);

// lights (simple + romantic)
scene.add(new AmbientLight(0x6b86a8, 0.35));
const warm = new PointLight(0xffd4ad, 1.25, 65);
warm.position.set(0, 6, 0);
scene.add(warm);

// ground (no texture)
const ground = new Mesh(
  new PlaneGeometry(120, 120),
  new MeshStandardMaterial({ color: 0x0c0f16, roughness: 1.0 })
);
ground.rotation.x = -Math.PI / 2;
scene.add(ground);

// ---------- pool + water ----------
function makeWaterMaterial() {
  return new ShaderMaterial({
    transparent: true,
    uniforms: {
      uTime: { value: 0.0 },
      uTint: { value: new THREE.Color(0x12445e) }
    },
    vertexShader: `
      uniform float uTime;
      varying vec2 vUv;
      varying float vWave;

      void main() {
        vUv = uv;
        vec3 p = position;

        float t = uTime;
        float w = 0.06*sin(p.x*0.9 + t*1.2)
                + 0.05*cos(p.y*1.1 + t*0.9)
                + 0.04*sin((p.x+p.y)*0.7 + t*1.5);

        p.z += w;
        vWave = w;

        gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
      }
    `,
    fragmentShader: `
      uniform float uTime;
      uniform vec3 uTint;
      varying vec2 vUv;
      varying float vWave;

      float rand(vec2 co){
        return fract(sin(dot(co.xy, vec2(12.9898,78.233))) * 43758.5453);
      }

      void main() {
        vec2 uv = vUv;
        float t = uTime;

        // subtle shimmer distortion
        uv += vec2(
          0.01*sin(uv.y*12.0 + t*0.9),
          0.01*cos(uv.x*10.0 + t*1.2)
        );

        float grad = smoothstep(0.0, 1.0, vUv.y);
        vec3 base = mix(uTint * 0.85, uTint * 1.18, grad);

        float n = rand(uv*220.0 + t*0.02);
        float sparkle = smoothstep(0.988, 1.0, n) * 0.12;

        float highlight = smoothstep(0.03, 0.10, abs(vWave)) * 0.25;

        vec3 color = base + sparkle + highlight;
        float alpha = 0.86;

        gl_FragColor = vec4(color, alpha);
      }
    `
  });
}

function makePool() {
  const g = new Group();

  // base
  const base = new Mesh(
    new CylinderGeometry(2.0, 2.3, 0.5, 64),
    new MeshStandardMaterial({ color: 0x2a2a2a, roughness: 0.9 })
  );
  base.position.y = 0.25;
  g.add(base);

  // rim (open cylinder)
  const rim = new Mesh(
    new CylinderGeometry(2.35, 2.35, 0.25, 64, 1, true),
    new MeshStandardMaterial({ color: 0x343434, roughness: 0.8, metalness: 0.05 })
  );
  rim.position.y = 0.55;
  g.add(rim);

  // water surface
  const water = new Mesh(
    new PlaneGeometry(4.2, 4.2, 140, 140),
    makeWaterMaterial()
  );
  water.rotation.x = -Math.PI / 2;
  water.position.y = 0.60;
  g.add(water);

  g.userData.water = water;

  scene.add(g);
  return g;
}

const pool = makePool();

// ---------- poem page on water ----------
function makePoemPageMaterial(tex) {
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.magFilter = THREE.LinearFilter;

  return new ShaderMaterial({
    transparent: true,
    uniforms: {
      uTime: { value: 0.0 },
      uTex: { value: tex }
    },
    vertexShader: `
      uniform float uTime;
      varying vec2 vUv;

      void main() {
        vUv = uv;
        vec3 p = position;

        float t = uTime;
        // tiny bob so it feels afloat
        p.y += 0.02*sin(t*1.3 + p.x*0.5 + p.z*0.5);

        gl_Position = projectionMatrix * modelViewMatrix * vec4(p,1.0);
      }
    `,
    fragmentShader: `
      uniform float uTime;
      uniform sampler2D uTex;
      varying vec2 vUv;

      void main() {
        float t = uTime;
        vec2 uv = vUv;

        // gentle ripple warp
        float ripple = 0.010*sin(uv.x*10.0 + t*1.2)
                     + 0.010*cos(uv.y*12.0 + t*0.9);
        uv += vec2(ripple, -ripple);

        vec4 tex = texture2D(uTex, uv);

        // soft brighten (paper presence)
        tex.rgb = mix(tex.rgb, vec3(1.0), 0.06);

        gl_FragColor = vec4(tex.rgb, tex.a);
      }
    `
  });
}

const loader = new TextureLoader();
let poemPage = null;

async function loadPoemFirst(poemURL) {
  return await new Promise((resolve, reject) => {
    loader.load(poemURL, resolve, undefined, reject);
  });
}

function createPoemPage(tex) {
  const img = tex.image;
  const aspect = img ? (img.width / img.height) : 1.0;

  const h = 1.75;
  const w = h * aspect;

  const page = new Mesh(
    new PlaneGeometry(w, h, 1, 1),
    makePoemPageMaterial(tex)
  );

  page.rotation.x = -Math.PI / 2;
  page.position.set(0, 0.605, 0); // just above water
  page.rotation.z = 0.10;         // slight tilt

  scene.add(page);
  return page;
}

// ---------- floating photos (only photos of you two) ----------
function makePhotoRing(urls) {
  const group = new Group();
  const count = Math.min(urls.length, 30);
  const radius = 10.5;

  for (let i = 0; i < count; i++) {
    const a = (i / count) * Math.PI * 2;
    const x = Math.cos(a) * radius;
    const z = Math.sin(a) * radius;

    const tex = loader.load(urls[i]);
    tex.minFilter = THREE.LinearMipmapLinearFilter;
    tex.magFilter = THREE.LinearFilter;

    const mat = new MeshBasicMaterial({ map: tex, transparent: true });
    const geo = new PlaneGeometry(2.4, 1.8);

    const m = new Mesh(geo, mat);
    m.position.set(x, 1.6 + Math.random() * 0.9, z);
    m.rotation.y = -a + Math.PI / 2;
    m.rotation.z = (Math.random() - 0.5) * 0.22;

    m.userData.phase = Math.random() * Math.PI * 2;
    m.userData.baseY = m.position.y;

    group.add(m);
  }

  group.userData.photos = group.children;
  scene.add(group);
  return group;
}

let photoRing = null;

// ---------- soft bounds (keep it a “bounded zone”) ----------
const BOUND_RADIUS = 18;

function applyBounds(pos) {
  // keep player inside circle on XZ plane
  const x = pos.x;
  const z = pos.z;
  const d = Math.sqrt(x*x + z*z);
  if (d > BOUND_RADIUS) {
    const s = (BOUND_RADIUS - 0.02) / d;
    pos.x *= s;
    pos.z *= s;
  }
}

// ---------- controls ----------
function initControls() {
  controls = new PointerLockControls(camera, document.body);
  scene.add(controls.getObject());

  overlay.addEventListener("click", () => controls.lock());
  controls.addEventListener("lock", () => overlay.classList.add("hidden"));
  controls.addEventListener("unlock", () => overlay.classList.remove("hidden"));

  window.addEventListener("keydown", (e) => {
    if (e.code === "KeyW") move.f = true;
    if (e.code === "KeyS") move.b = true;
    if (e.code === "KeyA") move.l = true;
    if (e.code === "KeyD") move.r = true;
  });

  window.addEventListener("keyup", (e) => {
    if (e.code === "KeyW") move.f = false;
    if (e.code === "KeyS") move.b = false;
    if (e.code === "KeyA") move.l = false;
    if (e.code === "KeyD") move.r = false;
  });
}

function updateWalk(dt) {
  const speed = 5.1;

  const dir = new Vector3(
    (move.r ? 1 : 0) - (move.l ? 1 : 0),
    0,
    (move.b ? 1 : 0) - (move.f ? 1 : 0)
  );

  if (dir.lengthSq() > 0) dir.normalize();

  const forward = new Vector3();
  controls.getDirection(forward);
  forward.y = 0;
  forward.normalize();

  const right = new Vector3().crossVectors(forward, new Vector3(0, 1, 0)).normalize();

  const delta = new Vector3()
    .addScaledVector(forward, dir.z)
    .addScaledVector(right, dir.x)
    .multiplyScalar(speed * dt);

  const p = controls.getObject().position;
  p.add(delta);

  // fix height (simple FPS)
  p.y = 1.65;

  // bounded shrine zone
  applyBounds(p);
}

// ---------- boot ----------
initControls();

(async function boot() {
  // Load data
  const photosData = await loadJSON("./data/photos.json");
  const poemsData = await loadJSON("./data/poems.json");

  const photoUrls = (photosData.photos || []).map(p => p.url).filter(Boolean);
  const poemUrls = (poemsData.poems || []).map(p => p.url).filter(Boolean);

  if (photoUrls.length) photoRing = makePhotoRing(photoUrls);

  if (poemUrls.length) {
    const tex = await loadPoemFirst(poemUrls[0]);
    poemPage = createPoemPage(tex);
  }

  // render loop
  const clock = new THREE.Clock();

  function animate() {
    requestAnimationFrame(animate);
    const dt = Math.min(0.05, clock.getDelta());
    const t = clock.elapsedTime;

    // animate water + poem page
    pool.userData.water.material.uniforms.uTime.value = t;
    if (poemPage) poemPage.material.uniforms.uTime.value = t;

    // float photos gently
    if (photoRing) {
      for (const m of photoRing.userData.photos) {
        const ph = m.userData.phase || 0;
        m.position.y = m.userData.baseY + Math.sin(t * 0.8 + ph) * 0.18;
      }
    }

    if (controls.isLocked) updateWalk(dt);

    renderer.render(scene, camera);
  }

  animate();
})().catch(err => {
  console.error(err);
  alert(err.message || String(err));
});

// resize
window.addEventListener("resize", () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});
