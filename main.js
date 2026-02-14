// main.js
console.log("✅ main.js loaded");

const overlay = document.getElementById("overlay");
if (!overlay) console.error("❌ #overlay not found. Check index.html.");

const isTouch =
  "ontouchstart" in window ||
  navigator.maxTouchPoints > 0 ||
  window.matchMedia?.("(pointer:coarse)")?.matches;

let scene, camera, renderer;
let controls = null;
let started = false;

// look vars
let yaw = 0;
let pitch = 0;

// desktop movement + look
const keys = { w:false, a:false, s:false, d:false };
let pitchDir = 0; // -1 down, +1 up from arrows

// touch look drag
let dragging = false;
let lastX = 0, lastY = 0;

// mobile joystick movement
let moveStick = { x:0, y:0 };
// mobile vertical joystick for pitch
let pitchStick = 0; // -1..+1

function start() {
  if (started) return;
  started = true;
  overlay.classList.add("hidden");
  boot();
}

overlay.addEventListener("click", () => {
  console.log("✅ overlay clicked");
  start();
});
overlay.addEventListener("touchend", (e) => {
  e.preventDefault();
  console.log("✅ overlay tapped");
  start();
}, { passive:false });

function boot() {
  const THREE = window.THREE;
  if (!THREE) {
    console.error("❌ THREE is undefined. Ensure three.min.js is included in index.html.");
    return;
  }

  scene = new THREE.Scene();
  scene.fog = new THREE.Fog(0x000000, 8, 90);

  camera = new THREE.PerspectiveCamera(70, innerWidth/innerHeight, 0.1, 300);
  camera.position.set(0, 1.6, 7);

  renderer = new THREE.WebGLRenderer({ antialias:true });
  renderer.setSize(innerWidth, innerHeight);
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  document.body.appendChild(renderer.domElement);

  // lights
  scene.add(new THREE.AmbientLight(0xffffff, 0.35));
  const key = new THREE.DirectionalLight(0xffffff, 0.9);
  key.position.set(4, 9, 3);
  scene.add(key);

  addStars();
  addGroundAndFountain();

  // Desktop pointer lock if present
  if (!isTouch && window.THREE.PointerLockControls) {
    controls = new window.THREE.PointerLockControls(camera, document.body);
    scene.add(controls.getObject());

    document.body.addEventListener("click", () => {
      if (overlay.classList.contains("hidden")) controls.lock();
    });

    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);

  } else {
    console.log("📱 touch mode enabled");
    setupTouchLook();
    setupMobileUI(); // adds 2 joysticks
  }

  // Load media (photos + poems)
  loadAndPlaceMedia();

  window.addEventListener("resize", onResize);

  console.log("✅ scene booted");
  animate();
}

function onKeyDown(e){
  if (e.code==="KeyW") keys.w=true;
  if (e.code==="KeyA") keys.a=true;
  if (e.code==="KeyS") keys.s=true;
  if (e.code==="KeyD") keys.d=true;

  if (e.code==="ArrowUp") pitchDir = +1;
  if (e.code==="ArrowDown") pitchDir = -1;
}
function onKeyUp(e){
  if (e.code==="KeyW") keys.w=false;
  if (e.code==="KeyA") keys.a=false;
  if (e.code==="KeyS") keys.s=false;
  if (e.code==="KeyD") keys.d=false;

  if (e.code==="ArrowUp" || e.code==="ArrowDown") pitchDir = 0;
}

function setupTouchLook(){
  window.addEventListener("pointerdown",(e)=>{
    dragging=true;
    lastX=e.clientX; lastY=e.clientY;
  });
  window.addEventListener("pointermove",(e)=>{
    if(!dragging) return;
    const dx=e.clientX-lastX;
    const dy=e.clientY-lastY;
    lastX=e.clientX; lastY=e.clientY;

    yaw -= dx * 0.003;
    pitch -= dy * 0.0025;
    pitch = clamp(pitch, -1.25, 1.25);

    camera.rotation.order = "YXZ";
    camera.rotation.y = yaw;
    camera.rotation.x = pitch;
  });
  window.addEventListener("pointerup",()=> dragging=false);
}

// --- Mobile UI: left joystick move, right joystick pitch up/down
function setupMobileUI(){
  const ui = document.createElement("div");
  ui.style.cssText = `position:fixed; inset:0; pointer-events:none; z-index:9;`;
  document.body.appendChild(ui);

  // left move stick
  const baseL = document.createElement("div");
  baseL.style.cssText = `
    position:absolute; left:14px; bottom:14px; width:130px; height:130px;
    border-radius:999px; background:rgba(255,255,255,.06);
    border:1px solid rgba(255,255,255,.14);
    pointer-events:auto; touch-action:none;
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

  // right pitch stick
  const baseR = document.createElement("div");
  baseR.style.cssText = `
    position:absolute; right:14px; bottom:14px; width:110px; height:170px;
    border-radius:26px; background:rgba(255,255,255,.06);
    border:1px solid rgba(255,255,255,.14);
    pointer-events:auto; touch-action:none;
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

  // Move stick events
  let activeL=false, cxL=0, cyL=0;
  baseL.addEventListener("pointerdown",(e)=>{
    activeL=true; baseL.setPointerCapture(e.pointerId);
    const r = baseL.getBoundingClientRect();
    cxL = r.left + r.width/2;
    cyL = r.top + r.height/2;
    moveStick.x=0; moveStick.y=0;
  });
  baseL.addEventListener("pointermove",(e)=>{
    if(!activeL) return;
    const r = baseL.getBoundingClientRect();
    const max = r.width*0.33;
    let dx = e.clientX - cxL;
    let dy = e.clientY - cyL;
    const len = Math.hypot(dx,dy);
    if(len>max){ dx = dx/len*max; dy = dy/len*max; }

    nubL.style.left = `calc(50% + ${dx}px)`;
    nubL.style.top  = `calc(50% + ${dy}px)`;

    moveStick.x = dx/max;     // strafe
    moveStick.y = dy/max;     // forward/back (note sign used later)
  });
  baseL.addEventListener("pointerup",()=>{
    activeL=false;
    nubL.style.left="50%"; nubL.style.top="50%";
    moveStick.x=0; moveStick.y=0;
  });

  // Pitch stick events
  let activeR=false, cyR=0, maxR=0;
  baseR.addEventListener("pointerdown",(e)=>{
    activeR=true; baseR.setPointerCapture(e.pointerId);
    const r = baseR.getBoundingClientRect();
    cyR = r.top + r.height/2;
    maxR = r.height*0.30;
    pitchStick = 0;
  });
  baseR.addEventListener("pointermove",(e)=>{
    if(!activeR) return;
    let dy = e.clientY - cyR;
    dy = clamp(dy, -maxR, maxR);
    nubR.style.top = `calc(50% + ${dy}px)`;
    pitchStick = -dy/maxR; // up = positive
  });
  baseR.addEventListener("pointerup",()=>{
    activeR=false;
    nubR.style.top="50%";
    pitchStick = 0;
  });
}

function addStars(){
  const THREE = window.THREE;
  const starGeo = new THREE.BufferGeometry();
  const count = 1400;
  const pos = new Float32Array(count*3);
  for (let i=0;i<count;i++){
    const r = 70 + Math.random()*90;
    const a = Math.random()*Math.PI*2;
    const y = (Math.random()-0.5)*70 + 10;
    pos[i*3+0]=Math.cos(a)*r;
    pos[i*3+1]=y;
    pos[i*3+2]=Math.sin(a)*r;
  }
  starGeo.setAttribute("position", new THREE.BufferAttribute(pos,3));
  scene.add(new THREE.Points(starGeo, new THREE.PointsMaterial({ color:0xffffff, size:0.06 })));
}

function addGroundAndFountain(){
  const THREE = window.THREE;

  const ground = new THREE.Mesh(
    new THREE.CircleGeometry(40,64),
    new THREE.MeshStandardMaterial({ color:0x05060a, roughness:1 })
  );
  ground.rotation.x = -Math.PI/2;
  scene.add(ground);

  const rim = new THREE.Mesh(
    new THREE.CylinderGeometry(3.2,3.2,0.45,64,1,true),
    new THREE.MeshStandardMaterial({ color:0x0a0b12, roughness:0.7, metalness:0.2 })
  );
  rim.position.y=0.22;
  scene.add(rim);

  const water = new THREE.Mesh(
    new THREE.CircleGeometry(3.05,64),
    new THREE.MeshStandardMaterial({
      color:0x3355ff, emissive:0x091026,
      roughness:0.15, transparent:true, opacity:0.55
    })
  );
  water.rotation.x = -Math.PI/2;
  water.position.y = 0.26;
  water.userData.isWater = true;
  scene.add(water);

  const glow = new THREE.PointLight(0xaab6ff, 1.25, 14);
  glow.position.set(0,1.25,0);
  scene.add(glow);
}

async function loadAndPlaceMedia(){
  // IMPORTANT: you need these JSON files to exist at these paths
  const photosUrl = "./data/photos.json";
  const poemsUrl  = "./data/poems.json";

  let photos = [];
  let poems = [];

  try {
    const p = await fetch(photosUrl, { cache:"no-store" }).then(r => r.json());
    photos = Array.isArray(p.items) ? p.items : [];
    console.log(`📷 photos loaded: ${photos.length}`);
  } catch (e) {
    console.warn("⚠️ photos.json not found or invalid:", e);
  }

  try {
    const q = await fetch(poemsUrl, { cache:"no-store" }).then(r => r.json());
    poems = Array.isArray(q.items) ? q.items : [];
    console.log(`📝 poems loaded: ${poems.length}`);
  } catch (e) {
    console.warn("⚠️ poems.json not found or invalid:", e);
  }

  placeFloatingPhotos(photos);
  placePoemsOnWater(poems);
}

function placeFloatingPhotos(items){
  if (!items.length) return;

  const THREE = window.THREE;
  const loader = new THREE.TextureLoader();
  const radius = 7.2;
  const baseY = 1.6;

  items.slice(0, 260).forEach((it, i) => {
    const angle = (i / items.length) * Math.PI * 2;
    const r = radius + (Math.random() - 0.5) * 1.0;

    const tex = loader.load(it.src);
    tex.colorSpace = THREE.SRGBColorSpace;

    const w = 1.35, h = 0.95;

    const card = new THREE.Mesh(
      new THREE.PlaneGeometry(w, h),
      new THREE.MeshStandardMaterial({ map: tex, transparent:true, roughness:0.85 })
    );

    card.position.set(
      Math.cos(angle) * r,
      baseY + (Math.random() - 0.5) * 1.1,
      Math.sin(angle) * r
    );

    card.lookAt(0, baseY, 0);

    card.userData.floatPhase = Math.random() * Math.PI * 2;
    card.userData.floatSpeed = 0.6 + Math.random() * 0.7;
    card.userData.baseY = card.position.y;

    scene.add(card);
  });
}

function placePoemsOnWater(items){
  if (!items.length) return;

  const THREE = window.THREE;
  const loader = new THREE.TextureLoader();
  const waterY = 0.27;
  const ringR = 1.55;

  items.slice(0, 18).forEach((it, i) => {
    const angle = (i / items.length) * Math.PI * 2;

    const tex = loader.load(it.src);
    tex.colorSpace = THREE.SRGBColorSpace;

    const poem = new THREE.Mesh(
      new THREE.PlaneGeometry(1.15, 0.75),
      new THREE.MeshStandardMaterial({ map: tex, transparent:true, roughness:0.95, opacity:0.95 })
    );

    poem.rotation.x = -Math.PI/2;
    poem.position.set(
      Math.cos(angle) * ringR,
      waterY + 0.01,
      Math.sin(angle) * ringR
    );

    scene.add(poem);
  });
}

function animate(){
  requestAnimationFrame(animate);

  const THREE = window.THREE;
  const t = performance.now() * 0.001;

  // shimmer + float
  scene.traverse((obj)=>{
    if (obj.isMesh && obj.userData.isWater) {
      obj.material.opacity = 0.52 + Math.sin(t*1.3)*0.04;
    }
    if (obj.isMesh && obj.userData.baseY != null) {
      obj.position.y = obj.userData.baseY + Math.sin(t*obj.userData.floatSpeed + obj.userData.floatPhase)*0.12;
      obj.rotation.z = Math.sin(t*0.45 + obj.userData.floatPhase)*0.06;
    }
  });

  // arrow keys (desktop) OR pitchStick (mobile) adjust pitch
  const pitchSpeed = 0.018;
  if (!isTouch && pitchDir !== 0) {
    pitch += pitchDir * pitchSpeed;
    pitch = clamp(pitch, -1.25, 1.25);
  }
  if (isTouch && pitchStick !== 0) {
    pitch += pitchStick * pitchSpeed;
    pitch = clamp(pitch, -1.25, 1.25);
    camera.rotation.order = "YXZ";
    camera.rotation.y = yaw;
    camera.rotation.x = pitch;
  }

  // movement
  if (!isTouch && controls && controls.isLocked) {
    const speed = 0.07;

    const forward = new THREE.Vector3();
    controls.getObject().getWorldDirection(forward);
    forward.y = 0; forward.normalize();

    const right = new THREE.Vector3().crossVectors(forward, new THREE.Vector3(0,1,0)).normalize();

    const moveF = (keys.w ? 1 : 0) - (keys.s ? 1 : 0);
    const moveS = (keys.d ? 1 : 0) - (keys.a ? 1 : 0);

    controls.getObject().position.addScaledVector(forward, moveF * speed);
    controls.getObject().position.addScaledVector(right, moveS * speed);

  } else if (isTouch) {
    // mobile: move via joystick in camera space
    const speed = 0.055;

    const fwd = new THREE.Vector3(0,0,-1).applyEuler(camera.rotation);
    fwd.y = 0; fwd.normalize();

    const right = new THREE.Vector3().crossVectors(fwd, new THREE.Vector3(0,1,0)).normalize();

    // note: moveStick.y is screen down positive, so invert for forward
    const moveF = (-moveStick.y);
    const moveS = (moveStick.x);

    camera.position.addScaledVector(fwd, moveF * speed);
    camera.position.addScaledVector(right, moveS * speed);
  }

  renderer.render(scene, camera);
}

function onResize(){
  camera.aspect = innerWidth/innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
}

function clamp(v, a, b){ return Math.max(a, Math.min(b, v)); }
