// three-sprites.js — Three.js layer that renders the rigged skeleton model
// for every agent on top of the current world view. ONE shared scene, model
// loaded once, cloned per agent. Each clone has its own animation mixer that
// can play 'idle' or 'walk' based on whether the agent is moving.
//
// Coordinate system: world view uses SVG coords with WORLD_CX=800, WORLD_CY=600
// inside a 1600×1200 viewBox. We map those into a Three.js orthographic
// camera so 3D positions overlay the SVG sprites perfectly.

import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { clone as cloneSkinned } from 'three/addons/utils/SkeletonUtils.js';

const WORLD_W = 1600, WORLD_H = 1200;

let renderer, scene, camera, clock;
let baseModel, baseAnimations = {};   // { idle: AnimationClip, walk: AnimationClip }
let baseModelHeight = 1, baseModelFeetY = 0;
let baseModelCenter = new THREE.Vector3(0, 0, 0);  // bbox center in model-local coords
const agentRigs = {};                 // name -> { root, mixer, actions: {idle, walk}, current: 'idle'|'walk' }
export function _debug() {
  return {
    ready,
    agents: Object.keys(agentRigs),
    sceneChildren: scene ? scene.children.length : null,
    anims: Object.keys(baseAnimations),
  };
}
let canvas;
let ready = false;
let pendingUpdates = [];

let anchorEl;   // the SVG world view we're overlaying
export async function init3D(svgAnchor) {
  anchorEl = svgAnchor;
  canvas = document.createElement('canvas');
  canvas.style.cssText = 'position:absolute; pointer-events:none; z-index:5; display:block;';
  // Append the canvas to the SVG's parent so it can be absolutely positioned
  // relative to a shared positioning context.
  const host = svgAnchor.parentElement;
  // Ensure host has positioning so absolute children land within it
  const cs = getComputedStyle(host);
  if (cs.position === 'static') host.style.position = 'relative';
  host.appendChild(canvas);

  renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
  renderer.setPixelRatio(window.devicePixelRatio || 1);
  // Enable per-material clipping so we can slice the front wall off the
  // world meshes without affecting the agent rigs.
  renderer.localClippingEnabled = true;
  resize();
  if (window.ResizeObserver) {
    const ro = new ResizeObserver(() => resize());
    ro.observe(svgAnchor);
    ro.observe(host);
  }
  window.addEventListener('scroll', resize, true);

  scene = new THREE.Scene();
  // Orthographic camera — bounds match SVG viewBox (1600×1200) but expanded
  // on whichever axis is "extra" in the canvas so the world stays centered
  // and 1:1 with the SVG's preserveAspectRatio="xMidYMid meet" letterboxing.
  camera = new THREE.OrthographicCamera(-WORLD_W/2, WORLD_W/2, WORLD_H/2, -WORLD_H/2, -1000, 1000);
  camera.position.set(0, 0, 500);
  camera.lookAt(0, 0, 0);
  updateCameraForCanvas();

  // Bright stage lighting so the world GLBs read with vivid colors and the
  // skeletons pop. Five lights total: strong ambient + key + 3 fill lights
  // from different angles to eliminate dark corners.
  scene.add(new THREE.AmbientLight(0xffffff, 1.8));
  const key = new THREE.DirectionalLight(0xffffff, 1.4);
  key.position.set(300, 600, 800);
  scene.add(key);
  const fillFront = new THREE.DirectionalLight(0xffffff, 0.8);
  fillFront.position.set(0, 200, 1000);
  scene.add(fillFront);
  const fillLeft = new THREE.DirectionalLight(0xffffff, 0.6);
  fillLeft.position.set(-800, 200, 400);
  scene.add(fillLeft);
  const fillRight = new THREE.DirectionalLight(0xffffff, 0.6);
  fillRight.position.set(800, 200, 400);
  scene.add(fillRight);
  // Subtle warm rim from below so floors don't go pitch black
  const rim = new THREE.HemisphereLight(0xfff0c0, 0x404060, 0.6);
  scene.add(rim);


  clock = new THREE.Clock();

  // Load the rigged + animated skeleton model
  await loadBaseModel();
  ready = true;
  // Flush pending updates that came before the model loaded
  pendingUpdates.forEach(([name, action]) => updateAgent(name, action));
  pendingUpdates = [];

  window.addEventListener('resize', resize);
  requestAnimationFrame(tick);
  return true;
}

function resize() {
  // Match the canvas to the SVG anchor's CSS bounding rect.
  const anchorRect = anchorEl.getBoundingClientRect();
  const hostRect = canvas.parentElement.getBoundingClientRect();
  renderer.setSize(anchorRect.width || 1, anchorRect.height || 1, true);
  canvas.style.position = 'absolute';
  canvas.style.top  = (anchorRect.top  - hostRect.top)  + 'px';
  canvas.style.left = (anchorRect.left - hostRect.left) + 'px';
  if (camera) updateCameraForCanvas();
}

// Adjust ortho bounds so the 1600×1200 SVG world is centered + scaled to
// "meet" (letterboxed) — matching the SVG's xMidYMid meet behavior.
function updateCameraForCanvas() {
  const r = anchorEl.getBoundingClientRect();
  const canvasAspect = (r.width || 1) / (r.height || 1);
  const worldAspect = WORLD_W / WORLD_H;
  let halfW, halfH;
  if (canvasAspect > worldAspect) {
    // canvas wider than world: pad world horizontally
    halfH = WORLD_H / 2;
    halfW = halfH * canvasAspect;
  } else {
    // canvas narrower/taller than world: pad world vertically
    halfW = WORLD_W / 2;
    halfH = halfW / canvasAspect;
  }
  camera.left = -halfW; camera.right = halfW;
  camera.top = halfH;   camera.bottom = -halfH;
  camera.updateProjectionMatrix();
}

async function loadBaseModel() {
  const loader = new GLTFLoader();
  const url = '/assets/skel3d.glb';
  return new Promise((res, rej) => {
    loader.load(url, (gltf) => {
      baseModel = gltf.scene;
      // Measure the model's natural size so we know what scale to apply
      const box = new THREE.Box3().setFromObject(baseModel);
      const size = box.getSize(new THREE.Vector3());
      const center = box.getCenter(new THREE.Vector3());
      console.log('[3D] model bbox size:', size.x.toFixed(3), size.y.toFixed(3), size.z.toFixed(3),
                  'center:', center.x.toFixed(3), center.y.toFixed(3), center.z.toFixed(3),
                  'scene scale:', baseModel.scale.x, baseModel.scale.y, baseModel.scale.z);
      baseModelHeight = size.y;
      baseModelFeetY = box.min.y;
      baseModelCenter = center.clone();
      // Brighten the skeleton: override material to be near-white with a
      // soft emissive glow so the agents stand out on top of the dark world
      // scenes. We keep the original texture but tint it lighter.
      baseModel.traverse(o => {
        if (o.isMesh) {
          o.frustumCulled = false;
          if (o.material) {
            o.material.side = THREE.DoubleSide;
            o.material.transparent = false;
            o.material.opacity = 1;
            // Wash out the gray baked-in tones toward white
            if (o.material.color) o.material.color.setRGB(1.0, 1.0, 1.0);
            // Soft self-illumination so it never goes dark
            if ('emissive' in o.material) {
              o.material.emissive = new THREE.Color(0xddddee);
              o.material.emissiveIntensity = 0.35;
            }
            if ('roughness'  in o.material) o.material.roughness  = 0.55;
            if ('metalness'  in o.material) o.material.metalness  = 0.0;
            o.material.needsUpdate = true;
          }
        }
      });
      window.__three_model_size = { sx: size.x, sy: size.y, sz: size.z };
      (gltf.animations || []).forEach(clip => {
        const name = clip.name.toLowerCase();
        if (name.includes('walk') || name.includes('run')) baseAnimations.walk = clip;
        else if (name.includes('idle') || name.includes('stand')) baseAnimations.idle = clip;
        else if (!baseAnimations.idle) baseAnimations.idle = clip;
      });
      if (baseAnimations.idle && !baseAnimations.walk) baseAnimations.walk = baseAnimations.idle;
      if (baseAnimations.walk && !baseAnimations.idle) baseAnimations.idle = baseAnimations.walk;
      console.log('[3D] base model loaded; anims:', Object.keys(baseAnimations));
      res();
    }, undefined, (e) => { console.warn('[3D] model load failed:', e); rej(e); });
  });
}

function makeAgentRig(name) {
  if (!baseModel) return null;
  // Clone skinned mesh (preserves bones per instance)
  const inner = cloneSkinned(baseModel);
  // Re-anchor: shift the clone so its bbox is centered on x/z and feet on y=0
  inner.position.set(-baseModelCenter.x, -baseModelFeetY, -baseModelCenter.z);
  // Wrap in a group we can scale/rotate/position freely
  const root = new THREE.Group();
  root.add(inner);
  // Small enough to feel like a character inside the room, not a giant.
  const targetHeight = 35;
  const s = targetHeight / (baseModelHeight || 1);
  root.scale.setScalar(s);
  root.rotation.y = Math.PI;
  scene.add(root);
  const mixer = new THREE.AnimationMixer(inner);
  const actions = {};
  if (baseAnimations.walk) {
    // We only have a walk clip. Use it for both states:
    //  - walk: normal speed, looping
    //  - idle: same clip but paused at a calm pose (use timeScale=0
    //    on a separate action so the mixer keeps the bones posed)
    const walkAct = mixer.clipAction(baseAnimations.walk);
    walkAct.setLoop(THREE.LoopRepeat); walkAct.enabled = true;
    actions.walk = walkAct;
  }
  // Start in idle: walk action paused at the first frame
  if (actions.walk) {
    actions.walk.play();
    actions.walk.paused = true;
    actions.walk.time = 0.4;   // standing pose, roughly
  }
  return { root, mixer, actions, current: 'idle', facing: 1 };
}

// Public API: called by the main script every render tick
// `action` is { x, y, moving, facing }  (x/y in SVG world coords with WORLD_CX/CY at 800/600)
export function updateAgent(name, action) {
  if (!ready) { pendingUpdates.push([name, action]); return; }
  let rig = agentRigs[name];
  if (!rig) {
    rig = makeAgentRig(name);
    if (!rig) return;
    agentRigs[name] = rig;
  }
  // Two input modes:
  //  - screenSpace:true → action.x/y are canvas-local pixel coords; convert
  //    those to camera-world coords by scaling against the camera frustum.
  //  - default → action.x/y are SVG viewBox coords with 800,600 = center.
  let wx, wy;
  if (action.screenSpace) {
    const r = canvas.getBoundingClientRect();
    const ndcX = (action.x / r.width) * 2 - 1;
    const ndcY = -((action.y / r.height) * 2 - 1);  // canvas y is top-down; camera y is up
    wx = (camera.right - camera.left) * 0.5 * ndcX;
    wy = (camera.top   - camera.bottom) * 0.5 * ndcY;
  } else {
    wx = action.x - 800;
    wy = -(action.y - 600);
  }
  rig.root.position.set(wx, wy, 0);  // feet land exactly on the SVG sprite anchor
  // Facing: rotate around Y; side-on facing is mapped to scaleX flip equivalent via rotation
  const wantFacing = action.facing || 1;
  if (wantFacing !== rig.facing) {
    rig.facing = wantFacing;
    rig.root.rotation.y = wantFacing < 0 ? Math.PI / 2 : -Math.PI / 2;
  }
  // Switch action: toggle paused on the single walk clip
  const want = action.moving ? 'walk' : 'idle';
  if (want !== rig.current && rig.actions.walk) {
    if (want === 'walk') {
      rig.actions.walk.paused = false;
    } else {
      rig.actions.walk.paused = true;
    }
    rig.current = want;
  }
}

export function probeAgent(name) {
  const rig = agentRigs[name]; if (!rig) return null;
  const bb = new THREE.Box3().setFromObject(rig.root);
  // Project the world center of the bbox into canvas pixels
  const center = bb.getCenter(new THREE.Vector3());
  const ndc = center.clone().project(camera);
  const r = canvas.getBoundingClientRect();
  const screen = {
    x: (ndc.x * 0.5 + 0.5) * r.width + r.left,
    y: (-ndc.y * 0.5 + 0.5) * r.height + r.top,
  };
  return {
    rootPos: rig.root.position.toArray(),
    rootScale: rig.root.scale.toArray(),
    bbox: { min: bb.min.toArray(), max: bb.max.toArray() },
    bboxCenter: center.toArray(),
    ndc: [ndc.x, ndc.y, ndc.z],
    screen,
    canvasRect: { x: r.left, y: r.top, w: r.width, h: r.height },
    cameraBounds: { l: camera.left, r: camera.right, t: camera.top, b: camera.bottom },
  };
}
export function removeAgent(name) {
  const rig = agentRigs[name];
  if (!rig) return;
  scene.remove(rig.root);
  delete agentRigs[name];
}

export function removeAllAgents() {
  Object.keys(agentRigs).forEach(removeAgent);
}

// ─── World 3D scenes ────────────────────────────────────────────────────
// One GLB per world (world-{id}.glb). Loaded lazily on first enter, cached,
// swapped on world change.
const worldCache = new Map();   // id -> Object3D (already normalized)
let currentWorldRoot = null;
let currentWorldId = null;

// Per-world rotation overrides on top of the base isometric rotation.
// HQ gets an extra +45° yaw so the hex/square sits diamond-wise like the
// satellites' diamond outline (but rotated to a unique angle).
const WORLD_YAW_OFFSET = {
  hq: -Math.PI / 4,   // -45° (the other direction)
};

export async function loadWorldScene(id) {
  if (currentWorldId === id && currentWorldRoot) return;
  // Detach previous
  if (currentWorldRoot) { scene.remove(currentWorldRoot); currentWorldRoot = null; }
  currentWorldId = id;
  let root = worldCache.get(id);
  if (!root) {
    const loader = new GLTFLoader();
    try {
      const gltf = await new Promise((res, rej) => loader.load(
        `/assets/world-${id}.glb`, res, undefined, rej));
      root = normalizeWorldGLB(gltf.scene);
      // Apply per-world yaw override before caching
      const extra = WORLD_YAW_OFFSET[id] || 0;
      root.rotation.y += extra;
      worldCache.set(id, root);
    } catch (e) {
      console.warn('[3D] world load failed:', id, e);
      return;
    }
  }
  // Add only if it's still the active world
  if (currentWorldId === id) {
    scene.add(root);
    currentWorldRoot = root;
    return root;
  }
}

export function unloadWorldScene() {
  if (currentWorldRoot) { scene.remove(currentWorldRoot); currentWorldRoot = null; }
  currentWorldId = null;
  // Force-clear the WebGL framebuffer so the last rendered frame doesn't
  // linger as a ghost when we navigate back to the map.
  if (renderer) {
    renderer.setClearColor(0x000000, 0);
    renderer.clear(true, true, true);
  }
}

export function probeWorld() {
  if (!currentWorldRoot) return null;
  const bb = new THREE.Box3().setFromObject(currentWorldRoot);
  return {
    id: currentWorldId,
    bbox: { min: bb.min.toArray(), max: bb.max.toArray() },
    rot: [currentWorldRoot.rotation.x, currentWorldRoot.rotation.y, currentWorldRoot.rotation.z],
    pos: currentWorldRoot.position.toArray(),
    scale: currentWorldRoot.scale.x,
  };
}

// Rotate / position the world model interactively for debugging
export function tweakWorld({ rotY, rotX, posZ, scale }) {
  if (!currentWorldRoot) return null;
  if (rotY != null) currentWorldRoot.rotation.y = rotY;
  if (rotX != null) currentWorldRoot.rotation.x = rotX;
  if (posZ != null) currentWorldRoot.position.z = posZ;
  if (scale != null) currentWorldRoot.scale.setScalar(scale);
  return probeWorld();
}

// Tripo3D models come at unpredictable scale/orientation. Normalize so the
// room sits centered on the X/Y plane with its widest axis ~1300 world units
// wide (a bit smaller than the 1600-wide camera frustum so it fits with
// breathing room), and pushed back on Z so characters appear in front of it.
function normalizeWorldGLB(gltfScene) {
  const root = new THREE.Group();
  root.add(gltfScene);

  // Clip the front portion (closer to camera) so the wall facing us is
  // sliced off → the skeletons walking inside become visible. Plane normal
  // (0,0,-1) + constant=180 keeps world-space z ≤ 180; the room's front
  // wall sits around z=300-400 after rotation, so we cut the top ~quarter.
  const frontClip = new THREE.Plane(new THREE.Vector3(0, 0, -1), 180);

  // Materials: ensure visible + perk up brightness + apply front-wall clip.
  gltfScene.traverse(o => {
    if (o.isMesh) {
      o.frustumCulled = false;
      if (o.material) {
        o.material.side = THREE.DoubleSide;
        o.material.clippingPlanes = [frontClip];
        o.material.clipShadows = true;
        if ('emissive' in o.material && o.material.map) {
          // Use the diffuse map as the emissive map at low intensity → every
          // pixel of the texture self-glows just enough to never go pitch black.
          o.material.emissive = new THREE.Color(0xffffff);
          o.material.emissiveMap = o.material.map;
          o.material.emissiveIntensity = 0.25;
        }
        if ('roughness' in o.material) o.material.roughness = 0.7;
        if ('metalness' in o.material) o.material.metalness = 0.1;
        o.material.needsUpdate = true;
      }
    }
  });

  // Measure + scale
  const bb = new THREE.Box3().setFromObject(gltfScene);
  const size = bb.getSize(new THREE.Vector3());
  const center = bb.getCenter(new THREE.Vector3());
  const widest = Math.max(size.x, size.y, size.z) || 1;
  // Match the 2D backdrop's footprint (~521 CSS px). After the isometric
  // rotation, an originally widest-axis-aligned edge projects to ~80% of its
  // length on screen — so the model needs to start at ~660 world units so it
  // overlays the 2D image exactly.
  const targetWidest = 660;
  const s = targetWidest / widest;

  // Recenter then scale
  gltfScene.position.set(-center.x, -center.y, -center.z);
  root.scale.setScalar(s);
  // Push slightly back so characters at z=0 render in front
  root.position.set(0, 0, -50);
  // Standard isometric orientation: ~35.26° elevation + 45° yaw. This rotates
  // the Tripo3D mesh so the orthographic camera sees it from the same angle
  // as the original 2D source image (which was an isometric render).
  root.rotation.x = 0.6154;   // arctan(1/√2)
  root.rotation.y = 0.7854;   // π/4

  console.log('[3D] world loaded; bbox', size.x.toFixed(1), size.y.toFixed(1), size.z.toFixed(1),
              '→ scale', s.toFixed(3));
  return root;
}

function tick() {
  const dt = clock.getDelta();
  Object.values(agentRigs).forEach(r => r.mixer.update(dt));
  // Only render (and show the canvas) when we're actively in a world; on
  // the map view the canvas is hidden so the SVG modules render cleanly.
  if (currentWorldRoot || Object.keys(agentRigs).length > 0) {
    canvas.style.display = 'block';
    renderer.render(scene, camera);
  } else {
    canvas.style.display = 'none';
  }
  requestAnimationFrame(tick);
}
