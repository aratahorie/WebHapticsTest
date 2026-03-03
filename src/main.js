import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { WebHaptics } from 'web-haptics';

// ============================================
// Haptics — with user gesture priming & collision queue
// ============================================
const haptics = new WebHaptics({ debug: true });

// Whether the haptic system has been primed via a user gesture
let hapticsPrimed = false;

// Collision haptic queue — accumulates impacts to be fired during user gestures
// (iOS requires user gesture context for each haptic trigger)
let pendingCollisionForce = 0;
let lastGlobalHapticTime = 0;
const HAPTIC_COOLDOWN = 60; // ms between haptic events

/**
 * Prime the haptics system — must be called from a user gesture (touch/click).
 * This unlocks AudioContext for desktop debug and vibrate API on Android.
 */
function primeHaptics() {
    if (hapticsPrimed) return;
    hapticsPrimed = true;
    // Trigger a minimal haptic to unlock all subsystems
    haptics.trigger('selection');
}

/**
 * Called from cannon-es collision callbacks (NOT in user gesture context).
 * Uses navigator.vibrate() directly for Android, queues for iOS.
 */
function triggerCollisionHaptic(normalizedForce) {
    if (normalizedForce < 0.05) return;

    const now = performance.now();
    if (now - lastGlobalHapticTime < HAPTIC_COOLDOWN) return;
    lastGlobalHapticTime = now;

    // Android/Chrome: navigator.vibrate() works outside user gesture after initial unlock
    if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
        let vibrationMs;
        if (normalizedForce > 0.7) {
            vibrationMs = [40, 30, 40]; // double pulse for heavy
        } else if (normalizedForce > 0.35) {
            vibrationMs = [25, 20, 15]; // lighter double
        } else {
            vibrationMs = [15]; // single short
        }
        navigator.vibrate(vibrationMs);
    }

    // iOS fallback: queue the force for the next user gesture
    pendingCollisionForce = Math.max(pendingCollisionForce, normalizedForce);
}

/**
 * Process any queued collision haptics — called from user gesture handlers.
 * This is the iOS path where haptics can only fire within touch events.
 */
function processPendingCollisionHaptics() {
    if (pendingCollisionForce <= 0) return;
    const force = pendingCollisionForce;
    pendingCollisionForce = 0;

    if (force > 0.7) {
        haptics.trigger('heavy');
    } else if (force > 0.35) {
        haptics.trigger('nudge');
    } else {
        haptics.trigger('light');
    }
}

// Global touch/pointer handlers to prime haptics and process iOS collision queue
function onGlobalPointerDown() {
    primeHaptics();
    processPendingCollisionHaptics();
}
function onGlobalPointerMove() {
    // During active touch (drag), process any collision haptics in gesture context
    processPendingCollisionHaptics();
}
document.addEventListener('pointerdown', onGlobalPointerDown, { passive: true });
document.addEventListener('pointermove', onGlobalPointerMove, { passive: true });
document.addEventListener('pointerup', () => processPendingCollisionHaptics(), { passive: true });

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

    // Flash screen edge
    if (normalizedForce > 0.2) {
        collisionFlash.classList.add('active');
        clearTimeout(flashTimeout);
        flashTimeout = setTimeout(() => {
            collisionFlash.classList.remove('active');
        }, 120);
    }

    // Decay
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

// Floor
const floorMat = new THREE.MeshStandardMaterial({
    color: 0x14142e,
    roughness: 0.8,
    metalness: 0.2,
});
const floorMesh = new THREE.Mesh(new THREE.BoxGeometry(ARENA_SIZE * 2, 0.2, ARENA_SIZE * 2), floorMat);
floorMesh.position.y = -0.1;
floorMesh.receiveShadow = true;
scene.add(floorMesh);

const floorBody = new CANNON.Body({
    mass: 0,
    shape: new CANNON.Box(new CANNON.Vec3(ARENA_SIZE, 0.1, ARENA_SIZE)),
    position: new CANNON.Vec3(0, -0.1, 0),
});
world.addBody(floorBody);

// Grid on floor
const grid = new THREE.GridHelper(ARENA_SIZE * 2, 20, 0x2a2a4a, 0x1a1a3a);
grid.position.y = 0.01;
scene.add(grid);

// Wall helper
const wallMat = new THREE.MeshStandardMaterial({
    color: 0x1e1e3e,
    roughness: 0.6,
    metalness: 0.3,
    transparent: true,
    opacity: 0.35,
});

function createWall(px, py, pz, sx, sy, sz) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(sx * 2, sy * 2, sz * 2), wallMat);
    mesh.position.set(px, py, pz);
    mesh.receiveShadow = true;
    scene.add(mesh);

    const body = new CANNON.Body({
        mass: 0,
        shape: new CANNON.Box(new CANNON.Vec3(sx, sy, sz)),
        position: new CANNON.Vec3(px, py, pz),
    });
    world.addBody(body);
    return { mesh, body };
}

// 4 walls
createWall(0, WALL_HEIGHT / 2, -ARENA_SIZE, ARENA_SIZE, WALL_HEIGHT / 2, WALL_THICKNESS); // back
createWall(0, WALL_HEIGHT / 2, ARENA_SIZE, ARENA_SIZE, WALL_HEIGHT / 2, WALL_THICKNESS); // front
createWall(-ARENA_SIZE, WALL_HEIGHT / 2, 0, WALL_THICKNESS, WALL_HEIGHT / 2, ARENA_SIZE); // left
createWall(ARENA_SIZE, WALL_HEIGHT / 2, 0, WALL_THICKNESS, WALL_HEIGHT / 2, ARENA_SIZE); // right

// ============================================
// Dynamic Objects
// ============================================
const OBJECT_COLORS = [
    0x6366f1, // indigo
    0xf59e0b, // amber
    0xef4444, // red
    0x10b981, // emerald
    0x8b5cf6, // purple
    0x06b6d4, // cyan
    0xf97316, // orange
    0xec4899, // pink
];

const SHAPES = ['sphere', 'box', 'cylinder'];
const dynamicBodies = []; // { mesh, body, collisionFlashTime }
const MAX_FORCE = 30; // normalization ceiling for haptic intensity

function createDynamicObject(type, position) {
    let mesh, body;
    const color = OBJECT_COLORS[Math.floor(Math.random() * OBJECT_COLORS.length)];
    const mat = new THREE.MeshStandardMaterial({
        color,
        roughness: 0.25,
        metalness: 0.7,
        emissive: color,
        emissiveIntensity: 0.05,
    });

    const size = 0.4 + Math.random() * 0.3;

    if (type === 'sphere') {
        mesh = new THREE.Mesh(new THREE.SphereGeometry(size, 32, 32), mat);
        body = new CANNON.Body({
            mass: size * 3,
            shape: new CANNON.Sphere(size),
        });
    } else if (type === 'box') {
        mesh = new THREE.Mesh(new THREE.BoxGeometry(size * 2, size * 2, size * 2), mat);
        body = new CANNON.Body({
            mass: size * 4,
            shape: new CANNON.Box(new CANNON.Vec3(size, size, size)),
        });
    } else {
        mesh = new THREE.Mesh(new THREE.CylinderGeometry(size * 0.8, size * 0.8, size * 2, 24), mat);
        body = new CANNON.Body({
            mass: size * 3.5,
            shape: new CANNON.Cylinder(size * 0.8, size * 0.8, size * 2, 12),
        });
    }

    mesh.castShadow = true;
    mesh.receiveShadow = true;
    scene.add(mesh);

    body.position.set(position.x, position.y, position.z);
    // Add some random angular velocity for visual interest
    body.angularVelocity.set(
        (Math.random() - 0.5) * 3,
        (Math.random() - 0.5) * 3,
        (Math.random() - 0.5) * 3
    );
    world.addBody(body);

    const entry = { mesh, body, emissiveBase: 0.05, lastCollisionTime: 0 };

    // Collision listener
    body.addEventListener('collide', (event) => {
        const contact = event.contact;
        const impulse = contact.getImpactVelocityAlongNormal();
        const force = Math.abs(impulse);

        // Cooldown: don't spam haptics (min 80ms between events per body)
        const now = performance.now();
        if (now - entry.lastCollisionTime < 80) return;
        entry.lastCollisionTime = now;

        if (force < 0.5) return; // ignore micro-collisions

        const normalizedForce = Math.min(force / MAX_FORCE, 1);

        // Trigger haptic
        triggerCollisionHaptic(normalizedForce);

        // Visual feedback
        showImpact(normalizedForce);

        // Emissive flash on collided object
        entry.emissiveBase = 0.3 + normalizedForce * 0.7;
    });

    dynamicBodies.push(entry);
    return entry;
}

// Initial objects
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
        const type = SHAPES[i % SHAPES.length];
        createDynamicObject(type, pos);
    });
}

spawnInitialObjects();

// ============================================
// Drop button — spawns a random object
// ============================================
btnDrop.addEventListener('pointerup', () => {
    const x = (Math.random() - 0.5) * (ARENA_SIZE - 1);
    const z = (Math.random() - 0.5) * (ARENA_SIZE - 1);
    const type = SHAPES[Math.floor(Math.random() * SHAPES.length)];
    createDynamicObject(type, { x, y: 8 + Math.random() * 4, z });

    // Trigger a light haptic for the button press itself
    haptics.trigger('selection');
});

// Reset button
btnReset.addEventListener('pointerup', () => {
    // Remove all dynamic bodies
    dynamicBodies.forEach(({ mesh, body }) => {
        scene.remove(mesh);
        mesh.geometry.dispose();
        mesh.material.dispose();
        world.removeBody(body);
    });
    dynamicBodies.length = 0;

    haptics.trigger('warning');
    spawnInitialObjects();
});

// ============================================
// Drag & Throw
// ============================================
const raycaster = new THREE.Raycaster();
const pointerNDC = new THREE.Vector2();
let draggedEntry = null;
let dragPlaneY = 2;
let pointerDownTime = 0;
let lastDragPos = new CANNON.Vec3();

// Plane for drag movement
const dragPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
const dragIntersect = new THREE.Vector3();

function getPointerPos(event) {
    const x = event.clientX ?? event.touches?.[0]?.clientX;
    const y = event.clientY ?? event.touches?.[0]?.clientY;
    return { x, y };
}

function onPointerDown(event) {
    const { x, y } = getPointerPos(event);
    if (x == null || y == null) return;

    pointerNDC.x = (x / window.innerWidth) * 2 - 1;
    pointerNDC.y = -(y / window.innerHeight) * 2 + 1;

    raycaster.setFromCamera(pointerNDC, camera);
    const meshes = dynamicBodies.map(e => e.mesh);
    const intersects = raycaster.intersectObjects(meshes);

    if (intersects.length > 0) {
        const hitMesh = intersects[0].object;
        const entry = dynamicBodies.find(e => e.mesh === hitMesh);
        if (entry) {
            draggedEntry = entry;
            dragPlaneY = entry.body.position.y;
            dragPlane.constant = -dragPlaneY;

            // Freeze physics while dragging
            entry.body.type = CANNON.Body.KINEMATIC;
            entry.body.velocity.setZero();
            entry.body.angularVelocity.setZero();

            lastDragPos.copy(entry.body.position);
            pointerDownTime = performance.now();

            controls.enabled = false;
            haptics.trigger('selection');
        }
    }
}

function onPointerMove(event) {
    if (!draggedEntry) return;

    const { x, y } = getPointerPos(event);
    if (x == null || y == null) return;

    pointerNDC.x = (x / window.innerWidth) * 2 - 1;
    pointerNDC.y = -(y / window.innerHeight) * 2 + 1;

    raycaster.setFromCamera(pointerNDC, camera);
    if (raycaster.ray.intersectPlane(dragPlane, dragIntersect)) {
        // Clamp to arena
        const cx = Math.max(-ARENA_SIZE + 1, Math.min(ARENA_SIZE - 1, dragIntersect.x));
        const cz = Math.max(-ARENA_SIZE + 1, Math.min(ARENA_SIZE - 1, dragIntersect.z));

        lastDragPos.copy(draggedEntry.body.position);

        draggedEntry.body.position.x = cx;
        draggedEntry.body.position.z = cz;
    }
}

function onPointerUp(event) {
    if (!draggedEntry) return;

    // Calculate throw velocity from last movement
    const dt = Math.max((performance.now() - pointerDownTime) / 1000, 0.016);
    const vx = (draggedEntry.body.position.x - lastDragPos.x) / dt * 0.3;
    const vz = (draggedEntry.body.position.z - lastDragPos.z) / dt * 0.3;

    // Make dynamic again
    draggedEntry.body.type = CANNON.Body.DYNAMIC;
    draggedEntry.body.velocity.set(
        Math.max(-15, Math.min(15, vx)),
        0,
        Math.max(-15, Math.min(15, vz))
    );

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

    // Step physics
    world.step(fixedTimeStep, delta, 3);

    // Sync Three.js meshes with cannon bodies
    dynamicBodies.forEach((entry) => {
        entry.mesh.position.copy(entry.body.position);
        entry.mesh.quaternion.copy(entry.body.quaternion);

        // Decay emissive flash
        if (entry.emissiveBase > 0.05) {
            entry.emissiveBase *= 0.93;
            if (entry.emissiveBase < 0.06) entry.emissiveBase = 0.05;
        }
        entry.mesh.material.emissiveIntensity = entry.emissiveBase;
    });

    // Subtle light animation
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

// ============================================
// Start
// ============================================
animate();
