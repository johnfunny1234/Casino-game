// ============================================================================
//  SCHOOL SIMULATOR — Three.js life sim
//  Single-file engine. Uses the Three.js-hosted RobotExpressive character
//  (Mixamo-rigged with Idle/Walking/Running/Sitting/Punch/Wave/Yes/No/etc.)
//  for the player and every NPC (tinted per character). Everything else
//  — school, bedroom, park, props — is procedurally generated.
// ============================================================================

// Immediately signal that the module executed (for the HTML-side diagnostic).
window._gameBootStarted = true;

import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';

// ---------- Globals ----------
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x87a7c7);
scene.fog = new THREE.Fog(0x87a7c7, 40, 120);

const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.75));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
document.getElementById('app').appendChild(renderer.domElement);

const camera = new THREE.PerspectiveCamera(55, window.innerWidth / window.innerHeight, 0.1, 500);
camera.position.set(0, 6, 10);

addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// ---------- Game state ----------
const G = {
  // time
  day: 1,
  dayName: 'MON',
  hour: 7, minute: 0,         // in-game minutes; 1 real sec = 1 in-game min (tunable)
  timeScale: 60,              // 60 in-game seconds = 1 real second
  paused: false,
  // scene
  location: 'BEDROOM',
  activeScene: null,
  // player stats
  money: 20, hp: 100, stamina: 100, hunger: 50, stress: 10,
  popularity: 25, reputation: 50,    // 0-100
  // systems
  objective: 'Wake up. Your alarm is ringing.',
  inClass: false,
  detention: false, suspended: false,
  lateMinutes: 0,
  classScore: {}, // { math: 80, sci: 60, ... }
  relationships: {}, // npcId -> {score, love, enemy}
  dating: null,
  talkedTo: new Set(),
  rumors: [],
  pranks: 0, fights: 0, hacks: 0,
  flags: {},      // any narrative flags
  inventory: [],
  // world
  npcs: [],
  props: [],      // interactables
  doors: [],
  notifications: [],
  // bell periods
  schedule: [
    {start:8*60,  end:8*60+50, class:'MATH',   room:'ROOM_101'},
    {start:9*60,  end:9*60+50, class:'SCIENCE',room:'ROOM_102'},
    {start:10*60, end:10*60+50,class:'ENGLISH',room:'ROOM_103'},
    {start:11*60, end:11*60+50,class:'LUNCH',  room:'CAFETERIA'},
    {start:12*60+30,end:13*60+20,class:'PE',   room:'GYM'},
    {start:13*60+30,end:14*60+20,class:'HISTORY',room:'ROOM_201'},
    {start:14*60+30,end:15*60,  class:'FREE',  room:'ANYWHERE'},
  ],
};
window.G = G; // debug

// ---------- UI helpers ----------
const UI = {
  ev(text, kind='info') {
    const el = document.createElement('div');
    el.className = 'event ' + kind;
    el.textContent = text;
    document.getElementById('events').appendChild(el);
    setTimeout(()=>el.remove(), 4500);
  },
  setObj(t){ G.objective = t; document.getElementById('objText').textContent = t; },
  setLoc(t){ G.location = t; document.getElementById('locLabel').textContent = t.replace(/_/g,' '); },
  updateStats(){
    document.getElementById('bSta').style.width = G.stamina+'%';
    document.getElementById('bHun').style.width = G.hunger+'%';
    document.getElementById('bStr').style.width = G.stress+'%';
    document.getElementById('bPop').style.width = G.popularity+'%';
    document.getElementById('bRep').style.width = G.reputation+'%';
    document.getElementById('money').textContent = G.money;
  },
  updateClock(){
    const h = G.hour, m = G.minute;
    const hh = String(h).padStart(2,'0'), mm = String(m).padStart(2,'0');
    const t12 = `${((h+11)%12)+1}:${mm}`;
    document.getElementById('clock').textContent = `${hh}:${mm}`;
    document.getElementById('dayLabel').textContent = `${G.dayName} · DAY ${G.day}`;
    document.getElementById('phTime').textContent = t12;
    document.getElementById('phTimeBig').textContent = t12;
    document.getElementById('phDate').textContent = `${['SUN','MON','TUE','WED','THU','FRI','SAT'][(G.day+0)%7]} · APR ${17+G.day}`;
    document.getElementById('crtTime').textContent = t12 + (h<12?' AM':' PM');
  },
  showInteract(label){
    document.getElementById('interact').style.display = 'block';
    document.getElementById('interactLabel').textContent = label;
  },
  hideInteract(){ document.getElementById('interact').style.display = 'none'; },
  async fade(to=1, label=''){
    const f = document.getElementById('fader');
    f.textContent = label;
    if(to) f.classList.add('on'); else f.classList.remove('on');
    await new Promise(r=>setTimeout(r,520));
  },
  rumor(text){
    const r = document.getElementById('rumor');
    r.textContent = text;
    r.classList.add('show');
    setTimeout(()=>r.classList.remove('show'),5000);
  },
  overlay(title, text, seconds=4, onDone){
    const ov = document.getElementById('overlay');
    document.getElementById('ovTitle').textContent = title;
    document.getElementById('ovText').textContent = text;
    let t = seconds;
    document.getElementById('ovClock').textContent = t;
    ov.classList.add('on');
    const iv = setInterval(()=>{
      t -= 1;
      document.getElementById('ovClock').textContent = t;
      if(t<=0){ clearInterval(iv); ov.classList.remove('on'); onDone && onDone(); }
    },500);
    document.getElementById('ovBtn').onclick = ()=>{ clearInterval(iv); ov.classList.remove('on'); onDone && onDone(); };
  },
};

// ---------- Asset loader ----------
// We use ONE character GLB (RobotExpressive, Three.js-hosted, no auth required)
// and clone it with a color tint for every NPC. It ships with the animations
// we need: Idle, Walking, Running, Dance, Sitting, Standing, Jump, Yes, No,
// Wave, Punch, ThumbsUp, Death.
const CHAR_URL = 'https://threejs.org/examples/models/gltf/RobotExpressive/RobotExpressive.glb';

const Assets = { charGLB: null, charAnims: {}, audio: {}, procedural: false };

// Fallback: build a simple posable mannequin so the game still runs if
// the network asset can't be reached.
function makeProceduralCharacterSource(){
  const root = new THREE.Group();
  const skinMat = new THREE.MeshStandardMaterial({color:0xddbb99, roughness:.8});
  const pantMat = new THREE.MeshStandardMaterial({color:0x335588, roughness:.8});
  const shirtMat = new THREE.MeshStandardMaterial({color:0xffffff, roughness:.7});
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.55, 1.2, 6, 12), shirtMat);
  body.position.y = 1.6; body.castShadow = true; root.add(body);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.45, 16, 12), skinMat);
  head.position.y = 2.6; head.castShadow = true; root.add(head);
  const leg1 = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.2, 1.2, 10), pantMat);
  leg1.position.set(-0.25, 0.6, 0); leg1.castShadow = true; root.add(leg1);
  const leg2 = leg1.clone(); leg2.position.x = 0.25; root.add(leg2);
  const arm1 = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.14, 1.1, 10), shirtMat);
  arm1.position.set(-0.7, 1.8, 0); arm1.castShadow = true; root.add(arm1);
  const arm2 = arm1.clone(); arm2.position.x = 0.7; root.add(arm2);
  return root;
}

async function loadAssets(progress){
  const loader = new GLTFLoader();
  progress(5, 'loading character rig');
  const TIMEOUT_MS = 12000;
  try {
    const loadPromise = new Promise((resolve,reject)=>{
      loader.load(CHAR_URL, resolve, (e)=>{
        if(e.total) progress(5 + (e.loaded/e.total)*70, 'loading character rig');
      }, reject);
    });
    const timeoutPromise = new Promise((_,rej)=>{
      setTimeout(()=> rej(new Error('asset timeout (12s) — network may be blocking threejs.org')), TIMEOUT_MS);
    });
    const gltf = await Promise.race([loadPromise, timeoutPromise]);
    Assets.charGLB = gltf.scene;
    gltf.animations.forEach(a => Assets.charAnims[a.name] = a);
  } catch(err){
    console.warn('character GLB unavailable, using procedural fallback:', err);
    progress(50, 'using fallback character');
    Assets.procedural = true;
    Assets.charGLB = makeProceduralCharacterSource();
  }
  progress(80, 'building world');
}

// Build a new character instance (player or NPC) with a color tint.
function makeCharacter(tint = 0xffffff) {
  let g;
  if(Assets.procedural){
    // Simple clone — no skeleton, so just deep-clone meshes
    g = Assets.charGLB.clone(true);
    g.traverse(o=>{
      if(o.isMesh){
        o.material = o.material.clone();
        if(o.material.color) o.material.color.lerp(new THREE.Color(tint), 0.5);
        o.castShadow = true;
      }
    });
  } else {
    g = SkeletonUtils.clone(Assets.charGLB);
    g.traverse(o=>{
      if(o.isMesh){
        o.castShadow = true; o.receiveShadow = false;
        const src = o.material;
        const mat = (Array.isArray(src)?src:[src]).map(m=>{
          const c = m.clone();
          if(c.color) c.color.lerp(new THREE.Color(tint), 0.6);
          return c;
        });
        o.material = Array.isArray(src)?mat:mat[0];
      }
    });
  }
  g.scale.setScalar(Assets.procedural ? 0.9 : 0.45);
  const mixer = new THREE.AnimationMixer(g);
  const actions = {};
  if(!Assets.procedural){
    Object.values(Assets.charAnims).forEach(clip=>{
      actions[clip.name] = mixer.clipAction(clip);
    });
    actions.Idle.play();
  }
  return { root:g, mixer, actions, current:'Idle' };
}

function play(char, name, fade=0.22){
  if(!char.actions[name] || char.current === name) return;
  const prev = char.actions[char.current];
  const next = char.actions[name];
  if(!prev || !next) return;
  next.reset().play();
  next.crossFadeFrom(prev, fade, false);
  char.current = name;
}

// ---------- Simple procedural textures ----------
function canvasTex(w, h, draw){
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
const Tex = {
  floorWood: canvasTex(256,256,(g,w,h)=>{
    g.fillStyle='#7a5a3a'; g.fillRect(0,0,w,h);
    for(let i=0;i<50;i++){
      g.fillStyle=`rgba(${30+Math.random()*30},${15+Math.random()*20},0,${.2+Math.random()*.3})`;
      g.fillRect(Math.random()*w,Math.random()*h,Math.random()*80+10,2);
    }
    for(let i=0;i<6;i++){ g.strokeStyle='#4a3a20'; g.beginPath(); g.moveTo(0,i*h/6); g.lineTo(w,i*h/6); g.stroke(); }
  }),
  tile: canvasTex(256,256,(g,w,h)=>{
    g.fillStyle='#d8d5cc'; g.fillRect(0,0,w,h);
    g.strokeStyle='#7a7a70'; g.lineWidth=2;
    for(let i=0;i<=8;i++){ g.beginPath(); g.moveTo(i*w/8,0); g.lineTo(i*w/8,h); g.stroke();
      g.beginPath(); g.moveTo(0,i*h/8); g.lineTo(w,i*h/8); g.stroke(); }
    for(let i=0;i<20;i++){
      g.fillStyle=`rgba(0,0,0,${Math.random()*.05})`;
      g.fillRect(Math.random()*w,Math.random()*h,Math.random()*20+5,Math.random()*20+5);
    }
  }),
  brick: canvasTex(256,256,(g,w,h)=>{
    g.fillStyle='#8a5139'; g.fillRect(0,0,w,h);
    const bw=48, bh=22;
    for(let y=0;y<h;y+=bh){
      for(let x=(y/bh)%2?bw/2:0 ;x<w+bw;x+=bw){
        g.fillStyle=`hsl(${10+Math.random()*15},${30+Math.random()*20}%,${30+Math.random()*15}%)`;
        g.fillRect(x,y,bw-3,bh-2);
      }
    }
  }),
  grass: canvasTex(256,256,(g,w,h)=>{
    g.fillStyle='#4a7a35'; g.fillRect(0,0,w,h);
    for(let i=0;i<800;i++){
      g.fillStyle=`hsl(${80+Math.random()*40},${40+Math.random()*30}%,${20+Math.random()*30}%)`;
      g.fillRect(Math.random()*w,Math.random()*h,2,3);
    }
  }),
  concrete: canvasTex(256,256,(g,w,h)=>{
    g.fillStyle='#5a5d66'; g.fillRect(0,0,w,h);
    for(let i=0;i<200;i++){
      g.fillStyle=`rgba(255,255,255,${Math.random()*.06})`;
      g.fillRect(Math.random()*w,Math.random()*h,2,2);
      g.fillStyle=`rgba(0,0,0,${Math.random()*.1})`;
      g.fillRect(Math.random()*w,Math.random()*h,3,3);
    }
  }),
  asphalt: canvasTex(256,256,(g,w,h)=>{
    g.fillStyle='#2a2d33'; g.fillRect(0,0,w,h);
    for(let i=0;i<400;i++){
      g.fillStyle=`rgba(200,200,200,${Math.random()*.1})`;
      g.fillRect(Math.random()*w,Math.random()*h,1,1);
    }
  }),
  wall: canvasTex(256,256,(g,w,h)=>{
    g.fillStyle='#e8e5d8'; g.fillRect(0,0,w,h);
    for(let i=0;i<80;i++){
      g.fillStyle=`rgba(100,90,60,${Math.random()*.05})`;
      g.beginPath(); g.arc(Math.random()*w,Math.random()*h,Math.random()*10,0,Math.PI*2); g.fill();
    }
  }),
  locker: canvasTex(256,512,(g,w,h)=>{
    g.fillStyle='#3d6ba8'; g.fillRect(0,0,w,h);
    for(let i=0;i<3;i++){
      g.fillStyle='#4a7db8'; g.fillRect(10,20+i*170,w-20,155);
      g.fillStyle='#2a4b8a'; g.fillRect(10,20+i*170,w-20,5);
      g.fillStyle='#ccc'; g.beginPath(); g.arc(w-30,90+i*170,6,0,Math.PI*2); g.fill();
      g.fillStyle='#ff9'; g.font='bold 14px monospace'; g.fillText(String(100+Math.floor(Math.random()*200)),20,45+i*170);
    }
  }),
  blackboard: canvasTex(512,256,(g,w,h)=>{
    g.fillStyle='#1a3a2a'; g.fillRect(0,0,w,h);
    g.strokeStyle='#6a9a7a'; g.lineWidth=4; g.strokeRect(6,6,w-12,h-12);
    g.fillStyle='#ddd'; g.font='36px serif';
    g.fillText('x² + 3x − 4 = 0', 40, 80);
    g.fillText('F = m · a', 40, 140);
    g.font='18px serif'; g.fillText('Homework: pg. 142, 1-15', 40, 200);
  }),
};
Tex.floorWood.repeat.set(6,6);
Tex.tile.repeat.set(8,8);
Tex.brick.repeat.set(4,2);
Tex.grass.repeat.set(20,20);
Tex.concrete.repeat.set(3,3);
Tex.asphalt.repeat.set(10,10);
Tex.wall.repeat.set(3,1);

// ---------- World helpers ----------
const M = {
  wall:    new THREE.MeshStandardMaterial({map:Tex.wall, roughness:.9}),
  brick:   new THREE.MeshStandardMaterial({map:Tex.brick, roughness:.9}),
  tile:    new THREE.MeshStandardMaterial({map:Tex.tile,  roughness:.8}),
  wood:    new THREE.MeshStandardMaterial({map:Tex.floorWood, roughness:.7}),
  grass:   new THREE.MeshStandardMaterial({map:Tex.grass, roughness:.95}),
  concrete:new THREE.MeshStandardMaterial({map:Tex.concrete, roughness:.85}),
  asphalt: new THREE.MeshStandardMaterial({map:Tex.asphalt, roughness:.9}),
  metal:   new THREE.MeshStandardMaterial({color:0x8a96a6, metalness:.8, roughness:.3}),
  plastic: new THREE.MeshStandardMaterial({color:0x333, roughness:.4}),
  glass:   new THREE.MeshPhysicalMaterial({color:0x88ccee, transmission:.7, roughness:.05, metalness:0, transparent:true, opacity:.5}),
  locker:  new THREE.MeshStandardMaterial({map:Tex.locker, roughness:.5, metalness:.3}),
  bb:      new THREE.MeshStandardMaterial({map:Tex.blackboard, roughness:.9}),
  paper:   new THREE.MeshStandardMaterial({color:0xffffff, roughness:.9}),
  red:     new THREE.MeshStandardMaterial({color:0xcc2233, roughness:.6}),
  dark:    new THREE.MeshStandardMaterial({color:0x1a1e28, roughness:.5}),
  green:   new THREE.MeshStandardMaterial({color:0x2d8a4a, roughness:.7}),
  yellow:  new THREE.MeshStandardMaterial({color:0xf5c542, roughness:.5}),
  screen:  new THREE.MeshStandardMaterial({color:0x0a1828, emissive:0x224488, emissiveIntensity:.4, roughness:.2}),
};

function box(w,h,d,mat,x=0,y=0,z=0,rotY=0){
  const m = new THREE.Mesh(new THREE.BoxGeometry(w,h,d), mat);
  m.position.set(x, y+h/2, z); m.rotation.y = rotY;
  m.castShadow = true; m.receiveShadow = true;
  return m;
}
function plane(w,d,mat,x=0,y=0,z=0){
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w,d), mat);
  m.rotation.x = -Math.PI/2;
  m.position.set(x,y,z);
  m.receiveShadow = true;
  return m;
}
// thin walls (for corridors / rooms)
function wall(w,h,mat,x,y,z,rotY=0){
  const m = new THREE.Mesh(new THREE.BoxGeometry(w,h,0.15), mat);
  m.position.set(x, y+h/2, z); m.rotation.y = rotY;
  m.castShadow = false; m.receiveShadow = true;
  return m;
}

// A simple "prop" with an interact() callback.
class Interactable {
  constructor(obj, label, onUse, range=2.2){
    this.obj = obj; this.label = label; this.onUse = onUse; this.range = range;
  }
}

// ---------- Colliders ----------
// We use simple AABB colliders for level walls + round colliders for props/npcs.
const Colliders = { boxes: [], spheres: [] };
// Per-scene collider storage (built once, swapped on scene load)
let _buildingColliders = null;
function beginSceneBuild(){ _buildingColliders = []; }
function endSceneBuild(){ const arr = _buildingColliders; _buildingColliders = null; return arr; }
function addBoxCollider(mesh, inflate=0){
  mesh.updateMatrixWorld(true);
  const b = new THREE.Box3().setFromObject(mesh);
  b.expandByScalar(inflate);
  const entry = { box:b, mesh };
  if(_buildingColliders) _buildingColliders.push(entry);
  else Colliders.boxes.push(entry);
}
function addSphereCollider(pos, radius){
  Colliders.spheres.push({ pos: pos.clone(), radius });
}
function clearColliders(){ Colliders.boxes.length = 0; Colliders.spheres.length = 0; }
function useSceneColliders(list){
  Colliders.boxes.length = 0;
  for(const c of (list||[])) Colliders.boxes.push(c);
}

// ---------- Scene containers ----------
// We keep separate Group()s for each location so we can swap them without
// rebuilding lights/fog/camera.
const Scenes = {};
function newSceneGroup(){ const g = new THREE.Group(); scene.add(g); return g; }

// ---------- Lighting kits ----------
function outdoorLights(group){
  const hemi = new THREE.HemisphereLight(0xbfd9ff, 0x3a4a2a, 0.9);
  group.add(hemi);
  const sun = new THREE.DirectionalLight(0xfff3d8, 1.4);
  sun.position.set(20, 40, 15);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048,2048);
  sun.shadow.camera.near=1; sun.shadow.camera.far=100;
  sun.shadow.camera.left=-50; sun.shadow.camera.right=50;
  sun.shadow.camera.top=50; sun.shadow.camera.bottom=-50;
  sun.shadow.bias=-0.0003;
  group.add(sun);
  return { hemi, sun };
}
function indoorLights(group, positions){
  const amb = new THREE.AmbientLight(0xffffff, 0.25);
  group.add(amb);
  positions.forEach(p=>{
    const pt = new THREE.PointLight(0xffefb0, 0.9, 14, 1.8);
    pt.position.copy(p);
    pt.castShadow = false;
    group.add(pt);
  });
}

// ============================================================================
//  SCENE: BEDROOM
// ============================================================================
function buildBedroom(){
  beginSceneBuild();
  const g = newSceneGroup();
  outdoorLights(g).sun.intensity = 0.7; // morning light through window
  const amb = new THREE.AmbientLight(0xffa060, 0.35); g.add(amb);

  // room: 8x3x10 box
  const floor = plane(10, 12, M.wood, 0, 0, 0); g.add(floor); addBoxCollider(floor, 0);
  const ceil = plane(10, 12, M.wall, 0, 3.0, 0); ceil.rotation.x = Math.PI/2; g.add(ceil);
  // walls
  const wN = wall(10,3,M.wall,0,0,-6,0); g.add(wN); addBoxCollider(wN);
  const wS = wall(10,3,M.wall,0,0, 6,0); g.add(wS); addBoxCollider(wS);
  const wE = wall(12,3,M.wall, 5,0,0, Math.PI/2); g.add(wE); addBoxCollider(wE);
  const wW = wall(12,3,M.wall,-5,0,0, Math.PI/2); g.add(wW); addBoxCollider(wW);

  // window on north wall, with morning sun
  const winFrame = box(2.4,1.6,0.2,M.metal,0,1.3,-5.92);
  g.add(winFrame);
  const winGlass = box(2.2,1.4,0.06,M.glass,0,1.3,-5.85);
  g.add(winGlass);
  const sunGlow = new THREE.PointLight(0xffcc88, 2.2, 10, 1.4);
  sunGlow.position.set(0,2,-5.5); g.add(sunGlow);

  // bed
  const bed = new THREE.Group();
  bed.add(box(2.4,0.35,4.2,new THREE.MeshStandardMaterial({color:0x553322,roughness:.7}),0,0,0));
  bed.add(box(2.2,0.25,4.0,new THREE.MeshStandardMaterial({color:0xddccaa,roughness:.9}),0,0.3,0));
  bed.add(box(2.2,0.15,1.0,new THREE.MeshStandardMaterial({color:0xaa3344,roughness:.9}),0,0.5,1.3));
  bed.add(box(0.8,0.2,0.5, new THREE.MeshStandardMaterial({color:0xffffff,roughness:1}),0,0.55,-1.5));
  bed.position.set(-3,0, 3.5);
  g.add(bed); bed.children.forEach(c=>addBoxCollider(c));

  // desk + computer
  const desk = box(2.2,0.9,1.0,new THREE.MeshStandardMaterial({color:0x3a2a1a,roughness:.7}),3.5,0,-4.2); g.add(desk); addBoxCollider(desk);
  const monitor = box(1.0,0.65,0.05,M.dark,3.5,1.2,-4.6); g.add(monitor);
  const screen = box(0.9,0.55,0.01,M.screen,3.5,1.2,-4.58); g.add(screen);
  const keyboard = box(0.6,0.04,0.2,M.dark,3.5,0.92,-4.0); g.add(keyboard);

  // nightstand + alarm clock
  const ns = box(0.7,0.7,0.7,new THREE.MeshStandardMaterial({color:0x3a2a1a,roughness:.7}),-1,0,3.5); g.add(ns); addBoxCollider(ns);
  const clock = box(0.35,0.2,0.2,M.red,-1,0.72,3.4); g.add(clock);
  const clockScreen = box(0.28,0.12,0.005,new THREE.MeshStandardMaterial({color:0x110000,emissive:0xff2222,emissiveIntensity:1.2}),-1,0.72,3.305); g.add(clockScreen);
  // (will animate: pulse emissive + attach sound via Howler-less beep oscillator)

  // rug
  const rug = new THREE.Mesh(new THREE.CircleGeometry(1.8,36), new THREE.MeshStandardMaterial({color:0x8a3a4a,roughness:1}));
  rug.rotation.x = -Math.PI/2; rug.position.set(0,0.01,0.5); g.add(rug);

  // wardrobe
  const ward = box(1.8,2.4,0.6,new THREE.MeshStandardMaterial({color:0x2a1a0a,roughness:.7}),4.2,0,4.5); g.add(ward); addBoxCollider(ward);
  // handles
  g.add(box(0.05,0.3,0.05,M.metal,4.2-0.3,1.2,4.2));
  g.add(box(0.05,0.3,0.05,M.metal,4.2+0.3,1.2,4.2));

  // posters on wall
  const makePoster = (color, x, y, w=1.2, h=1.6)=>{
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w,h), new THREE.MeshStandardMaterial({color, roughness:.9}));
    m.position.set(x,y,-5.89); g.add(m);
  };
  makePoster(0x2a4a8a, -2.5, 2.0);
  makePoster(0x8a2a4a,  2.5, 2.0);

  // door to hallway → leaves to school
  const door = box(0.9,2.2,0.08,new THREE.MeshStandardMaterial({color:0x5a3a2a,roughness:.7}),-4.9,0,0, Math.PI/2);
  g.add(door); addBoxCollider(door);
  const doorHandle = box(0.05,0.05,0.1,M.metal,-4.9+0.05,1.1,0.35, Math.PI/2); g.add(doorHandle);

  // --- Interactables ---
  const props = [];
  // Alarm clock
  const alarmInt = new Interactable(clock, 'STOP ALARM', ()=>{
    G.flags.alarmStopped = true;
    UI.ev('You slap the alarm off.', 'good');
    UI.setObj('Get dressed at the wardrobe.');
    // animate: scale pulse
    (function pulse(){
      let t=0; const iv=setInterval(()=>{ t+=0.05; clockScreen.material.emissiveIntensity=0.5; if(t>0.3) clearInterval(iv); },30);
    })();
  }, 1.6);
  props.push(alarmInt);
  props.push(new Interactable(ward, 'GET DRESSED', ()=>{
    if(!G.flags.alarmStopped){ UI.ev('Maybe stop that alarm first.', 'bad'); return; }
    G.flags.dressed = true;
    UI.ev('You throw on jeans + a hoodie.', 'good');
    UI.setObj('Leave for school through the door.');
  }, 2.0));
  props.push(new Interactable(monitor, 'CHECK PC', ()=>{
    UI.ev('"Low battery. Go to school."', 'info');
  }, 2.2));
  props.push(new Interactable(door, 'LEAVE FOR SCHOOL', async ()=>{
    if(!G.flags.dressed){ UI.ev('Not in pajamas. Get dressed first.', 'bad'); return; }
    await UI.fade(1, 'TO SCHOOL');
    loadScene('SCHOOL_EXTERIOR');
    G.hour = 7; G.minute = 45;
    UI.setObj("Head to homeroom. First period starts at 8:00.");
    await UI.fade(0);
  }, 2.2));

  Scenes.BEDROOM = { group: g, props, spawn: new THREE.Vector3(0,0,1.5), lookAt: new THREE.Vector3(-1,0,3.5), colliders: endSceneBuild() };
}

// ============================================================================
//  SCENE: SCHOOL EXTERIOR (street, park, front of building)
// ============================================================================
function buildExterior(){
  beginSceneBuild();
  const g = newSceneGroup();
  const L = outdoorLights(g);

  // ground
  const ground = plane(160,160, M.grass, 0,0,0); g.add(ground);
  // road
  const road = plane(160,10, M.asphalt, 0,0.02, 35); g.add(road);
  // lane stripes
  for(let i=-70;i<=70;i+=6){
    const s = plane(3,0.3,new THREE.MeshStandardMaterial({color:0xeeeecc}),i,0.04,35);
    g.add(s);
  }
  // sidewalk
  const sw = plane(160,4, M.concrete, 0,0.03, 27); g.add(sw);

  // School building footprint (to the north, -z)
  const schoolSite = plane(60,40, M.concrete, 0,0.04, -5); g.add(schoolSite);

  // Building façade (just the front face — we enter via door)
  const bodyMat = new THREE.MeshStandardMaterial({map:Tex.brick.clone(), roughness:.9});
  bodyMat.map.repeat.set(10,5);
  const body = box(50,14,20,bodyMat, 0,0, -15); g.add(body); addBoxCollider(body);
  // roof trim
  const trim = box(52,1,22,new THREE.MeshStandardMaterial({color:0x2a2a3a}), 0,14, -15); g.add(trim);
  // windows (rows)
  for(let fl=0; fl<3; fl++){
    for(let i=-20;i<=20;i+=5){
      if(Math.abs(i)<4 && fl===0) continue; // skip main entrance area
      const w = box(3,1.8,0.1,M.glass, i, 2+fl*4.2, -5.0);
      g.add(w);
      const fr = box(3.1,0.1,0.12,M.dark, i, 2+fl*4.2-0.9, -5.01); g.add(fr);
      const fr2 = box(3.1,0.1,0.12,M.dark, i, 2+fl*4.2+0.9, -5.01); g.add(fr2);
    }
  }
  // entrance doors (double)
  const entry = box(5,3.2,0.3,new THREE.MeshStandardMaterial({color:0x2a3a55,metalness:.4,roughness:.4}), 0,0,-4.85);
  g.add(entry); addBoxCollider(entry);
  const entryGlass = box(4.6,2.8,0.1,M.glass, 0,0.2,-4.7); g.add(entryGlass);
  // big sign
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(12,1.4), new THREE.MeshStandardMaterial({color:0x111,emissive:0xffffff,emissiveIntensity:.3}));
  sign.position.set(0,5.2,-4.84); g.add(sign);
  const signTex = canvasTex(1024,128,(ctx,w,h)=>{
    ctx.fillStyle='#111'; ctx.fillRect(0,0,w,h);
    ctx.fillStyle='#ffcc33'; ctx.font='bold 72px serif'; ctx.textAlign='center'; ctx.textBaseline='middle';
    ctx.fillText('NORTHWOOD HIGH · EST. 1963', w/2,h/2);
  });
  sign.material.map = signTex; sign.material.emissiveMap = signTex; sign.material.needsUpdate=true;

  // steps in front of entrance
  for(let i=0;i<4;i++){
    const s = box(6-i*0.4, 0.15, 1.2 - i*0.08, M.concrete, 0, i*0.15, -3.2 + i*0.6);
    g.add(s); addBoxCollider(s, 0);
  }

  // Park (to the east)
  const park = plane(40,40,M.grass, 50,0.05,10); g.add(park);
  // trees
  for(let i=0;i<24;i++){
    const x = 30 + Math.random()*40; const z = -8 + Math.random()*36;
    const trunk = box(0.6,2.4,0.6,new THREE.MeshStandardMaterial({color:0x5a3a1a,roughness:.9}),x,0,z);
    g.add(trunk); addBoxCollider(trunk);
    const leaf = new THREE.Mesh(new THREE.SphereGeometry(1.6+Math.random()*0.6, 10,8), new THREE.MeshStandardMaterial({color:0x2a6a3a,roughness:.9}));
    leaf.position.set(x,3.2,z); leaf.castShadow = true; g.add(leaf);
  }
  // benches
  for(let i=0;i<4;i++){
    const bx = 40 + (i%2)*12, bz = -2 + Math.floor(i/2)*14;
    const seat = box(1.8,0.1,0.5,new THREE.MeshStandardMaterial({color:0x5a3a1a,roughness:.8}),bx,0.5,bz); g.add(seat); addBoxCollider(seat);
    g.add(box(0.1,0.5,0.1,M.metal,bx-0.8,0,bz));
    g.add(box(0.1,0.5,0.1,M.metal,bx+0.8,0,bz));
  }
  // convenience store (west)
  const store = box(10,5,7, new THREE.MeshStandardMaterial({color:0xdcdcd0,roughness:.9}), -45, 0, 10); g.add(store); addBoxCollider(store);
  const storeDoor = box(1.4,2.4,0.1,M.glass, -45, 0, 6.5); g.add(storeDoor);
  const storeSign = new THREE.Mesh(new THREE.PlaneGeometry(6,1), new THREE.MeshStandardMaterial({color:0xcc0000,emissive:0xff3333,emissiveIntensity:.5}));
  storeSign.position.set(-45,3.8,6.5); g.add(storeSign);

  // street lamps
  for(let x=-60;x<=60;x+=20){
    const pole = box(0.2,5,0.2,M.metal,x,0,31); g.add(pole); addBoxCollider(pole);
    const lamp = new THREE.PointLight(0xffddaa, 0.4, 15, 2); lamp.position.set(x,5,31); g.add(lamp);
    g.add(box(0.6,0.3,0.6,M.yellow,x,4.7,31));
  }

  // parked cars (low-poly)
  function car(x,z,color){
    const gr = new THREE.Group();
    gr.add(box(2.5,0.7,4.2,new THREE.MeshStandardMaterial({color, roughness:.4, metalness:.5}),0,0,0));
    gr.add(box(2.2,0.7,2.0,new THREE.MeshStandardMaterial({color:color*0.8|0, roughness:.3}),0,0.7,-0.2));
    const wheels = [[1.1,-1.4],[-1.1,-1.4],[1.1,1.4],[-1.1,1.4]];
    wheels.forEach(([wx,wz])=>{
      const w = new THREE.Mesh(new THREE.CylinderGeometry(0.35,0.35,0.3,12), new THREE.MeshStandardMaterial({color:0x222}));
      w.rotation.z = Math.PI/2; w.position.set(wx,0.1,wz); gr.add(w);
    });
    gr.position.set(x,0.35,z);
    gr.children.forEach(c=>addBoxCollider(c));
    g.add(gr);
  }
  car(-18,32,0xaa2233); car(-8,32,0x224477); car(8,32,0x336644); car(20,32,0xffaa22);

  // --- Interactables ---
  const props = [];
  props.push(new Interactable(entryGlass, 'ENTER SCHOOL', async ()=>{
    if(G.suspended){ UI.ev("You're suspended. Go home.", 'bad'); return; }
    await UI.fade(1,'ENTERING');
    loadScene('SCHOOL_FLOOR1');
    await UI.fade(0);
  }, 3.0));
  props.push(new Interactable(storeDoor, 'GO HOME', async ()=>{
    await UI.fade(1,'END OF DAY');
    endOfDay();
    await UI.fade(0);
  }, 2.5));

  Scenes.SCHOOL_EXTERIOR = { group: g, props, spawn: new THREE.Vector3(0,0,2), lookAt: new THREE.Vector3(0,0,-10), colliders: endSceneBuild() };
}

// ============================================================================
//  SCENE: SCHOOL FLOOR 1 (main hall, classrooms, cafeteria, offices)
// ============================================================================
function buildFloor1(){
  beginSceneBuild();
  const g = newSceneGroup();
  indoorLights(g, [
    new THREE.Vector3(-20,3,0), new THREE.Vector3(-10,3,0), new THREE.Vector3(0,3,0),
    new THREE.Vector3(10,3,0), new THREE.Vector3(20,3,0),
    new THREE.Vector3(-20,3,-12), new THREE.Vector3(0,3,-12), new THREE.Vector3(20,3,-12),
  ]);
  // floor
  g.add(plane(60,40, M.tile, 0,0,-10));
  // ceiling
  const ceil = plane(60,40, M.wall, 0,4,-10); ceil.rotation.x = Math.PI/2; g.add(ceil);

  // Outer walls
  const oN = wall(60,4,M.wall,0,0,-30,0); g.add(oN); addBoxCollider(oN);
  const oS = wall(60,4,M.wall,0,0, 10,0); g.add(oS); addBoxCollider(oS);
  const oE = wall(40,4,M.wall, 30,0,-10, Math.PI/2); g.add(oE); addBoxCollider(oE);
  const oW = wall(40,4,M.wall,-30,0,-10, Math.PI/2); g.add(oW); addBoxCollider(oW);

  // Main entrance (from exterior is at z=10, x=0 gap)
  // Corridor runs along z = 0 east-west.

  // Internal partition walls dividing a south row of classrooms (z from 0 to 10)
  // and a north row (z from -30 to -20). A big open hall in middle z ≈ -10.
  // South row partitions at x = ±10, with door gaps at x=±9.
  function partitionWithDoor(x1,x2,zLine, doorX){
    const segs = [ [x1, doorX-1], [doorX+1, x2] ];
    segs.forEach(([a,b])=>{
      const w = wall(b-a, 4, M.wall, (a+b)/2, 0, zLine, 0);
      g.add(w); addBoxCollider(w);
    });
    const header = box(2,0.8,0.15, M.wall, doorX, 3.2, zLine); g.add(header);
  }
  // South row walls (between corridor z=0 and classrooms at z>0)
  partitionWithDoor(-30,-11, 0, -20); // ROOM 101 door
  partitionWithDoor(-11, 11, 0,   0); // CAFETERIA wide opening: we'll do no door (already gap)
  partitionWithDoor( 11, 30, 0,  20); // ROOM 102 door
  // And interior walls between rooms
  const wRoom1a = wall(10, 4, M.wall, -11,0, 5, Math.PI/2); g.add(wRoom1a); addBoxCollider(wRoom1a);
  const wRoom1b = wall(10, 4, M.wall,  11,0, 5, Math.PI/2); g.add(wRoom1b); addBoxCollider(wRoom1b);

  // North row: offices, computer lab, bathroom
  // wall at z=-20 with doors
  partitionWithDoor(-30, -11, -20, -20); // Principal office
  partitionWithDoor(-11,  11, -20,   0); // Computer lab
  partitionWithDoor( 11,  30, -20,  20); // Bathroom
  const wRoom2a = wall(10, 4, M.wall, -11,0, -25, Math.PI/2); g.add(wRoom2a); addBoxCollider(wRoom2a);
  const wRoom2b = wall(10, 4, M.wall,  11,0, -25, Math.PI/2); g.add(wRoom2b); addBoxCollider(wRoom2b);

  // === ROOM 101: Math classroom ===
  buildClassroom(g, -20.5, 5, 'MATH', 'ROOM_101');
  // === ROOM 102: Science ===
  buildClassroom(g,  20.5, 5, 'SCIENCE', 'ROOM_102');

  // === CAFETERIA (middle south) ===
  const caf = new THREE.Group();
  for(let i=-4;i<=4;i+=4){
    for(let j=2;j<=8;j+=3){
      const t = box(2,0.9,1.2, new THREE.MeshStandardMaterial({color:0xd8d0c0,roughness:.6}), i, 0, j);
      caf.add(t); addBoxCollider(t);
      // benches
      caf.add(box(2,0.5,0.3, new THREE.MeshStandardMaterial({color:0x8a6a4a}), i, 0, j-0.75));
      caf.add(box(2,0.5,0.3, new THREE.MeshStandardMaterial({color:0x8a6a4a}), i, 0, j+0.75));
    }
  }
  // counter
  const counter = box(8,1.1,1.2,new THREE.MeshStandardMaterial({color:0xaaaaaa}), 0,0,9.2); caf.add(counter); addBoxCollider(counter);
  const sneeze = box(8,0.5,0.02,M.glass, 0,1.3,9.2); caf.add(sneeze);
  // food trays with colored food
  for(let i=-3;i<=3;i+=1.5){
    caf.add(box(1,0.06,0.6,M.metal, i, 1.0, 9.4));
    const food = new THREE.Mesh(new THREE.SphereGeometry(0.2,10,8), new THREE.MeshStandardMaterial({color: Math.random()<.5?0xcc8833:0x44aa44}));
    food.position.set(i,1.2,9.4); caf.add(food);
  }
  g.add(caf);

  // === PRINCIPAL OFFICE ===
  const po = new THREE.Group();
  // desk
  const pdesk = box(3, 0.9, 1.4, new THREE.MeshStandardMaterial({color:0x3a2a1a}), -20, 0, -26);
  po.add(pdesk); addBoxCollider(pdesk);
  // chair
  po.add(box(0.8,1.2,0.8, new THREE.MeshStandardMaterial({color:0x1a1a1a}), -20, 0, -28));
  // books shelves
  for(let y=1;y<3;y+=0.6){
    po.add(box(3,0.06,0.5,new THREE.MeshStandardMaterial({color:0x5a3a2a}), -25, y-0.5, -28));
  }
  // bookspines
  for(let i=0;i<8;i++){
    po.add(box(0.2,0.5,0.3, new THREE.MeshStandardMaterial({color: new THREE.Color().setHSL(Math.random(),0.6,0.4)}), -26.3+i*0.25, 0.6,-28));
  }
  g.add(po);

  // === COMPUTER LAB (middle north) ===
  const lab = new THREE.Group();
  // grid of desks with monitors
  for(let i=-8;i<=8;i+=4){
    for(let j=-28;j<=-22;j+=3){
      const d = box(2.2,0.9,1.0, new THREE.MeshStandardMaterial({color:0x2a3a55}), i, 0, j);
      lab.add(d); addBoxCollider(d);
      const mon = box(0.9,0.6,0.05, M.dark, i, 1.3, j-0.3); lab.add(mon);
      const scr = box(0.84,0.54,0.01, M.screen, i, 1.3, j-0.27); lab.add(scr);
      const kb  = box(0.5,0.04,0.15,M.dark, i, 0.92, j+0.1); lab.add(kb);
    }
  }
  g.add(lab);
  // computer interactable (first accessible PC)
  const firstComputer = lab.children.find(c=>c.material===M.screen);

  // === BATHROOM ===
  const bath = new THREE.Group();
  for(let i=0;i<3;i++){
    const stall = box(1.2,2.4,0.1, new THREE.MeshStandardMaterial({color:0xd8d8d0}), 14+i*2.2, 0, -22, 0);
    bath.add(stall); addBoxCollider(stall);
    const stall2 = box(1.6,2.4,0.1, new THREE.MeshStandardMaterial({color:0xd8d8d0}), 14+i*2.2+0.6, 0, -24.5, Math.PI/2);
    bath.add(stall2); addBoxCollider(stall2);
    const toilet = box(0.5,0.4,0.6, M.paper, 14+i*2.2, 0, -23.8);
    bath.add(toilet);
  }
  // sinks
  for(let i=0;i<3;i++){
    const sink = box(0.7,0.4,0.45,M.paper, 24+i*1, 0.7, -27, 0); bath.add(sink);
    const mir = box(0.8,1,0.05, new THREE.MeshStandardMaterial({color:0xaaccee,metalness:.8,roughness:.1}), 24+i*1, 2.0, -29.9); bath.add(mir);
  }
  g.add(bath);

  // === LOCKERS (corridor) ===
  const lockers = [];
  for(let x=-26;x<=26;x+=1.1){
    if(Math.abs(x)<3.5) continue; // keep main hall gap near cafeteria
    const loc = box(1.0, 2.0, 0.4, M.locker, x, 0, -0.5, 0);
    g.add(loc); addBoxCollider(loc);
    lockers.push({mesh:loc, num: 100+Math.floor(Math.random()*200), contents: Math.random()<.15 ? ['energy drink','$5','notes'][Math.floor(Math.random()*3)] : null});
  }
  // player's locker (marked)
  const myLocker = lockers[Math.floor(lockers.length/2)+2];
  myLocker.mesh.scale.y = 1.02;
  myLocker.contents = ['phone charger','math book'];

  // Stairs up to floor 2 (east end of hall)
  const stairTop = box(4, 0.15, 3, M.concrete, 26, 2, -9.5); g.add(stairTop); addBoxCollider(stairTop);
  for(let i=0;i<10;i++){
    const step = box(4, 0.15, 0.45, M.concrete, 26, 0.15*i, -12 + i*0.4);
    g.add(step); addBoxCollider(step);
  }
  const stairRail = box(0.1, 1.2, 4, M.metal, 28, 0.8, -10.5); g.add(stairRail);

  // Door mesh for interaction into rooms (visual — we use gaps for walking)
  // Big "directions" floor decals
  const directionTex = canvasTex(1024,256,(ctx,w,h)=>{
    ctx.fillStyle='#d8d5cc'; ctx.fillRect(0,0,w,h);
    ctx.fillStyle='#444'; ctx.font='bold 48px sans-serif'; ctx.textAlign='center';
    ctx.fillText('← CAFETERIA ·  COMPUTER LAB →', w/2, h/2+16);
  });

  // --- Interactables ---
  const props = [];
  props.push(new Interactable(myLocker.mesh, `OPEN LOCKER #${myLocker.num}`, ()=>{
    const items = myLocker.contents;
    UI.ev(`Your locker: ${items.join(', ')}`, 'info');
  }, 1.8));
  // a few other lockers
  for(let i=0;i<5;i++){
    const lc = lockers[Math.floor(Math.random()*lockers.length)];
    if(!lc.contents || lc===myLocker) continue;
    props.push(new Interactable(lc.mesh, `SNOOP LOCKER #${lc.num}`, ()=>{
      const rep = G.reputation;
      UI.ev(`You peek in — ${lc.contents}. You didn't take it.`, 'bad');
      G.reputation = Math.max(0, rep-2);
      if(Math.random()<0.25){
        UI.ev('Someone saw you. Word gets around...', 'bad');
        pushRumor(`Someone was snooping in locker #${lc.num}. It was $playerName.`);
      }
    }, 1.4));
  }
  // Computer lab PC
  if(firstComputer){
    props.push(new Interactable(firstComputer, 'USE COMPUTER', ()=>{
      openComputer();
    }, 2.2));
  }
  // Cafeteria counter
  props.push(new Interactable(counter, 'BUY LUNCH ($5)', ()=>{
    if(G.money<5){ UI.ev('Not enough money.', 'bad'); return; }
    G.money -= 5; G.hunger = Math.min(100, G.hunger+45); G.stress = Math.max(0, G.stress-6);
    UI.ev('Mystery meat + juice. Surprisingly okay.', 'good');
  }, 2.2));
  // Principal desk
  props.push(new Interactable(pdesk, 'TALK TO PRINCIPAL', ()=>{
    const pr = G.npcs.find(n=>n.id==='principal');
    if(pr) startDialogue(pr);
  }, 2.0));
  // Stairs up
  props.push(new Interactable(stairTop, 'GO UPSTAIRS', async ()=>{
    await UI.fade(1,'2ND FLOOR');
    loadScene('SCHOOL_FLOOR2');
    await UI.fade(0);
  }, 2.5));
  // Exit
  props.push(new Interactable(new THREE.Mesh(new THREE.PlaneGeometry(4,4), new THREE.MeshBasicMaterial({visible:false})), 'EXIT SCHOOL', async ()=>{
    await UI.fade(1,'OUTSIDE');
    loadScene('SCHOOL_EXTERIOR');
    await UI.fade(0);
  }, 2.0));
  props[props.length-1].obj.position.set(0,0.1,8.5); g.add(props[props.length-1].obj);

  Scenes.SCHOOL_FLOOR1 = { group: g, props, spawn: new THREE.Vector3(0,0,6), lookAt: new THREE.Vector3(0,0,-10), colliders: endSceneBuild() };
}

function buildClassroom(parent, cx, cz, subject, roomId){
  const gr = new THREE.Group();
  // blackboard on north wall of room
  const bb = box(5, 1.8, 0.08, M.bb, cx, 2.0, cz+4.8);
  gr.add(bb);
  // teacher desk
  const td = box(2.2,0.9,1.0,new THREE.MeshStandardMaterial({color:0x3a2a1a}), cx, 0, cz+3.5);
  gr.add(td); addBoxCollider(td);
  // rows of student desks
  for(let r=0;r<3;r++){
    for(let c=-1;c<=1;c++){
      const d = box(1.0,0.8,0.7, new THREE.MeshStandardMaterial({color:0xaa8a5a}), cx+c*1.5, 0, cz+1.0-r*1.6);
      gr.add(d); addBoxCollider(d);
      // chair
      gr.add(box(0.7,0.9,0.7, new THREE.MeshStandardMaterial({color:0x2a2a2a}), cx+c*1.5, 0, cz+0.2-r*1.6));
    }
  }
  gr.userData.room = roomId;
  gr.userData.subject = subject;
  parent.add(gr);
}

// ============================================================================
//  SCENE: SCHOOL FLOOR 2 (History, English, Gym, rooftop access)
// ============================================================================
function buildFloor2(){
  beginSceneBuild();
  const g = newSceneGroup();
  indoorLights(g, [
    new THREE.Vector3(-20,3,0), new THREE.Vector3(0,3,0), new THREE.Vector3(20,3,0),
    new THREE.Vector3(-20,3,-12), new THREE.Vector3(0,3,-12), new THREE.Vector3(20,3,-12),
  ]);
  g.add(plane(60,40,M.tile, 0,0,-10));
  const ceil = plane(60,40,M.wall, 0,4,-10); ceil.rotation.x=Math.PI/2; g.add(ceil);

  // outer walls
  [wall(60,4,M.wall,0,0,-30,0), wall(60,4,M.wall,0,0,10,0),
   wall(40,4,M.wall, 30,0,-10,Math.PI/2), wall(40,4,M.wall,-30,0,-10,Math.PI/2)]
    .forEach(w=>{ g.add(w); addBoxCollider(w); });

  // partitions
  [[-30,-11,0,-20],[-11,11,0,0],[11,30,0,20]].forEach(([a,b,z,dx])=>{
    // same function-style partition
    const segs=[[a,dx-1],[dx+1,b]];
    segs.forEach(([s,e])=>{ const w = wall(e-s,4,M.wall,(s+e)/2,0,z,0); g.add(w); addBoxCollider(w); });
  });
  // classrooms (ROOM_201 History, ROOM_103 English)
  buildClassroom(g, -20.5, 5, 'HISTORY', 'ROOM_201');
  buildClassroom(g,  20.5, 5, 'ENGLISH', 'ROOM_103');

  // middle south: library
  const lib = new THREE.Group();
  for(let x=-8;x<=8;x+=4){
    const shelf = box(3, 3, 0.8, new THREE.MeshStandardMaterial({color:0x4a2a1a}), x, 0, 4);
    lib.add(shelf); addBoxCollider(shelf);
    // books
    for(let i=-1;i<=1;i+=1){
      for(let j=0;j<4;j++){
        lib.add(box(0.25,0.5,0.3, new THREE.MeshStandardMaterial({color:new THREE.Color().setHSL(Math.random(),0.6,0.35)}), x-1+i*1, 0.3+j*0.7, 3.7));
      }
    }
  }
  g.add(lib);

  // === GYM (north, big open area) ===
  const gym = new THREE.Group();
  const gymFloor = plane(24,16, M.wood, 0, 0.02, -22); g.add(gymFloor);
  // basketball court lines (visual)
  const line = canvasTex(1024,1024,(ctx,w,h)=>{
    ctx.fillStyle='#b8864a'; ctx.fillRect(0,0,w,h);
    ctx.strokeStyle='#fff'; ctx.lineWidth=6; ctx.strokeRect(40,40,w-80,h-80);
    ctx.beginPath(); ctx.arc(w/2,h/2,120,0,Math.PI*2); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(w/2,40); ctx.lineTo(w/2,h-40); ctx.stroke();
  });
  gymFloor.material = new THREE.MeshStandardMaterial({map:line, roughness:.6});
  // hoops
  for(let s=-1;s<=1;s+=2){
    const pole = box(0.2,4,0.2,M.metal, 0, 0, -22+s*7.5); g.add(pole);
    const back = box(1.4,1,0.1,M.paper, 0, 3.5, -22+s*7); g.add(back);
    const rim = new THREE.Mesh(new THREE.TorusGeometry(0.4,0.04,8,16), new THREE.MeshStandardMaterial({color:0xcc3322}));
    rim.rotation.x = Math.PI/2; rim.position.set(0,3.1,-22+s*6.7); g.add(rim);
  }
  // bleachers
  for(let i=0;i<4;i++){
    g.add(box(24,0.3,1.2,new THREE.MeshStandardMaterial({color:0x6a4a2a}), 0, 0.3+i*0.3, -14-i*1.2));
  }

  // Rooftop access ladder (far corner)
  const ladder = new THREE.Group();
  for(let i=0;i<6;i++) ladder.add(box(0.6,0.1,0.1,M.metal, 0,0.5+i*0.5,0));
  ladder.add(box(0.1,3,0.1,M.metal, -0.3,0,0));
  ladder.add(box(0.1,3,0.1,M.metal,  0.3,0,0));
  ladder.position.set(27, 0, -28); g.add(ladder);

  // stairs down
  const stairBot = box(4,0.15,3,M.concrete,26,0,-9.5); g.add(stairBot); addBoxCollider(stairBot);

  // --- Interactables ---
  const props = [];
  props.push(new Interactable(stairBot, 'GO DOWNSTAIRS', async ()=>{
    await UI.fade(1,'1ST FLOOR');
    loadScene('SCHOOL_FLOOR1');
    await UI.fade(0);
  }, 2.5));
  props.push(new Interactable(ladder, 'CLIMB TO ROOFTOP', async ()=>{
    if(!G.flags.knowsRoof && G.reputation>=40){ UI.ev('You found the rooftop. Secret area unlocked.', 'good'); G.flags.knowsRoof = true; }
    await UI.fade(1,'ROOFTOP');
    loadScene('ROOFTOP');
    await UI.fade(0);
  }, 2.0));
  // library: read a book -> +int, -stress
  props.push(new Interactable(lib.children[0], 'READ A BOOK', ()=>{
    G.stress = Math.max(0, G.stress-8);
    UI.ev('You read for a bit. Feeling calmer.', 'good');
  }, 2.0));
  // gym: practice basketball (if PE class, or free time)
  props.push(new Interactable(gymFloor, 'SHOOT HOOPS', ()=>{
    openMinigame('PE');
  }, 3.0));

  Scenes.SCHOOL_FLOOR2 = { group: g, props, spawn: new THREE.Vector3(26,0,-6), lookAt: new THREE.Vector3(0,0,-10), colliders: endSceneBuild() };
}

// ============================================================================
//  SCENE: ROOFTOP (secret)
// ============================================================================
function buildRooftop(){
  beginSceneBuild();
  const g = newSceneGroup();
  outdoorLights(g);
  scene.background = new THREE.Color(0x87a7c7);
  // flat roof
  g.add(plane(40,30, M.concrete, 0,0,0));
  // parapet
  [wall(40,1,M.concrete,0,0,-15,0), wall(40,1,M.concrete,0,0,15,0),
   wall(30,1,M.concrete, 20,0,0,Math.PI/2), wall(30,1,M.concrete,-20,0,0,Math.PI/2)]
    .forEach(w=>{ g.add(w); addBoxCollider(w); });
  // AC units & vents
  for(let i=0;i<3;i++){
    const ac = box(3,1.5,2,M.metal, -10+i*10, 0, -8);
    g.add(ac); addBoxCollider(ac);
  }
  // a hidden stash
  const stash = box(0.5,0.3,0.3, M.red, 8, 0, -11); g.add(stash);
  // smoking group (rebel kids hang here after lunch)
  const props = [];
  props.push(new Interactable(stash, 'GRAB STASH ($20)', ()=>{
    if(G.flags.gotStash){ UI.ev('Already took it.', 'info'); return; }
    G.money += 20; G.flags.gotStash = true; G.reputation = Math.max(0, G.reputation-5);
    UI.ev('+$20 cash. Someone will notice it missing...', 'good');
  }, 1.8));
  // ladder down
  const ladderDown = box(1,3,1,M.metal, -18, 0, -13); g.add(ladderDown);
  props.push(new Interactable(ladderDown, 'CLIMB DOWN', async ()=>{
    await UI.fade(1,'2ND FLOOR');
    loadScene('SCHOOL_FLOOR2');
    await UI.fade(0);
  }, 2.0));

  Scenes.ROOFTOP = { group: g, props, spawn: new THREE.Vector3(-16,0,-10), lookAt: new THREE.Vector3(0,0,0), colliders: endSceneBuild() };
}

// ============================================================================
//  SCENE LOADER (tears down, rebuilds, spawns player + NPCs)
// ============================================================================
let currentGroup = null;
function loadScene(name){
  // Detach every scene group from the scene tree (so their lights go dark)
  Object.values(Scenes).forEach(s=>{ if(s && s.group && s.group.parent) s.group.parent.remove(s.group); });
  const s = Scenes[name];
  if(!s){ console.warn('Unknown scene', name); return; }
  scene.add(s.group);
  currentGroup = s.group;

  // Swap collider set to this scene's
  useSceneColliders(s.colliders);

  // Remove previous NPCs from scene
  G.npcs.forEach(n => n.root.parent && n.root.parent.remove(n.root));
  G.npcs.length = 0;

  // Spawn the player at this scene's spawn point
  Player.setPosition(s.spawn.x, s.spawn.z);
  Player.root.lookAt(s.lookAt);

  G.activeScene = name;
  UI.setLoc(name);

  // Set appropriate sky / fog per location
  if(name==='BEDROOM'){
    scene.background = new THREE.Color(0x1a1a28);
    scene.fog = null;
  } else if(name==='SCHOOL_FLOOR1' || name==='SCHOOL_FLOOR2'){
    scene.background = new THREE.Color(0x1a1f2a);
    scene.fog = new THREE.Fog(0x1a1f2a, 20, 60);
  } else {
    scene.background = new THREE.Color(0x87a7c7);
    scene.fog = new THREE.Fog(0x87a7c7, 40, 140);
  }

  spawnNPCsFor(name);
}

// ============================================================================
//  PLAYER CONTROLLER  (third-person, mouse-look, WASD, sprint, jump)
// ============================================================================
const Player = {
  char: null,
  root: new THREE.Group(),
  pos: new THREE.Vector3(0, 0, 0),
  vel: new THREE.Vector3(),
  yaw: 0, pitch: 0.2,
  grounded: true,
  sprinting: false,
  state: 'idle',     // idle | walking | running | jumping | sitting | fighting | dancing
  moveSpeed: 3.5,
  runSpeed: 6.0,
  setPosition(x,z){ this.root.position.set(x, 0, z); this.pos.copy(this.root.position); },
  init(){
    this.char = makeCharacter(0xfff2d8);
    this.root.add(this.char.root);
    scene.add(this.root);
  },
  update(dt){
    if(FightSys.active) return FightSys.updatePlayer(dt);
    const k = Keys;
    const fwd = new THREE.Vector3(Math.sin(this.yaw), 0, Math.cos(this.yaw));
    const rgt = new THREE.Vector3(Math.cos(this.yaw), 0, -Math.sin(this.yaw));
    const move = new THREE.Vector3();
    if(k.w) move.sub(fwd);
    if(k.s) move.add(fwd);
    if(k.a) move.sub(rgt);
    if(k.d) move.add(rgt);

    const moving = move.lengthSq() > 0.01;
    this.sprinting = k.shift && G.stamina > 3 && moving;

    if(moving){
      move.normalize();
      const speed = this.sprinting ? this.runSpeed : this.moveSpeed;
      this.vel.x = move.x * speed;
      this.vel.z = move.z * speed;
      // face movement
      const target = Math.atan2(move.x, move.z);
      this.root.rotation.y = lerpAngle(this.root.rotation.y, target + Math.PI, 0.22);
    } else {
      this.vel.x *= 0.82; this.vel.z *= 0.82;
    }
    // attempt move with collision
    const next = this.pos.clone().add(new THREE.Vector3(this.vel.x*dt, 0, this.vel.z*dt));
    // sample a radius
    const r = 0.4;
    if(!collides(next, r)) this.pos.copy(next);
    else {
      // try axis-separated
      const nx = this.pos.clone(); nx.x += this.vel.x*dt;
      if(!collides(nx, r)) this.pos.copy(nx);
      const nz = this.pos.clone(); nz.z += this.vel.z*dt;
      if(!collides(nz, r)) this.pos.copy(nz);
    }
    this.root.position.copy(this.pos);

    // animation
    let targetState = 'Idle';
    if(moving) targetState = this.sprinting ? 'Running' : 'Walking';
    if(this.state==='sitting') targetState = 'Sitting';
    if(this.state==='dancing') targetState = 'Dance';
    if(targetState !== this.char.current) play(this.char, targetState, 0.18);

    this.char.mixer.update(dt);

    // stamina
    if(this.sprinting){ G.stamina = Math.max(0, G.stamina - 14*dt); }
    else { G.stamina = Math.min(100, G.stamina + (moving?4:8)*dt); }

    // camera follow (third-person)
    updateCamera(dt);
    checkInteractables();
  }
};
function lerpAngle(a,b,t){ let d=((b-a+Math.PI)%(Math.PI*2))-Math.PI; return a + d*t; }

// Collision: check AABBs + spheres. Static props.
const _tmpBox = new THREE.Box3();
function collides(pos, r){
  for(const c of Colliders.boxes){
    if(!c.box) continue;
    // distance from pos to box
    const closest = new THREE.Vector3(
      Math.max(c.box.min.x, Math.min(pos.x, c.box.max.x)),
      Math.max(c.box.min.y, Math.min(1, c.box.max.y)),
      Math.max(c.box.min.z, Math.min(pos.z, c.box.max.z))
    );
    const dx = pos.x - closest.x, dz = pos.z - closest.z;
    if(dx*dx + dz*dz < r*r && c.box.max.y > 0.3) return true;
  }
  // npc bodies so you can't walk through them
  for(const n of G.npcs){
    const dx = pos.x - n.root.position.x, dz = pos.z - n.root.position.z;
    if(dx*dx + dz*dz < 0.9*0.9) return true;
  }
  return false;
}

// Camera follow
const camTarget = new THREE.Vector3();
function updateCamera(dt){
  const dist = 7, height = 3.2;
  const offX = Math.sin(Player.yaw) * dist;
  const offZ = Math.cos(Player.yaw) * dist;
  const wantY = 1.8 + height * Math.cos(Player.pitch);
  const back = 1 + 4*Math.sin(Math.max(0,Math.abs(Player.pitch)));
  const wantX = Player.pos.x + offX;
  const wantZ = Player.pos.z + offZ;
  camera.position.lerp(new THREE.Vector3(wantX, wantY, wantZ), 0.14);
  camTarget.set(Player.pos.x - Math.sin(Player.yaw)*2, 1.6, Player.pos.z - Math.cos(Player.yaw)*2);
  camera.lookAt(Player.pos.x, 1.4, Player.pos.z);
}

// ============================================================================
//  INPUT
// ============================================================================
const Keys = { w:false,a:false,s:false,d:false,shift:false,space:false };
const keyAliases = {
  ArrowUp: 'w',
  ArrowLeft: 'a',
  ArrowDown: 's',
  ArrowRight: 'd',
};
function updateMoveKey(code, pressed){
  if(code==='KeyW') Keys.w = pressed;
  if(code==='KeyA') Keys.a = pressed;
  if(code==='KeyS') Keys.s = pressed;
  if(code==='KeyD') Keys.d = pressed;
  if(keyAliases[code]) Keys[keyAliases[code]] = pressed;
}
addEventListener('keydown', e=>{
  const c = e.code;
  updateMoveKey(c, true);
  if(c==='ShiftLeft'||c==='ShiftRight') Keys.shift=true;
  if(c==='Space'){ Keys.space=true; if(FightSys.active) FightSys.dodge(); }
  if(c==='KeyE'){ tryInteract(); }
  if(c==='KeyF'){ tryStartFight(); }
  if(c==='KeyP'){ togglePhone(); }
  if(c==='Tab'){ e.preventDefault(); openPhone('map'); }
  if(c==='Escape'){ closeAllUIs(); }
});
addEventListener('keyup', e=>{
  const c = e.code;
  updateMoveKey(c, false);
  if(c==='ShiftLeft'||c==='ShiftRight') Keys.shift=false;
  if(c==='Space') Keys.space=false;
});

// Mouse look
let locked = false;
renderer.domElement.addEventListener('click', ()=>{
  if(!locked && G.activeScene) renderer.domElement.requestPointerLock();
});
document.addEventListener('pointerlockchange', ()=>{
  locked = document.pointerLockElement === renderer.domElement;
  document.getElementById('crosshair').style.display = locked ? 'block' : 'none';
});
addEventListener('mousemove', e=>{
  if(!locked) return;
  Player.yaw -= e.movementX * 0.0028;
  Player.pitch = Math.max(-0.5, Math.min(0.8, Player.pitch + e.movementY * 0.0024));
});
addEventListener('mousedown', e=>{
  if(FightSys.active){
    if(e.button===0) FightSys.punch();
    else if(e.button===2) FightSys.block(true);
  }
});
addEventListener('mouseup', e=>{
  if(FightSys.active && e.button===2) FightSys.block(false);
});
addEventListener('contextmenu', e=>e.preventDefault());

// Interaction raycast → nearest prop in range
let currentProp = null;
function checkInteractables(){
  const s = Scenes[G.activeScene];
  if(!s){ UI.hideInteract(); return; }
  let best = null, bestD = Infinity;
  for(const p of s.props){
    const op = new THREE.Vector3();
    p.obj.getWorldPosition(op);
    const d = op.distanceTo(Player.pos);
    if(d < p.range && d < bestD){ best = p; bestD = d; }
  }
  // also check nearby NPCs as talk targets
  let bestNpc = null, bestND = 2.5;
  for(const n of G.npcs){
    const d = n.root.position.distanceTo(Player.pos);
    if(d < bestND){ bestNpc = n; bestND = d; }
  }
  if(bestNpc && (!best || bestND < bestD)){
    currentProp = { label: `TALK TO ${bestNpc.name}`, onUse: ()=>startDialogue(bestNpc) };
    UI.showInteract(currentProp.label);
  } else if(best){
    currentProp = best;
    UI.showInteract(best.label);
  } else {
    currentProp = null;
    UI.hideInteract();
  }
}
function tryInteract(){ if(currentProp) currentProp.onUse(); }

// ============================================================================
//  NPC SYSTEM
// ============================================================================
class NPC {
  constructor(opts){
    Object.assign(this, {
      id: 'npc_'+Math.random().toString(36).slice(2,7),
      name: 'STUDENT', role: 'student', tint: 0xcccccc,
      home: new THREE.Vector3(), schedule: null,
      mood: 'neutral', dialogueTree: null,
      pronouns: 'they/them', clique: 'none',
      likes: 0, angry: false, love: false,
    }, opts);
    this.char = makeCharacter(this.tint);
    this.root = this.char.root; this.root.position.copy(this.home);
    this.target = this.home.clone();
    this.path = []; this.cooldown = 0; this.chatting = false;
    scene.add(this.root);
    // Name tag
    this.nameTag = makeNameTag(this.name, this.role);
    this.nameTag.position.set(0, 2.4, 0);
    this.root.add(this.nameTag);
    // relationship init
    if(!G.relationships[this.id]) G.relationships[this.id] = {score:0, knows:false};
  }
  setTarget(v){ this.target.copy(v); }
  update(dt){
    // Head slowly toward current target
    if(this.chatting){ play(this.char,'Wave',0.2); this.char.mixer.update(dt); return; }
    const dx = this.target.x - this.root.position.x;
    const dz = this.target.z - this.root.position.z;
    const d = Math.sqrt(dx*dx+dz*dz);
    if(d > 0.3){
      const v = 1.4;
      this.root.position.x += (dx/d)*v*dt;
      this.root.position.z += (dz/d)*v*dt;
      const tgt = Math.atan2(dx, dz);
      this.root.rotation.y = lerpAngle(this.root.rotation.y, tgt, 0.15);
      play(this.char, 'Walking', 0.2);
    } else {
      play(this.char, 'Idle', 0.2);
      // occasionally pick a new wander spot
      this.cooldown -= dt;
      if(this.cooldown <= 0){
        this.cooldown = 3 + Math.random()*6;
        const wander = new THREE.Vector3(this.home.x + (Math.random()-0.5)*6, 0, this.home.z + (Math.random()-0.5)*6);
        this.target.copy(wander);
      }
    }
    this.char.mixer.update(dt);
  }
}
function makeNameTag(name, role){
  const cv = document.createElement('canvas'); cv.width=256; cv.height=80;
  const c = cv.getContext('2d');
  c.fillStyle='rgba(0,0,0,.6)'; c.roundRect ? c.roundRect(4,4,248,72,12) : c.fillRect(4,4,248,72); c.fill();
  c.fillStyle='#fff'; c.font='bold 28px sans-serif'; c.textAlign='center'; c.textBaseline='middle';
  c.fillText(name, 128, 32);
  c.font='12px monospace'; c.fillStyle='#aaa'; c.fillText(role.toUpperCase(), 128, 58);
  const t = new THREE.CanvasTexture(cv);
  const s = new THREE.Sprite(new THREE.SpriteMaterial({map:t, depthTest:false, transparent:true}));
  s.scale.set(1.8, 0.55, 1);
  return s;
}

// NPC roster data (the "cast" of our school)
const ROSTER = [
  {id:'maya',    name:'MAYA RIVERA',    role:'student', tint:0xff7a9a, clique:'popular', pronouns:'she/her', love:true},
  {id:'devon',   name:'DEVON HARRIS',   role:'student', tint:0x6ab0ff, clique:'jock'},
  {id:'zoe',     name:'ZOE CHEN',       role:'student', tint:0xa88cff, clique:'art'},
  {id:'marcus',  name:'MARCUS "BIG E"', role:'student', tint:0x6affc0, clique:'rebel'},
  {id:'bully',   name:'TREVOR KANE',    role:'bully',   tint:0x8a8a8a, clique:'rebel'},
  {id:'nerd',    name:'AIDEN PARK',     role:'student', tint:0xffd06a, clique:'nerd'},
  {id:'jenny',   name:'JENNY LOGAN',    role:'student', tint:0xffb0d8, clique:'popular'},
  {id:'teacher_math',  name:'MR. HARGROVE', role:'teacher', tint:0x555555},
  {id:'teacher_sci',   name:'MS. OBOSI',    role:'teacher', tint:0x775588},
  {id:'teacher_eng',   name:'MS. KLINE',    role:'teacher', tint:0x8888aa},
  {id:'teacher_hist',  name:'MR. DUMAS',    role:'teacher', tint:0x997755},
  {id:'teacher_pe',    name:'COACH BANKS',  role:'teacher', tint:0x557766},
  {id:'principal',     name:'PRINCIPAL VEGA', role:'principal', tint:0xaa3344},
  {id:'janitor', name:'MR. FRANKS', role:'janitor', tint:0x446655},
];

// Spawn NPCs for a given scene
function spawnNPCsFor(sceneName){
  if(sceneName==='SCHOOL_FLOOR1'){
    // Map by in-game time
    const period = currentPeriod();
    const inClass = period && period.start <= minutesNow() && minutesNow() < period.end && period.class!=='LUNCH' && period.class!=='FREE';
    const atLunch = period && period.class==='LUNCH';

    ROSTER.forEach(r=>{
      if(r.role==='teacher'){
        // Teachers stay in their rooms
        const where = teacherHome(r.id);
        if(where) new NPC({...r, home: where.clone()});
        return;
      }
      let home;
      if(r.role==='principal') home = new THREE.Vector3(-19, 0, -26);
      else if(r.role==='janitor') home = new THREE.Vector3(-24, 0, 3);
      else if(atLunch) home = new THREE.Vector3(-6 + Math.random()*12, 0, 2 + Math.random()*6);
      else if(inClass) home = new THREE.Vector3(-20.5 + (Math.random()<.5?0:41), 0, 2 + Math.random()*3);
      else home = new THREE.Vector3(-22 + Math.random()*44, 0, -2 + Math.random()*4);
      new NPC({...r, home});
    });
  } else if(sceneName==='SCHOOL_FLOOR2'){
    ROSTER.filter(r=>['teacher_hist','teacher_eng','teacher_pe','nerd','zoe','marcus'].includes(r.id)).forEach(r=>{
      let home;
      if(r.id==='teacher_hist') home = new THREE.Vector3(-20.5, 0, 3.5);
      else if(r.id==='teacher_eng') home = new THREE.Vector3(20.5, 0, 3.5);
      else if(r.id==='teacher_pe') home = new THREE.Vector3(0,0,-22);
      else home = new THREE.Vector3(-10+Math.random()*20, 0, -4+Math.random()*6);
      new NPC({...r, home});
    });
  } else if(sceneName==='SCHOOL_EXTERIOR'){
    // Some kids hanging out front
    ['devon','jenny','maya','zoe'].forEach((id,i)=>{
      const r = ROSTER.find(x=>x.id===id);
      new NPC({...r, home: new THREE.Vector3(-6+i*4, 0, 5 + Math.random()*3)});
    });
  } else if(sceneName==='ROOFTOP'){
    ['marcus','bully'].forEach((id,i)=>{
      const r = ROSTER.find(x=>x.id===id);
      new NPC({...r, home: new THREE.Vector3(-4+i*4, 0, 4)});
    });
  }
}
function teacherHome(id){
  return {
    teacher_math: new THREE.Vector3(-20.5, 0, 8.3),
    teacher_sci:  new THREE.Vector3( 20.5, 0, 8.3),
  }[id];
}

// ============================================================================
//  DIALOGUE SYSTEM
// ============================================================================
const DialogueTrees = {
  default(npc){
    const rel = G.relationships[npc.id];
    const lines = [
      `Hey. How's it going?`,
      `Oh, you again.`,
      `What's up.`,
      `Class was brutal today. Yours?`,
      `Did you see what happened in the cafeteria?`,
    ];
    return {
      mood: rel.score>=10?'friendly':(rel.score<=-10?'cold':'neutral'),
      text: lines[Math.floor(Math.random()*lines.length)],
      choices: [
        { text:"Hey. You doing okay?",            tag:'nice',  effect:{rel:+3, pop:+1} },
        { text:"Not much. What about you?",       tag:'info',  effect:{rel:+1} },
        { text:"Wow, rough. Need a hand?",        tag:'nice',  effect:{rel:+4, pop:+1} },
        { text:"Whatever, don't care.",           tag:'mean',  effect:{rel:-4, pop:-2, rep:-1} },
      ]
    };
  },
  flirt(npc){
    return {
      mood: 'cautious',
      text: `Oh... hey. [${npc.name} smiles a little]`,
      choices: [
        { text:"You look nice today.",              tag:'flirt', effect:{rel:+5, love:+3, pop:+2} },
        { text:"Want to hang out after school?",    tag:'flirt', effect:{rel:+4, love:+4, pop:+1} },
        { text:"Never mind.",                       tag:'info',  effect:{} },
      ]
    };
  },
  bully(npc){
    return {
      mood:'aggressive',
      text: `What are you looking at, loser?`,
      choices: [
        { text:"I was just walking.",       tag:'info', effect:{rel:-1, stress:+5} },
        { text:"Back off.",                 tag:'mean', effect:{rel:-6, rep:-1, pop:+1} },
        { text:"Want to go? Right here.",   tag:'mean', effect:{fight:true} },
      ]
    };
  },
  teacher(npc){
    return {
      mood:'stern',
      text: `Mr./Ms. ${G.player?G.player.name:'You'}. Have you done your homework?`,
      choices: [
        { text:"Yes, ma'am.",        tag:'nice', effect:{rel:+2, rep:+1, classScore:+3} },
        { text:"Working on it.",     tag:'info', effect:{} },
        { text:"I forgot.",          tag:'mean', effect:{rel:-2, rep:-1, stress:+3} },
      ]
    };
  },
  principal(npc){
    return {
      mood:'sharp',
      text: `You're on thin ice. I've heard things. Behave yourself.`,
      choices: [
        { text:"Yes, Principal Vega.",  tag:'nice',  effect:{rep:+2} },
        { text:"I haven't done anything.", tag:'info', effect:{} },
        { text:"Or what?",              tag:'mean',  effect:{rep:-4, stress:+5} },
      ]
    };
  },
  janitor(npc){
    return {
      mood:'gruff',
      text: `Ever try cleaning this floor? No. Of course not.`,
      choices: [
        { text:"Thank you for what you do.",    tag:'nice', effect:{rel:+5, rep:+1} },
        { text:"Seen anything weird lately?",    tag:'info', effect:{rel:+2, flag:'janitor_tip'} },
        { text:"Not my problem.",                tag:'mean', effect:{rel:-3} },
      ]
    };
  },
};
function treeFor(npc){
  if(npc.role==='teacher') return DialogueTrees.teacher(npc);
  if(npc.role==='principal') return DialogueTrees.principal(npc);
  if(npc.role==='janitor') return DialogueTrees.janitor(npc);
  if(npc.role==='bully') return DialogueTrees.bully(npc);
  if(npc.love && G.relationships[npc.id].score >= 15) return DialogueTrees.flirt(npc);
  return DialogueTrees.default(npc);
}
function startDialogue(npc){
  const tree = treeFor(npc);
  npc.chatting = true;
  document.getElementById('dlgName').textContent = npc.name;
  document.getElementById('dlgMood').textContent = tree.mood;
  document.getElementById('dlgText').textContent = tree.text;
  const cwrap = document.getElementById('dlgChoices');
  cwrap.innerHTML = '';
  tree.choices.forEach(ch=>{
    const b = document.createElement('div');
    b.className = 'dlg-choice ' + (ch.tag||'');
    b.innerHTML = `${ch.text}<span class="tag">[${ch.tag||'say'}]</span>`;
    b.onclick = ()=>applyChoice(npc, ch);
    cwrap.appendChild(b);
  });
  document.getElementById('dialogue').classList.add('show');
}
function applyChoice(npc, ch){
  const e = ch.effect||{};
  const rel = G.relationships[npc.id];
  rel.knows = true;
  rel.score += (e.rel||0);
  rel.love = (rel.love||0) + (e.love||0);
  G.popularity = clamp(G.popularity + (e.pop||0), 0, 100);
  G.reputation = clamp(G.reputation + (e.rep||0), 0, 100);
  G.stress = clamp(G.stress + (e.stress||0), 0, 100);
  if(e.classScore){
    const s = G.inClass ? currentPeriod().class.toLowerCase() : 'generic';
    G.classScore[s] = (G.classScore[s]||50) + e.classScore;
  }
  if(e.flag) G.flags[e.flag] = true;

  // Become dating?
  if(rel.love>=12 && !G.dating && npc.love){
    G.dating = npc.id;
    UI.ev(`You and ${npc.name} are dating now.`, 'good');
  }
  // Jealousy: if dating && flirting with someone else
  if(ch.tag==='flirt' && G.dating && G.dating !== npc.id){
    const dating = ROSTER.find(r=>r.id===G.dating);
    UI.ev(`${dating?.name} will hear about this...`, 'bad');
    G.relationships[G.dating].score -= 6;
    pushRumor(`Did you hear? ${npc.name} and $playerName...`);
  }

  // Rumor propagation for big choices
  if(ch.tag==='mean' && Math.random()<0.4){
    pushRumor(`${npc.name}: "$playerName was being such a jerk."`);
    G.reputation = Math.max(0, G.reputation-1);
  } else if(ch.tag==='nice' && Math.random()<0.3){
    pushRumor(`$playerName helped ${npc.name} out.`);
  }

  if(e.fight){
    document.getElementById('dialogue').classList.remove('show');
    npc.chatting = false;
    FightSys.start(npc);
    return;
  }

  document.getElementById('dialogue').classList.remove('show');
  npc.chatting = false;
  UI.updateStats();
}
function clamp(v,a,b){ return Math.max(a,Math.min(b,v)); }

// Rumor system
function pushRumor(text){
  text = text.replace('$playerName', 'YOU');
  G.rumors.push({text, t: minutesNow()});
  if(G.rumors.length>20) G.rumors.shift();
  UI.rumor(text);
}
function minutesNow(){ return G.hour*60 + G.minute; }

// ============================================================================
//  FIGHT SYSTEM
// ============================================================================
const FightSys = {
  active: false, target: null, myHP: 100, enemyHP: 100, blocking:false, cooldown:0,
  start(npc){
    this.active = true; this.target = npc; this.myHP = 100; this.enemyHP = 100;
    document.getElementById('fight-ui').classList.add('on');
    UI.ev(`FIGHT: ${npc.name}`, 'bad');
    G.fights++;
    // draw crowd: nearby NPCs gather
    G.npcs.forEach(n=>{
      if(n===npc) return;
      const d = n.root.position.distanceTo(npc.root.position);
      if(d<10 && n.role!=='teacher' && n.role!=='principal'){
        n.setTarget(npc.root.position.clone().add(new THREE.Vector3((Math.random()-0.5)*4,0,(Math.random()-0.5)*4)));
      }
    });
    // teacher response timer
    this.teacherTimer = 10;
  },
  punch(){
    if(this.cooldown>0) return;
    this.cooldown = 0.6;
    if(this.target && Player.pos.distanceTo(this.target.root.position) < 2.6){
      const dmg = 10 + Math.random()*10;
      this.enemyHP -= dmg;
      play(Player.char, 'Punch', 0.1);
      play(this.target.char, 'No', 0.1);
      UI.ev(`HIT (-${Math.floor(dmg)})`, 'info');
    } else {
      play(Player.char, 'Punch', 0.1);
    }
    if(this.enemyHP<=0) this.end('win');
  },
  block(on){ this.blocking = on; },
  dodge(){
    if(this.cooldown>0) return;
    this.cooldown = 0.8;
    play(Player.char, 'Jump', 0.1);
    UI.ev('DODGE', 'good');
  },
  enemyPunch(){
    const dmg = (8 + Math.random()*8) * (this.blocking?0.3:1);
    this.myHP -= dmg;
    play(this.target.char, 'Punch', 0.1);
    if(this.myHP<=0) this.end('lose');
  },
  updatePlayer(dt){
    if(this.cooldown>0) this.cooldown -= dt;
    // simple AI: close distance & swing
    const dx = Player.pos.x - this.target.root.position.x;
    const dz = Player.pos.z - this.target.root.position.z;
    const d = Math.sqrt(dx*dx+dz*dz);
    if(d>1.4){
      const v = 2.0;
      this.target.root.position.x += (dx/d)*v*dt;
      this.target.root.position.z += (dz/d)*v*dt;
      this.target.root.rotation.y = lerpAngle(this.target.root.rotation.y, Math.atan2(dx,dz), 0.2);
      play(this.target.char, 'Running', 0.1);
    } else {
      if(!this._swing){ this._swing = 1.3; this.enemyPunch(); }
      else this._swing -= dt;
      if(this._swing<=0) this._swing = null;
      play(this.target.char, 'Idle', 0.1);
    }
    this.target.char.mixer.update(dt);
    Player.char.mixer.update(dt);

    // also update camera & bars
    updateCamera(dt);
    document.getElementById('enemyHP').style.width = Math.max(0,this.enemyHP)+'%';
    document.getElementById('myHP').style.width = Math.max(0,this.myHP)+'%';

    // teacher intervention timer
    this.teacherTimer -= dt;
    if(this.teacherTimer<=0){
      this.end('caught');
    }
  },
  end(kind){
    this.active = false;
    document.getElementById('fight-ui').classList.remove('on');
    if(kind==='win'){
      UI.ev(`You won. ${this.target.name} ran off.`, 'good');
      G.popularity = clamp(G.popularity+8,0,100);
      G.reputation = clamp(G.reputation-8,0,100);
      pushRumor(`$playerName beat ${this.target.name} in a fight.`);
    } else if(kind==='lose'){
      UI.ev(`You lost the fight.`, 'bad');
      G.popularity = clamp(G.popularity-6,0,100);
      G.hp = 30;
    } else {
      UI.ev(`A teacher broke it up. DETENTION.`, 'bad');
      G.detention = true;
      doDetention();
    }
    this.target = null; this._swing = null; this.cooldown = 0;
  }
};
function tryStartFight(){
  // must be near an NPC
  for(const n of G.npcs){
    if(n.role==='teacher'||n.role==='principal') continue;
    const d = n.root.position.distanceTo(Player.pos);
    if(d < 2.2){
      FightSys.start(n); return;
    }
  }
  UI.ev('No one to fight here.', 'info');
}

function doDetention(){
  UI.overlay('DETENTION', 'You sit in Mr. Hargrove’s room for 30 minutes. Your soul dies a little.', 5, ()=>{
    G.stress = clamp(G.stress+15,0,100);
    G.reputation = clamp(G.reputation-4,0,100);
    G.hour = Math.min(15, G.hour+1); G.minute = 0;
    G.detention = false;
  });
}

// ============================================================================
//  PHONE UI
// ============================================================================
function openPhone(page='home'){
  document.getElementById('phone').classList.add('on');
  if(page==='home') goPhoneHome();
  else showPhonePage(page);
  renderPhone();
}
function closePhone(){ document.getElementById('phone').classList.remove('on'); }
function togglePhone(){
  const ph = document.getElementById('phone');
  if(ph.classList.contains('on')) closePhone();
  else openPhone();
}
function goPhoneHome(){
  document.querySelectorAll('.phone-page').forEach(p=>p.classList.remove('show'));
  document.getElementById('phHome').style.display = 'flex';
}
function showPhonePage(id){
  document.getElementById('phHome').style.display = 'none';
  document.querySelectorAll('.phone-page').forEach(p=>p.classList.remove('show'));
  const map = { messages:'phMessages', feed:'phFeed', map:'phMap' };
  const el = document.getElementById(map[id]);
  if(el) el.classList.add('show');
}

// phone chat data
const PhoneChat = {
  data: {},
  unread(id){ return (this.data[id]||[]).filter(m=>m.unread).length; },
  lastLine(id){ const arr = this.data[id]; if(!arr||!arr.length) return ''; return arr[arr.length-1].text; },
  send(id, text){
    if(!this.data[id]) this.data[id] = [];
    this.data[id].push({from:'me', text, time: minutesNow(), unread:false});
    setTimeout(()=>{
      const reply = replyFromNpc(id, text);
      this.data[id].push({from:'them', text: reply, time: minutesNow(), unread:true});
      UI.ev(`Text from ${ROSTER.find(r=>r.id===id).name}.`, 'info');
      if(document.getElementById('phone').classList.contains('on')) renderPhone();
    }, 1500 + Math.random()*3000);
  },
  markRead(id){ (this.data[id]||[]).forEach(m=>m.unread=false); },
};
function unreadCount(){
  return Object.keys(PhoneChat.data).reduce((s,k)=>s+PhoneChat.unread(k),0);
}
function replyFromNpc(id, text){
  const rel = G.relationships[id];
  const love = rel.love >= 10;
  const positive = rel.score >= 5;
  const bank = {
    friendly: ['lol fr', 'oh nice', 'same tbh', 'yeah come thru', "haha you're cool", 'okay bet', 'say less'],
    neutral: ['ok', 'alright', 'yeah i guess', 'sure', 'mm', 'k'],
    cold: ['whatever', 'stop', 'leave me alone', "i'm busy", 'bye'],
    love:  ['🥺', '<3', 'I was just thinking of you', 'come find me later?', 'miss u'],
  };
  const pool = love ? bank.love : (positive ? bank.friendly : (rel.score < -5 ? bank.cold : bank.neutral));
  return pool[Math.floor(Math.random()*pool.length)];
}
function colorStr(tint){ const c = new THREE.Color(tint); return `rgb(${(c.r*255)|0},${(c.g*255)|0},${(c.b*255)|0})`; }

function renderPhone(){
  const apps = [
    {id:'messages', icon:'💬', color:'#3ddc97', label:'Chat', badge: unreadCount()},
    {id:'feed',     icon:'🌐', color:'#4e8bff', label:'Feed'},
    {id:'map',      icon:'🗺', color:'#ffb020', label:'Map'},
    {id:'clock',    icon:'⏰', color:'#ff5a5f', label:'Clock'},
    {id:'music',    icon:'🎵', color:'#b794f4', label:'Music'},
    {id:'camera',   icon:'📷', color:'#ff79c6', label:'Cam'},
    {id:'settings', icon:'⚙',  color:'#555',   label:'Setup'},
    {id:'close',    icon:'✕',  color:'#222',    label:'Close'},
  ];
  const wrap = document.getElementById('phApps');
  wrap.innerHTML = '';
  apps.forEach(a=>{
    const b = document.createElement('div');
    b.className = 'phone-app';
    b.style.background = a.color;
    b.innerHTML = `<span>${a.icon}</span>${a.badge?`<span class="dot">${a.badge}</span>`:''}<span class="label">${a.label}</span>`;
    b.onclick = ()=>{
      if(a.id==='close') closePhone();
      else if(a.id==='messages') showPhonePage('messages');
      else if(a.id==='feed') showPhonePage('feed');
      else if(a.id==='map') showPhonePage('map');
      else UI.ev(`${a.label}: nothing new.`, 'info');
    };
    wrap.appendChild(b);
  });
  // Contacts list
  const contacts = document.getElementById('phContacts');
  contacts.innerHTML = '';
  const known = ROSTER.filter(r=>r.role==='student' && G.relationships[r.id]?.knows);
  if(!known.length){
    contacts.innerHTML = `<div style="color:#888;font-size:12px;text-align:center;padding:40px 10px">No contacts yet. Talk to people.</div>`;
  }
  known.forEach(r=>{
    const last = PhoneChat.lastLine(r.id);
    const un = PhoneChat.unread(r.id);
    const el = document.createElement('div');
    el.className = 'contact';
    el.innerHTML = `
      <div class="av" style="background:${colorStr(r.tint)}">${r.name.split(' ')[0][0]}</div>
      <div class="info"><div class="name">${r.name}</div><div class="last">${last||'...'}</div></div>
      ${un?`<div class="badge2">${un}</div>`:''}`;
    el.onclick = ()=>openChat(r.id);
    contacts.appendChild(el);
  });
  renderFeed();
  renderMapPage();
}
function openChat(id){
  PhoneChat.markRead(id);
  document.getElementById('phHome').style.display = 'none';
  document.querySelectorAll('.phone-page').forEach(p=>p.classList.remove('show'));
  document.getElementById('phChat').classList.add('show');
  document.getElementById('phChatName').textContent = ROSTER.find(r=>r.id===id).name;
  const body = document.getElementById('phChatBody');
  body.innerHTML = '';
  (PhoneChat.data[id]||[]).forEach(m=>{
    const d = document.createElement('div');
    d.className = 'msg ' + (m.from==='me'?'me':'them');
    d.textContent = m.text;
    body.appendChild(d);
  });
  const entry = document.createElement('div');
  entry.className = 'chat-entry';
  entry.innerHTML = `
    <button data-t="hey"  style="background:#4e8bff;color:#fff;border:0;padding:6px 10px;border-radius:8px;margin:4px 4px 0 0;font-size:11px;cursor:pointer">hey 👋</button>
    <button data-t="hang" style="background:#3ddc97;color:#000;border:0;padding:6px 10px;border-radius:8px;margin:4px 4px 0 0;font-size:11px;cursor:pointer">hang out?</button>
    <button data-t="haha" style="background:#ff79c6;color:#fff;border:0;padding:6px 10px;border-radius:8px;margin:4px 4px 0 0;font-size:11px;cursor:pointer">haha</button>
    <button data-t="rude" style="background:#333;color:#fff;border:0;padding:6px 10px;border-radius:8px;margin:4px 4px 0 0;font-size:11px;cursor:pointer">leave me alone</button>`;
  body.appendChild(entry);
  entry.querySelectorAll('button').forEach(b=>{
    b.onclick = ()=>{
      const t = b.dataset.t;
      const map = { hey:'hey 👋', hang:'wanna hang out after school?', haha:'lol 😂', rude:'leave me alone.' };
      PhoneChat.send(id, map[t]);
      if(t==='hang') G.relationships[id].score += 2;
      if(t==='rude') G.relationships[id].score -= 5;
      openChat(id);
    };
  });
  body.scrollTop = body.scrollHeight;
}
function renderFeed(){
  const body = document.getElementById('phFeedBody');
  body.innerHTML = '';
  const items = [
    ...G.rumors.slice(-5).map(r=>({name:'ANON', color:'#888', t:r.t, text:r.text})),
    {name:'MAYA',  color:'#ff7a9a', t: minutesNow()-30, text:'study group tonight? i\u2019m drowning in math 😭'},
    {name:'DEVON', color:'#6ab0ff', t: minutesNow()-90, text:'gym PR today. no days off 💪'},
    {name:'ZOE',   color:'#a88cff', t: minutesNow()-120,text:'painting something dark. art block = fuel.'},
    {name:'AIDEN', color:'#ffd06a', t: minutesNow()-200,text:'who wants to form a robotics team?'},
  ];
  items.forEach(x=>{
    const el = document.createElement('div');
    el.className = 'feed-post';
    el.innerHTML = `
      <div class="feed-head">
        <div class="av" style="background:${x.color}">${x.name[0]}</div>
        <div class="n">${x.name}</div>
        <div class="t">${Math.max(1,Math.floor(Math.abs(minutesNow()-x.t)||1))}m</div>
      </div>
      <div class="feed-text">${x.text}</div>
      <div class="feed-actions">❤ ${Math.floor(Math.random()*50)} · 💬 ${Math.floor(Math.random()*10)}</div>`;
    body.appendChild(el);
  });
}
function renderMapPage(){
  const body = document.getElementById('phMapBody');
  const fmt = m=>{ const h=Math.floor(m/60), mm=String(m%60).padStart(2,'0'); return `${h}:${mm}`; };
  const sch = G.schedule.map(p=>{
    const now = minutesNow();
    const active = now>=p.start && now<p.end;
    return `<div style="padding:8px;border-radius:8px;margin-bottom:6px;background:${active?'#3ddc97':'rgba(255,255,255,.04)'};color:${active?'#000':'#cde'}">
      <div style="font-family:monospace;font-size:11px">${fmt(p.start)} \u2013 ${fmt(p.end)}</div>
      <div style="font-weight:700">${p.class}</div>
      <div style="font-size:11px;opacity:.7">${p.room}</div>
    </div>`;
  }).join('');
  body.innerHTML = `
    <div style="margin-bottom:10px;color:#aaa;font-size:11px;letter-spacing:2px">TODAY'S SCHEDULE</div>
    ${sch}
    <div style="margin-top:14px;color:#aaa;font-size:11px;letter-spacing:2px">WALLET</div>
    <div style="font-size:26px;font-family:var(--disp)">$${G.money}</div>`;
}
document.querySelectorAll('[data-back]').forEach(b=> b.onclick = goPhoneHome);

// ============================================================================
//  COMPUTER LAB OS (desktop, browser, terminal, jailbreak)
// ============================================================================
const CRT = {
  open(app){
    const d = document.getElementById('desktop');
    const w = document.createElement('div');
    w.className = 'window';
    const size = app.size || [600,380];
    w.style.width = size[0]+'px'; w.style.height = size[1]+'px';
    w.style.left = (100 + Math.random()*160) + 'px';
    w.style.top  = (60 + Math.random()*80) + 'px';
    w.innerHTML = `
      <div class="win-bar"><span>${app.title}</span><span class="x">×</span></div>
      <div class="win-body ${app.term?'term':''}"></div>`;
    d.appendChild(w);
    w.querySelector('.x').onclick = ()=> w.remove();
    // drag
    const bar = w.querySelector('.win-bar');
    let dx=0,dy=0,dragging=false;
    bar.addEventListener('mousedown',(e)=>{ dragging=true; dx=e.clientX-w.offsetLeft; dy=e.clientY-w.offsetTop; });
    const mm = (e)=>{ if(dragging){ w.style.left=(e.clientX-dx)+'px'; w.style.top=(e.clientY-dy)+'px'; }};
    const mu = ()=> dragging=false;
    addEventListener('mousemove', mm); addEventListener('mouseup', mu);
    app.render(w.querySelector('.win-body'));
  },
  apps_def: [
    {id:'browser', name:'NHSNet', icon:'🌐', color:'#4e8bff', title:'NHSNet Browser', size:[680,440], render:(body)=>{
      body.className = 'win-body www';
      body.innerHTML = `
        <div style="background:#0a0f1a;border:1px solid #2a3a5a;border-radius:4px;padding:6px 10px;margin-bottom:8px;font-size:11px;color:#8ab">🔒 nhs-intranet.edu</div>
        <h3 style="color:#ffd;margin-bottom:10px">📚 Northwood High — Student Portal</h3>
        <p>Welcome. Status: <span style="color:#3ddc97">ACTIVE</span></p>
        <ul style="margin-top:10px;line-height:1.8">
          <li><a data-click="login">Faculty Login (restricted)</a></li>
          <li><a data-click="feed">Bulletin Board</a></li>
          <li><a data-click="mini">Student Minigames</a></li>
          <li><a data-click="term">Terminal (admin only)</a></li>
          <li><a data-click="files">File Explorer</a></li>
        </ul>
        <p style="margin-top:16px;color:#8ab;font-size:11px">// hint: some pages leak info. keep poking.</p>`;
      body.querySelectorAll('a').forEach(a=>a.onclick = ()=>{
        const id = a.dataset.click;
        if(id==='login'){
          const t = prompt('Faculty Login\n(there\'s a rumor the janitor knows the default password)');
          if(t && t.toLowerCase().includes('admin1963')){
            G.flags.gotAdmin = true;
            G.flags.knowsJailbreak = true;
            UI.ev('LOGIN SUCCESS. You have admin access.', 'good');
            pushRumor('Someone logged into the faculty portal.');
          } else if(t) UI.ev('Access denied.', 'bad');
        } else {
          const app = CRT.apps_def.find(x=>x.id===id);
          if(app) CRT.open(app);
        }
      });
    }},
    {id:'feed', name:'Board', icon:'📋', color:'#ffb020', title:'NH Bulletin Board', render:(body)=>{
      body.innerHTML = `
        <div style="color:#ffd;margin-bottom:10px"><b>🔔 Posts</b></div>
        <div style="background:rgba(255,255,255,.04);padding:10px;border-radius:4px;margin-bottom:8px"><b>Coach Banks:</b> Tryouts Friday. Come sweat.</div>
        <div style="background:rgba(255,255,255,.04);padding:10px;border-radius:4px;margin-bottom:8px"><b>Anon (mod deleted):</b> Principal keeps passwords in his top drawer. try admin1963.</div>
        <div style="background:rgba(255,255,255,.04);padding:10px;border-radius:4px;margin-bottom:8px"><b>Maya R.:</b> Prom committee needs volunteers!</div>
        <div style="background:rgba(255,255,255,.04);padding:10px;border-radius:4px;margin-bottom:8px"><b>Anon:</b> Roof hatch 2F east. thank me later.</div>`;
    }},
    {id:'mini', name:'Games', icon:'🎮', color:'#3ddc97', title:'NHS Mini-Games', render:(body)=>{
      body.innerHTML = `<div style="color:#ffd;margin-bottom:10px"><b>🎮 Pick a game</b></div>
        <button class="mg-btn" style="width:100%;margin-bottom:6px" data-g="math">⟶ Math Blast</button>
        <button class="mg-btn" style="width:100%;margin-bottom:6px" data-g="typing">⟶ Typing Test</button>
        <button class="mg-btn" style="width:100%;margin-bottom:6px" data-g="hack">⟶ H4CK-M4N</button>`;
      body.querySelectorAll('button').forEach(b=>b.onclick=()=>{
        closeComputer();
        openMinigame(b.dataset.g==='math'?'MATH': b.dataset.g==='typing'?'TYPING':'HACK');
      });
    }},
    {id:'term', name:'Terminal', icon:'▶', color:'#111', title:'/bin/sh', size:[560,380], term:true, render:(body)=>{
      const write = (t)=>{ const el=document.createElement('div'); el.className='line'; el.textContent=t; body.appendChild(el); body.scrollTop=body.scrollHeight; };
      write('NHSOS terminal v4.1');
      write('type "help" for commands.');
      const inp = document.createElement('div');
      inp.innerHTML = `<span style="color:#3ddc97">$ </span><input type="text" autofocus spellcheck="false" />`;
      body.appendChild(inp);
      const input = inp.querySelector('input');
      setTimeout(()=>input.focus(),50);
      input.addEventListener('keydown',(e)=>{
        if(e.key==='Enter'){
          const cmd = input.value.trim();
          write(`$ ${cmd}`);
          runCmd(cmd, write);
          input.value='';
        }
      });
    }},
    {id:'files', name:'Files', icon:'📁', color:'#775588', title:'File Manager', render:(body)=>{
      body.innerHTML = `
        <div>📁 /home/student/</div>
        <div style="margin-left:14px">📄 homework.txt</div>
        <div style="margin-left:14px">📄 README</div>
        <div style="margin-top:6px">📁 /var/log/</div>
        <div style="margin-left:14px">📄 access.log <span style="color:#ffb020;cursor:pointer" id="leakBtn">(open)</span></div>
        <div style="margin-top:6px">📁 /secret/ ${G.flags.gotAdmin?'<span style="color:#3ddc97">(unlocked)</span>':'<span style="color:#ff5a5f">(locked)</span>'}</div>
        ${G.flags.gotAdmin?'<div style="margin-left:14px;color:#3ddc97">📄 grades.csv</div><div style="margin-left:14px;color:#3ddc97">📄 answers.pdf</div>':''}`;
      body.querySelector('#leakBtn').onclick = ()=>{
        alert('Line 4412:\npassword_reset USER:vega PW:N0rthWood63\n\n(interesting...)');
        G.flags.knowsJailbreak = true;
      };
    }},
    {id:'jail', name:'JAIL.exe', icon:'⚠', color:'#ff5a5f', title:'⚠ Jailbreak Tool', render:(body)=>{
      if(G.flags.gotAdmin){
        body.innerHTML = `<div style="color:#3ddc97"><b>ADMIN UNLOCKED</b></div><p style="margin-top:10px">You now have elevated access in the Terminal app.</p>`;
      } else {
        body.innerHTML = `
          <div style="color:#ff5a5f;margin-bottom:12px"><b>⚠ WARNING</b></div>
          <p>This attempts to escalate privileges. If you're caught, DETENTION.</p>
          <p style="margin-top:6px;color:#888;font-size:11px">Success chance scales with hacks completed.</p>
          <button class="mg-btn" style="width:100%;margin-top:10px" id="jailbtn">RUN EXPLOIT</button>`;
        body.querySelector('#jailbtn').onclick = ()=>{
          const success = G.hacks >= 2 || Math.random()<0.35;
          if(success){
            G.flags.gotAdmin = true; G.hacks++;
            UI.ev('ADMIN ACCESS GRANTED.', 'good');
            G.reputation = clamp(G.reputation-4,0,100);
            pushRumor('Someone just rooted the school PCs.');
          } else {
            UI.ev('A teacher noticed. DETENTION.', 'bad');
            closeComputer(); doDetention();
          }
        };
      }
    }},
  ]
};
function runCmd(cmd, write){
  const c = cmd.toLowerCase().trim();
  if(c==='') return;
  if(c==='help') return write('commands: ls, cat README, whoami, sudo su, unlock /secret, grades, rumor, exit');
  if(c==='ls') return write('homework.txt  README  /secret/  /var/log/');
  if(c==='whoami') return write(G.flags.gotAdmin ? 'root' : 'student');
  if(c==='cat readme') return write('NHSOS v4.1. try: sudo su');
  if(c==='sudo su'){
    if(G.flags.gotAdmin){ write('# already root'); return; }
    write('password:');
    const roll = Math.random();
    if(roll<0.4){ G.flags.gotAdmin=true; G.hacks++; write('# ACCESS GRANTED'); UI.ev('You got root!', 'good'); }
    else { write('denied. flagged to admin.'); if(Math.random()<0.3){ closeComputer(); doDetention(); } }
    return;
  }
  if(c==='unlock /secret'){
    if(!G.flags.gotAdmin) return write('permission denied.');
    write('unlocked: /secret/grades.csv /secret/answers.pdf');
    G.flags.gotAnswers = true;
    UI.ev('You downloaded the answer key. Tests will be easier.', 'good');
    return;
  }
  if(c==='grades'){
    const s = G.classScore; const keys = Object.keys(s);
    if(!keys.length) return write('no grades yet.');
    keys.forEach(k=> write(`${k}: ${Math.floor(s[k])}%`));
    return;
  }
  if(c==='rumor'){
    if(!G.rumors.length) return write('no rumors in the database.');
    G.rumors.slice(-5).forEach(r=> write('// '+r.text));
    return;
  }
  if(c==='exit') closeComputer();
  else write('unknown command: '+cmd);
}
function openComputer(){
  const d = document.getElementById('desktop');
  d.querySelectorAll('.window').forEach(w=>w.remove());
  const ic = document.getElementById('dtIcons');
  ic.innerHTML = '';
  CRT.apps_def.forEach(app=>{
    if(app.id==='jail' && !G.flags.knowsJailbreak) return;
    const el = document.createElement('div');
    el.className = 'dt-icon';
    el.innerHTML = `<div class="gfx" style="background:${app.color}">${app.icon}</div><div class="nm">${app.name}</div>`;
    el.onclick = ()=> CRT.open(app);
    ic.appendChild(el);
  });
  document.getElementById('computer').classList.add('show');
  if(document.pointerLockElement) document.exitPointerLock();
}
function closeComputer(){ document.getElementById('computer').classList.remove('show'); }
document.getElementById('crtClose').onclick = closeComputer;

// ============================================================================
//  CLASSROOM / ARCADE MINIGAMES
// ============================================================================
function openMinigame(kind){
  const box = document.getElementById('mgBox');
  document.getElementById('minigame').classList.add('show');
  if(document.pointerLockElement) document.exitPointerLock();
  kind = String(kind).toUpperCase();
  if(kind==='MATH'){ runMathGame(box); }
  else if(kind==='SCI' || kind==='SCIENCE'){ runSciGame(box); }
  else if(kind==='PE'){ runPEGame(box); }
  else if(kind==='TYPING'){ runTypingGame(box); }
  else if(kind==='HACK'){ runHackGame(box); }
  else if(kind==='ENGLISH'){ runTypingGame(box, 'ENGLISH'); }
  else if(kind==='HISTORY'){ runSciGame(box, 'HISTORY'); }
  else { runMathGame(box); }
}
function closeMinigame(){ document.getElementById('minigame').classList.remove('show'); }

function shuffle(a){ for(let i=a.length-1;i>0;i--){ const j=(Math.random()*(i+1))|0; [a[i],a[j]]=[a[j],a[i]]; } return a; }

function runMathGame(box){
  let q=0, correct=0, total=5;
  const next = ()=>{
    if(q>=total){ finishMini('math', correct*(100/total), box); return; }
    const a = 2+Math.floor(Math.random()*12), b=1+Math.floor(Math.random()*8);
    const op = ['+','-','×'][Math.floor(Math.random()*3)];
    const ans = op==='+'?a+b:op==='-'?a-b:a*b;
    const wrongs = [ans+1, ans-1, ans+3, Math.abs(ans)+5];
    const choices = shuffle([ans, ...shuffle(wrongs).slice(0,3)]);
    box.innerHTML = `
      <div class="mg-title">MATH — Q${q+1}/${total}</div>
      <div class="mg-q">${a} ${op} ${b} = ?</div>
      <div class="mg-choices">${choices.map(c=>`<button class="mg-btn" data-v="${c}">${c}</button>`).join('')}</div>
      <div class="mg-score">Score: ${correct}/${total}${G.flags.gotAnswers?' (+ you have the answer key)':''}</div>`;
    box.querySelectorAll('button').forEach(b=>b.onclick = ()=>{
      const val = +b.dataset.v;
      const right = val === ans;
      if(right || G.flags.gotAnswers){ correct++; }
      q++; next();
    });
  };
  next();
}
function runSciGame(box, label='SCIENCE'){
  const sciQs = [
    {q:'Water boils at how many °C at sea level?', a:'100', c:['50','100','75','180']},
    {q:'The powerhouse of the cell is the...', a:'mitochondria', c:['nucleus','mitochondria','ribosome','cytoplasm']},
    {q:'Force = mass × ?', a:'acceleration', c:['velocity','distance','acceleration','weight']},
    {q:'Atomic number of oxygen?', a:'8', c:['6','7','8','16']},
    {q:'Speed of light (m/s, rounded)?', a:'3×10⁸', c:['3×10⁶','3×10⁸','3×10¹⁰','1000']},
  ];
  const histQs = [
    {q:'The Declaration of Independence was signed in?', a:'1776', c:['1492','1776','1812','1865']},
    {q:'The Roman Empire fell in which century (West)?', a:'5th', c:['1st','5th','10th','15th']},
    {q:'Who wrote "I have a dream"?', a:'MLK Jr.', c:['Malcolm X','MLK Jr.','JFK','FDR']},
    {q:'The Berlin Wall fell in?', a:'1989', c:['1945','1961','1989','2001']},
    {q:'First emperor of unified China?', a:'Qin Shi Huang', c:['Kublai Khan','Qin Shi Huang','Sun Tzu','Mao Zedong']},
  ];
  const qs = label==='HISTORY' ? histQs : sciQs;
  let q=0, correct=0;
  const next = ()=>{
    if(q>=qs.length){ finishMini(label.toLowerCase(), correct*(100/qs.length), box); return; }
    const x = qs[q];
    box.innerHTML = `
      <div class="mg-title">${label} — Q${q+1}/${qs.length}</div>
      <div class="mg-q">${x.q}</div>
      <div class="mg-choices">${shuffle([...x.c]).map(c=>`<button class="mg-btn">${c}</button>`).join('')}</div>
      <div class="mg-score">Score: ${correct}/${qs.length}</div>`;
    box.querySelectorAll('button').forEach(b=>b.onclick = ()=>{
      if(b.textContent===x.a || G.flags.gotAnswers) correct++;
      q++; next();
    });
  };
  next();
}
function runPEGame(box){
  let score=0, shots=0;
  box.innerHTML = `
    <div class="mg-title">GYM — SHOOT HOOPS</div>
    <div style="font-size:13px;color:#aaa;margin-bottom:10px">Time your SHOOT to hit the GREEN zone.</div>
    <div style="position:relative;height:28px;background:#1a1e28;border-radius:4px;margin:16px 0;overflow:hidden">
      <div style="position:absolute;left:42%;width:16%;height:100%;background:#3ddc97;opacity:.4"></div>
      <div id="mark" style="position:absolute;left:0;width:4px;height:100%;background:#fff"></div>
    </div>
    <button class="mg-btn" id="shoot" style="grid-column:span 2">SHOOT</button>
    <div class="mg-score" id="sc">Made: 0 / 0</div>`;
  const mark = document.getElementById('mark');
  let dir=1, x=0;
  const iv = setInterval(()=>{
    x += dir*1.8; if(x>96){dir=-1} if(x<0){dir=1}
    mark.style.left = x+'%';
  }, 16);
  document.getElementById('shoot').onclick = ()=>{
    shots++;
    if(x>=42 && x<=58){ score++; UI.ev('SWISH!', 'good'); }
    else UI.ev('Miss.', 'bad');
    document.getElementById('sc').textContent = `Made: ${score} / ${shots}`;
    if(shots>=5){ clearInterval(iv); finishMini('pe', score*20, box); }
  };
}
function runTypingGame(box, label='TYPING'){
  const words = 'the quick brown fox jumps over the lazy dog'.split(' ');
  let i=0, correct=0;
  const next = ()=>{
    if(i>=words.length){ finishMini(label.toLowerCase(), correct*(100/words.length), box); return; }
    const target = words[i];
    box.innerHTML = `
      <div class="mg-title">${label} — ${i+1}/${words.length}</div>
      <div class="mg-q" style="font-family:monospace;letter-spacing:4px">${target}</div>
      <input id="tinp" style="width:100%;padding:10px;background:#1a1e28;color:#fff;border:1px solid rgba(255,255,255,.1);border-radius:6px;font-family:monospace;font-size:16px;text-align:center" autocomplete="off">
      <div class="mg-score">Correct: ${correct}/${words.length}</div>`;
    const inp = document.getElementById('tinp');
    setTimeout(()=>inp.focus(),50);
    inp.addEventListener('keydown', e=>{
      if(e.key==='Enter'){
        if(inp.value.trim()===target) correct++;
        i++; next();
      }
    });
  };
  next();
}
function runHackGame(box){
  let level=0, maxL=5, correct=0;
  const next = ()=>{
    if(level>=maxL){ finishMini('hack', correct*20, box); if(correct>=3) G.hacks++; return; }
    const seq = Array.from({length:3+level},()=>['△','○','□','✕'][Math.floor(Math.random()*4)]);
    box.innerHTML = `
      <div class="mg-title">HACK-M4N — LV ${level+1}</div>
      <div class="mg-q" id="mq" style="letter-spacing:12px;font-size:36px;color:#3ddc97">memorize...</div>
      <div class="mg-score">ok: ${correct}/${maxL}</div>`;
    const mq = document.getElementById('mq');
    mq.textContent = seq.join(' ');
    setTimeout(()=>{
      mq.textContent = 'enter the sequence';
      const inp = document.createElement('input');
      inp.style.cssText = 'width:100%;padding:10px;background:#1a1e28;color:#3ddc97;border:1px solid rgba(255,255,255,.1);border-radius:6px;font-family:monospace;font-size:20px;text-align:center;letter-spacing:8px;margin-top:10px';
      inp.placeholder = '△○□✕';
      box.appendChild(inp); inp.focus();
      inp.addEventListener('keydown', e=>{
        if(e.key==='Enter'){
          const v = inp.value.replace(/\s/g,'').split('').join(' ');
          if(v === seq.join(' ')) correct++;
          level++; next();
        }
      });
    }, 1200+level*200);
  };
  next();
}
function finishMini(kind, score, box){
  score = Math.round(score);
  const grade = score>=80?'A':score>=60?'B':score>=40?'C':'F';
  const gc = grade==='A'?'#3ddc97':grade==='F'?'#ff3355':'#ffb020';
  box.innerHTML = `
    <div class="mg-title">${kind.toUpperCase()} — DONE</div>
    <div class="mg-q">Score: ${score}% · Grade <b style="color:${gc}">${grade}</b></div>
    <div class="mg-choices"><button class="mg-btn" id="miniok" style="grid-column:span 2">CLOSE</button></div>`;
  document.getElementById('miniok').onclick = closeMinigame;
  G.classScore[kind] = (G.classScore[kind]||50)*0.3 + score*0.7;
  if(score>=80){ G.stress = clamp(G.stress-5,0,100); G.reputation = clamp(G.reputation+2,0,100); UI.ev(`${kind.toUpperCase()}: great job!`, 'good'); }
  else if(score<40){ G.stress = clamp(G.stress+10,0,100); G.reputation = clamp(G.reputation-2,0,100); UI.ev(`${kind.toUpperCase()}: rough.`, 'bad'); }
  else UI.ev(`${kind.toUpperCase()}: passed.`, 'info');
  UI.updateStats();
}

// ============================================================================
//  TIME / BELLS / SCHEDULES / END OF DAY
// ============================================================================
function currentPeriod(){
  const m = minutesNow();
  return G.schedule.find(p=> m>=p.start && m<p.end);
}
let lastMinute = -1;
function tickTime(dt){
  if(G.paused) return;
  G.minute += dt * G.timeScale / 60;
  while(G.minute>=60){ G.minute-=60; G.hour++; }
  if(G.hour>=24){ G.hour=0; G.day++; }
  const mm = Math.floor(G.minute);
  if(mm !== lastMinute){
    lastMinute = mm;
    UI.updateClock();
    UI.updateStats();
    const now = minutesNow();
    const p = G.schedule.find(p=> p.start===now);
    if(p){
      UI.ev(`🔔 BELL — ${p.class} starts (${p.room})`, 'info');
      if(G.activeScene && G.activeScene.startsWith('SCHOOL') && p.class!=='FREE'){
        const inRoom = checkIfInRoom(p.room);
        if(!inRoom && p.class!=='LUNCH') UI.ev(`You should be in ${p.room}!`, 'bad');
      }
    }
    const pe = G.schedule.find(p=> p.end===now);
    if(pe){ UI.ev(`🔔 BELL — ${pe.class} ends`, 'info'); }
    if(now === 15*60 && G.activeScene && G.activeScene.startsWith('SCHOOL')){
      UI.ev('School is over. Head to the exit.', 'info');
    }
    if(G.hour>=19){ endOfDay(); }
  }
}
function checkIfInRoom(room){
  // Rough spatial check based on room centers
  const centers = {
    ROOM_101: [-20, 5], ROOM_102: [20, 5], ROOM_103: [20, 5],
    ROOM_201: [-20, 5], CAFETERIA: [0, 4], GYM: [0, -22], ANYWHERE:[0,0]
  };
  const c = centers[room];
  if(!c) return true;
  const dx = Player.pos.x - c[0], dz = Player.pos.z - c[1];
  return dx*dx+dz*dz < 64;
}

function endOfDay(){
  G.stress = clamp(G.stress-25,0,100);
  G.hunger = clamp(G.hunger-30,0,100);
  G.hp = 100; G.stamina = 100;
  G.day++;
  G.hour = 7; G.minute = 0;
  UI.ev(`DAY ${G.day-1} ENDS. A new day begins.`, 'good');
  loadScene('BEDROOM');
  UI.setObj('Alarm is ringing. Wake up.');
  G.flags.alarmStopped = false; G.flags.dressed = false;
  playAlarm();
}

function closeAllUIs(){
  closePhone(); closeComputer(); closeMinigame();
  document.getElementById('dialogue').classList.remove('show');
  if(document.pointerLockElement) document.exitPointerLock();
}

// NPC schedule updates — retarget them to sensible locations
function updateNPCSchedules(){
  const p = currentPeriod();
  if(!p) return;
  G.npcs.forEach(n=>{
    if(n.chatting) return;
    if(n.role==='teacher' || n.role==='principal' || n.role==='janitor') return;
    if(p.class==='LUNCH' && G.activeScene==='SCHOOL_FLOOR1'){
      n.setTarget(new THREE.Vector3(-4 + Math.random()*8, 0, 2 + Math.random()*6));
    } else if(p.class==='PE' && G.activeScene==='SCHOOL_FLOOR2'){
      n.setTarget(new THREE.Vector3(-6 + Math.random()*12, 0, -20 + Math.random()*6));
    } else if(p.class==='FREE' || p.class==='LUNCH'){
      n.setTarget(new THREE.Vector3(n.home.x + (Math.random()-.5)*4, 0, n.home.z + (Math.random()-.5)*4));
    } else if(G.activeScene==='SCHOOL_FLOOR1' && (p.class==='MATH' || p.class==='SCIENCE')){
      const side = p.class==='MATH' ? -1 : 1;
      n.setTarget(new THREE.Vector3(20.5*side + (Math.random()-.5)*3, 0, 2 + Math.random()*3));
    }
  });
}

// Rumor ticker
let rumorTimer = 20;
function tickRumor(dt){
  rumorTimer -= dt;
  if(rumorTimer<=0){
    rumorTimer = 30 + Math.random()*40;
    if(G.rumors.length && Math.random()<0.5){
      const r = G.rumors[Math.floor(Math.random()*G.rumors.length)];
      UI.rumor(r.text);
    }
  }
}

// ============================================================================
//  BOOTSTRAP
// ============================================================================
async function boot(){
  const bar = document.getElementById('loadbar');
  const txt = document.getElementById('loadtext');
  const progress = (p, t) => { bar.style.width = p + '%'; if(t) txt.textContent = t; };
  progress(2, 'booting engine');
  try {
    await loadAssets(progress);
  } catch(err){
    console.error('asset load failed', err);
    txt.textContent = 'asset load failed — check network (CORS / blocked host)';
    return;
  }
  progress(90, 'ready');
  setTimeout(()=>{
    document.getElementById('loading').style.display = 'none';
    document.getElementById('title').style.display = 'flex';
    document.getElementById('startBtn').onclick = startGame;
  }, 300);
}

function startGame(){
  document.getElementById('title').style.display = 'none';
  Player.init();
  buildBedroom();
  buildExterior();
  buildFloor1();
  buildFloor2();
  buildRooftop();
  loadScene('BEDROOM');
  playAlarm();
  UI.setObj('WAKE UP. Slap the alarm off (walk up and press E).');
  UI.updateStats();
  UI.updateClock();
  loop();
}

function playAlarm(){
  try{
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'square';
    osc.frequency.value = 880;
    gain.gain.value = 0;
    osc.connect(gain).connect(ctx.destination);
    osc.start();
    let on = false;
    const iv = setInterval(()=>{
      on = !on;
      gain.gain.setTargetAtTime(on ? 0.05 : 0, ctx.currentTime, 0.01);
      if(G.flags.alarmStopped){
        clearInterval(iv);
        try{ osc.stop(); ctx.close(); }catch(e){}
      }
    }, 350);
  } catch(e){}
}

// Main loop
const clock = new THREE.Clock();
function loop(){
  const dt = Math.min(0.05, clock.getDelta());
  tickTime(dt);
  tickRumor(dt);
  Player.update(dt);
  G.npcs.forEach(n=>n.update(dt));
  if(Math.random() < 0.005) updateNPCSchedules();

  // stat decay
  G.hunger = clamp(G.hunger - 0.08*dt, 0, 100);
  if(G.hunger < 15) G.stress = clamp(G.stress + 0.3*dt, 0, 100);

  // Sprites already face camera automatically

  renderer.render(scene, camera);
  requestAnimationFrame(loop);
}

boot();
