import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { WebHaptics } from 'web-haptics';

// ============================================
// Haptics Setup
// ============================================
const haptics = new WebHaptics({ debug: true });

// Haptic pattern map per object type
const HAPTIC_MAP = {
    sphere: { pattern: 'success', label: 'SUCCESS', color: '#6366f1' },
    cube: { pattern: 'nudge', label: 'NUDGE', color: '#f59e0b' },
    torus: { pattern: 'error', label: 'ERROR', color: '#ef4444' },
    cone: { pattern: 'buzz', label: 'BUZZ', color: '#10b981' },
    icosahedron: {
        pattern: [
            { duration: 30, intensity: 1 },
            { delay: 40, duration: 60, intensity: 0.6 },
            { delay: 30, duration: 30, intensity: 1 },
            { delay: 40, duration: 100, intensity: 0.4 },
        ],
        label: 'CUSTOM',
        color: '#8b5cf6',
    },
};

// ============================================
// Three.js Setup
// ============================================
const canvas = document.getElementById('webgl-canvas');
const scene = new THREE.Scene();

const camera = new THREE.PerspectiveCamera(
    60,
    window.innerWidth / window.innerHeight,
    0.1,
    100
);
camera.position.set(0, 4, 8);

const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    alpha: false,
});
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.2;

// Controls
const controls = new OrbitControls(camera, canvas);
controls.enableDamping = true;
controls.dampingFactor = 0.08;
controls.minDistance = 3;
controls.maxDistance = 18;
controls.maxPolarAngle = Math.PI / 2 + 0.1;
controls.target.set(0, 0.5, 0);

// ============================================
// Lighting
// ============================================
const ambientLight = new THREE.AmbientLight(0x404060, 0.6);
scene.add(ambientLight);

const dirLight = new THREE.DirectionalLight(0xffffff, 1.2);
dirLight.position.set(5, 8, 5);
dirLight.castShadow = false;
scene.add(dirLight);

const pointLight1 = new THREE.PointLight(0x6366f1, 2, 20);
pointLight1.position.set(-4, 4, -3);
scene.add(pointLight1);

const pointLight2 = new THREE.PointLight(0xf59e0b, 1.5, 20);
pointLight2.position.set(4, 3, 3);
scene.add(pointLight2);

// ============================================
// Environment (Background)
// ============================================
scene.background = new THREE.Color(0x0a0a1a);
scene.fog = new THREE.FogExp2(0x0a0a1a, 0.04);

// Ground grid
const gridHelper = new THREE.GridHelper(30, 30, 0x1a1a3a, 0x12122a);
gridHelper.position.y = -0.01;
scene.add(gridHelper);

// Ground plane (invisible but for visual reference)
const groundGeo = new THREE.PlaneGeometry(30, 30);
const groundMat = new THREE.MeshStandardMaterial({
    color: 0x0e0e24,
    roughness: 0.9,
    metalness: 0.1,
    transparent: true,
    opacity: 0.8,
});
const ground = new THREE.Mesh(groundGeo, groundMat);
ground.rotation.x = -Math.PI / 2;
ground.position.y = -0.02;
scene.add(ground);

// ============================================
// Interactive Objects
// ============================================
const interactiveObjects = [];

function createMaterial(color, emissiveColor) {
    return new THREE.MeshStandardMaterial({
        color,
        emissive: emissiveColor,
        emissiveIntensity: 0.15,
        roughness: 0.2,
        metalness: 0.6,
    });
}

// Sphere
const sphereGeo = new THREE.SphereGeometry(0.8, 64, 64);
const sphereMat = createMaterial(0x6366f1, 0x4338ca);
const sphere = new THREE.Mesh(sphereGeo, sphereMat);
sphere.position.set(-3, 1, 0);
sphere.userData = { type: 'sphere', baseY: 1, phase: 0 };
scene.add(sphere);
interactiveObjects.push(sphere);

// Cube (rounded)
const cubeGeo = new THREE.BoxGeometry(1.2, 1.2, 1.2, 4, 4, 4);
const cubeMat = createMaterial(0xf59e0b, 0xd97706);
const cube = new THREE.Mesh(cubeGeo, cubeMat);
cube.position.set(-1, 1, 2);
cube.userData = { type: 'cube', baseY: 1, phase: 1 };
scene.add(cube);
interactiveObjects.push(cube);

// Torus
const torusGeo = new THREE.TorusGeometry(0.65, 0.3, 32, 64);
const torusMat = createMaterial(0xef4444, 0xb91c1c);
const torus = new THREE.Mesh(torusGeo, torusMat);
torus.position.set(1.5, 1.2, -1);
torus.userData = { type: 'torus', baseY: 1.2, phase: 2 };
scene.add(torus);
interactiveObjects.push(torus);

// Cone
const coneGeo = new THREE.ConeGeometry(0.7, 1.4, 32);
const coneMat = createMaterial(0x10b981, 0x059669);
const cone = new THREE.Mesh(coneGeo, coneMat);
cone.position.set(3, 0.7, 1.5);
cone.userData = { type: 'cone', baseY: 0.7, phase: 3 };
scene.add(cone);
interactiveObjects.push(cone);

// Icosahedron
const icoGeo = new THREE.IcosahedronGeometry(0.75, 0);
const icoMat = createMaterial(0x8b5cf6, 0x7c3aed);
const ico = new THREE.Mesh(icoGeo, icoMat);
ico.position.set(0, 1, -2.5);
ico.userData = { type: 'icosahedron', baseY: 1, phase: 4 };
scene.add(ico);
interactiveObjects.push(ico);

// Floating particles
const particleCount = 200;
const particleGeo = new THREE.BufferGeometry();
const particlePositions = new Float32Array(particleCount * 3);
for (let i = 0; i < particleCount; i++) {
    particlePositions[i * 3] = (Math.random() - 0.5) * 20;
    particlePositions[i * 3 + 1] = Math.random() * 10;
    particlePositions[i * 3 + 2] = (Math.random() - 0.5) * 20;
}
particleGeo.setAttribute('position', new THREE.BufferAttribute(particlePositions, 3));
const particleMat = new THREE.PointsMaterial({
    color: 0x6366f1,
    size: 0.03,
    transparent: true,
    opacity: 0.6,
    sizeAttenuation: true,
});
const particles = new THREE.Points(particleGeo, particleMat);
scene.add(particles);

// ============================================
// Raycaster & Interaction
// ============================================
const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();
let hoveredObject = null;
let animatingObjects = new Map();

const hapticIndicator = document.getElementById('haptic-indicator');
const hapticName = document.getElementById('haptic-name');
const hapticPulse = document.getElementById('haptic-pulse');
let indicatorTimeout = null;

function showHapticFeedback(type) {
    const config = HAPTIC_MAP[type];
    if (!config) return;

    hapticName.textContent = config.label;
    hapticPulse.style.color = config.color;
    hapticPulse.style.background = config.color;

    hapticIndicator.classList.remove('hidden');
    hapticIndicator.classList.add('visible');

    clearTimeout(indicatorTimeout);
    indicatorTimeout = setTimeout(() => {
        hapticIndicator.classList.remove('visible');
        hapticIndicator.classList.add('hidden');
    }, 1500);
}

function triggerHaptic(type) {
    const config = HAPTIC_MAP[type];
    if (!config) return;

    haptics.trigger(config.pattern);
    showHapticFeedback(type);
}

function onTapObject(object) {
    const type = object.userData.type;
    triggerHaptic(type);

    // Visual feedback — bounce + flash
    animatingObjects.set(object, {
        startTime: performance.now(),
        duration: 400,
        originalScale: object.scale.clone(),
        originalEmissiveIntensity: object.material.emissiveIntensity,
    });
}

// Track tap vs drag to avoid triggering haptics during orbit controls
let pointerDownPos = null;
const TAP_THRESHOLD = 10; // px — movement beyond this is a drag, not a tap

function handlePointerDown(event) {
    pointerDownPos = { x: event.clientX, y: event.clientY };
}

function handlePointerUp(event) {
    if (!pointerDownPos) return;

    const dx = event.clientX - pointerDownPos.x;
    const dy = event.clientY - pointerDownPos.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    pointerDownPos = null;

    // If the pointer moved too much, it's a drag (orbit controls), not a tap
    if (dist > TAP_THRESHOLD) return;

    pointer.x = (event.clientX / window.innerWidth) * 2 - 1;
    pointer.y = -(event.clientY / window.innerHeight) * 2 + 1;

    raycaster.setFromCamera(pointer, camera);
    const intersects = raycaster.intersectObjects(interactiveObjects);

    if (intersects.length > 0) {
        // Trigger haptics synchronously within the user gesture context (critical for iOS)
        onTapObject(intersects[0].object);
    }
}

function handlePointerMove(event) {
    const x = event.clientX ?? event.touches?.[0]?.clientX;
    const y = event.clientY ?? event.touches?.[0]?.clientY;
    if (x === undefined || y === undefined) return;

    pointer.x = (x / window.innerWidth) * 2 - 1;
    pointer.y = -(y / window.innerHeight) * 2 + 1;

    raycaster.setFromCamera(pointer, camera);
    const intersects = raycaster.intersectObjects(interactiveObjects);

    if (intersects.length > 0) {
        const obj = intersects[0].object;
        if (hoveredObject !== obj) {
            if (hoveredObject) {
                hoveredObject.material.emissiveIntensity = 0.15;
            }
            hoveredObject = obj;
            canvas.style.cursor = 'pointer';
        }
    } else {
        if (hoveredObject) {
            hoveredObject.material.emissiveIntensity = 0.15;
            hoveredObject = null;
        }
        canvas.style.cursor = 'grab';
    }
}

// Use pointerup (not pointerdown) — iOS Safari requires haptic triggers
// in click/pointerup user gesture context for the hidden checkbox trick to work.
// Do NOT use { passive: false } or event.preventDefault() as this blocks
// iOS from recognizing the gesture as a valid user interaction.
canvas.addEventListener('pointerdown', handlePointerDown);
canvas.addEventListener('pointerup', handlePointerUp);
canvas.addEventListener('pointermove', handlePointerMove, { passive: true });

// ============================================
// Animation Loop
// ============================================
const clock = new THREE.Clock();

function animate() {
    requestAnimationFrame(animate);
    const elapsed = clock.getElapsedTime();
    const now = performance.now();

    // Floating animation for objects
    interactiveObjects.forEach((obj) => {
        const phase = obj.userData.phase;
        const baseY = obj.userData.baseY;
        obj.position.y = baseY + Math.sin(elapsed * 0.8 + phase * 1.3) * 0.15;

        // Gentle rotation
        obj.rotation.y = elapsed * 0.3 + phase;
        if (obj.userData.type === 'torus') {
            obj.rotation.x = elapsed * 0.4 + phase;
        }
    });

    // Hover glow
    if (hoveredObject && !animatingObjects.has(hoveredObject)) {
        hoveredObject.material.emissiveIntensity =
            0.3 + Math.sin(elapsed * 4) * 0.1;
    }

    // Tap animation
    animatingObjects.forEach((anim, obj) => {
        const progress = Math.min((now - anim.startTime) / anim.duration, 1);

        // Bounce: scale up then back
        const bounce = Math.sin(progress * Math.PI) * 0.3;
        const s = 1 + bounce;
        obj.scale.set(s, s, s);

        // Flash emissive
        obj.material.emissiveIntensity =
            anim.originalEmissiveIntensity + (1 - progress) * 1.5;

        if (progress >= 1) {
            obj.scale.copy(anim.originalScale);
            obj.material.emissiveIntensity = anim.originalEmissiveIntensity;
            animatingObjects.delete(obj);
        }
    });

    // Particle drift
    particles.rotation.y = elapsed * 0.02;

    // Point lights subtle movement
    pointLight1.position.x = -4 + Math.sin(elapsed * 0.5) * 2;
    pointLight1.position.z = -3 + Math.cos(elapsed * 0.3) * 2;
    pointLight2.position.x = 4 + Math.cos(elapsed * 0.4) * 2;

    controls.update();
    renderer.render(scene, camera);
}

// ============================================
// Resize Handler
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
