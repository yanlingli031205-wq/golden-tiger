import './style.css'; 
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import gsap from 'gsap';

// UI 进场动画
gsap.to('.title-en', { opacity: 1, x: 0, duration: 2.5, ease: "power2.out", delay: 1 });
gsap.to('.title-cn', { opacity: 1, x: 0, duration: 2.5, ease: "power2.out", delay: 1.5 });
gsap.to('.hint', { opacity: 0.6, duration: 3, delay: 3 });

// ==========================================
// 1. 核心 Shader: 注入奔跑动画逻辑
// ==========================================
const globalUniforms = { 
    uTime: { value: 0 },
    uSpeed: { value: 1.0 }
};

function setupTigerMaterial(material) {
    material.onBeforeCompile = (shader) => {
        shader.uniforms.uTime = globalUniforms.uTime;
        shader.uniforms.uSpeed = globalUniforms.uSpeed;
        
        shader.vertexShader = `
            uniform float uTime;
            uniform float uSpeed;
            attribute vec3 aOffset;
            attribute float aPhase;
            attribute float aPart;
            mat4 rotateX(float angle) {
                float s = sin(angle); float c = cos(angle);
                return mat4(1,0,0,0, 0,c,-s,0, 0,s,c,0, 0,0,0,1);
            }
            ${shader.vertexShader}
        `;
        
        shader.vertexShader = shader.vertexShader.replace(
            '#include <begin_vertex>',
            `
            #include <begin_vertex>
            float t = uTime * 4.0 * uSpeed;
            if (aPart < 0.5) {
                transformed.y += sin(t * 2.0) * 0.1; 
                transformed.x += sin(t) * 0.05;
            } else if (aPart < 1.5) {
                transformed.y += sin(t * 2.0 - 0.5) * 0.1;
            } else if (aPart < 2.5) {
                float runCycle = t + aPhase;
                transformed.y += sin(runCycle) * 0.5;
                transformed.z += cos(runCycle) * 0.8;
            } else {
                float wave = sin(t + transformed.x * 2.0);
                transformed.y += wave * 0.2;
                transformed.z += cos(t) * 0.1;
            }
            transformed += normal * sin(uTime * 5.0 + transformed.y * 10.0) * 0.02;
            `
        );
    };
}

function fillTigerAttributes(geometry, count, partID, getPhase) {
    const parts = new Float32Array(count).fill(partID);
    const phases = new Float32Array(count);
    for(let i=0; i<count; i++) phases[i] = getPhase(i);
    geometry.setAttribute('aPart', new THREE.InstancedBufferAttribute(parts, 1));
    geometry.setAttribute('aPhase', new THREE.InstancedBufferAttribute(phases, 1));
}

// ==========================================
// 2. 场景与灯光
// ==========================================
const scene = new THREE.Scene();
scene.background = new THREE.Color('#000000');
scene.fog = new THREE.FogExp2('#000000', 0.02);

const camera = new THREE.PerspectiveCamera(35, window.innerWidth / window.innerHeight, 0.1, 100);
camera.position.set(-8, 1, 15); 
camera.lookAt(0, 0, 0);

const renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: "high-performance" });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;
document.getElementById('app').appendChild(renderer.domElement);

const ambientLight = new THREE.AmbientLight('#111111', 1.0);
scene.add(ambientLight);

const rimLight = new THREE.SpotLight('#4466ff', 10.0);
rimLight.position.set(-5, 5, -10);
rimLight.lookAt(0,0,0);
rimLight.penumbra = 0.5;
scene.add(rimLight);

const keyLight = new THREE.DirectionalLight('#FFD700', 2.0);
keyLight.position.set(5, 5, 5);
scene.add(keyLight);

// ==========================================
// 3. 粒子猛虎
// ==========================================
const tigerGroup = new THREE.Group();
scene.add(tigerGroup);

const tigerMat = new THREE.MeshStandardMaterial({ 
    color: '#FFD700', roughness: 0.15, metalness: 1.0, 
    emissive: '#332200', emissiveIntensity: 0.2 
});
setupTigerMaterial(tigerMat);

function createPart(count, scale, pos, partID, phaseFunc) {
    const geo = new THREE.OctahedronGeometry(0.04, 0); 
    const mesh = new THREE.InstancedMesh(geo, tigerMat, count);
    const dummy = new THREE.Object3D();
    for(let i=0; i<count; i++) {
        const x = (Math.random()-0.5); const y = (Math.random()-0.5); const z = (Math.random()-0.5);
        if(x*x+y*y+z*z > 0.25) { i--; continue; }
        dummy.position.set(x*2, y*2, z*2);
        dummy.rotation.set(Math.random()*3, Math.random()*3, Math.random()*3);
        dummy.scale.setScalar(Math.random()*0.8 + 0.2);
        dummy.updateMatrix();
        mesh.setMatrixAt(i, dummy.matrix);
    }
    fillTigerAttributes(geo, count, partID, phaseFunc || (() => 0));
    mesh.scale.set(scale.x, scale.y, scale.z);
    mesh.position.set(pos.x, pos.y, pos.z);
    tigerGroup.add(mesh);
    return mesh;
}

createPart(2000, {x:4.5, y:1.5, z:1.5}, {x:0, y:0, z:0}, 0); // 身
const headMesh = createPart(800, {x:1.4, y:1.4, z:1.4}, {x:2.5, y:0.8, z:0}, 1); // 头
const headHitbox = new THREE.Mesh(new THREE.SphereGeometry(1.0), new THREE.MeshBasicMaterial({visible:false}));
headHitbox.position.copy(headMesh.position);
tigerGroup.add(headHitbox);
const legScale = {x:0.6, y:2.2, z:0.6};
createPart(400, legScale, {x:1.5, y:-1.2, z:0.6}, 2, ()=>0); 
createPart(400, legScale, {x:1.5, y:-1.2, z:-0.6}, 2, ()=>Math.PI);
createPart(400, legScale, {x:-1.5, y:-1.2, z:0.6}, 2, ()=>Math.PI);
createPart(400, legScale, {x:-1.5, y:-1.2, z:-0.6}, 2, ()=>0);
createPart(300, {x:2.5, y:0.2, z:0.2}, {x:-3.5, y:0.5, z:0}, 3); // 尾

// ==========================================
// 4. 文字粒子系统
// ==========================================
let textMesh = null;
function createWishText(text) {
    if (textMesh) { tigerGroup.remove(textMesh); textMesh.geometry.dispose(); }
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    canvas.width = 512; canvas.height = 128;
    ctx.font = 'bold 80px "Noto Serif SC", serif';
    ctx.fillStyle = 'white'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(text, 256, 64);
    const imgData = ctx.getImageData(0,0,512,128).data;
    const particles = [];
    for(let y=0; y<128; y+=2) {
        for(let x=0; x<512; x+=2) {
            if(imgData[(y*512+x)*4] > 128) {
                particles.push({x: (x/512 - 0.5) * 8, y: (1 - y/128) * 2 + 1.5, z: 2});
            }
        }
    }
    const geo = new THREE.OctahedronGeometry(0.03, 0);
    const mat = new THREE.MeshBasicMaterial({ color: 0xFFD700, transparent: true, opacity: 0 });
    textMesh = new THREE.InstancedMesh(geo, mat, particles.length);
    const dummy = new THREE.Object3D();
    for(let i=0; i<particles.length; i++) {
        dummy.position.set(particles[i].x, particles[i].y, particles[i].z);
        dummy.updateMatrix(); textMesh.setMatrixAt(i, dummy.matrix);
    }
    tigerGroup.add(textMesh);
    gsap.to(textMesh.material, { opacity: 1, duration: 2 });
    gsap.to(textMesh.position, { x: -5, duration: 10, ease: "none" });
}

// ==========================================
// 5. 交互与渲染
// ==========================================
const raycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2();
const modal = document.getElementById('wish-modal');
const input = document.getElementById('wish-input');
const closeBtn = document.getElementById('close-modal');
const submitBtn = document.getElementById('wish-submit');
let isModalOpen = false;

window.addEventListener('pointerdown', (event) => {
    if (isModalOpen) return;
    mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
    mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;
    raycaster.setFromCamera(mouse, camera);
    if (raycaster.intersectObject(headHitbox).length > 0) {
        gsap.to(globalUniforms.uSpeed, { value: 0.1, duration: 0.5, yoyo: true, repeat: 1 });
        gsap.to(bloomPass, { strength: 2.5, radius: 1.0, duration: 0.2, yoyo: true, repeat: 1 });
        setTimeout(openModal, 300);
    }
});

function openModal() {
    isModalOpen = true; modal.classList.add('visible'); modal.classList.remove('hidden'); input.focus();
    gsap.to('#ui-layer', { opacity: 0, duration: 0.5 });
}
function closeModal() {
    isModalOpen = false; modal.classList.remove('visible'); setTimeout(() => modal.classList.add('hidden'), 800);
    gsap.to('#ui-layer', { opacity: 1, duration: 1 });
}
submitBtn.addEventListener('click', () => { if(input.value.trim()) { createWishText(input.value.trim()); closeModal(); input.value = ''; }});
closeBtn.addEventListener('click', closeModal);

const renderScene = new RenderPass(scene, camera);
const bloomPass = new UnrealBloomPass(new THREE.Vector2(window.innerWidth, window.innerHeight), 1.0, 0.2, 0.85);
const composer = new EffectComposer(renderer);
composer.addPass(renderScene);
composer.addPass(bloomPass);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true; controls.enableZoom = false; controls.maxPolarAngle = Math.PI / 1.6;
const clock = new THREE.Clock();

function animate() {
    requestAnimationFrame(animate);
    const time = clock.getElapsedTime();
    globalUniforms.uTime.value = time;
    camera.position.x = -8 + Math.sin(time * 0.2) * 0.5;
    camera.position.y = 1 + Math.cos(time * 0.3) * 0.2;
    camera.lookAt(0,0,0);
    controls.update();
    composer.render();
}
window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
    composer.setSize(window.innerWidth, window.innerHeight);
});
animate();