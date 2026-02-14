// main.js (redo: stable, wow, works on desktop + mobile)
console.log("✅ main.js loaded");

const overlay = document.getElementById("overlay");
if (!overlay) console.error("❌ #overlay missing in index.html");

const THREE = window.THREE;
if (!THREE) console.error("❌ THREE missing. Make sure three.min.js is loaded before main.js");

let scene, camera, renderer;
let controls = null;

let started = false;

// camera look
let yaw = 0;
let pitch = 0;

// desktop keys
const keys = { w:false, a:false, s:false, d:false };
let pitchDir = 0; // ArrowUp/ArrowDown

// pointer drag look (works for desktop + mobile)
let looking = false;
let lastX = 0, lastY = 0;

// joysticks
let moveStick = { x:0, y:0 }; // left joystick
let pitchStick = 0;           // right joystick vertical (-1..+1)

// ======= START HOOKS =======
overlay?.addEventListener("click", () => {
  console.log("✅ overlay clicked");
  start();
});
overlay?.addEventListener("touchend", (e) => {
  e.preventDefault();
  console.log("✅ overlay tapped");
  start();
},{ passive:false });

function start(){
  if (started) return;
  started = true;
  overlay.classList.add("hidden");
  boot();
}

// ======= BOOT =======
function boot(){
  if (!THREE) return;

  scene = new THREE.Scene();
  scene.fog = new THREE.Fog(0x000000, 10, 120);

  camera = new THREE.PerspectiveCamera(70, innerWidth/innerHeight, 0.1, 400);
  camera.position.set(0, 1.6, 8);

  renderer = new THREE.WebGLRenderer({ antialias:true });
  renderer.setSize(innerWidth, innerHeight);
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  document.body.appendChild(renderer.domElement);

  // lights
  scene.add(new THREE.AmbientLight(0xffffff, 0.35));
  const sun = new THREE.DirectionalLight(0xffffff, 0.9);
  sun.position.set(6, 14, 6);
  scene.add(sun);

  addStars();
  addGroundAndFountain();

  setupDesktopKeys();
  setupPointerDragLook();
  setupPointerLockControls();
  setupUIJoysticks(); // ALWAYS visible now

  // try loading media
  loadAndPlaceMedia();

  window.addEventListener("resize", onResize);

  console.log("✅ scene booted");
  animate();
}

// ======= SCENE OBJECTS =======
function addStars(){
  const starGeo = new THREE.BufferGeometry();
  const count = 1800;
  const pos = new Float32Array(count * 3);

  for (let i=0;i<count;i++){
    const r = 80 + Math.random()*120;
    const a = Math.random()*Math.PI*2;
    const y = (Math.random()-0.5)*90 + 15;

    pos[i*3+0] = Math.cos(a) * r;
    pos[i*3+1] = y;
    pos[i*3+2] = Math.sin(a) * r;
  }
  starGeo.setAttribute("position", new THREE.BufferAttribute(pos, 3));

  const stars = new THREE.Points(
    starGeo,
    new THREE.PointsMaterial({ color:0xffffff, size:0.06 })
  );
  scene.add(stars);
}

function addGroundAndFountain(){
  // ground
  const ground = new THREE.Mesh(
    new THREE.CircleGeometry(55, 96),
    new THREE.MeshStandardMaterial({ color:0x05060a, roughness:1 })
  );
  ground.rotation.x = -Math.PI/2;
  scene.add(ground);

  // fountain bowl rim
  const rim = new THREE.Mesh(
    new THREE.CylinderGeometry(3.25, 3.25, 0.48, 72, 1, true),
    new THREE.MeshStandardMaterial({ color:0x0a0b12, roughness:0.65, metalness:0.25 })
  );
  rim.position.y = 0.24;
  scene.add(rim);

  // water surface
  const water = new THREE.Mesh(
    new THREE.CircleGeometry(3.08, 72),
    new THREE.MeshStandardMaterial({
      color: 0x2b55ff,
      emissive: 0x071023,
      roughness: 0.12,
      transparent: true,
      opacity: 0.58
    })
  );
  water.rotation.x = -Math.PI/2;
  water.position.y = 0.265;
  water.userData.isWater = true;
  scene.add(water);

  // glow light
  const glow = new THREE.PointLight(0xaab6ff, 1.35, 18);
  glow.position.set(0, 1.2, 0);
  scene.add(glow);

  // subtle center pillar
  const pillar = new THREE.Mesh(
    new THREE.CylinderGeometry(0.15, 0.22, 1.2, 24),
    new THREE.MeshStandardMaterial({ color:0x0b0c14, roughness:0.4, metalness:0.35 })
  );
  pillar.position.y = 0.6;
  scene.add(pillar);
}

// ======= INPUT: DESKTOP KEYS =======
function setupDesktopKeys(){
  window.addEventListener("keydown", (e)=>{
    if (e.code==="KeyW") keys.w=true;
    if (e.code==="KeyA") keys.a=true;
    if (e.code==="KeyS") keys.s=true;
    if (e.code==="KeyD") keys.d=true;

    if (e.code==="ArrowUp") pitchDir = +1;
    if (e.code==="ArrowDown") pitchDir = -1;
  });

  window.addEventListener("keyup", (e)=>{
    if (e.code==="KeyW") keys.w=false;
    if (e.code==="KeyA") keys.a=false;
    if (e.code==="KeyS") keys.s=false;
    if (e.code==="KeyD") keys.d=false;

    if (e.code==="ArrowUp" || e.code==="ArrowDown") pitchDir = 0;
  });
}

// ======= INPUT: DRAG LOOK (works everywhere) =======
function setupPointerDragLook(){
  // Only drag-look when overlay hidden
  window.addEventListener("pointerdown", (e)=>{
    if (!overlay.classList.contains("hidden")) return;
    looking = true;
    lastX = e.clientX; lastY = e.clientY;
  });

  window.addEventListener("pointermove", (e)=>{
    if (!looking) return;
    const dx = e.clientX - lastX;
    const dy = e.clientY - lastY;
    lastX = e.clientX; lastY = e.clientY;

    yaw -= dx * 0.003;
    pitch -= dy * 0.0025;
    pitch = clamp(pitch, -1.25, 1.25);
    applyLook();
  });

  window.addEventListener("pointerup", ()=>{
    looking = false;
  });
}

// ======= INPUT: POINTER LOCK (desktop bonus) =======
function setupPointerLockControls(){
  if (!window.THREE?.PointerLockControls) {
    console.log("ℹ️ PointerLockControls not found (ok).");
    return;
  }

  controls = new window.THREE.PointerLockControls(camera, document.body);
  scene.add(controls.getObject());

  // click scene to lock
  document.body.addEventListener("click", ()=>{
    if (!overlay.classList.contains("hidden")) return;
    controls.lock();
  });

  // while locked, use mouse movement from pointer lock
  controls.addEventListener("lock", ()=> console.log("✅ pointer lock ON"));
  controls.addEventListener("unlock", ()=> console.log("ℹ️ pointer lock OFF"));
}

// ======= UI JOYSTICKS (ALWAYS VISIBLE) =======
function setupUIJoysticks(){
  const ui = document.createElement("div");
  ui.style.cssText = `position:fixed; inset:0; pointer-events:none; z-index:9999;`;
  document.body.appendChild(ui);

  // left move stick (circle)
  const baseL = document.createElement("div");
  baseL.style.cssText = `
    position:absolute; left:14px; bottom:14px; width:132px; height:132px;
    border-radius:999px; background:rgba(255,255,255,.06);
    border:1px solid rgba(255,255,255,.14);
    pointer-events:auto; touch-action:none; user-select:none;
  `;
  const nubL = document.createElement("div");
  nubL.style.cssText = `
    position:absolute; left:50%; top:50%; width:58px; height:58px;
    transform:translate(-50%,-50%); border-radius:999px;
    background:rgba(255,255,255,.12);
    border:1px solid rgba(255,255,255,.22);
  `;
  baseL.appendChild(nubL);
  ui.appendChild(baseL);

  // right pitch stick (vertical pill)
  const baseR = document.createElement("div");
  baseR.style.cssText = `
    position:absolute; right:14px; bottom:14px; width:112px; height:172px;
    border-radius:26px; background:rgba(255,255,255,.06);
    border:1px solid rgba(255,255,255,.14);
    pointer-events:auto; touch-action:none; user-select:none;
  `;
  const nubR = document.createElement("div");
  nubR.style.cssText = `
    position:absolute; left:50%; top:50%; width:54px; height:54px;
    transform:translate(-50%,-50%); border-radius:18px;
    background:rgba(255,255,255,.12);
    border:1px solid rgba(255,255,255,.22);
  `;
  baseR.appendChild(nubR);
  ui.appendChild(baseR);

  // left stick handlers
  let activeL=false, cxL=0, cyL=0;

  baseL.addEventListener("pointerdown",(e)=>{
    if (!overlay.classList.contains("hidden")) return;
    activeL=true;
    baseL.setPointerCapture(e.pointerId);
    const r = baseL.getBoundingClientRect();
    cxL = r.left + r.width/2;
    cyL = r.top  + r.height/2;
  });

  baseL.addEventListener("pointermove",(e)=>{
    if(!activeL) return;
    const r = baseL.getBoundingClientRect();
    const max = r.width * 0.33;

    let dx = e.clientX - cxL;
    let dy = e.clientY - cyL;

    const len = Math.hypot(dx, dy);
    if (len > max) { dx = dx/len*max; dy = dy/len*max; }

    nubL.style.left = `calc(50% + ${dx}px)`;
    nubL.style.top  = `calc(50% + ${dy}px)`;

    moveStick.x = dx / max; // strafe
    moveStick.y = dy / max; // forward/back (screen down positive)
  });

  baseL.addEventListener("pointerup",()=>{
    activeL=false;
    nubL.style.left="50%"; nubL.style.top="50%";
    moveStick.x=0; moveStick.y=0;
  });

  // right stick handlers (pitch)
  let activeR=false, cyR=0, maxR=0;

  baseR.addEventListener("pointerdown",(e)=>{
    if (!overlay.classList.contains("hidden")) return;
    activeR=true;
    baseR.setPointerCapture(e.pointerId);
    const r = baseR.getBoundingClientRect();
    cyR = r.top + r.height/2;
    maxR = r.height * 0.30;
  });

  baseR.addEventListener("pointermove",(e)=>{
    if(!activeR) return;
    let dy = e.clientY - cyR;
    dy = clamp(dy, -maxR, maxR);
    nubR.style.top = `calc(50% + ${dy}px)`;
    pitchStick = -dy / maxR; // up positive
  });

  baseR.addEventListener("pointerup",()=>{
    activeR=false;
    nubR.style.top="50%";
    pitchStick = 0;
  });
}

// ======= MEDIA: LOAD JSON + PLACE IMAGES =======
async function loadAndPlaceMedia(){
  const photosUrl = "./data/photos.json";
  const poemsUrl  = "./data/poems.json";

  let photos = [];
  let poems = [];

  try {
    const p = await fetch(photosUrl, { cache:"no-store" });
    const j = await p.json();
    photos = Array.isArray(j.items) ? j.items : [];
    console.log(`📷 photos loaded: ${photos.length}`);
  } catch (e) {
    console.warn("⚠️ photos.json missing or invalid:", e);
  }

  try {
    const q = await fetch(poemsUrl, { cache:"no-store" });
    const j2 = await q.json();
    poems = Array.isArray(j2.items) ? j2.items : [];
    console.log(`📝 poems loaded: ${poems.length}`);
  } catch (e) {
    console.warn("⚠️ poems.json missing or invalid:", e);
  }

  placeFloatingPhotos(photos);
  placePoemsOnWater(poems);
}

function placeFloatingPhotos(items){
  if (!items.length) return;

  const loader = new THREE.TextureLoader();
  const radius = 7.4;
  const baseY = 1.65;

  items.slice(0, 320).forEach((it, i) => {
    const angle = (i / items.length) * Math.PI * 2;
    const r = radius + (Math.random() - 0.5) * 1.2;

    const tex = loader.load(it.src);
    tex.colorSpace = THREE.SRGBColorSpace;

    const w = 1.35, h = 0.95;
    const mat = new THREE.MeshStandardMaterial({
      map: tex,
      transparent: true,
      roughness: 0.9,
      metalness: 0.0
    });

    const card = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);

    card.position.set(
      Math.cos(angle) * r,
      baseY + (Math.random() - 0.5) * 1.25,
      Math.sin(angle) * r
    );

    // face inward toward fountain center
    card.lookAt(0, baseY, 0);

    // float animation
    card.userData.floatPhase = Math.random() * Math.PI * 2;
    card.userData.floatSpeed = 0.6 + Math.random() * 0.8;
    card.userData.baseY = card.position.y;

    scene.add(card);
  });
}

function placePoemsOnWater(items){
  if (!items.length) return;

  const loader = new THREE.TextureLoader();
  const waterY = 0.276;
  const ringR = 1.55;

  items.slice(0, 22).forEach((it, i) => {
    const angle = (i / items.length) * Math.PI * 2;

    const tex = loader.load(it.src);
    tex.colorSpace = THREE.SRGBColorSpace;

    const poem = new THREE.Mesh(
      new THREE.PlaneGeometry(1.15, 0.75),
      new THREE.MeshStandardMaterial({
        map: tex,
        transparent: true,
        roughness: 0.95,
        opacity: 0.96
      })
    );

    poem.rotation.x = -Math.PI / 2;
    poem.position.set(
      Math.cos(angle) * ringR,
      waterY + 0.01,
      Math.sin(angle) * ringR
    );

    scene.add(poem);
  });
}

// ======= ANIMATE LOOP =======
function animate(){
  requestAnimationFrame(animate);

  const t = performance.now() * 0.001;

  // water shimmer + float cards
  scene.traverse((obj)=>{
    if (obj.isMesh && obj.userData.isWater) {
      obj.material.opacity = 0.56 + Math.sin(t * 1.25) * 0.05;
    }
    if (obj.isMesh && obj.userData.baseY != null) {
      obj.position.y = obj.userData.baseY + Math.sin(t * obj.userData.floatSpeed + obj.userData.floatPhase) * 0.12;
      obj.rotation.z = Math.sin(t * 0.45 + obj.userData.floatPhase) * 0.06;
    }
  });

  // apply arrow pitch
  if (pitchDir !== 0) {
    pitch += pitchDir * 0.018;
    pitch = clamp(pitch, -1.25, 1.25);
    applyLook();
  }

  // apply joystick pitch
  if (pitchStick !== 0) {
    pitch += pitchStick * 0.018;
    pitch = clamp(pitch, -1.25, 1.25);
    applyLook();
  }

  // movement desktop: WASD
  if (controls && controls.isLocked) {
    moveWithWASD(0.07);
  } else {
    // if not locked, still allow joystick movement (desktop + mobile)
    moveWithJoysticks(0.055);
    // also allow WASD even if not locked (nice fallback)
    moveWithWASD(0.055, true);
  }

  renderer.render(scene, camera);
}

function moveWithWASD(speed, useCameraDirect=false){
  const moveF = (keys.w ? 1 : 0) - (keys.s ? 1 : 0);
  const moveS = (keys.d ? 1 : 0) - (keys.a ? 1 : 0);
  if (moveF===0 && moveS===0) return;

  const obj = (controls && !useCameraDirect) ? controls.getObject() : camera;

  const forward = new THREE.Vector3();
  obj.getWorldDirection(forward);
  forward.y = 0; forward.normalize();

  const right = new THREE.Vector3().crossVectors(forward, new THREE.Vector3(0,1,0)).normalize();

  obj.position.addScaledVector(forward, moveF * speed);
  obj.position.addScaledVector(right,   moveS * speed);
}

function moveWithJoysticks(speed){
  if (moveStick.x===0 && moveStick.y===0) return;

  // forward based on camera direction
  const forward = new THREE.Vector3(0,0,-1).applyEuler(camera.rotation);
  forward.y = 0; forward.normalize();

  const right = new THREE.Vector3().crossVectors(forward, new THREE.Vector3(0,1,0)).normalize();

  const moveF = (-moveStick.y); // invert: pushing up (negative y) moves forward
  const moveS = (moveStick.x);

  camera.position.addScaledVector(forward, moveF * speed);
  camera.position.addScaledVector(right,   moveS * speed);

  if (controls) {
    // keep pointerlock object in sync if it exists
    controls.getObject().position.copy(camera.position);
  }
}

function applyLook(){
  camera.rotation.order = "YXZ";
  camera.rotation.y = yaw;
  camera.rotation.x = pitch;

  if (controls) {
    // keep pointerlock object aligned
    controls.getObject().rotation.y = yaw;
  }
}

// ======= RESIZE =======
function onResize(){
  camera.aspect = innerWidth/innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
}

// ======= UTILS =======
function clamp(v,a,b){ return Math.max(a, Math.min(b, v)); }
