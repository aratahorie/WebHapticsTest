import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { WebHaptics } from 'web-haptics';

// ============================================
// Platform detection
// ============================================
const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const hasVibrate = typeof navigator.vibrate === 'function';

// ============================================
// Web Audio — collision impact sounds
// ============================================
// Works on ALL platforms after first user touch unlocks AudioContext.
// Provides audio feedback for collisions regardless of user gesture context.
let audioCtx = null;

function unlockAudio() {
    if (audioCtx) return;
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    // iOS requires resume inside user gesture
    if (audioCtx.state === 'suspended') {
        audioCtx.resume();
    }
}

// Synthesize a short percussive impact sound
function playImpactSound(normalizedForce) {
    if (!audioCtx || audioCtx.state !== 'running') return;

    const now = audioCtx.currentTime;

    // Noise burst for impact texture
    const duration = 0.03 + normalizedForce * 0.04; // 30-70ms
    const bufferSize = Math.ceil(audioCtx.sampleRate * duration);
    const noiseBuffer = audioCtx.createBuffer(1, bufferSize, audioCtx.sampleRate);
    const data = noiseBuffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
        // Exponential decay noise
        data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (bufferSize * 0.2));
    }

    const noiseSource = audioCtx.createBufferSource();
    noiseSource.buffer = noiseBuffer;

    // Low-pass filter for a "thud" character
    const filter = audioCtx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 300 + normalizedForce * 800; // 300-1100 Hz
    filter.Q.value = 1.5;

    // Gain with impact force
    const gain = audioCtx.createGain();
    gain.gain.setValueAtTime(0.15 + normalizedForce * 0.35, now); // 0.15-0.5
    gain.gain.exponentialRampToValueAtTime(0.001, now + duration);

    // Sub-bass oscillator for heavy impacts
    let osc = null;
    if (normalizedForce > 0.3) {
        osc = audioCtx.createOscillator();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(60 + normalizedForce * 40, now); // 60-100 Hz
        osc.frequency.exponentialRampToValueAtTime(30, now + duration);

        const oscGain = audioCtx.createGain();
        oscGain.gain.setValueAtTime(normalizedForce * 0.3, now);
        oscGain.gain.exponentialRampToValueAtTime(0.001, now + duration);

        osc.connect(oscGain);
        oscGain.connect(audioCtx.destination);
        osc.start(now);
        osc.stop(now + duration);
    }

    noiseSource.connect(filter);
    filter.connect(gain);
    gain.connect(audioCtx.destination);

    noiseSource.start(now);
    noiseSource.stop(now + duration);
}

// ============================================
// Haptics (via web-haptics — for user-gesture-driven events only)
// ============================================
const haptics = new WebHaptics({ debug: false });

// ============================================
// Collision feedback — combines audio + vibration
// ============================================
let lastCollisionTime = 0;
const COLLISION_COOLDOWN = 80; // ms

function onCollision(normalizedForce) {
    if (normalizedForce < 0.05) return;

    const now = performance.now();
    if (now - lastCollisionTime < COLLISION_COOLDOWN) return;
    lastCollisionTime = now;

    // Audio feedback (works on all platforms from any context after unlock)
    playImpactSound(normalizedForce);

    // Vibration API (Android — works from rAF after initial user gesture)
    if (hasVibrate) {
        if (normalizedForce > 0.7) {
            navigator.vibrate([30, 20, 30]);
        } else if (normalizedForce > 0.35) {
            navigator.vibrate([20]);
        } else {
            navigator.vibrate([12]);
        }
    }
}

// ============================================
// UI Elements
// ============================================
const collisionFlash = document.getElementById('collision-flash');
const impactBar = document.getElementById('impact-bar');
const btnDrop = document.getElementById('btn-drop');
const btnReset = document.getElementById('btn-reset');
let flashTimeout = null;
let impactDecayRaf = null;
let currentImpact = 0;

function showImpact(normalizedForce) {
    currentImpact = Math.max(currentImpact, normalizedForce);
    const pct = Math.min(currentImpact * 100, 100);
    impactBar.style.height = pct + '%';
    impactBar.classList.toggle('strong', normalizedForce > 0.5);

    if (normalizedForce > 0.2) {
        collisionFlash.classList.add('active');
        clearTimeout(flashTimeout);
        flashTimeout = setTimeout(() => {
            collisionFlash.classList.remove('active');
        }, 120);
    }

    cancelAnimationFrame(impactDecayRaf);
    decayImpact();
}

function decayImpact() {
    impactDecayRaf = requestAnimationFrame(() => {
        currentImpact *= 0.92;
        if (currentImpact < 0.01) currentImpact = 0;
        impactBar.style.height = (currentImpact * 100) + '%';
        if (currentImpact > 0) decayImpact();
    });
}

// ============================================
// Three.js Setup
// ============================================
const canvas = document.getElementById('webgl-canvas');
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0a0a1a);
scene.fog = new THREE.FogExp2(0x0a0a1a, 0.025);

const camera = new THREE.PerspectiveCamera(55, window.innerWidth / window.innerHeight, 0.1, 100);
camera.position.set(0, 6, 12);

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

const controls = new OrbitControls(camera, canvas);
controls.enableDamping = true;
controls.dampingFactor = 0.08;
controls.minDistance = 5;
controls.maxDistance = 25;
controls.maxPolarAngle = Math.PI / 2 - 0.05;
controls.target.set(0, 1, 0);

// ============================================
// Lighting
// ============================================
const ambientLight = new THREE.AmbientLight(0x404060, 0.5);
scene.add(ambientLight);

const dirLight = new THREE.DirectionalLight(0xffffff, 1.5);
dirLight.position.set(8, 12, 6);
dirLight.castShadow = true;
dirLight.shadow.mapSize.set(1024, 1024);
dirLight.shadow.camera.left = -10;
dirLight.shadow.camera.right = 10;
dirLight.shadow.camera.top = 10;
dirLight.shadow.camera.bottom = -10;
dirLight.shadow.camera.near = 0.1;
dirLight.shadow.camera.far = 30;
dirLight.shadow.bias = -0.002;
scene.add(dirLight);

const rimLight = new THREE.PointLight(0x6366f1, 1.5, 25);
rimLight.position.set(-6, 5, -4);
scene.add(rimLight);

const warmLight = new THREE.PointLight(0xf97316, 1, 20);
warmLight.position.set(5, 3, 4);
scene.add(warmLight);

// ============================================
// Cannon.js Physics World
// ============================================
const world = new CANNON.World({
    gravity: new CANNON.Vec3(0, -9.82, 0),
});
world.broadphase = new CANNON.NaiveBroadphase();
world.solver.iterations = 10;
world.defaultContactMaterial.restitution = 0.45;
world.defaultContactMaterial.friction = 0.4;

// ============================================
// Arena — Floor + Walls
// ============================================
const ARENA_SIZE = 6;
const WALL_HEIGHT = 3;
const WALL_THICKNESS = 0.15;

const floorMat3D = new THREE.MeshStandardMaterial({
    color: 0x14142e, roughness: 0.8, metalness: 0.2,
});
const floorMesh = new THREE.Mesh(new THREE.BoxGeometry(ARENA_SIZE * 2, 0.2, ARENA_SIZE * 2), floorMat3D);
floorMesh.position.y = -0.1;
floorMesh.receiveShadow = true;
scene.add(floorMesh);

const floorBody = new CANNON.Body({
    mass: 0,
    shape: new CANNON.Box(new CANNON.Vec3(ARENA_SIZE, 0.1, ARENA_SIZE)),
    position: new CANNON.Vec3(0, -0.1, 0),
});
world.addBody(floorBody);

const grid = new THREE.GridHelper(ARENA_SIZE * 2, 20, 0x2a2a4a, 0x1a1a3a);
grid.position.y = 0.01;
scene.add(grid);

const wallMat3D = new THREE.MeshStandardMaterial({
    color: 0x1e1e3e, roughness: 0.6, metalness: 0.3, transparent: true, opacity: 0.35,
});

function createWall(px, py, pz, sx, sy, sz) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(sx * 2, sy * 2, sz * 2), wallMat3D);
    mesh.position.set(px, py, pz);
    mesh.receiveShadow = true;
    scene.add(mesh);
    const body = new CANNON.Body({
        mass: 0,
        shape: new CANNON.Box(new CANNON.Vec3(sx, sy, sz)),
        position: new CANNON.Vec3(px, py, pz),
    });
    world.addBody(body);
}

createWall(0, WALL_HEIGHT / 2, -ARENA_SIZE, ARENA_SIZE, WALL_HEIGHT / 2, WALL_THICKNESS);
createWall(0, WALL_HEIGHT / 2, ARENA_SIZE, ARENA_SIZE, WALL_HEIGHT / 2, WALL_THICKNESS);
createWall(-ARENA_SIZE, WALL_HEIGHT / 2, 0, WALL_THICKNESS, WALL_HEIGHT / 2, ARENA_SIZE);
createWall(ARENA_SIZE, WALL_HEIGHT / 2, 0, WALL_THICKNESS, WALL_HEIGHT / 2, ARENA_SIZE);

// ============================================
// Dynamic Objects
// ============================================
const OBJECT_COLORS = [
    0x6366f1, 0xf59e0b, 0xef4444, 0x10b981,
    0x8b5cf6, 0x06b6d4, 0xf97316, 0xec4899,
];
const SHAPES = ['sphere', 'box', 'cylinder'];
const dynamicBodies = [];
const MAX_FORCE = 30;

function createDynamicObject(type, position) {
    let mesh, body;
    const color = OBJECT_COLORS[Math.floor(Math.random() * OBJECT_COLORS.length)];
    const mat = new THREE.MeshStandardMaterial({
        color, roughness: 0.25, metalness: 0.7,
        emissive: color, emissiveIntensity: 0.05,
    });
    const size = 0.4 + Math.random() * 0.3;

    if (type === 'sphere') {
        mesh = new THREE.Mesh(new THREE.SphereGeometry(size, 32, 32), mat);
        body = new CANNON.Body({ mass: size * 3, shape: new CANNON.Sphere(size) });
    } else if (type === 'box') {
        mesh = new THREE.Mesh(new THREE.BoxGeometry(size * 2, size * 2, size * 2), mat);
        body = new CANNON.Body({ mass: size * 4, shape: new CANNON.Box(new CANNON.Vec3(size, size, size)) });
    } else {
        mesh = new THREE.Mesh(new THREE.CylinderGeometry(size * 0.8, size * 0.8, size * 2, 24), mat);
        body = new CANNON.Body({ mass: size * 3.5, shape: new CANNON.Cylinder(size * 0.8, size * 0.8, size * 2, 12) });
    }

    mesh.castShadow = true;
    mesh.receiveShadow = true;
    scene.add(mesh);

    body.position.set(position.x, position.y, position.z);
    body.angularVelocity.set(
        (Math.random() - 0.5) * 3,
        (Math.random() - 0.5) * 3,
        (Math.random() - 0.5) * 3
    );
    world.addBody(body);

    const entry = { mesh, body, emissiveBase: 0.05, lastCollisionTime: 0 };

    body.addEventListener('collide', (event) => {
        const force = Math.abs(event.contact.getImpactVelocityAlongNormal());
        const now = performance.now();
        if (now - entry.lastCollisionTime < 80) return;
        entry.lastCollisionTime = now;
        if (force < 0.5) return;

        const normalizedForce = Math.min(force / MAX_FORCE, 1);
        onCollision(normalizedForce);
        showImpact(normalizedForce);
        entry.emissiveBase = 0.3 + normalizedForce * 0.7;
    });

    dynamicBodies.push(entry);
    return entry;
}

function spawnInitialObjects() {
    const positions = [
        { x: -2, y: 5, z: -1 },
        { x: 1, y: 7, z: 1 },
        { x: -1, y: 9, z: 2 },
        { x: 2, y: 6, z: -2 },
        { x: 0, y: 11, z: 0 },
        { x: -2.5, y: 8, z: 1.5 },
        { x: 1.5, y: 10, z: -1.5 },
    ];
    positions.forEach((pos, i) => {
        createDynamicObject(SHAPES[i % SHAPES.length], pos);
    });
}

spawnInitialObjects();

// ============================================
// Unlock audio on first touch/click (required by all browsers)
// ============================================
function handleFirstInteraction() {
    unlockAudio();
    document.removeEventListener('touchstart', handleFirstInteraction);
    document.removeEventListener('pointerdown', handleFirstInteraction);
}
document.addEventListener('touchstart', handleFirstInteraction, { passive: true });
document.addEventListener('pointerdown', handleFirstInteraction, { passive: true });

// ============================================
// Drop / Reset buttons (haptics trigger from user gesture = works on iOS)
// ============================================
btnDrop.addEventListener('click', () => {
    unlockAudio();
    const x = (Math.random() - 0.5) * (ARENA_SIZE - 1);
    const z = (Math.random() - 0.5) * (ARENA_SIZE - 1);
    const type = SHAPES[Math.floor(Math.random() * SHAPES.length)];
    createDynamicObject(type, { x, y: 8 + Math.random() * 4, z });
    haptics.trigger('selection'); // user gesture context → works on iOS
});

btnReset.addEventListener('click', () => {
    unlockAudio();
    dynamicBodies.forEach(({ mesh, body }) => {
        scene.remove(mesh);
        mesh.geometry.dispose();
        mesh.material.dispose();
        world.removeBody(body);
    });
    dynamicBodies.length = 0;
    haptics.trigger('warning'); // user gesture context → works on iOS
    spawnInitialObjects();
});

// ============================================
// Drag & Throw — spring-force keeps physics collisions active
// ============================================
const raycaster = new THREE.Raycaster();
const pointerNDC = new THREE.Vector2();
let draggedEntry = null;
let dragPlaneY = 2;

const dragPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
const dragIntersect = new THREE.Vector3();

let dragSpringTarget = new CANNON.Vec3();
const DRAG_SPRING_STIFFNESS = 80;
const DRAG_DAMPING = 0.85;

function onPointerDown(event) {
    unlockAudio();

    pointerNDC.x = (event.clientX / window.innerWidth) * 2 - 1;
    pointerNDC.y = -(event.clientY / window.innerHeight) * 2 + 1;

    raycaster.setFromCamera(pointerNDC, camera);
    const meshes = dynamicBodies.map(e => e.mesh);
    const intersects = raycaster.intersectObjects(meshes);

    if (intersects.length > 0) {
        const entry = dynamicBodies.find(e => e.mesh === intersects[0].object);
        if (entry) {
            draggedEntry = entry;
            dragPlaneY = entry.body.position.y;
            dragPlane.constant = -dragPlaneY;

            entry.body.velocity.setZero();
            entry.body.angularVelocity.setZero();
            entry.body.linearDamping = DRAG_DAMPING;

            dragSpringTarget.set(entry.body.position.x, entry.body.position.y, entry.body.position.z);

            controls.enabled = false;
            haptics.trigger('selection'); // user gesture context → iOS haptic
        }
    }
}

function onPointerMove(event) {
    if (!draggedEntry) return;

    pointerNDC.x = (event.clientX / window.innerWidth) * 2 - 1;
    pointerNDC.y = -(event.clientY / window.innerHeight) * 2 + 1;

    raycaster.setFromCamera(pointerNDC, camera);
    if (raycaster.ray.intersectPlane(dragPlane, dragIntersect)) {
        const cx = Math.max(-ARENA_SIZE + 1, Math.min(ARENA_SIZE - 1, dragIntersect.x));
        const cz = Math.max(-ARENA_SIZE + 1, Math.min(ARENA_SIZE - 1, dragIntersect.z));
        dragSpringTarget.set(cx, dragPlaneY, cz);
    }
}

function onPointerUp() {
    if (!draggedEntry) return;
    draggedEntry.body.linearDamping = 0.01;
    draggedEntry = null;
    controls.enabled = true;
}

canvas.addEventListener('pointerdown', onPointerDown);
canvas.addEventListener('pointermove', onPointerMove);
canvas.addEventListener('pointerup', onPointerUp);
canvas.addEventListener('pointercancel', onPointerUp);

// ============================================
// Animation Loop
// ============================================
const clock = new THREE.Clock();
const fixedTimeStep = 1 / 60;

function animate() {
    requestAnimationFrame(animate);
    const delta = clock.getDelta();

    if (draggedEntry) {
        const body = draggedEntry.body;
        const dx = dragSpringTarget.x - body.position.x;
        const dy = dragSpringTarget.y - body.position.y;
        const dz = dragSpringTarget.z - body.position.z;
        body.force.set(
            dx * DRAG_SPRING_STIFFNESS * body.mass,
            dy * DRAG_SPRING_STIFFNESS * body.mass - world.gravity.y * body.mass,
            dz * DRAG_SPRING_STIFFNESS * body.mass
        );
    }

    world.step(fixedTimeStep, delta, 3);

    dynamicBodies.forEach((entry) => {
        entry.mesh.position.copy(entry.body.position);
        entry.mesh.quaternion.copy(entry.body.quaternion);

        if (entry.emissiveBase > 0.05) {
            entry.emissiveBase *= 0.93;
            if (entry.emissiveBase < 0.06) entry.emissiveBase = 0.05;
        }
        entry.mesh.material.emissiveIntensity = entry.emissiveBase;
    });

    const t = clock.elapsedTime;
    rimLight.position.x = -6 + Math.sin(t * 0.3) * 2;
    warmLight.position.z = 4 + Math.cos(t * 0.4) * 2;

    controls.update();
    renderer.render(scene, camera);
}

// ============================================
// Resize
// ============================================
function onResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
}
window.addEventListener('resize', onResize);

animate();
