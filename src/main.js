import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { WebHaptics } from 'web-haptics';

// ============================================
// Haptics — iOS-compatible collision haptics
// ============================================
// Strategy:
//   iOS: The <input type="checkbox" switch> toggle fires system-level haptics.
//        web-haptics clicks this hidden checkbox in haptics.trigger().
//        We call haptics.trigger() from pointermove/pointerup handlers (event context).
//   Android: navigator.vibrate() works outside user gesture after initial unlock.
//
// Collision events from cannon-es fire in rAF (no event context).
// We queue collision forces → drain the queue inside pointer event handlers.

const haptics = new WebHaptics({ debug: true });

let hapticsPrimed = false;
let isDragging = false; // true while user is dragging an object

// Collision queue
let pendingCollisionForce = 0;
let lastHapticTime = 0;
const HAPTIC_COOLDOWN = 50; // ms

function primeHaptics() {
    if (hapticsPrimed) return;
    hapticsPrimed = true;
    haptics.trigger('selection');
}

/**
 * Queue a collision haptic (called from cannon-es collision callback in rAF).
 * On Android, also vibrate directly.
 */
function queueCollisionHaptic(normalizedForce) {
    if (normalizedForce < 0.05) return;

    // Android: vibrate immediately (works after initial user gesture)
    if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
        const now = performance.now();
        if (now - lastHapticTime > HAPTIC_COOLDOWN) {
            lastHapticTime = now;
            if (normalizedForce > 0.7) {
                navigator.vibrate([40, 30, 40]);
            } else if (normalizedForce > 0.35) {
                navigator.vibrate([25, 20, 15]);
            } else {
                navigator.vibrate([15]);
            }
        }
    }

    // Queue for iOS (will be drained in next pointer event handler)
    pendingCollisionForce = Math.max(pendingCollisionForce, normalizedForce);
}

/**
 * Drain queued collision haptics — MUST be called from pointer event handlers.
 * On iOS, this triggers haptics.trigger() → label.click() → checkbox toggle → system haptic.
 */
function drainCollisionQueue() {
    if (pendingCollisionForce <= 0) return;

    const now = performance.now();
    if (now - lastHapticTime < HAPTIC_COOLDOWN) return;
    lastHapticTime = now;

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

// ============================================
// Global pointer listeners for iOS haptic draining
// ============================================
document.addEventListener('pointerdown', () => {
    primeHaptics();
    drainCollisionQueue();
}, { passive: true });

// pointermove fires continuously during drag — perfect for draining collision haptics
document.addEventListener('pointermove', () => {
    if (isDragging) drainCollisionQueue();
}, { passive: true });

document.addEventListener('pointerup', () => {
    drainCollisionQueue();
}, { passive: true });

// Also listen to touch events (iOS Safari sometimes prefers these)
document.addEventListener('touchmove', () => {
    if (isDragging) drainCollisionQueue();
}, { passive: true });

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

const floorMat = new THREE.MeshStandardMaterial({
    color: 0x14142e, roughness: 0.8, metalness: 0.2,
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

const grid = new THREE.GridHelper(ARENA_SIZE * 2, 20, 0x2a2a4a, 0x1a1a3a);
grid.position.y = 0.01;
scene.add(grid);

const wallMat = new THREE.MeshStandardMaterial({
    color: 0x1e1e3e, roughness: 0.6, metalness: 0.3, transparent: true, opacity: 0.35,
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

    // Collision listener — queues haptic force (runs in rAF, not event context)
    body.addEventListener('collide', (event) => {
        const force = Math.abs(event.contact.getImpactVelocityAlongNormal());
        const now = performance.now();
        if (now - entry.lastCollisionTime < 80) return;
        entry.lastCollisionTime = now;
        if (force < 0.5) return;

        const normalizedForce = Math.min(force / MAX_FORCE, 1);

        // Queue for haptic (Android vibrates directly, iOS waits for event handler)
        queueCollisionHaptic(normalizedForce);

        // Visual feedback
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
// Drop / Reset buttons
// ============================================
btnDrop.addEventListener('click', () => {
    primeHaptics();
    const x = (Math.random() - 0.5) * (ARENA_SIZE - 1);
    const z = (Math.random() - 0.5) * (ARENA_SIZE - 1);
    const type = SHAPES[Math.floor(Math.random() * SHAPES.length)];
    createDynamicObject(type, { x, y: 8 + Math.random() * 4, z });
    haptics.trigger('selection');
});

btnReset.addEventListener('click', () => {
    primeHaptics();
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
// Drag & Throw — keeps body DYNAMIC so collisions happen during drag
// ============================================
const raycaster = new THREE.Raycaster();
const pointerNDC = new THREE.Vector2();
let draggedEntry = null;
let dragPlaneY = 2;
let lastDragWorldPos = new THREE.Vector3();

const dragPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
const dragIntersect = new THREE.Vector3();

// Spring constraint: pulls the dragged body toward the pointer position
// The body stays DYNAMIC → collisions with other objects still trigger
let dragSpringTarget = new CANNON.Vec3();
const DRAG_SPRING_STIFFNESS = 80;  // force multiplier
const DRAG_DAMPING = 0.85;         // velocity damping during drag

function onPointerDown(event) {
    const x = event.clientX;
    const y = event.clientY;

    pointerNDC.x = (x / window.innerWidth) * 2 - 1;
    pointerNDC.y = -(y / window.innerHeight) * 2 + 1;

    raycaster.setFromCamera(pointerNDC, camera);
    const meshes = dynamicBodies.map(e => e.mesh);
    const intersects = raycaster.intersectObjects(meshes);

    if (intersects.length > 0) {
        const entry = dynamicBodies.find(e => e.mesh === intersects[0].object);
        if (entry) {
            draggedEntry = entry;
            isDragging = true;
            dragPlaneY = entry.body.position.y;
            dragPlane.constant = -dragPlaneY;

            // Keep body DYNAMIC — collisions will still fire!
            // Just clear current velocity and add high damping
            entry.body.velocity.setZero();
            entry.body.angularVelocity.setZero();
            entry.body.linearDamping = DRAG_DAMPING;

            dragSpringTarget.set(entry.body.position.x, entry.body.position.y, entry.body.position.z);
            lastDragWorldPos.set(entry.body.position.x, entry.body.position.y, entry.body.position.z);

            controls.enabled = false;

            // Prime haptics on grab (but use a simple trigger to not waste activation)
            primeHaptics();
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
        lastDragWorldPos.set(cx, dragPlaneY, cz);
    }

    // Drain any pending collision haptics in this event handler context (for iOS)
    drainCollisionQueue();
}

function onPointerUp() {
    if (!draggedEntry) return;

    // Restore normal damping
    draggedEntry.body.linearDamping = 0.01;

    // The body already has velocity from the spring force — it will fly naturally
    draggedEntry = null;
    isDragging = false;
    controls.enabled = true;

    // Drain any remaining collision haptics
    drainCollisionQueue();
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

    // Apply spring force to dragged body (keeps it dynamic for collision detection)
    if (draggedEntry) {
        const body = draggedEntry.body;
        const dx = dragSpringTarget.x - body.position.x;
        const dy = dragSpringTarget.y - body.position.y;
        const dz = dragSpringTarget.z - body.position.z;

        body.force.set(
            dx * DRAG_SPRING_STIFFNESS * body.mass,
            dy * DRAG_SPRING_STIFFNESS * body.mass - world.gravity.y * body.mass, // counteract gravity
            dz * DRAG_SPRING_STIFFNESS * body.mass
        );
    }

    // Step physics
    world.step(fixedTimeStep, delta, 3);

    // Sync meshes
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

// ============================================
// Start
// ============================================
animate();
