import * as THREE from 'three';
import { WebHaptics } from 'web-haptics';

// ============================================
// Haptics
// ============================================
const haptics = new WebHaptics();

// ============================================
// Web Audio — impact sounds
// ============================================
let audioCtx = null;

function unlockAudio() {
    if (audioCtx) {
        if (audioCtx.state === 'suspended') audioCtx.resume();
        return;
    }
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    if (audioCtx.state === 'suspended') audioCtx.resume();
}

function playImpactSound(intensity) {
    if (!audioCtx || audioCtx.state !== 'running') return;
    const now = audioCtx.currentTime;
    const duration = 0.03 + intensity * 0.06;
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
    gain.gain.setValueAtTime(0.12 + intensity * 0.28, now);
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
        osc.frequency.exponentialRampToValueAtTime(25, now + duration * 1.5);
        const oscGain = audioCtx.createGain();
        oscGain.gain.setValueAtTime(intensity * 0.2, now);
        oscGain.gain.exponentialRampToValueAtTime(0.001, now + duration * 1.5);
        osc.connect(oscGain);
        oscGain.connect(audioCtx.destination);
        osc.start(now);
        osc.stop(now + duration * 1.5);
    }
}

// ============================================
// UI
// ============================================
const canvas = document.getElementById('webgl-canvas');
const tapArea = document.getElementById('tap-area');
const promptIcon = document.getElementById('prompt-icon');
const promptText = document.getElementById('prompt-text');
const promptSub = document.getElementById('prompt-sub');
const stepCurrent = document.getElementById('step-current');
const collisionFlash = document.getElementById('collision-flash');
let flashTimeout = null;

function flash(color, intensity) {
    collisionFlash.style.background =
        `radial-gradient(circle at center, ${color}${Math.round(intensity * 60).toString(16).padStart(2, '0')}, transparent 70%)`;
    collisionFlash.classList.add('active');
    clearTimeout(flashTimeout);
    flashTimeout = setTimeout(() => collisionFlash.classList.remove('active'), 80 + intensity * 80);
}

// ============================================
// Three.js Scene
// ============================================
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0a0a1a);
scene.fog = new THREE.FogExp2(0x0a0a1a, 0.02);

const camera = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 0.1, 100);
camera.position.set(3, 3, 8);
camera.lookAt(1.5, 1, 0);

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
const ground = new THREE.Mesh(
    new THREE.BoxGeometry(20, 0.2, 10),
    new THREE.MeshStandardMaterial({ color: 0x14142e, roughness: 0.8, metalness: 0.2 })
);
ground.position.y = -0.1;
ground.receiveShadow = true;
scene.add(ground);

const grid = new THREE.GridHelper(20, 40, 0x2a2a4a, 0x1a1a3a);
grid.position.y = 0.01;
scene.add(grid);

// Ball (sphere)
const ball = new THREE.Mesh(
    new THREE.SphereGeometry(0.5, 48, 48),
    new THREE.MeshStandardMaterial({
        color: 0x6366f1, roughness: 0.15, metalness: 0.8,
        emissive: 0x4338ca, emissiveIntensity: 0.1,
    })
);
ball.castShadow = true;
ball.position.set(-2, 6, 0);
scene.add(ball);

// 3 Blocks
const blockColors = [0xf59e0b, 0xef4444, 0x10b981];
const blocks = blockColors.map((color, i) => {
    const mesh = new THREE.Mesh(
        new THREE.BoxGeometry(0.8, 0.8, 0.8),
        new THREE.MeshStandardMaterial({
            color, roughness: 0.25, metalness: 0.7,
            emissive: color, emissiveIntensity: 0.05,
        })
    );
    mesh.position.set(2.5 + i * 1.4, 0.4, 0);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    scene.add(mesh);
    return mesh;
});

// Wall
const wall = new THREE.Mesh(
    new THREE.BoxGeometry(0.3, 2.5, 3),
    new THREE.MeshStandardMaterial({
        color: 0x1e1e3e, roughness: 0.6, metalness: 0.3,
        transparent: true, opacity: 0.6,
    })
);
wall.position.set(7, 1.25, 0);
wall.receiveShadow = true;
scene.add(wall);

// ============================================
// Animation helpers
// ============================================
function easeInQuad(t) { return t * t; }
function easeOutQuad(t) { return t * (2 - t); }
function easeOutCubic(t) { return 1 - Math.pow(1 - t, 3); }
function easeOutBounce(t) {
    if (t < 1 / 2.75) return 7.5625 * t * t;
    if (t < 2 / 2.75) return 7.5625 * (t -= 1.5 / 2.75) * t + 0.75;
    if (t < 2.5 / 2.75) return 7.5625 * (t -= 2.25 / 2.75) * t + 0.9375;
    return 7.5625 * (t -= 2.625 / 2.75) * t + 0.984375;
}
function lerp(a, b, t) { return a + (b - a) * Math.min(1, Math.max(0, t)); }

// ============================================
// Step definitions — each is triggered by a tap
// ============================================
// Each step: { hapticPreset, duration, prompt, icon, animate(progress 0-1) }
const steps = [
    // Step 0: Ball drops from height → hits ground
    {
        hapticPreset: 'heavy',
        duration: 800,
        icon: '💥',
        prompt: 'Drop!',
        sub: 'Ball falls and impacts the ground',
        animate(p) {
            const fallP = Math.min(p / 0.3, 1); // fall in first 30%
            if (fallP < 1) {
                ball.position.y = lerp(6, 0.5, easeInQuad(fallP));
            } else {
                // Squash and recover
                const recoverP = (p - 0.3) / 0.7;
                const squash = 1 - 0.3 * Math.exp(-recoverP * 8) * Math.cos(recoverP * 20);
                ball.position.y = 0.5;
                ball.scale.set(1 + (1 - squash) * 0.3, squash, 1 + (1 - squash) * 0.3);
            }
            if (p < 0.05) {
                flash('rgba(99, 102, 241,', 1.0);
                ball.material.emissiveIntensity = 1.0;
            }
        },
    },

    // Step 1: First bounce
    {
        hapticPreset: 'medium',
        duration: 600,
        icon: '🔵',
        prompt: 'Bounce!',
        sub: 'First bounce — medium impact',
        animate(p) {
            ball.scale.set(1, 1, 1);
            const bounceH = 3.0;
            ball.position.y = 0.5 + bounceH * Math.sin(p * Math.PI);
            if (p < 0.05) {
                flash('rgba(99, 102, 241,', 0.7);
                ball.material.emissiveIntensity = 0.8;
            }
        },
    },

    // Step 2: Second bounce (smaller)
    {
        hapticPreset: 'light',
        duration: 500,
        icon: '🟣',
        prompt: 'Bounce!',
        sub: 'Second bounce — lighter',
        animate(p) {
            const bounceH = 1.5;
            ball.position.y = 0.5 + bounceH * Math.sin(p * Math.PI);
            if (p < 0.05) {
                flash('rgba(99, 102, 241,', 0.4);
                ball.material.emissiveIntensity = 0.5;
            }
        },
    },

    // Step 3: Ball rolls toward blocks
    {
        hapticPreset: 'soft',
        duration: 1000,
        icon: '🎱',
        prompt: 'Roll',
        sub: 'Ball rolls toward the blocks',
        animate(p) {
            ball.position.x = lerp(-2, 2.0, easeOutCubic(p));
            ball.position.y = 0.5;
            ball.rotation.z -= 0.15; // rolling
        },
    },

    // Step 4: Ball hits Block 1 → Block 1 slides
    {
        hapticPreset: 'nudge',
        duration: 500,
        icon: '💛',
        prompt: 'Hit!',
        sub: 'Ball strikes Block 1',
        animate(p) {
            // Ball decelerates
            ball.position.x = lerp(2.0, 1.8, easeOutQuad(p));
            // Block 1 slides
            blocks[0].position.x = lerp(2.5, 3.6, easeOutCubic(p));
            blocks[0].rotation.y = lerp(0, 0.15, easeOutQuad(p));
            if (p < 0.05) {
                flash('rgba(245, 158, 11,', 0.6);
                blocks[0].material.emissiveIntensity = 0.9;
            }
        },
    },

    // Step 5: Block 1 hits Block 2 → Block 2 slides
    {
        hapticPreset: 'nudge',
        duration: 500,
        icon: '❤️',
        prompt: 'Chain!',
        sub: 'Block 1 hits Block 2 → chain reaction',
        animate(p) {
            // Block 2 slides, Block 3 slides
            blocks[1].position.x = lerp(3.9, 5.0, easeOutCubic(p));
            blocks[1].rotation.y = lerp(0, -0.2, easeOutQuad(p));
            // Block 3 gets pushed too (at half delay)
            if (p > 0.4) {
                const p3 = (p - 0.4) / 0.6;
                blocks[2].position.x = lerp(5.3, 6.5, easeOutCubic(p3));
                blocks[2].rotation.y = lerp(0, 0.25, easeOutQuad(p3));
            }
            if (p < 0.05) {
                flash('rgba(239, 68, 68,', 0.5);
                blocks[1].material.emissiveIntensity = 0.9;
            }
            if (p > 0.4 && p < 0.45) {
                blocks[2].material.emissiveIntensity = 0.8;
            }
        },
    },

    // Step 6: Block 3 crashes into wall
    {
        hapticPreset: 'heavy',
        duration: 1000,
        icon: '💥',
        prompt: 'Crash!',
        sub: 'Final block crashes into the wall!',
        animate(p) {
            // Wall shake
            if (p < 0.5) {
                const shake = Math.exp(-p * 10) * Math.sin(p * 80);
                wall.position.x = 7 + shake * 0.08;
                wall.position.z = shake * 0.05;
            } else {
                wall.position.x = 7;
                wall.position.z = 0;
            }

            // All blocks glow
            if (p < 0.05) {
                flash('rgba(16, 185, 129,', 0.9);
                blocks.forEach(b => { b.material.emissiveIntensity = 1.0; });
                wall.material.opacity = 1.0;
            }
        },
    },
];

const TOTAL_STEPS = steps.length;
document.getElementById('step-total').textContent = TOTAL_STEPS;

// ============================================
// State
// ============================================
let currentStep = -1; // -1 = not started
let animating = false;
let animStartTime = 0;
let currentStepData = null;

function setPrompt(icon, text, sub) {
    promptIcon.textContent = icon;
    promptText.textContent = text;
    promptSub.textContent = sub;
}

function resetAllObjects() {
    ball.position.set(-2, 6, 0);
    ball.scale.set(1, 1, 1);
    ball.rotation.set(0, 0, 0);
    ball.material.emissiveIntensity = 0.1;
    blocks.forEach((b, i) => {
        b.position.set(2.5 + i * 1.4, 0.4, 0);
        b.rotation.set(0, 0, 0);
        b.material.emissiveIntensity = 0.05;
    });
    wall.position.set(7, 1.25, 0);
    wall.material.opacity = 0.6;
}

function showNextPrompt() {
    const nextStep = currentStep + 1;
    if (nextStep >= TOTAL_STEPS) {
        // Finished — show replay
        setPrompt('🔄', 'Replay', 'Tap to watch the animation again');
    } else {
        const s = steps[nextStep];
        setPrompt(s.icon, s.prompt, s.sub);
    }
}

// ============================================
// Tap handler — triggers next step in USER GESTURE CONTEXT
// ============================================
tapArea.addEventListener('click', () => {
    if (animating) return;

    unlockAudio();

    // If finished all steps, restart
    if (currentStep >= TOTAL_STEPS - 1) {
        currentStep = -1;
        resetAllObjects();
    }

    // Advance to next step
    currentStep++;
    stepCurrent.textContent = currentStep + 1;

    const step = steps[currentStep];
    currentStepData = step;

    // HAPTIC — triggered in user gesture context!
    haptics.trigger(step.hapticPreset);

    // Audio impact
    const intensity = step.hapticPreset === 'heavy' ? 1.0 :
        step.hapticPreset === 'medium' ? 0.7 :
            step.hapticPreset === 'nudge' ? 0.6 :
                step.hapticPreset === 'soft' ? 0.3 : 0.4;
    playImpactSound(intensity);

    // Start animation
    animating = true;
    animStartTime = performance.now();
});

// ============================================
// Animation loop
// ============================================
const clock = new THREE.Clock();

function animate() {
    requestAnimationFrame(animate);

    if (animating && currentStepData) {
        const elapsed = performance.now() - animStartTime;
        const progress = Math.min(elapsed / currentStepData.duration, 1);

        currentStepData.animate(progress);

        if (progress >= 1) {
            animating = false;
            currentStepData = null;
            showNextPrompt();
        }
    }

    // Decay emissive on all objects
    ball.material.emissiveIntensity *= 0.97;
    if (ball.material.emissiveIntensity < 0.1) ball.material.emissiveIntensity = 0.1;
    blocks.forEach(b => {
        b.material.emissiveIntensity *= 0.96;
        if (b.material.emissiveIntensity < 0.05) b.material.emissiveIntensity = 0.05;
    });
    wall.material.opacity += (0.6 - wall.material.opacity) * 0.03;

    // Ambient
    const t = clock.getElapsedTime();
    warmLight.position.x = 6 + Math.sin(t * 0.3);
    warmLight.position.z = 4 + Math.cos(t * 0.4);

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
// Init
// ============================================
showNextPrompt();
animate();
