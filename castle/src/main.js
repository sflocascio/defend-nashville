import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";

// Game constants
const TOTAL_WAVES = 20;
const ENEMY_DAMAGE_TAKEN_GROWTH_PER_WAVE = 1.0; // keep damage taken flat; scale HP instead
const BASE_ENEMY_HP = 20; // base HP for wave 1 enemies
const ENEMY_HP_GROWTH_PER_WAVE = 1.18; // ~18% HP growth per wave (tune as needed)
const INITIAL_GOLD = 300;
const CASTLE_MAX_HP = 100;

// Enemy path waypoints (2D on XZ plane)
const PATH_POINTS = [
  new THREE.Vector3(-40, 0, 30),
  new THREE.Vector3(-20, 0, 15),
  new THREE.Vector3(0, 0, 0),
  new THREE.Vector3(20, 0, -10),
  new THREE.Vector3(40, 0, -15),
  new THREE.Vector3(55, 0, -8),
];

// Tower types
const TowerCatalog = {
  archer: {
    key: "archer",
    display: "Singer Songwriter",
    cost: 50,
    range: 28,
    fireRateSeconds: 0.6,
    projectileSpeed: 30,
    damage: 1,
    color: 0x8fd3ff,
  },
  cannon: {
    key: "cannon",
    display: "Platinum Record Cannon",
    cost: 100,
    range: 15,
    fireRateSeconds: 2.3,
    projectileSpeed: 20,
    damage: 5,
    splashRadius: 7,
    color: 0xffb86b,
  },
  fire: {
    key: "fire",
    display: "Hot Chicken Launcher",
    cost: 75,
    range: 10,
    fireRateSeconds: 1.5,
    projectileSpeed: 26,
    damage: 3,
    splashRadius: 12,
    color: 0xff5555,
  },
  trebuchet: {
    key: "trebuchet",
    display: "Local Goods Slinger",
    cost: 300,
    range: 50,
    fireRateSeconds: 3.0,
    projectileSpeed: 15,
    damage: 6,
    splashRadius: 3,
    color: 0xc7a45c,
  },
  superTrebuchet: {
    key: "superTrebuchet",
    display: "Tourism Tax Trebuchet",
    cost: 600, //600 
    range: 100,
    fireRateSeconds: 6.0,
    projectileSpeed: 16,
    damage: 12,
    splashRadius: 6,
    color: 0xe0c080,
  },
};

// Utility
function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

// DOM elements
const canvas = document.getElementById("game");
const waveEl = document.getElementById("wave");
const goldEl = document.getElementById("gold");
const hpEl = document.getElementById("hp");
const themeNameEl = document.getElementById("themeName");
const enemiesLeftEl = document.getElementById("enemiesLeft");
const damageLeftEl = document.getElementById("damageLeft");
const startWaveBtn = document.getElementById("startWaveBtn");
const overlay = document.getElementById("overlay");
const overlayTitle = document.getElementById("overlayTitle");
const overlayText = document.getElementById("overlayText");
const restartBtn = document.getElementById("restartBtn");
const towersContainer = document.getElementById("towersContainer");

// Three.js scene setup
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.shadowMap.enabled = true;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0b1020);

const camera = new THREE.PerspectiveCamera(
  60,
  window.innerWidth / window.innerHeight,
  0.1,
  500
);
camera.position.set(35, 42, 40);

const controls = new OrbitControls(camera, renderer.domElement);
const CASTLE_POS = new THREE.Vector3(60, 0, -8);
const CASTLE_KEEP_OUT_RADIUS = 14; // enemies stop at this radius around castle
controls.target.copy(CASTLE_POS.clone().add(new THREE.Vector3(0, 6, 0)));
controls.enableDamping = true;

// Lighting
const hemi = new THREE.HemisphereLight(0xffffff, 0x223344, 0.6);
scene.add(hemi);
const dir = new THREE.DirectionalLight(0xffffff, 0.8);
dir.position.set(40, 55, 20);
dir.castShadow = true;
scene.add(dir);

// Ground and path
const groundGeo = new THREE.PlaneGeometry(160, 120);
const groundMat = new THREE.MeshStandardMaterial({ color: 0x2b3a3b });
const ground = new THREE.Mesh(groundGeo, groundMat);
ground.rotation.x = -Math.PI / 2;
ground.receiveShadow = true;
scene.add(ground);

// Path and road visualization
const pathCurve = new THREE.CatmullRomCurve3(PATH_POINTS);
const pathPoints = pathCurve.getPoints(200);
const pathGeo = new THREE.BufferGeometry().setFromPoints(pathPoints);
const pathMat = new THREE.LineBasicMaterial({ color: 0xffd700 }); // actual path 
const pathLine = new THREE.Line(pathGeo, pathMat);
scene.add(pathLine);

const ROAD_HALF_WIDTH = 8; // 4x wider
function buildRoadMesh() {
  const segments = 200;
  const positions = new Float32Array(segments * 2 * 3);
  const indices = [];
  const up = new THREE.Vector3(0, 1, 0);
  for (let i = 0; i < segments; i++) {
    const t = i / (segments - 1);
    const p = pathCurve.getPoint(t);
    const nextT = Math.min(1, (i + 1) / (segments - 1));
    const pNext = pathCurve.getPoint(nextT);
    const tangent = new THREE.Vector3().subVectors(pNext, p).normalize();
    const normal = new THREE.Vector3().crossVectors(up, tangent).normalize();
    const left = new THREE.Vector3().addVectors(p, normal.clone().multiplyScalar(-ROAD_HALF_WIDTH));
    const right = new THREE.Vector3().addVectors(p, normal.clone().multiplyScalar(ROAD_HALF_WIDTH));
    positions.set([left.x, 0.02, left.z], i * 6);
    positions.set([right.x, 0.02, right.z], i * 6 + 3);
    if (i < segments - 1) {
      const a = i * 2;
      const b = a + 1;
      const c = a + 2;
      const d = a + 3;
      indices.push(a, b, c, b, d, c);
    }
  }
  const geom = new THREE.BufferGeometry();
  geom.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geom.setIndex(indices);
  geom.computeVertexNormals();
  const mat = new THREE.MeshStandardMaterial({ color: 0x5b4f3b, roughness: 0.95 });
  const road = new THREE.Mesh(geom, mat);
  road.receiveShadow = true;
  scene.add(road);
}
buildRoadMesh();

// Scatter some trees for atmosphere
function addBuilding(position, scale = 1) {
  const building = new THREE.Group();
  const height = 2 + Math.random() * 8 * scale;
  const width = 0.8 + Math.random() * 1.4 * scale;
  const depth = 0.8 + Math.random() * 1.4 * scale;
  const body = new THREE.Mesh(
    new THREE.BoxGeometry(width, height, depth),
    new THREE.MeshStandardMaterial({
      color: new THREE.Color(
        0.6 + Math.random() * 0.4,
        0.6 + Math.random() * 0.4,
        0.65 + Math.random() * 0.35
      ),
      roughness: 0.92,
      metalness: 0.12,
    })
  );
  body.position.y = height / 2;
  body.castShadow = true;
  body.receiveShadow = true;
  building.add(body);
  building.position.copy(position);
  scene.add(building);
}

function scatterBuildings() {
  const rng = (min, max) => min + Math.random() * (max - min);
  for (let i = 0; i < 40; i++) {
    const side = Math.random() > 0.5 ? 1 : -1;
    const t = Math.random();
    const p = pathCurve.getPoint(t);
    const normal = new THREE.Vector3().crossVectors(new THREE.Vector3(0,1,0), pathCurve.getTangent(t)).normalize();
    const dist = rng(ROAD_HALF_WIDTH + 4, ROAD_HALF_WIDTH + 20) * side;
    const pos = new THREE.Vector3().addVectors(p, normal.multiplyScalar(dist));
    pos.y = 0;
    addBuilding(pos, rng(0.9, 1.7));
  }
}
scatterBuildings();

// Tennessee flag in corner
function addTennesseeFlag() {
  // Create flag pole immediately (always visible)
  // Position near path start at (-40, 0, 30), offset slightly
  const poleGeometry = new THREE.CylinderGeometry(0.15, 0.15, 16, 8);
  const poleMaterial = new THREE.MeshStandardMaterial({ color: 0x1a1a1a });
  const pole = new THREE.Mesh(poleGeometry, poleMaterial);
  pole.position.set(-45, 8, 32); // Near path start, elevated
  pole.castShadow = true;
  pole.receiveShadow = true;
  scene.add(pole);
  
  // Create flag mesh immediately with fallback color
  const flagGeometry = new THREE.PlaneGeometry(8, 5);
  const flagMaterial = new THREE.MeshStandardMaterial({ 
    color: 0x0066cc, // Blue fallback (Tennessee flag has blue)
    side: THREE.DoubleSide,
    transparent: false,
  });
  const flag = new THREE.Mesh(flagGeometry, flagMaterial);
  flag.position.set(-45, 14, 32);
  flag.rotation.y = -Math.PI / 3; // Face toward camera/view
  flag.rotation.z = 0.15; // Slight tilt for wind effect
  flag.castShadow = true;
  flag.receiveShadow = true;
  scene.add(flag);
  
  // Try to load the texture and update the flag
  const flagTexturePath = './tennessee-flag.png';
  console.log('Loading Tennessee flag texture from:', flagTexturePath);
  textureLoader.load(
    flagTexturePath,
    (texture) => {
      console.log('Tennessee flag texture loaded successfully');
      textures.tennesseeFlag = texture;
      textureStatus.tennesseeFlag = 'loaded';
      flagMaterial.map = texture;
      flagMaterial.needsUpdate = true;
    },
    (progress) => {
      // Progress callback (optional)
      if (progress && progress.total) {
        console.log('Loading flag texture:', (progress.loaded / progress.total * 100) + '%');
      }
    },
    (error) => {
      console.error('Error loading Tennessee flag texture:', error);
      console.log('Using fallback blue flag color');
      // Flag already has fallback color, so it will still be visible
    }
  );
}

// Cave entrance at path start
function buildCaveEntrance() {
  const startPoint = PATH_POINTS[0].clone();
  const forward = pathCurve.getTangent(0).clone().normalize();
  const yaw = Math.atan2(forward.x, forward.z);

  const cave = new THREE.Group();
  cave.position.copy(startPoint.clone().add(forward.clone().multiplyScalar(-3.5)));
  cave.rotation.y = yaw;

  const stoneMat = new THREE.MeshStandardMaterial({ color: 0x5a544a, roughness: 0.95 });

  // Arch (half torus)
  const arch = new THREE.Mesh(
    new THREE.TorusGeometry(3.2, 1.0, 10, 32, Math.PI),
    stoneMat
  );
  arch.rotation.z = Math.PI / 2; // stand the arch up
  arch.position.y = 2.2;
  cave.add(arch);

  // Side pillars
  const pillarGeom = new THREE.CylinderGeometry(1.0, 1.2, 3.8, 10);
  const pillarL = new THREE.Mesh(pillarGeom, stoneMat);
  pillarL.position.set(-3.0, 1.9, 0);
  const pillarR = pillarL.clone();
  pillarR.position.x = 3.0;
  cave.add(pillarL);
  cave.add(pillarR);

  // Back wall (dark inside)
  const back = new THREE.Mesh(
    new THREE.BoxGeometry(5.2, 3.6, 0.6),
    new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 1.0 })
  );
  back.position.set(0, 2.0, -2.5);
  cave.add(back);

  // Scatter a few rocks
  const rockGeom = new THREE.DodecahedronGeometry(0.8, 0);
  for (let i = 0; i < 5; i++) {
    const rock = new THREE.Mesh(rockGeom, stoneMat);
    rock.position.set(
      -3 + Math.random() * 6,
      0.4 + Math.random() * 0.2,
      -2 + Math.random() * 3
    );
    rock.scale.setScalar(0.6 + Math.random() * 0.8);
    rock.castShadow = true;
    rock.receiveShadow = true;
    cave.add(rock);
  }

  scene.add(cave);
}
buildCaveEntrance();

// Castle (3D walls + turrets)
const castle = new THREE.Group();
scene.add(castle);
buildBatmanBuilding()

function buildBatmanBuilding() {
  // Main building body
  const mainBuilding = new THREE.Mesh(
    new THREE.BoxGeometry(6, 16, 6),
    new THREE.MeshPhongMaterial({ color: 0x444d56 })
  );
  mainBuilding.position.copy(CASTLE_POS.clone().add(new THREE.Vector3(0, 8, 0)));
  mainBuilding.castShadow = true;
  mainBuilding.receiveShadow = true;
  castle.add(mainBuilding);

  // Central black glass area
  const glass = new THREE.Mesh(
    new THREE.BoxGeometry(4.2, 6, 0.5),
    new THREE.MeshPhongMaterial({ color: 0x23262b, shininess: 100 })
  );
  glass.position.copy(CASTLE_POS.clone().add(new THREE.Vector3(0, 11.5, 3.28)));
  glass.rotation.x = -0.28;
  glass.castShadow = true;
  glass.receiveShadow = true;
  castle.add(glass);

  // Left spire
  const leftSpire = new THREE.Mesh(
    new THREE.CylinderGeometry(0.35, 0.5, 8, 8),
    new THREE.MeshPhongMaterial({ color: 0xe0e2e5 })
  );
  leftSpire.position.copy(CASTLE_POS.clone().add(new THREE.Vector3(-2.3, 16, 0)));
  leftSpire.castShadow = true;
  leftSpire.receiveShadow = true;
  castle.add(leftSpire);

  // Right spire
  const rightSpire = leftSpire.clone();
  rightSpire.position.copy(CASTLE_POS.clone().add(new THREE.Vector3(2.3, 16, 0)));
  castle.add(rightSpire);

  // Optionally: Add more basic shapes (boxes) to mimic additional details from the building silhouette
  // This provides a basic "Batman Building" blocky look!
}

// Welcome to Nashville arch over the road
function buildWelcomeArch() {
  // Find a point on the road path near the castle (around t=0.85-0.9)
  const archT = 0.88;
  const archPoint = pathCurve.getPoint(archT);
  const archTangent = pathCurve.getTangent(archT).normalize();
  const archNormal = new THREE.Vector3().crossVectors(new THREE.Vector3(0, 1, 0), archTangent).normalize();
  
  const archGroup = new THREE.Group();
  archGroup.position.copy(archPoint);
  archGroup.position.y = 0;
  
  // Calculate rotation to align with road
  const yaw = Math.atan2(archTangent.x, archTangent.z);
  archGroup.rotation.y = yaw;
  
  const archMat = new THREE.MeshStandardMaterial({ color: 0x8b7355, roughness: 0.8 });
  
  // Left pillar
  const leftPillar = new THREE.Mesh(
    new THREE.BoxGeometry(1.5, 12, 1.5),
    archMat
  );
  leftPillar.position.set(-8, 6, 0);
  leftPillar.castShadow = true;
  leftPillar.receiveShadow = true;
  archGroup.add(leftPillar);
  
  // Right pillar
  const rightPillar = new THREE.Mesh(
    new THREE.BoxGeometry(1.5, 12, 1.5),
    archMat
  );
  rightPillar.position.set(8, 6, 0);
  rightPillar.castShadow = true;
  rightPillar.receiveShadow = true;
  archGroup.add(rightPillar);
  
  // Create text sign using canvas
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 128;
  const ctx = canvas.getContext('2d');
  
  // Background
  ctx.fillStyle = '#1a4d80';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  
  // Border
  ctx.strokeStyle = '#ffd700';
  ctx.lineWidth = 4;
  ctx.strokeRect(2, 2, canvas.width - 4, canvas.height - 4);
  
  // Text
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 48px Arial';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('Welcome to Nashville', canvas.width / 2, canvas.height / 2);
  
  // Create texture from canvas
  const textTexture = new THREE.CanvasTexture(canvas);
  textTexture.needsUpdate = true;
  
  // Sign plane
  const signGeometry = new THREE.PlaneGeometry(14, 3.5);
  const signMaterial = new THREE.MeshStandardMaterial({
    map: textTexture,
    side: THREE.DoubleSide,
    transparent: false,
  });
  const sign = new THREE.Mesh(signGeometry, signMaterial);
  sign.position.set(0, 11, 0);
  sign.rotation.y = Math.PI; // Face toward incoming traffic
  sign.castShadow = true;
  sign.receiveShadow = true;
  archGroup.add(sign);
  
  scene.add(archGroup);
}
buildWelcomeArch();

// Placement and interaction state
const raycaster = new THREE.Raycaster();
const mouseNdc = new THREE.Vector2();
let isPlacing = false;
/** @type {keyof typeof TowerCatalog | null} */
let placingType = null;
/** @type {THREE.Object3D | null} */
let preview = null;
/** @type {TowerInstance | null} */
let selectedTower = null;
let isMovingSelected = false;
const objectToTower = new Map();

const PLACEMENT_MAX_DISTANCE_FROM_PATH = 14; // must be near the road
const MIN_TOWER_SPACING = 3.2;

// Game state
let gold = INITIAL_GOLD;
let wave = 1;
let castleHp = CASTLE_MAX_HP;
let isWaveActive = false;
let remainingToSpawn = 0;
let currentThemeLabel = "-";
let currentWaveTotalHp = 0;
let currentWaveDamageDealt = 0;
let currentWaveEnemiesTotal = 0;
let currentWaveEnemiesKilled = 0;

/** @type {Array<TowerInstance>} */
let towers = [];
/** @type {Array<EnemyInstance>} */
let enemies = [];
/** @type {Array<ProjectileInstance>} */
let projectiles = [];

// Asset loading (textures) – placeholder for future icons (e.g., fire/arrow/logo)
const textureLoader = new THREE.TextureLoader();
const textures = {
  // project/visual assets
  arrowRight: null,
  archerTower: null,
  flame: null,
  cannonBall: null,
  flagLogo: null,
  tennesseeFlag: null,
};
const textureStatus = {
  arrowRight: 'idle',
  archerTower: 'idle',
  flame: 'idle',
  cannonBall: 'idle',
  flagLogo: 'idle',
  tennesseeFlag: 'idle',
};

function ensureTexture(name, url) {
  if (textures[name] || textureStatus[name] === 'loading' || textureStatus[name] === 'failed') return;
  textureStatus[name] = 'loading';
  textureLoader.load(
    url,
    (tex) => { textures[name] = tex; textureStatus[name] = 'loaded'; },
    undefined,
    () => { textureStatus[name] = 'failed'; }
  );
}

// Initialize Tennessee flag after textureLoader is ready
addTennesseeFlag();

// Types via JSDoc
/**
 * @typedef {Object} TowerInstance
 * @property {THREE.Object3D} root
 * @property {keyof typeof TowerCatalog} type
 * @property {number} lastFireTime
 */

/**
 * @typedef {Object} EnemyInstance
 * @property {THREE.Object3D} mesh
 * @property {number} hp
 * @property {number} speed
 * @property {number} pathT // 0-1 along path
 * @property {number} lastAttackTime
 * @property {string} theme
 * @property {THREE.Sprite} healthDisplay
 * @property {{ type: 'biped' | 'quadruped' | 'fish', leftLeg?: THREE.Object3D, rightLeg?: THREE.Object3D, leftArm?: THREE.Object3D, rightArm?: THREE.Object3D, legs?: THREE.Object3D[], tail?: THREE.Object3D, pectoralFins?: THREE.Object3D[] }} anim
 */

/**
 * @typedef {Object} ProjectileInstance
 * @property {THREE.Mesh} mesh
 * @property {THREE.Vector3} velocity
 * @property {number} damage
 * @property {number} splashRadius
 */

function updateHud() {
  waveEl.textContent = `${wave} / ${TOTAL_WAVES}`;
  goldEl.textContent = `${gold}`;
  hpEl.textContent = `${castleHp}`;
  if (themeNameEl) themeNameEl.textContent = currentThemeLabel;
  if (enemiesLeftEl) enemiesLeftEl.textContent = `${Math.max(0, currentWaveEnemiesTotal - currentWaveEnemiesKilled)}`;
  if (damageLeftEl) damageLeftEl.textContent = `${Math.max(0, Math.round(currentWaveTotalHp - currentWaveDamageDealt))}`;
}

function createTowerModel(typeKey) {
  const g = new THREE.Group();
  g.userData.type = typeKey;
  const def = TowerCatalog[typeKey];
  // Platform
  const platform = new THREE.Mesh(
    new THREE.CylinderGeometry(1.2, 1.3, 0.6, 16),
    new THREE.MeshStandardMaterial({ color: 0x2e3947 })
  );
  platform.position.y = 0.3;
  platform.castShadow = true;
  platform.receiveShadow = true;
  g.add(platform);

  if (typeKey === "archer") {
    // Use archer tower icon as billboard
    ensureTexture('archerTower', '/icons/archer-tower.png');
    if (textures.archerTower) {
      const mat = new THREE.SpriteMaterial({ map: textures.archerTower, transparent: true, depthWrite: false });
      const sprite = new THREE.Sprite(mat);
      //sprite.scale.set(1.4, 1.4, 1);
      sprite.scale.set(1.75, 1.75, 1);
      sprite.position.y = 1.6;
      g.add(sprite);
    } else {
      const body = new THREE.Mesh(
        new THREE.CylinderGeometry(0.25, 0.3, 1.2, 8),
        new THREE.MeshStandardMaterial({ color: 0x8b7355 })
      );
      body.position.y = 1.2;
      body.castShadow = true;
      g.add(body);
    }
  } else if (typeKey === "cannon") {
    // Cannon: base + barrel
    
    const base = new THREE.Mesh(
      new THREE.CylinderGeometry(0.6, 0.8, 0.5, 16),
      new THREE.MeshStandardMaterial({ color: 0x9F9F9F, metalness: 0.6, roughness: 0.4 })
    );
    base.position.y = 0.8;
    base.castShadow = true;
    g.add(base);
    const barrel = new THREE.Mesh(
      new THREE.CylinderGeometry(0.25, 0.25, 1.2, 16),
      new THREE.MeshStandardMaterial({ color: 0xF1F1F1, metalness: 0.8, roughness: 0.2 })
    );
    barrel.rotation.z = Math.PI / 2;
    barrel.position.set(0.7, 1.1, 0);
    barrel.castShadow = true;
    g.add(barrel);
// ---------- ADD RECORD PNG ----------
ensureTexture("record", "/icons/cannon-ball.png");

if (textures.record) {
  const mat = new THREE.SpriteMaterial({
    map: textures.record,
    transparent: true,
    depthWrite: false
  });

  const recordSprite = new THREE.Sprite(mat);

  // Set size (adjust as needed)
  recordSprite.scale.set(0.9, 0.9, 1);

  // Position it on top of the cannon base
  recordSprite.position.set(0, 1.35, 0);

  g.add(recordSprite);
}




  } else if (typeKey === "fire") {
    // Fire brazier: pillar + flame icon
    const pillar = new THREE.Mesh(
      new THREE.CylinderGeometry(0.35, 0.4, 1.4, 12),
      new THREE.MeshStandardMaterial({ color: 0x6b2e2e })
    );
    pillar.position.y = 1.1;
    pillar.castShadow = true;
    g.add(pillar);

    // Try to load fire icon texture; fallback to emissive plane
    ensureTexture('flame', '/icons/flame.png');
    if (textures.flame) {
      const spriteMat = new THREE.SpriteMaterial({ map: textures.flame, transparent: true, depthWrite: false });
      const sprite = new THREE.Sprite(spriteMat);
      sprite.scale.set(2.4, 2.4, 1);
      sprite.position.y = 2.0;
      g.add(sprite);
    } else {
      const plane = new THREE.Mesh(
        new THREE.PlaneGeometry(2.4, 2.4),
        new THREE.MeshStandardMaterial({ color: 0xff7b00, emissive: 0xff3b00, emissiveIntensity: 0.8, side: THREE.DoubleSide, transparent: true })
      );
      plane.position.y = 2.0;
      g.add(plane);
    }
  } else if (typeKey === "trebuchet") {
    // Simple trebuchet: base + arm + counterweight
    const base = new THREE.Mesh(
      new THREE.BoxGeometry(1.8, 0.3, 1.2),
      new THREE.MeshStandardMaterial({ color: 0x6b4e2e, roughness: 0.9 })
    );
    base.position.y = 0.45;
    g.add(base);
    const frameL = new THREE.Mesh(
      new THREE.BoxGeometry(0.12, 1.2, 0.12),
      new THREE.MeshStandardMaterial({ color: 0x7a5a3a })
    );
    frameL.position.set(-0.6, 1.0, 0);
    const frameR = frameL.clone(); frameR.position.x = 0.6;
    g.add(frameL); g.add(frameR);
    const arm = new THREE.Mesh(
      new THREE.BoxGeometry(1.8, 0.12, 0.12),
      new THREE.MeshStandardMaterial({ color: 0x8b6b4b })
    );
    arm.position.set(0, 1.4, 0);
    arm.rotation.z = -Math.PI / 6;
    g.add(arm);
    const counter = new THREE.Mesh(
      new THREE.BoxGeometry(0.3, 0.3, 0.3),
      new THREE.MeshStandardMaterial({ color: 0x4a3b2a, metalness: 0.2 })
    );
    counter.position.set(-0.9, 1.4, 0);
    g.add(counter);
  } else if (typeKey === "superTrebuchet") {
    // Super trebuchet: scaled-up version
    const base = new THREE.Mesh(
      new THREE.BoxGeometry(2.6, 0.45, 1.8),
      new THREE.MeshStandardMaterial({ color: 0x7a5a3a, roughness: 0.9 })
    );
    base.position.y = 0.55;
    g.add(base);
    const frameL = new THREE.Mesh(
      new THREE.BoxGeometry(0.16, 1.8, 0.16),
      new THREE.MeshStandardMaterial({ color: 0x8b6b4b })
    );
    frameL.position.set(-0.9, 1.3, 0);
    const frameR = frameL.clone(); frameR.position.x = 0.9;
    g.add(frameL); g.add(frameR);
    const arm = new THREE.Mesh(
      new THREE.BoxGeometry(2.6, 0.16, 0.16),
      new THREE.MeshStandardMaterial({ color: 0x9c7b5a })
    );
    arm.position.set(0, 1.9, 0);
    arm.rotation.z = -Math.PI / 6;
    g.add(arm);
    const counter = new THREE.Mesh(
      new THREE.BoxGeometry(0.45, 0.45, 0.45),
      new THREE.MeshStandardMaterial({ color: 0x5a4b3a, metalness: 0.2 })
    );
    counter.position.set(-1.3, 1.9, 0);
    g.add(counter);
  }
  return g;
}

function setGroupEmissive(group, color, opacity = 1) {
  group.traverse((obj) => {
    if (obj.isMesh) {
      const mat = obj.material;
      if (mat && mat.color) {
        mat.opacity = opacity;
        mat.transparent = opacity < 1;
        mat.emissive = mat.emissive || new THREE.Color(0x000000);
      }
    }
  });
}

function distanceToPathXZ(pos) {
  let min = Infinity;
  const samples = 150;
  for (let i = 0; i <= samples; i++) {
    const p = pathCurve.getPoint(i / samples);
    const d = Math.hypot(p.x - pos.x, p.z - pos.z);
    if (d < min) min = d;
  }
  return min;
}

function isValidTowerPosition(position, ignoreTower = null) {
  if (Math.abs(position.x) > 80 || Math.abs(position.z) > 80) return false;
  if (distanceToPathXZ(position) > PLACEMENT_MAX_DISTANCE_FROM_PATH) return false;
  for (const t of towers) {
    if (ignoreTower && t === ignoreTower) continue;
    if (position.distanceTo(t.root.position) < MIN_TOWER_SPACING) return false;
  }
  return true;
}

function placeTowerAt(position, typeKey) {
  const catalog = TowerCatalog[typeKey];
  if (gold < catalog.cost) return false;
  if (!isValidTowerPosition(position)) return false;

  gold -= catalog.cost;
  const root = createTowerModel(typeKey);
  root.position.copy(position);
  scene.add(root);
  /** @type {TowerInstance} */
  const instance = { root, type: typeKey, lastFireTime: 0 };
  towers.push(instance);
  // map children for picking
  root.traverse((o) => objectToTower.set(o, instance));
  updateHud();
  return true;
}

function canFire(tower, now) {
  const def = TowerCatalog[tower.type];
  return now - tower.lastFireTime >= def.fireRateSeconds;
}

function targetEnemy(position, range) {
  let best = null;
  let bestT = -1;
  for (const e of enemies) {
    const dist = position.distanceTo(e.mesh.position);
    if (dist <= range) {
      // Prefer the enemy closest to castle (highest pathT)
      if (e.pathT > bestT) {
        best = e;
        bestT = e.pathT;
      }
    }
  }
  return best;
}

function fireProjectile(fromPos, toEnemy, towerType) {
  const def = TowerCatalog[towerType];
  let proj;
  if (towerType === "archer") {
    // Try to use specific arrow-right icon; fallback to flat arrow
    ensureTexture('arrowRight', '/icons/arrow-right.png');
    if (textures.arrowRight) {
      const mat = new THREE.SpriteMaterial({ map: textures.arrowRight, transparent: true, depthWrite: false });
      const sprite = new THREE.Sprite(mat);
      sprite.scale.set(1.5, 1.5, 1);
      proj = sprite;
    } else {
      const arrowGeom = new THREE.PlaneGeometry(0.9, 0.18);
      const arrowMat = new THREE.MeshStandardMaterial({ color: 0xdeb887, metalness: 0.0, roughness: 1, side: THREE.DoubleSide });
      const arrow = new THREE.Mesh(arrowGeom, arrowMat);
      arrow.rotation.y = Math.PI / 2; // face forward
      proj = arrow;
    }
  } else if (towerType === "cannon") {
    // Try to use cannon-ball icon; fallback to mesh sphere
    ensureTexture('cannonBall', '/icons/cannon-ball.png');
    if (textures.cannonBall) {
      const mat = new THREE.SpriteMaterial({ map: textures.cannonBall, transparent: true, depthWrite: false });
      const sprite = new THREE.Sprite(mat);
      sprite.scale.set(1.5, 1.5, 1);
      proj = sprite;
    } else {
      proj = new THREE.Mesh(
        new THREE.SphereGeometry(0.18, 10, 10),
        new THREE.MeshStandardMaterial({ color: 0x1f1f1f, metalness: 0.9, roughness: 0.2 })
      );
    }
  } else if (towerType === "trebuchet") {

    // Load the shirt texture
    const textureLoader = new THREE.TextureLoader();
    const shirtTexture = textureLoader.load('/icons/candle.png');
  
    // Create a flat T-shirt projectile
    proj = new THREE.Mesh(
      new THREE.PlaneGeometry(2, 2), // adjust size if needed
      new THREE.MeshStandardMaterial({
        map: shirtTexture,
        transparent: true,     // lets PNG transparency work
        side: THREE.DoubleSide // visible from both sides
      })
    );
  
    // Slight angle so it’s visible while flying
    proj.rotation.x = -Math.PI / 2;
  }
  
  
  
  else if (towerType === "superTrebuchet") {
    // Larger rock projectile for super trebuchet
      // Load the shirt texture
      const textureLoader = new THREE.TextureLoader();
      const shirtTexture = textureLoader.load('/icons/dollar.png');
    
      // Create a flat T-shirt projectile
      proj = new THREE.Mesh(
        new THREE.PlaneGeometry(2, 2), // adjust size if needed
        new THREE.MeshStandardMaterial({
          map: shirtTexture,
          transparent: true,     // lets PNG transparency work
          side: THREE.DoubleSide // visible from both sides
        })
      );
    
      // Slight angle so it’s visible while flying
      proj.rotation.x = -Math.PI / 2;
  } else {
    // Fire icon projectile if available; fallback to emissive plane
    ensureTexture('flame', '/icons/flame.png');
    if (textures.flame) {
      const mat = new THREE.SpriteMaterial({ map: textures.flame, transparent: true, depthWrite: false });
      const sprite = new THREE.Sprite(mat);
      sprite.scale.set(1.5, 1.5, 1);
      proj = sprite;
    } else {
      const fireGeom = new THREE.PlaneGeometry(1.5, 1.5);
      const fireMat = new THREE.MeshStandardMaterial({ color: 0xff7b00, emissive: 0xff3b00, emissiveIntensity: 0.8, side: THREE.DoubleSide });
      const fire = new THREE.Mesh(fireGeom, fireMat);
      fire.rotation.y = Math.PI / 2;
      proj = fire;
    }
  }
  proj.position.copy(fromPos);
  proj.castShadow = true;
  scene.add(proj);

  const dir = new THREE.Vector3()
    .subVectors(toEnemy.mesh.position, fromPos)
    .normalize();
  const velocity = dir.multiplyScalar(def.projectileSpeed);

  projectiles.push({
    mesh: proj,
    velocity,
    damage: def.damage,
    splashRadius: def.splashRadius ?? 0,
  });
}

function setupUI() {
  towersContainer.innerHTML = "";
  for (const key of Object.keys(TowerCatalog)) {
    const t = TowerCatalog[key];
    const card = document.createElement("div");
    card.className = "towerCard";
    const title = document.createElement("div");
    title.className = "title";
    title.textContent = `${t.display} – Cost $${t.cost}`;
    const btn = document.createElement("button");
    btn.textContent = `Place`;
    btn.onclick = () => {
      if (isWaveActive) return;
      placingType = t.key;
      isPlacing = true;
      // create preview
      if (preview) scene.remove(preview);
      preview = createTowerModel(t.key);
      preview.traverse((o) => {
        if (o.isMesh) {
          o.material = o.material.clone();
          o.material.transparent = true;
          o.material.opacity = 0.6;
        }
      });
      scene.add(preview);
    };
    card.appendChild(title);
    card.appendChild(btn);
    towersContainer.appendChild(card);
  }

  startWaveBtn.onclick = () => startWave();
  restartBtn.onclick = () => restart();
}

const LegacyTHEMES = ["goblin", "troll", "alien", "wolf", "giant", "fish", "giant-goblin", "wizard", "knight", "mega-giant", "dragon", "yeti", "viking", "ninja", "pirate", "robot", "zombie", "vampire", "skeleton", "ghost", "witch", "witch-doctor", "witch-doctor-2", "witch-doctor-3", "witch-doctor-4", "witch-doctor-5", "witch-doctor-6", "witch-doctor-7", "witch-doctor-8", "witch-doctor-9", "witch-doctor-10"];

const THEMES = [

"Tourists",
"Bachelorette Party v1",
"Investors",
"Bad Singer Songwriters",
"California Transplants",
"Bridesmaids",
"Bachelorette Party v2",
"New Yorkers",
"Airbnb Investors",
"Bachelorette Party v3",
"Woo Girls",
"SEC Boys",
"Bachelorette Party v4",
"Tourists with Cowboy Hats",
"Floridians",
"Influencers",
"Tik Tok Dancers",
"Bachelorette Party v5",
"Instagram Models",
"Mega Bachelorette Party" ];

function spawnEnemy() {
  const themeIndex = (wave - 1) % THEMES.length;
  const theme = THEMES[themeIndex];
  currentThemeLabel = theme;
  updateHud();

  const enemyGroup = buildEnemy(theme);
  enemyGroup.castShadow = true;
  enemyGroup.position.copy(PATH_POINTS[0]);
  scene.add(enemyGroup);

  const hp = Math.round(BASE_ENEMY_HP * Math.pow(ENEMY_HP_GROWTH_PER_WAVE, Math.max(0, wave - 1)));
  const healthDisplay = createHealthDisplay(hp);
  healthDisplay.position.y = 3; // Position above enemy
  enemyGroup.add(healthDisplay);

  /** @type {EnemyInstance} */
  const e = {
    mesh: enemyGroup,
    hp,
    // keep speed growth mild and independent of HP
    speed: lerp(3.2, 4.5, Math.random()) * (1.0 + 0.03 * Math.max(0, wave - 1)),
    pathT: 0,
    lastAttackTime: 0,
    theme,
    healthDisplay,
    anim: enemyGroup.userData.anim || { type: 'biped' },
  };
  enemies.push(e);
}

function startWave() {
  if (isWaveActive) return;
  if (wave > TOTAL_WAVES) return;
  isWaveActive = true;
  // lock placement and movement
  isPlacing = false;
  placingType = null;
  if (preview) { scene.remove(preview); preview = null; }
  selectedTower = null;
  isMovingSelected = false;
  const count = Math.max(6, Math.round((6 + wave * 2) * Math.pow(1.2, wave - 1)));
  let spawned = 0;
  const hpPerEnemy = Math.round(BASE_ENEMY_HP * Math.pow(ENEMY_HP_GROWTH_PER_WAVE, Math.max(0, wave - 1)));
  remainingToSpawn = count;
  // Reset per-wave counters
  currentWaveTotalHp = hpPerEnemy * count;
  currentWaveDamageDealt = 0;
  currentWaveEnemiesTotal = count;
  currentWaveEnemiesKilled = 0;
  updateHud();

  startWaveBtn.disabled = true;
  startWaveBtn.textContent = `Wave ${wave} active...`;

  // Spawn first immediately for instant feedback
  spawnEnemy();
  spawned += 1;
  remainingToSpawn -= 1;

  const intervalMs = 900 - Math.min(600, (wave - 1) * 60);
  const spawnInterval = setInterval(() => {
    if (spawned >= count) {
      clearInterval(spawnInterval);
      return;
    }
    spawnEnemy();
    spawned++;
    remainingToSpawn -= 1;
  }, Math.max(200, intervalMs));
}

function restart() {
  // Clear all entities
  for (const t of towers) scene.remove(t.root);
  for (const e of enemies) scene.remove(e.mesh);
  for (const p of projectiles) scene.remove(p.mesh);
  towers = [];
  enemies = [];
  projectiles = [];

  gold = INITIAL_GOLD;
  wave = 1;
  castleHp = CASTLE_MAX_HP;
  isWaveActive = false;
  overlay.classList.add("hidden");
  updateHud();
}

function winGame() {
  overlayTitle.textContent = "Victory! YOU SAVED NASHVILLE <3 ";
  overlayText.textContent = `You defended Nashville through all ${TOTAL_WAVES} waves with ${castleHp} HP left and ${gold} cash.`;
  overlay.classList.remove("hidden");
  startWaveBtn.disabled = true;
}

function gameOver() {
  overlayTitle.textContent = "Game Over!!!";
  overlayText.textContent = `Nashville fell on wave ${wave}. Final cash: ${gold}.`;
  overlay.classList.remove("hidden");
  startWaveBtn.disabled = true;
}

function damageCastle(amount) {
  castleHp = clamp(castleHp - amount, 0, CASTLE_MAX_HP);
  updateHud();
  if (castleHp <= 0) {
    gameOver();
  }
}

function grantGold(amount) {
  gold += amount;
  updateHud();
}

function maybeAdvanceWave() {
  if (!isWaveActive) return;
  if (remainingToSpawn === 0 && enemies.length === 0 && isWaveActive) {
    isWaveActive = false;
    grantGold(20 + wave * 6);
    wave += 1;
    updateHud();
    if (wave > TOTAL_WAVES) {
      winGame();
    } else {
      startWaveBtn.disabled = false;
      startWaveBtn.textContent = "Start Wave";
    }
  }
}

function updateEnemies(dt, now) {
  const castlePos = CASTLE_POS;
  const toRemove = [];
  for (const e of enemies) {
    // Move along curve via pathT, stop when near castle
    const maxT = 1.0;
    const current = pathCurve.getPointAt(clamp(e.pathT, 0, maxT));

    // detailed animations
    const t = now * 4;
    if (e.anim?.type === 'goblin') {
      const stride = Math.sin(t * 1.2);
      const lift = (Math.cos(t * 2.4) * 0.03) + 0.02;
      // bob hip
      if (e.anim.hip) e.anim.hip.position.y = 0.9 + lift;
      // legs with knee bend
      if (e.anim.leftUpperLeg && e.anim.leftLowerLeg) {
        e.anim.leftUpperLeg.rotation.x = stride * 0.6;
        e.anim.leftLowerLeg.rotation.x = Math.max(0, -stride) * 0.8;
      }
      if (e.anim.rightUpperLeg && e.anim.rightLowerLeg) {
        e.anim.rightUpperLeg.rotation.x = -stride * 0.6;
        e.anim.rightLowerLeg.rotation.x = Math.max(0, stride) * 0.8;
      }
      // slight forward lean of chest
      if (e.anim.chest) e.anim.chest.rotation.x = -0.08 + Math.sin(t * 0.8) * 0.02;
      // arm counter-swing and dagger flick
      if (e.anim.leftUpperArm && e.anim.leftLowerArm) {
        e.anim.leftUpperArm.rotation.x = -stride * 0.35;
        e.anim.leftLowerArm.rotation.x = Math.max(0, stride) * 0.25;
      }
      if (e.anim.rightUpperArm && e.anim.rightLowerArm) {
        e.anim.rightUpperArm.rotation.x = stride * 0.35;
        e.anim.rightLowerArm.rotation.x = Math.max(0, -stride) * 0.25;
        if (e.anim.weapon) e.anim.weapon.rotation.z = Math.sin(t * 3.0) * 0.2;
      }
      // ear flops
      if (e.anim.ears) {
        e.anim.ears[0].rotation.z = Math.PI/2.5 + Math.sin(t * 1.8) * 0.1;
        e.anim.ears[1].rotation.z = -Math.PI/2.5 - Math.sin(t * 1.8) * 0.1;
      }
      // head look jitter and face billboard towards camera
      if (e.anim.head) e.anim.head.rotation.y = Math.sin(t * 0.5) * 0.2;
      // jaw chatter
      if (e.anim.jaw) e.anim.jaw.rotation.x = Math.max(0, Math.sin(t * 2.6)) * 0.2;
    } else if (e.anim?.type === 'biped') {
      const swing = Math.sin(t) * 0.35;
      if (e.anim.leftLeg) e.anim.leftLeg.rotation.x = swing;
      if (e.anim.rightLeg) e.anim.rightLeg.rotation.x = -swing;
      if (e.anim.leftArm) e.anim.leftArm.rotation.x = -swing * 0.5;
      if (e.anim.rightArm) e.anim.rightArm.rotation.x = swing * 0.5;
    } else if (e.anim?.type === 'quadruped') {
      const swing = Math.sin(t) * 0.3;
      if (e.anim.legs) {
        e.anim.legs[0].rotation.x = swing;
        e.anim.legs[1].rotation.x = -swing;
        e.anim.legs[2].rotation.x = -swing;
        e.anim.legs[3].rotation.x = swing;
      }
      if (e.anim.tail) e.anim.tail.rotation.y = Math.sin(t * 1.2) * 0.4;
    } else if (e.anim?.type === 'fish') {
      if (e.anim.tail) e.anim.tail.rotation.y = Math.sin(t * 1.8) * 0.7;
      if (e.anim.pectoralFins) {
        for (const f of e.anim.pectoralFins) f.rotation.x = Math.sin(t * 2.2) * 0.5;
      }
    }

    // Keep-out ring around castle: enemies stop outside and attack
    const toCastle = new THREE.Vector3().subVectors(current, castlePos);
    const distToCastle = toCastle.length();
    if (distToCastle <= CASTLE_KEEP_OUT_RADIUS) {
      const clampedPos = new THREE.Vector3()
        .copy(toCastle.normalize())
        .multiplyScalar(CASTLE_KEEP_OUT_RADIUS)
        .add(castlePos);
      e.mesh.position.copy(clampedPos);
      // Attack periodically while outside the wall
      if (now - e.lastAttackTime > 1.0) {
        damageCastle(5);
        e.lastAttackTime = now;
      }
      // Do not advance pathT once at the ring
    } else {
      // Advance along the path until reaching the keep-out ring
      e.mesh.position.copy(current);
      e.pathT = Math.min(maxT, e.pathT + (e.speed * dt) / 120);
    }
  }
  for (const e of toRemove) {
    scene.remove(e.mesh);
    enemies = enemies.filter((x) => x !== e);
  }
}

function updateTowers(dt, now) {
  for (const t of towers) {
    const def = TowerCatalog[t.type];
    const pos = t.root.position;
    const target = targetEnemy(pos, def.range);
    if (target && canFire(t, now)) {
      let muzzle = pos.clone();
      if (t.type === "archer") muzzle = pos.clone().add(new THREE.Vector3(0.2, 1.9, 0));
      else if (t.type === "cannon") muzzle = pos.clone().add(new THREE.Vector3(0.9, 1.1, 0));
      else if (t.type === "fire") muzzle = pos.clone().add(new THREE.Vector3(0, 1.9, 0));
      else if (t.type === "trebuchet") muzzle = pos.clone().add(new THREE.Vector3(0, 1.5, 0));
      else if (t.type === "superTrebuchet") muzzle = pos.clone().add(new THREE.Vector3(0, 2.2, 0));
      fireProjectile(muzzle, target, t.type);
      t.lastFireTime = now;
    }
  }
}

function updateProjectiles(dt) {
  const toRemove = [];
  for (const p of projectiles) {
    p.mesh.position.addScaledVector(p.velocity, dt);
    // Orient arrows along velocity
    if (p.mesh.type === 'Group') {
      const dir = p.velocity.clone().normalize();
      const up = new THREE.Vector3(0, 1, 0);
      const quat = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(1,0,0), dir);
      p.mesh.setRotationFromQuaternion(quat);
    }
    // Check collision with enemies
    let hit = null;
    for (const e of enemies) {
      const d = e.mesh.position.distanceTo(p.mesh.position);
      if (d < 0.8) {
        hit = e;
        break;
      }
    }
    if (hit) {
      const dmgMultiplier = Math.pow(ENEMY_DAMAGE_TAKEN_GROWTH_PER_WAVE, Math.max(0, wave - 1));
      let totalApplied = 0;
      if (p.splashRadius && p.splashRadius > 0) {
        for (const e of enemies) {
          const d = e.mesh.position.distanceTo(p.mesh.position);
          if (d <= p.splashRadius) {
            const ap = p.damage * dmgMultiplier;
            e.hp -= ap;
            updateHealthDisplay(e.healthDisplay, e.hp);
            totalApplied += ap;
          }
        }
      } else {
        const ap = p.damage * dmgMultiplier;
        hit.hp -= ap;
        updateHealthDisplay(hit.healthDisplay, hit.hp);
        totalApplied += ap;
      }
      currentWaveDamageDealt += totalApplied;
      updateHud();
      toRemove.push(p);
      scene.remove(p.mesh);
    }

    // Remove if out of bounds
    const pos = p.mesh.position;
    if (Math.abs(pos.x) > 100 || Math.abs(pos.z) > 100) {
      toRemove.push(p);
      scene.remove(p.mesh);
    }
  }
  projectiles = projectiles.filter((x) => !toRemove.includes(x));
}

function createHealthDisplay(hp) {
  const canvas = document.createElement('canvas');
  canvas.width = 100;
  canvas.height = 50;
  const ctx = canvas.getContext('2d');
  ctx.font = 'bold 32px Arial';
  ctx.fillStyle = 'white';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(Math.ceil(hp).toString(), canvas.width / 2, canvas.height / 2);

  const texture = new THREE.CanvasTexture(canvas);
  const material = new THREE.SpriteMaterial({ map: texture });
  const sprite = new THREE.Sprite(material);
  sprite.scale.set(2, 1, 1);
  return sprite;
}

function updateHealthDisplay(sprite, hp) {
  const canvas = sprite.material.map.image;
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.font = 'bold 32px Arial';
  ctx.fillStyle = 'white';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(Math.ceil(hp).toString(), canvas.width / 2, canvas.height / 2);
  sprite.material.map.needsUpdate = true;
}

function cleanupDeadEnemies() {
  const toRemove = [];
  for (const e of enemies) {
    if (e.hp <= 0) {
      toRemove.push(e);
    }
  }
  for (const e of toRemove) {
    scene.remove(e.mesh);
    if (e.healthDisplay) {
      scene.remove(e.healthDisplay);
    }
    enemies = enemies.filter((x) => x !== e);
    grantGold(5);
    currentWaveEnemiesKilled += 1;
    updateHud();
  }
}

// Enemy modeling and simple stride animations
const gltfLoader = new GLTFLoader();
const gltfCache = new Map();
function loadGLTFOnce(key, url, onReady) {
  if (gltfCache.has(key)) { onReady(gltfCache.get(key).clone(true)); return; }
  gltfLoader.load(url, (gltf) => {
    const scene = gltf.scene || gltf.scenes?.[0];
    if (scene) gltfCache.set(key, scene);
    onReady(scene ? scene.clone(true) : new THREE.Group());
  }, undefined, () => onReady(new THREE.Group()));
}

function hashStringToColor(theme) {
  let h = 0;
  for (let i = 0; i < theme.length; i++) h = (h * 31 + theme.charCodeAt(i)) >>> 0;
  // Create a pleasant, mid-saturation color
  const r = 100 + (h & 0x7f);
  const g = 100 + ((h >> 7) & 0x7f);
  const b = 100 + ((h >> 14) & 0x7f);
  return (r << 16) | (g << 8) | b;
}

function buildHumanoidPlaceholder(theme) {
  const color = hashStringToColor(theme);
  const group = new THREE.Group();
  const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.4, 0.6, 8, 12), new THREE.MeshStandardMaterial({ color, roughness: 0.8 }));
  torso.position.y = 1.1; group.add(torso);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.28, 16, 16), new THREE.MeshStandardMaterial({ color: 0xf2e6d9 }));
  head.position.y = 1.8; group.add(head);
  const armL = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.6, 10), new THREE.MeshStandardMaterial({ color: 0xf2e6d9 }));
  armL.position.set(-0.5, 1.2, 0); group.add(armL);
  const armR = armL.clone(); armR.position.x = 0.5; group.add(armR);
  const legL = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.7, 10), new THREE.MeshStandardMaterial({ color: 0x4a3b2a }));
  legL.position.set(-0.18, 0.45, 0); group.add(legL);
  const legR = legL.clone(); legR.position.x = 0.18; group.add(legR);
  group.userData.anim = { type: 'biped', leftLeg: legL, rightLeg: legR, leftArm: armL, rightArm: armR };
  return group;
}

function buildDynamicNashvilleEnemy(group, theme) {
  // Base humanoid structure
  const baseColor = hashStringToColor(theme);
  const skinColor = 0xf2e6d9;
  
  // Theme-specific configurations
  const themeConfig = {
    'Tourists': { 
      torsoColor: 0x4a90e2, // Blue shirt
      accessory: 'camera',
      hat: null,
      size: 1.0
    },
    'Bachelorette Party v1': { 
      torsoColor: 0xff69b4, // Pink
      accessory: 'phone',
      hat: 'tiara',
      size: 1.0
    },
    'Investors': { 
      torsoColor: 0x2c3e50, // Dark suit
      accessory: 'briefcase',
      hat: null,
      size: 1.1
    },
    'Bad Singer Songwriters': { 
      torsoColor: 0x8b4513, // Brown
      accessory: 'guitar',
      hat: 'cowboy',
      size: 1.0
    },
    'California Transplants': { 
      torsoColor: 0xff6b35, // Orange
      accessory: 'sunglasses',
      hat: null,
      size: 1.0
    },
    'Bridesmaids': { 
      torsoColor: 0xffb6c1, // Light pink
      accessory: 'flowers',
      hat: null,
      size: 1.0
    },
    'Bachelorette Party v2': { 
      torsoColor: 0xff1493, // Deep pink
      accessory: 'phone',
      hat: 'tiara',
      size: 1.0
    },
    'New Yorkers': { 
      torsoColor: 0x1a1a1a, // Black
      accessory: 'coffee',
      hat: null,
      size: 1.0
    },
    'Airbnb Investors': { 
      torsoColor: 0x34495e, // Dark blue-gray
      accessory: 'keys',
      hat: null,
      size: 1.0
    },
    'Bachelorette Party v3': { 
      torsoColor: 0xff69b4, // Pink
      accessory: 'phone',
      hat: 'tiara',
      size: 1.0
    },
    'Woo Girls': { 
      torsoColor: 0xff00ff, // Magenta
      accessory: 'phone',
      hat: null,
      size: 1.0
    },
    'SEC Boys': { 
      torsoColor: 0x0066cc, // Blue
      accessory: 'football',
      hat: 'cap',
      size: 1.1
    },
    'Bachelorette Party v4': { 
      torsoColor: 0xff1493, // Deep pink
      accessory: 'phone',
      hat: 'tiara',
      size: 1.0
    },
    'Tourists with Cowboy Hats': { 
      torsoColor: 0x4a90e2, // Blue
      accessory: 'camera',
      hat: 'cowboy',
      size: 1.0
    },
    'Floridians': { 
      torsoColor: 0xffa500, // Orange
      accessory: 'sunglasses',
      hat: 'cap',
      size: 1.0
    },
    'Influencers': { 
      torsoColor: 0xff69b4, // Pink
      accessory: 'phone',
      hat: null,
      size: 1.0
    },
    'Tik Tok Dancers': { 
      torsoColor: 0xff00ff, // Magenta
      accessory: 'phone',
      hat: null,
      size: 1.0
    },
    'Bachelorette Party v5': { 
      torsoColor: 0xff1493, // Deep pink
      accessory: 'phone',
      hat: 'tiara',
      size: 1.0
    },
    'Instagram Models': { 
      torsoColor: 0xffb6c1, // Light pink
      accessory: 'phone',
      hat: null,
      size: 1.0
    },
    'Mega Bachelorette Party': { 
      torsoColor: 0xff00ff, // Bright magenta
      accessory: 'phone',
      hat: 'tiara',
      size: 1.2
    }
  };
  
  const config = themeConfig[theme] || {
    torsoColor: baseColor,
    accessory: null,
    hat: null,
    size: 1.0
  };
  
  const scale = config.size;
  
  // Torso
  const torso = new THREE.Mesh(
    new THREE.CapsuleGeometry(0.4 * scale, 0.6 * scale, 8, 12),
    new THREE.MeshStandardMaterial({ color: config.torsoColor, roughness: 0.8 })
  );
  torso.position.y = 1.1 * scale;
  torso.castShadow = true;
  group.add(torso);
  
  // Head
  const head = new THREE.Mesh(
    new THREE.SphereGeometry(0.28 * scale, 16, 16),
    new THREE.MeshStandardMaterial({ color: skinColor })
  );
  head.position.y = 1.8 * scale;
  head.castShadow = true;
  group.add(head);
  
  // Arms
  const armL = new THREE.Mesh(
    new THREE.CylinderGeometry(0.08 * scale, 0.08 * scale, 0.6 * scale, 10),
    new THREE.MeshStandardMaterial({ color: skinColor })
  );
  armL.position.set(-0.5 * scale, 1.2 * scale, 0);
  armL.castShadow = true;
  group.add(armL);
  
  const armR = armL.clone();
  armR.position.x = 0.5 * scale;
  group.add(armR);
  
  // Legs
  const legL = new THREE.Mesh(
    new THREE.CylinderGeometry(0.1 * scale, 0.1 * scale, 0.7 * scale, 10),
    new THREE.MeshStandardMaterial({ color: 0x4a3b2a })
  );
  legL.position.set(-0.18 * scale, 0.45 * scale, 0);
  legL.castShadow = true;
  group.add(legL);
  
  const legR = legL.clone();
  legR.position.x = 0.18 * scale;
  group.add(legR);
  
  // Add hat
  if (config.hat === 'cowboy') {
    const hat = new THREE.Mesh(
      new THREE.CylinderGeometry(0.35 * scale, 0.4 * scale, 0.15 * scale, 16),
      new THREE.MeshStandardMaterial({ color: 0x8b4513 })
    );
    hat.position.y = 2.0 * scale;
    hat.castShadow = true;
    group.add(hat);
    
    const brim = new THREE.Mesh(
      new THREE.TorusGeometry(0.4 * scale, 0.05 * scale, 8, 16),
      new THREE.MeshStandardMaterial({ color: 0x8b4513 })
    );
    brim.rotation.x = Math.PI / 2;
    brim.position.y = 1.92 * scale;
    brim.castShadow = true;
    group.add(brim);
  } else if (config.hat === 'tiara') {
    const tiara = new THREE.Mesh(
      new THREE.TorusGeometry(0.3 * scale, 0.03 * scale, 8, 16),
      new THREE.MeshStandardMaterial({ color: 0xffd700, metalness: 0.8, roughness: 0.2 })
    );
    tiara.rotation.x = Math.PI / 2;
    tiara.position.y = 1.95 * scale;
    tiara.castShadow = true;
    group.add(tiara);
  } else if (config.hat === 'cap') {
    const cap = new THREE.Mesh(
      new THREE.SphereGeometry(0.3 * scale, 16, 16, 0, Math.PI * 2, 0, Math.PI / 2),
      new THREE.MeshStandardMaterial({ color: 0x0066cc })
    );
    cap.position.y = 1.9 * scale;
    cap.castShadow = true;
    group.add(cap);
  }
  
  // Add accessories
  if (config.accessory === 'camera') {
    const camera = new THREE.Mesh(
      new THREE.BoxGeometry(0.15 * scale, 0.1 * scale, 0.2 * scale),
      new THREE.MeshStandardMaterial({ color: 0x333333 })
    );
    camera.position.set(0.55 * scale, 1.3 * scale, 0.1 * scale);
    camera.castShadow = true;
    group.add(camera);
  } else if (config.accessory === 'phone') {
    const phone = new THREE.Mesh(
      new THREE.BoxGeometry(0.08 * scale, 0.15 * scale, 0.02 * scale),
      new THREE.MeshStandardMaterial({ color: 0x1a1a1a })
    );
    phone.position.set(0.55 * scale, 1.2 * scale, 0.05 * scale);
    phone.castShadow = true;
    group.add(phone);
  } else if (config.accessory === 'briefcase') {
    const briefcase = new THREE.Mesh(
      new THREE.BoxGeometry(0.2 * scale, 0.15 * scale, 0.1 * scale),
      new THREE.MeshStandardMaterial({ color: 0x2c3e50 })
    );
    briefcase.position.set(0.55 * scale, 1.0 * scale, 0);
    briefcase.castShadow = true;
    group.add(briefcase);
  } else if (config.accessory === 'guitar') {
    const guitar = new THREE.Mesh(
      new THREE.BoxGeometry(0.3 * scale, 0.15 * scale, 0.05 * scale),
      new THREE.MeshStandardMaterial({ color: 0x8b4513 })
    );
    guitar.position.set(0.6 * scale, 1.1 * scale, 0);
    guitar.rotation.z = -Math.PI / 6;
    guitar.castShadow = true;
    group.add(guitar);
  } else if (config.accessory === 'sunglasses') {
    const glasses = new THREE.Mesh(
      new THREE.BoxGeometry(0.2 * scale, 0.05 * scale, 0.15 * scale),
      new THREE.MeshStandardMaterial({ color: 0x1a1a1a })
    );
    glasses.position.set(0, 1.75 * scale, 0.25 * scale);
    glasses.castShadow = true;
    group.add(glasses);
  } else if (config.accessory === 'flowers') {
    const flowers = new THREE.Mesh(
      new THREE.SphereGeometry(0.1 * scale, 8, 8),
      new THREE.MeshStandardMaterial({ color: 0xff69b4 })
    );
    flowers.position.set(0.5 * scale, 1.3 * scale, 0);
    flowers.castShadow = true;
    group.add(flowers);
  } else if (config.accessory === 'coffee') {
    const coffee = new THREE.Mesh(
      new THREE.CylinderGeometry(0.05 * scale, 0.05 * scale, 0.15 * scale, 8),
      new THREE.MeshStandardMaterial({ color: 0x8b4513 })
    );
    coffee.position.set(0.55 * scale, 1.3 * scale, 0);
    coffee.castShadow = true;
    group.add(coffee);
  } else if (config.accessory === 'keys') {
    const keys = new THREE.Mesh(
      new THREE.BoxGeometry(0.1 * scale, 0.15 * scale, 0.02 * scale),
      new THREE.MeshStandardMaterial({ color: 0xffd700 })
    );
    keys.position.set(0.55 * scale, 1.2 * scale, 0.05 * scale);
    keys.castShadow = true;
    group.add(keys);
  } else if (config.accessory === 'football') {
    const football = new THREE.Mesh(
      new THREE.SphereGeometry(0.12 * scale, 12, 12),
      new THREE.MeshStandardMaterial({ color: 0x8b4513 })
    );
    football.position.set(0.6 * scale, 1.1 * scale, 0);
    football.castShadow = true;
    group.add(football);
  }
  
  // Animation data
  group.userData.anim = {
    type: 'biped',
    leftLeg: legL,
    rightLeg: legR,
    leftArm: armL,
    rightArm: armR
  };
}

function buildEnemy(theme) {
  const g = new THREE.Group();
  g.userData.anim = { type: 'biped' };

  if (theme === 'goblin') {
    const skin = 0x4faa4f;
    const tunic = 0x3a5a3a;

    // Hip root for walking bob
    const hip = new THREE.Group();
    hip.position.y = 0.9;
    g.add(hip);

    // Chest on hip with slight forward lean
    const chest = new THREE.Group();
    chest.position.y = 0.55;
    hip.add(chest);
    const torso = new THREE.Mesh(
      new THREE.CapsuleGeometry(0.35, 0.5, 8, 10),
      new THREE.MeshStandardMaterial({ color: tunic })
    );
    torso.castShadow = true;
    chest.add(torso);

    // Head group and ears
    const headGroup = new THREE.Group();
    headGroup.position.y = 0.6;
    chest.add(headGroup);
    const head = new THREE.Mesh(
      new THREE.SphereGeometry(0.28, 16, 16),
      new THREE.MeshStandardMaterial({ color: skin })
    );
    head.castShadow = true;
    headGroup.add(head);

    const earL = new THREE.Mesh(
      new THREE.ConeGeometry(0.08, 0.18, 8),
      new THREE.MeshStandardMaterial({ color: skin })
    );
    earL.position.set(-0.22, 0.05, 0);
    earL.rotation.z = Math.PI / 2.5;
    headGroup.add(earL);
    const earR = earL.clone();
    earR.position.x = 0.22;
    earR.rotation.z = -Math.PI / 2.5;
    headGroup.add(earR);

    // Jaw
    const jaw = new THREE.Mesh(
      new THREE.BoxGeometry(0.28, 0.1, 0.22),
      new THREE.MeshStandardMaterial({ color: skin })
    );
    jaw.position.set(0, -0.2, 0.1);
    headGroup.add(jaw);

    // Arms (upper + lower) with pivots at shoulders and elbows
    const shoulderY = 0.25;
    const upperLen = 0.35;
    const lowerLen = 0.32;

    function makeArm(sign) {
      const upper = new THREE.Group();
      upper.position.set(sign * 0.38, shoulderY, 0);
      chest.add(upper);
      const upperMesh = new THREE.Mesh(
        new THREE.CylinderGeometry(0.07, 0.08, upperLen, 8),
        new THREE.MeshStandardMaterial({ color: skin })
      );
      upperMesh.position.y = -upperLen / 2;
      upper.add(upperMesh);

      const lower = new THREE.Group();
      lower.position.set(0, -upperLen, 0);
      upper.add(lower);
      const lowerMesh = new THREE.Mesh(
        new THREE.CylinderGeometry(0.065, 0.065, lowerLen, 8),
        new THREE.MeshStandardMaterial({ color: skin })
      );
      lowerMesh.position.y = -lowerLen / 2;
      lower.add(lowerMesh);

      return { upper, lower };
    }
    const leftArm = makeArm(-1);
    const rightArm = makeArm(1);

    // Simple dagger weapon in right hand
    const dagger = new THREE.Group();
    const hilt = new THREE.Mesh(
      new THREE.CylinderGeometry(0.03, 0.03, 0.12, 6),
      new THREE.MeshStandardMaterial({ color: 0x3b2b1a })
    );
    hilt.position.y = -0.05;
    dagger.add(hilt);
    const blade = new THREE.Mesh(
      new THREE.ConeGeometry(0.06, 0.35, 8),
      new THREE.MeshStandardMaterial({ color: 0xb8c0c2, metalness: 0.7, roughness: 0.3 })
    );
    blade.position.y = -0.28;
    dagger.add(blade);
    rightArm.lower.add(dagger);
    dagger.position.set(0, -lowerLen, 0);

    // Legs (upper + lower) with pivots at hips and knees
    const thighLen = 0.38;
    const shinLen = 0.38;
    function makeLeg(sign) {
      const upper = new THREE.Group();
      upper.position.set(sign * 0.18, 0, 0);
      hip.add(upper);
      const upperMesh = new THREE.Mesh(
        new THREE.CylinderGeometry(0.1, 0.11, thighLen, 8),
        new THREE.MeshStandardMaterial({ color: 0x4a3b2a })
      );
      upperMesh.position.y = -thighLen / 2;
      upper.add(upperMesh);

      const lower = new THREE.Group();
      lower.position.set(0, -thighLen, 0);
      upper.add(lower);
      const lowerMesh = new THREE.Mesh(
        new THREE.CylinderGeometry(0.09, 0.09, shinLen, 8),
        new THREE.MeshStandardMaterial({ color: 0x4a3b2a })
      );
      lowerMesh.position.y = -shinLen / 2;
      lower.add(lowerMesh);

      return { upper, lower };
    }
    const leftLeg = makeLeg(-1);
    const rightLeg = makeLeg(1);

    g.userData.anim = {
      type: 'goblin', hip, chest, head: headGroup, jaw,
      leftUpperLeg: leftLeg.upper, leftLowerLeg: leftLeg.lower,
      rightUpperLeg: rightLeg.upper, rightLowerLeg: rightLeg.lower,
      leftUpperArm: leftArm.upper, leftLowerArm: leftArm.lower,
      rightUpperArm: rightArm.upper, rightLowerArm: rightArm.lower,
      ears: [earL, earR], weapon: dagger,
      facePlane: headGroup.userData.facePlane || null
    };

  } else if (theme === 'troll') {
    const skin = 0x7e9a7e;
    const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.6, 0.9, 8, 12), new THREE.MeshStandardMaterial({ color: 0x6b856b }));
    torso.position.y = 1.2; g.add(torso);
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.55, 0.55), new THREE.MeshStandardMaterial({ color: skin }));
    head.position.y = 1.9; g.add(head);
    const nose = new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.3, 8), new THREE.MeshStandardMaterial({ color: 0x5e7a5e }));
    nose.rotation.x = Math.PI / 2; nose.position.set(0, 1.8, 0.33); g.add(nose);
    const tuskL = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.18, 8), new THREE.MeshStandardMaterial({ color: 0xeaeaea })); tuskL.rotation.x = Math.PI/2; tuskL.position.set(-0.12, 1.7, 0.32); g.add(tuskL);
    const tuskR = tuskL.clone(); tuskR.position.x = 0.12; g.add(tuskR);
    const armL = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 0.7, 8), new THREE.MeshStandardMaterial({ color: skin })); armL.position.set(-0.55, 1.2, 0); g.add(armL);
    const armR = armL.clone(); armR.position.x = 0.55; g.add(armR);
    const club = new THREE.Group();
    const clubStick = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.08, 0.8, 8), new THREE.MeshStandardMaterial({ color: 0x5a3b1f })); clubStick.position.y = -0.3; club.add(clubStick);
    const clubHead = new THREE.Mesh(new THREE.SphereGeometry(0.22, 12, 12), new THREE.MeshStandardMaterial({ color: 0x3f2a15 })); clubHead.position.y = -0.7; club.add(clubHead);
    club.position.set(0.65, 1.0, 0); g.add(club);
    const legL = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 0.9, 8), new THREE.MeshStandardMaterial({ color: 0x5a6d5a })); legL.position.set(-0.22, 0.45, 0); g.add(legL);
    const legR = legL.clone(); legR.position.x = 0.22; g.add(legR);
    g.userData.anim = { type: 'troll', arms: [armL, armR], legs: [legL, legR], club };
  } else if (theme === 'alien') {
    const coreMat = new THREE.MeshStandardMaterial({ color: 0x6f5aff, emissive: 0x3a1cff, emissiveIntensity: 0.5, roughness: 0.4, metalness: 0.2 });
    const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.35, 0.5, 8, 12), coreMat);
    torso.position.y = 1.0; g.add(torso);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.45, 18, 18), new THREE.MeshStandardMaterial({ color: 0x9ea0ff, roughness: 0.6 }));
    head.position.y = 1.7; g.add(head);
    const eyeMat = new THREE.MeshStandardMaterial({ color: 0x111111 });
    const eyeL = new THREE.Mesh(new THREE.SphereGeometry(0.11, 12, 12), eyeMat); eyeL.scale.set(0.5, 1.0, 1.6);
    eyeL.position.set(-0.15, 1.75, 0.38); g.add(eyeL);
    const eyeR = eyeL.clone(); eyeR.position.x = 0.15; g.add(eyeR);
    const antBaseL = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.35, 8), new THREE.MeshStandardMaterial({ color: 0x9ea0ff }));
    antBaseL.position.set(-0.15, 2.0, 0.05); g.add(antBaseL);
    const antTipL = new THREE.Mesh(new THREE.SphereGeometry(0.06, 10, 10), coreMat); antTipL.position.set(-0.15, 2.2, 0.05); g.add(antTipL);
    const antBaseR = antBaseL.clone(); antBaseR.position.x = 0.15; g.add(antBaseR);
    const antTipR = antTipL.clone(); antTipR.position.x = 0.15; g.add(antTipR);
    const limbMat = new THREE.MeshStandardMaterial({ color: 0x9ea0ff });
    const armL = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.5, 8), limbMat); armL.position.set(-0.35, 1.2, 0); g.add(armL);
    const armR = armL.clone(); armR.position.x = 0.35; g.add(armR);
    const legL = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.5, 8), limbMat); legL.position.set(-0.12, 0.65, 0); g.add(legL);
    const legR = legL.clone(); legR.position.x = 0.12; g.add(legR);
    const orb = new THREE.Mesh(new THREE.SphereGeometry(0.12, 12, 12), new THREE.MeshStandardMaterial({ color: 0x89e1ff, emissive: 0x44e0ff, emissiveIntensity: 0.8 }));
    orb.position.set(0, 1.2, 0.25); g.add(orb);
    g.userData.anim = { type: 'alien', head, arms: [armL, armR], legs: [legL, legR], antennae: [antBaseL, antBaseR, antTipL, antTipR] };
  } else if (theme === 'wolf') {
    const fur = 0x8a8a8a;
    const torso = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.5, 0.5), new THREE.MeshStandardMaterial({ color: fur, roughness: 0.95 }));
    torso.position.y = 0.5; g.add(torso);
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.45, 0.45), new THREE.MeshStandardMaterial({ color: 0x9a9a9a }));
    head.position.set(0.8, 0.6, 0); g.add(head);
    const snout = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.2, 0.3), new THREE.MeshStandardMaterial({ color: 0xaaaaaa })); snout.position.set(1.0, 0.55, 0); g.add(snout);
    const jaw = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.12, 0.28), new THREE.MeshStandardMaterial({ color: 0x8a8a8a })); jaw.position.set(1.0, 0.45, 0); g.add(jaw);
    const earL = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.2, 6), new THREE.MeshStandardMaterial({ color: 0xbababa }));
    earL.position.set(0.95, 0.85, 0.15); g.add(earL);
    const earR = earL.clone(); earR.position.z = -0.15; g.add(earR);
    const legGeom = new THREE.CylinderGeometry(0.09, 0.09, 0.5, 8);
    const legMat = new THREE.MeshStandardMaterial({ color: 0x6f6f6f });
    const legs = [
      new THREE.Mesh(legGeom, legMat), new THREE.Mesh(legGeom, legMat),
      new THREE.Mesh(legGeom, legMat), new THREE.Mesh(legGeom, legMat)
    ];
    legs[0].position.set(0.4, 0.25, 0.18);
    legs[1].position.set(0.4, 0.25, -0.18);
    legs[2].position.set(-0.4, 0.25, 0.18);
    legs[3].position.set(-0.4, 0.25, -0.18);
    legs.forEach(l => g.add(l));
    const tail = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.5, 6), new THREE.MeshStandardMaterial({ color: 0x9a9a9a }));
    tail.position.set(-0.8, 0.7, 0); tail.rotation.z = -Math.PI/4; g.add(tail);
    g.userData.anim = { type: 'wolf', legs, tail, jaw };
  } else if (theme === 'giant') {
    const skin = 0xd2a679;
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.6, 0.6), new THREE.MeshStandardMaterial({ color: skin }));
    head.position.y = 2.0; g.add(head);
    const body = new THREE.Mesh(new THREE.BoxGeometry(1.2, 1.6, 0.8), new THREE.MeshStandardMaterial({ color: 0x7a563a }));
    body.position.y = 1.2; g.add(body);
    const shoulderL = new THREE.Mesh(new THREE.SphereGeometry(0.22, 12, 12), new THREE.MeshStandardMaterial({ color: skin })); shoulderL.position.set(-0.6, 1.8, 0); g.add(shoulderL);
    const shoulderR = shoulderL.clone(); shoulderR.position.x = 0.6; g.add(shoulderR);
    const armL = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 0.9, 10), new THREE.MeshStandardMaterial({ color: skin })); armL.position.set(-0.6, 1.25, 0); g.add(armL);
    const armR = armL.clone(); armR.position.x = 0.6; g.add(armR);
    const fistL = new THREE.Mesh(new THREE.SphereGeometry(0.18, 12, 12), new THREE.MeshStandardMaterial({ color: skin })); fistL.position.set(-0.6, 0.8, 0.2); g.add(fistL);
    const fistR = fistL.clone(); fistR.position.x = 0.6; g.add(fistR);
    const legL = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.18, 1.0, 10), new THREE.MeshStandardMaterial({ color: 0x6b4e33 }));
    legL.position.set(-0.3, 0.5, 0); g.add(legL);
    const legR = legL.clone(); legR.position.x = 0.3; g.add(legR);
    const belt = new THREE.Mesh(new THREE.TorusGeometry(0.6, 0.06, 8, 16), new THREE.MeshStandardMaterial({ color: 0x4a351f })); belt.rotation.x = Math.PI/2; belt.position.y = 1.1; g.add(belt);
    g.userData.anim = { type: 'giant', legs: [legL, legR], arms: [armL, armR], fists: [fistL, fistR] };
  } else if (theme === 'fish') {
    const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.6, 0.8, 8, 12), new THREE.MeshStandardMaterial({ color: 0x58a6ff, emissive: 0x2b6edc, emissiveIntensity: 0.4 }));
    body.rotation.z = Math.PI / 2; body.position.y = 0.8; g.add(body);
    const tail = new THREE.Mesh(new THREE.ConeGeometry(0.2, 0.4, 8), new THREE.MeshStandardMaterial({ color: 0x2b6edc }));
    tail.position.set(-0.7, 0.9, 0); g.add(tail);
    const finTop = new THREE.Mesh(new THREE.ConeGeometry(0.15, 0.3, 8), new THREE.MeshStandardMaterial({ color: 0x7fb3ff }));
    finTop.position.set(0, 1.1, 0); g.add(finTop);
    const finL = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.2, 8), new THREE.MeshStandardMaterial({ color: 0x7fb3ff }));
    finL.position.set(0.1, 0.8, 0.25); finL.rotation.z = Math.PI/2; g.add(finL);
    const finR = finL.clone(); finR.position.z = -0.25; g.add(finR);
    g.userData.anim = { type: 'fish', pectoralFins: [finL, finR], tail };
  } else {
    // Dynamic enemy generation based on Nashville themes
    buildDynamicNashvilleEnemy(g, theme);
  }

  return g;
}


// Render loop
let lastTime = performance.now() / 1000;
function tick() {
  const now = performance.now() / 1000;
  const dt = Math.min(0.05, now - lastTime);
  lastTime = now;

  controls.update();

  updateEnemies(dt, now);
  updateTowers(dt, now);
  updateProjectiles(dt);
  cleanupDeadEnemies();
  maybeAdvanceWave();

  // Flag ripple
  castle.traverse((o) => {
    if (o.isMesh && o.userData.ripple && o.geometry && o.geometry.attributes && o.geometry.attributes.position) {
      const pos = o.geometry.attributes.position;
      for (let i = 0; i < pos.count; i++) {
        const x = pos.getX(i);
        const y = pos.getY(i);
        const z = pos.getZ(i);
        const wave = Math.sin(now * 3 + x * 1.5) * 0.05 * (x / 2.5);
        pos.setZ(i, z + wave);
      }
      pos.needsUpdate = true;
    }
  });

  renderer.render(scene, camera);
  requestAnimationFrame(tick);
}

// Resize
window.addEventListener("resize", () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// Mouse interaction for placement and moving towers
function getGroundIntersection(clientX, clientY) {
  const rect = renderer.domElement.getBoundingClientRect();
  mouseNdc.x = ((clientX - rect.left) / rect.width) * 2 - 1;
  mouseNdc.y = -((clientY - rect.top) / rect.height) * 2 + 1;
  raycaster.setFromCamera(mouseNdc, camera);
  const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  const point = new THREE.Vector3();
  raycaster.ray.intersectPlane(plane, point);
  return point;
}

window.addEventListener("mousemove", (e) => {
  if (isPlacing && preview) {
    const p = getGroundIntersection(e.clientX, e.clientY);
    if (!p) return;
    p.y = 0;
    preview.position.copy(p);
    const ok = isValidTowerPosition(p);
    // tint preview green/red
    preview.traverse((o) => {
      if (o.isMesh) {
        o.material.color.set(ok ? 0x6ee787 : 0xff6b6b);
      }
    });
  }
  if (isMovingSelected && selectedTower) {
    const p = getGroundIntersection(e.clientX, e.clientY);
    if (!p) return;
    p.y = 0;
    selectedTower.root.position.copy(p);
  }
});

window.addEventListener("click", (e) => {
  if (isWaveActive) return;
  const point = getGroundIntersection(e.clientX, e.clientY);
  if (!point) return;
  point.y = 0;

  if (isPlacing && placingType && preview) {
    if (placeTowerAt(point, placingType)) {
      // finish placement
      scene.remove(preview);
      preview = null;
      isPlacing = false;
      placingType = null;
    }
    return;
  }

  // Select tower to move
  mouseNdc.x = ((e.clientX - renderer.domElement.getBoundingClientRect().left) / renderer.domElement.clientWidth) * 2 - 1;
  mouseNdc.y = -((e.clientY - renderer.domElement.getBoundingClientRect().top) / renderer.domElement.clientHeight) * 2 + 1;
  raycaster.setFromCamera(mouseNdc, camera);
  const intersects = raycaster.intersectObjects(towers.map(t => t.root), true);
  if (intersects.length > 0) {
    const hit = intersects[0].object;
    const tower = objectToTower.get(hit) || towers.find(t => t.root === hit || t.root.children.includes(hit));
    if (tower) {
      selectedTower = tower;
      isMovingSelected = true;
    }
  } else if (selectedTower) {
    // Drop tower if valid
    if (isValidTowerPosition(selectedTower.root.position, selectedTower)) {
      isMovingSelected = false;
      selectedTower = null;
    }
  }
});

window.addEventListener("keydown", (e) => {
  if (e.key === "Escape") {
    if (isPlacing && preview) {
      scene.remove(preview);
      preview = null;
      isPlacing = false;
      placingType = null;
    }
    if (isMovingSelected) {
      isMovingSelected = false;
      selectedTower = null;
    }
  }
});

setupUI();
updateHud();
tick();

