import * as THREE from 'three';
import { WebHaptics } from 'web-haptics';

// ============================================
// Haptics
// ============================================
const haptics = new WebHaptics();

// ============================================
// Animation timeline — haptic events at specific times (ms)
// These define BOTH the haptic pattern AND the visual keyframes.
// ============================================
const TIMELINE_DURATION = 5500; // total animation length in ms

// Haptic events with timestamps for visual sync
const HAPTIC_EVENTS = [
    { time: 700, intensity: 1.0, label: 'IMPACT' },    // Ball hits ground
    { time: 1150, intensity: 0.7, label: 'BOUNCE' },     // First bounce
    { time: 1500, intensity: 0.45, label: 'BOUNCE' },     // Second bounce
    { time: 1750, intensity: 0.25, label: 'BOUNCE' },     // Third bounce
    { time: 2500, intensity: 0.6, label: 'HIT' },        // Ball hits block 1
    { time: 2800, intensity: 0.5, label: 'HIT' },        // Block 1 hits block 2
    { time: 3100, intensity: 0.4, label: 'HIT' },        // Block 2 hits block 3
    { time: 3400, intensity: 0.8, label: 'CRASH' },      // Block 3 hits wall
    { time: 4200, intensity: 0.3, label: 'SETTLE' },     // Rumble settle
];

// Build a single web-haptics pattern from HAPTIC_EVENTS
function buildHapticPattern() {
    const pattern = [];
    let currentTime = 0;

    for (const event of HAPTIC_EVENTS) {
        const delay = event.time - currentTime;
        const duration = 15 + event.intensity * 30; // 15–45ms
        pattern.push({
            delay: delay > 0 ? delay : undefined,
            duration,
            intensity: event.intensity,
        });
        currentTime = event.time + duration;
    }

    return pattern;
}

const HAPTIC_PATTERN = buildHapticPattern();

// ============================================
// Web Audio — impact sounds (supplement haptics)
// ============================================
let audioCtx = null;

function unlockAudio() {
    if (audioCtx) return;
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    if (audioCtx.state === 'suspended') audioCtx.resume();
}

function playImpactSound(intensity) {
    if (!audioCtx || audioCtx.state !== 'running') return;
    const now = audioCtx.currentTime;
    const duration = 0.03 + intensity * 0.05;
    const bufferSize = Math.ceil(audioCtx.sampleRate * duration);
    const noiseBuffer = audioCtx.createBuffer(1, bufferSize, audioCtx.sampleRate);
    const data = noiseBuffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
        data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (bufferSize * 0.2));
    }
    const src = audioCtx.createBufferSource();
    src.buffer = noiseBuffer;

    const filter = audioCtx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 300 + intensity * 900;
    filter.Q.value = 1.5;

    const gain = audioCtx.createGain();
    gain.gain.setValueAtTime(0.15 + intensity * 0.25, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + duration);

    src.connect(filter);
    filter.connect(gain);
    gain.connect(audioCtx.destination);
    src.start(now);
    src.stop(now + duration);

    if (intensity > 0.4) {
        const osc = audioCtx.createOscillator();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(50 + intensity * 50, now);
        osc.frequency.exponentialRampToValueAtTime(25, now + duration);
        const oscGain = audioCtx.createGain();
        oscGain.gain.setValueAtTime(intensity * 0.2, now);
        oscGain.gain.exponentialRampToValueAtTime(0.001, now + duration);
        osc.connect(oscGain);
        oscGain.connect(audioCtx.destination);
        osc.start(now);
        osc.stop(now + duration);
    }
}

// ============================================
// UI
// ============================================
const canvas = document.getElementById('webgl-canvas');
const btnPlay = document.getElementById('btn-play');
const playIcon = document.getElementById('play-icon');
const playText = document.getElementById('play-text');
const playHint = document.getElementById('play-hint');
const timelineEl = document.getElementById('timeline');
const timelineBar = document.getElementById('timeline-bar');
const collisionFlash = document.getElementById('collision-flash');
let flashTimeout = null;

function flash(intensity) {
    collisionFlash.style.background = `radial-gradient(circle at center, rgba(99, 102, 241, ${0.1 + intensity * 0.25}), transparent 70%)`;
    collisionFlash.classList.add('active');
    clearTimeout(flashTimeout);
    flashTimeout = setTimeout(() => collisionFlash.classList.remove('active'), 80 + intensity * 60);
}

// ============================================
// Three.js Scene
// ============================================
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0a0a1a);
scene.fog = new THREE.FogExp2(0x0a0a1a, 0.025);

const camera = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 0.1, 100);
camera.position.set(4, 3.5, 9);
camera.lookAt(2, 1, 0);

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

// Lighting
scene.add(new THREE.AmbientLight(0x404060, 0.5));

const dirLight = new THREE.DirectionalLight(0xffffff, 1.5);
dirLight.position.set(8, 12, 6);
dirLight.castShadow = true;
dirLight.shadow.mapSize.set(1024, 1024);
dirLight.shadow.camera.left = -8;
dirLight.shadow.camera.right = 8;
dirLight.shadow.camera.top = 8;
dirLight.shadow.camera.bottom = -8;
dirLight.shadow.bias = -0.002;
scene.add(dirLight);

const rimLight = new THREE.PointLight(0x6366f1, 1.5, 25);
rimLight.position.set(-6, 5, -4);
scene.add(rimLight);

const warmLight = new THREE.PointLight(0xf97316, 1, 20);
warmLight.position.set(6, 3, 4);
scene.add(warmLight);

// ============================================
// Scene Objects
// ============================================

// Ground
const groundGeo = new THREE.BoxGeometry(16, 0.2, 10);
const groundMat = new THREE.MeshStandardMaterial({ color: 0x14142e, roughness: 0.8, metalness: 0.2 });
const ground = new THREE.Mesh(groundGeo, groundMat);
ground.position.y = -0.1;
ground.receiveShadow = true;
scene.add(ground);

const grid = new THREE.GridHelper(16, 32, 0x2a2a4a, 0x1a1a3a);
grid.position.y = 0.01;
scene.add(grid);

// Ball
const ballGeo = new THREE.SphereGeometry(0.5, 48, 48);
const ballMat = new THREE.MeshStandardMaterial({
    color: 0x6366f1, roughness: 0.15, metalness: 0.8,
    emissive: 0x4338ca, emissiveIntensity: 0.1,
});
const ball = new THREE.Mesh(ballGeo, ballMat);
ball.castShadow = true;
scene.add(ball);

// Blocks (3 blocks that will be hit in chain reaction)
const blockGeo = new THREE.BoxGeometry(0.8, 0.8, 0.8);
const blockColors = [0xf59e0b, 0xef4444, 0x10b981];
const blocks = blockColors.map((color, i) => {
    const mat = new THREE.MeshStandardMaterial({
        color, roughness: 0.25, metalness: 0.7,
        emissive: color, emissiveIntensity: 0.05,
    });
    const mesh = new THREE.Mesh(blockGeo, mat);
    mesh.position.set(2 + i * 1.4, 0.4, 0);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    scene.add(mesh);
    return mesh;
});

// Wall (at the end of block chain)
const wallGeo = new THREE.BoxGeometry(0.3, 2, 3);
const wallMat = new THREE.MeshStandardMaterial({
    color: 0x1e1e3e, roughness: 0.6, metalness: 0.3, transparent: true, opacity: 0.6,
});
const wall = new THREE.Mesh(wallGeo, wallMat);
wall.position.set(6.5, 1, 0);
wall.receiveShadow = true;
scene.add(wall);

// ============================================
// Keyframe animation system
// ============================================

// Easing functions
function easeOutBounce(t) {
    if (t < 1 / 2.75) return 7.5625 * t * t;
    if (t < 2 / 2.75) return 7.5625 * (t -= 1.5 / 2.75) * t + 0.75;
    if (t < 2.5 / 2.75) return 7.5625 * (t -= 2.25 / 2.75) * t + 0.9375;
    return 7.5625 * (t -= 2.625 / 2.75) * t + 0.984375;
}

function easeInQuad(t) { return t * t; }
function easeOutQuad(t) { return t * (2 - t); }
function lerp(a, b, t) { return a + (b - a) * t; }

// Ball animation keyframes (positions over time)
function getBallPosition(t) {
    // t in ms
    if (t < 0) return { x: -2, y: 8, z: 0 }; // start above

    // Phase 1: Fall (0 – 700ms)
    if (t < 700) {
        const p = t / 700;
        const y = lerp(8, 0.5, easeInQuad(p));
        return { x: -2, y, z: 0 };
    }

    // Phase 2: Bounces (700 – 1900ms)
    const bounces = [
        { start: 700, end: 1150, fromY: 0.5, peakY: 3.5 },
        { start: 1150, end: 1500, fromY: 0.5, peakY: 2.0 },
        { start: 1500, end: 1750, fromY: 0.5, peakY: 1.2 },
        { start: 1750, end: 1950, fromY: 0.5, peakY: 0.7 },
    ];

    for (const b of bounces) {
        if (t >= b.start && t < b.end) {
            const p = (t - b.start) / (b.end - b.start);
            const y = b.fromY + (b.peakY - b.fromY) * Math.sin(p * Math.PI);
            return { x: -2, y, z: 0 };
        }
    }

    // Phase 3: Roll toward blocks (1950 – 2500ms)
    if (t < 2500) {
        const p = (t - 1950) / (2500 - 1950);
        const x = lerp(-2, 1.6, easeOutQuad(p));
        return { x, y: 0.5, z: 0 };
    }

    // Phase 4: Ball stops after hitting block 1 (2500+)
    if (t < 3000) {
        const p = (t - 2500) / 500;
        const x = lerp(1.6, 1.3, easeOutQuad(Math.min(p, 1)));
        return { x, y: 0.5, z: 0 };
    }

    return { x: 1.3, y: 0.5, z: 0 };
}

// Block animation keyframes
function getBlockPosition(blockIndex, t) {
    const baseX = 2 + blockIndex * 1.4;
    const hitTimes = [2500, 2800, 3100]; // when each block gets hit
    const hitTime = hitTimes[blockIndex];

    if (t < hitTime) return { x: baseX, y: 0.4, z: 0, ry: 0 };

    // Block slides forward after being hit
    const elapsed = t - hitTime;
    const slideDistance = blockIndex === 2 ? 0.5 : 1.2; // last block hits wall, slides less
    const slideDuration = 250;

    if (elapsed < slideDuration) {
        const p = easeOutQuad(elapsed / slideDuration);
        return {
            x: baseX + slideDistance * p,
            y: 0.4,
            z: 0,
            ry: p * (blockIndex === 2 ? 0.3 : 0.15),
        };
    }

    return {
        x: baseX + slideDistance,
        y: 0.4,
        z: 0,
        ry: blockIndex === 2 ? 0.3 : 0.15,
    };
}

// Wall shake on final impact
function getWallShake(t) {
    if (t < 3400 || t > 3900) return { x: 0, z: 0 };
    const elapsed = t - 3400;
    const decay = Math.exp(-elapsed / 100);
    return {
        x: Math.sin(elapsed * 0.05) * 0.05 * decay,
        z: Math.cos(elapsed * 0.07) * 0.03 * decay,
    };
}

// ============================================
// Animation state
// ============================================
let isPlaying = false;
let animStartTime = 0;
let nextHapticEventIndex = 0;

// Initial positions
function resetScene() {
    ball.position.set(-2, 8, 0);
    ball.material.emissiveIntensity = 0.1;
    blocks.forEach((b, i) => {
        b.position.set(2 + i * 1.4, 0.4, 0);
        b.rotation.y = 0;
        b.material.emissiveIntensity = 0.05;
    });
    wall.position.set(6.5, 1, 0);
    timelineBar.style.width = '0%';
    timelineEl.classList.remove('active');
    nextHapticEventIndex = 0;
}

resetScene();

// ============================================
// Play button
// ============================================
btnPlay.addEventListener('click', () => {
    if (isPlaying) return;

    unlockAudio();
    resetScene();

    isPlaying = true;
    animStartTime = performance.now();
    nextHapticEventIndex = 0;

    btnPlay.disabled = true;
    playIcon.textContent = '⏸';
    playText.textContent = 'Playing...';
    timelineEl.classList.add('active');

    // Fire the ENTIRE haptic pattern as one trigger (user gesture context!)
    haptics.trigger(HAPTIC_PATTERN);
});

// ============================================
// Animation loop
// ============================================
const clock = new THREE.Clock();

function animate() {
    requestAnimationFrame(animate);

    if (isPlaying) {
        const elapsed = performance.now() - animStartTime;
        const progress = Math.min(elapsed / TIMELINE_DURATION, 1);
        timelineBar.style.width = (progress * 100) + '%';

        // Update ball
        const ballPos = getBallPosition(elapsed);
        ball.position.set(ballPos.x, ballPos.y, ballPos.z);
        ball.rotation.x += 0.03;

        // Update blocks
        blocks.forEach((block, i) => {
            const bp = getBlockPosition(i, elapsed);
            block.position.set(bp.x, bp.y, bp.z);
            block.rotation.y = bp.ry || 0;
        });

        // Wall shake
        const shake = getWallShake(elapsed);
        wall.position.x = 6.5 + shake.x;
        wall.position.z = shake.z;

        // Trigger visual effects at haptic event times
        while (nextHapticEventIndex < HAPTIC_EVENTS.length &&
            elapsed >= HAPTIC_EVENTS[nextHapticEventIndex].time) {
            const event = HAPTIC_EVENTS[nextHapticEventIndex];
            flash(event.intensity);
            playImpactSound(event.intensity);

            // Emissive flash on relevant object
            if (event.label === 'IMPACT' || event.label === 'BOUNCE') {
                ball.material.emissiveIntensity = 0.3 + event.intensity * 0.7;
            } else if (event.label === 'HIT') {
                const blockIdx = nextHapticEventIndex - 4; // events 4,5,6 = blocks 0,1,2
                if (blockIdx >= 0 && blockIdx < blocks.length) {
                    blocks[blockIdx].material.emissiveIntensity = 0.3 + event.intensity * 0.7;
                }
            } else if (event.label === 'CRASH') {
                blocks.forEach(b => b.material.emissiveIntensity = 0.8);
                wall.material.opacity = 0.9;
            }

            nextHapticEventIndex++;
        }

        // Decay emissive
        ball.material.emissiveIntensity *= 0.97;
        if (ball.material.emissiveIntensity < 0.1) ball.material.emissiveIntensity = 0.1;
        blocks.forEach(b => {
            b.material.emissiveIntensity *= 0.96;
            if (b.material.emissiveIntensity < 0.05) b.material.emissiveIntensity = 0.05;
        });
        wall.material.opacity += (0.6 - wall.material.opacity) * 0.05;

        // End of animation
        if (progress >= 1) {
            isPlaying = false;
            btnPlay.disabled = false;
            playIcon.textContent = '▶';
            playText.textContent = 'Replay';
            playHint.textContent = 'Tap to play again';
        }
    }

    // Subtle ambient animation
    const t = clock.getElapsedTime();
    warmLight.position.x = 6 + Math.sin(t * 0.3) * 1;
    warmLight.position.z = 4 + Math.cos(t * 0.4) * 1;

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
