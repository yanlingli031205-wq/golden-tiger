// 1. 引入样式 (关键修复！)
import './style.css'; 

import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import gsap from 'gsap';

// ==========================================
// 1. 核心 Shader 动画 (保持不变)
// ==========================================
const globalUniforms = { uExpansion: { value: 0.0 } };

function setupExplosionMaterial(material) {
    material.onBeforeCompile = (shader) => {
        shader.uniforms.uExpansion = globalUniforms.uExpansion;
        shader.vertexShader = `
            attribute vec3 aDirection;
            attribute float aSpeed;
            attribute vec3 aRotationAxis;
            uniform float uExpansion;
            mat4 rotationMatrix(vec3 axis, float angle) {
                axis = normalize(axis);
                float s = sin(angle);
                float c = cos(angle);
                float oc = 1.0 - c;
                return mat4(oc * axis.x * axis.x + c, oc * axis.x * axis.y - axis.z * s, oc * axis.z * axis.x + axis.y * s, 0.0,
                            oc * axis.x * axis.y + axis.z * s, oc * axis.y * axis.y + c, oc * axis.y * axis.z - axis.x * s, 0.0,
                            oc * axis.z * axis.x - axis.y * s, oc * axis.y * axis.z + axis.x * s, oc * axis.z * axis.z + c, 0.0,
                            0.0, 0.0, 0.0, 1.0);
            }
        ` + shader.vertexShader;
        shader.vertexShader = shader.vertexShader.replace(
            '#include <begin_vertex>',
            `#include <begin_vertex>
            float progress = uExpansion * aSpeed;
            vec3 offset = aDirection * progress * 8.0; 
            transformed += offset;
            if (progress > 0.01) {
                mat4 rot = rotationMatrix(aRotationAxis, progress * 2.5);
                transformed = (rot * vec4(transformed, 1.0)).xyz;
            }`
        );
    };
}

function fillAttributes(geometry, count, getDirFunc, getSpeedFunc) {
    const directions = []; const speeds = []; const axes = []; const dummyDir = new THREE.Vector3();
    for (let i = 0; i < count; i++) {
        getDirFunc(i, dummyDir);
        directions.push(dummyDir.x, dummyDir.y, dummyDir.z);
        speeds.push(getSpeedFunc(i));
        axes.push(Math.random(), Math.random(), Math.random());
    }
    geometry.setAttribute('aDirection', new THREE.InstancedBufferAttribute(new Float32Array(directions), 3));
    geometry.setAttribute('aSpeed', new THREE.InstancedBufferAttribute(new Float32Array(speeds), 1));
    geometry.setAttribute('aRotationAxis', new THREE.InstancedBufferAttribute(new Float32Array(axes), 3));
}

// ==========================================
// 2. 场景与灯光 (恢复高级感设置)
// ==========================================
const scene = new THREE.Scene();
scene.background = new THREE.Color('#030504'); // 经典深绿黑
scene.fog = new THREE.FogExp2('#030504', 0.02);

const camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 100);
camera.position.set(0, 0, 18);

const renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: "high-performance" });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.2; // 亮度恢复正常
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
document.getElementById('app').appendChild(renderer.domElement);

// 灯光 (恢复明亮温馨的设置)
const ambientLight = new THREE.AmbientLight('#112211', 0.6);
scene.add(ambientLight);

const mainLight = new THREE.DirectionalLight('#FFDDAA', 2.2);
mainLight.position.set(6, 8, 8);
mainLight.castShadow = true;
scene.add(mainLight);

const rimLight = new THREE.SpotLight('#6688AA', 2.0);
rimLight.position.set(-10, 5, -5);
scene.add(rimLight);

const treeGroup = new THREE.Group();
treeGroup.scale.set(0.75, 0.75, 0.75);
treeGroup.position.y = -4.5;
scene.add(treeGroup);

// ==========================================
// 3. 资产生成 (恢复珍珠版材质)
// ==========================================

// A. 柔光五角星 (Star)
const starShape = new THREE.Shape();
const points = 5;
for (let i = 0; i < points * 2; i++) {
    const r = (i % 2 === 0) ? 0.8 : 0.4; // 胖一点
    const a = (i / (points * 2)) * Math.PI * 2 - Math.PI / 2;
    const x = Math.cos(a) * r; const y = Math.sin(a) * r;
    if (i === 0) starShape.moveTo(x, y); else starShape.lineTo(x, y);
}
starShape.closePath();
const starGeo = new THREE.ExtrudeGeometry(starShape, { depth: 0.3, bevelEnabled: true, bevelThickness: 0.1, bevelSize: 0.1, bevelSegments: 4 });
starGeo.center();
const starMat = new THREE.MeshStandardMaterial({
    color: '#FFFDEE', 
    emissive: '#FFCC66', 
    emissiveIntensity: 0.8, // 恢复高亮度
    roughness: 0.4, 
    metalness: 0.6
});
const topStar = new THREE.Mesh(starGeo, starMat);
topStar.position.y = 11.2;
topStar.name = "MagicStar"; // 射线检测用
treeGroup.add(topStar);

// B. 祖母绿针叶
const NEEDLE_COUNT = 20000;
const needleGeo = new THREE.ConeGeometry(0.06, 0.25, 3);
const needleMat = new THREE.MeshStandardMaterial({ color: '#042818', roughness: 0.85, metalness: 0.05 });
setupExplosionMaterial(needleMat);
const needleMesh = new THREE.InstancedMesh(needleGeo, needleMat, NEEDLE_COUNT);
needleMesh.receiveShadow = true;
treeGroup.add(needleMesh);
const needleDirs = [];
const dummy = new THREE.Object3D();
for (let i = 0; i < NEEDLE_COUNT; i++) {
    const y = Math.pow(Math.random(), 1.6) * 11;
    const r = (Math.random() * 0.6 + 0.4) * (3.6 * (1 - y / 11.5) + 0.3);
    const angle = Math.random() * Math.PI * 2;
    const x = Math.cos(angle) * r; const z = Math.sin(angle) * r;
    dummy.position.set(x, y, z);
    dummy.lookAt(0, y, 0); dummy.rotateX(Math.PI / 2 + 0.35);
    const s = Math.random() * 0.5 + 0.5; dummy.scale.set(s, s, s);
    dummy.updateMatrix(); needleMesh.setMatrixAt(i, dummy.matrix);
    needleDirs.push({x, y, z});
}
fillAttributes(needleGeo, NEEDLE_COUNT, (i,v)=>v.set(needleDirs[i].x, needleDirs[i].y*0.1, needleDirs[i].z).normalize(), ()=>Math.random()*0.5+0.2);

// C. 柔光奶油珍珠 (恢复！)
const PEARL_COUNT = 700;
const pearlGeo = new THREE.SphereGeometry(0.12, 32, 32);
const pearlMat = new THREE.MeshStandardMaterial({
    color: '#FFF0E0', roughness: 0.7, metalness: 0.1, emissive: '#443322', emissiveIntensity: 0.3
});
setupExplosionMaterial(pearlMat);
const pearlMesh = new THREE.InstancedMesh(pearlGeo, pearlMat, PEARL_COUNT);
pearlMesh.castShadow = true;
treeGroup.add(pearlMesh);
const pearlDirs = [];
for(let i=0; i<PEARL_COUNT; i++) {
    const y = Math.random() * 10;
    const r = (3.6 * (1 - y/11.5) + 0.3) * (0.92 + Math.random()*0.15);
    const angle = Math.random() * Math.PI * 2;
    const x = Math.cos(angle) * r; const z = Math.sin(angle) * r;
    dummy.position.set(x, y, z);
    dummy.scale.set(Math.random()*0.3+0.7, Math.random()*0.3+0.7, Math.random()*0.3+0.7);
    dummy.updateMatrix(); pearlMesh.setMatrixAt(i, dummy.matrix);
    pearlDirs.push({x, y, z});
}
fillAttributes(pearlGeo, PEARL_COUNT, (i,v)=>v.set(pearlDirs[i].x, pearlDirs[i].y-5, pearlDirs[i].z).normalize(), ()=>Math.random()*0.8+0.5);

// D. 香槟金丝带
const RIBBON_COUNT = 2500;
const ribbonGeo = new THREE.BoxGeometry(0.12, 0.02, 0.3);
const ribbonMat = new THREE.MeshStandardMaterial({ color: '#FFDD88', roughness: 0.2, metalness: 0.8, transparent: true, opacity: 0.7, blending: THREE.AdditiveBlending });
setupExplosionMaterial(ribbonMat);
const ribbonMesh = new THREE.InstancedMesh(ribbonGeo, ribbonMat, RIBBON_COUNT);
treeGroup.add(ribbonMesh);
const ribbonDirs = [];
for(let i=0; i<RIBBON_COUNT; i++) {
    const t = i/RIBBON_COUNT; const y = t*10.5; const r = 4.0*(1-y/11.5)+0.5; const a = t*Math.PI*2*5.5;
    const x = Math.cos(a)*r; const z = Math.sin(a)*r;
    dummy.position.set(x,y,z);
    dummy.lookAt(Math.cos(a+0.1)*r, y+0.5, Math.sin(a+0.1)*r);
    dummy.scale.set(1,1,Math.random()*0.5+1);
    dummy.updateMatrix(); ribbonMesh.setMatrixAt(i, dummy.matrix);
    ribbonDirs.push({x,z});
}
fillAttributes(ribbonGeo, RIBBON_COUNT, (i,v)=>v.set(ribbonDirs[i].x, 0, ribbonDirs[i].z).normalize(), ()=>Math.random()*0.5+0.8);

// ==========================================
// 4. 文字粒子系统 (Wish Particles)
// ==========================================
let wishParticles = null;
function createWishParticles(text) {
    if (wishParticles) {
        treeGroup.remove(wishParticles);
        wishParticles.geometry.dispose();
    }
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    canvas.width = 512; canvas.height = 128;
    ctx.font = 'bold 80px "Cinzel", serif'; // 用 Cinzel 字体
    ctx.fillStyle = 'white'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(text, 256, 64);
    const imgData = ctx.getImageData(0,0,512,128).data;
    const particles = [];
    for(let y=0; y<128; y+=2) {
        for(let x=0; x<512; x+=2) {
            if(imgData[(y*512 + x)*4] > 128) {
                const u = (x / 512 - 0.5) * 8; 
                const v = (1 - y / 128) * 2 + 5; 
                particles.push({x: u, y: v, z: 3.5}); // 浮在树前面
            }
        }
    }
    const pCount = particles.length;
    const pGeo = new THREE.OctahedronGeometry(0.03, 0);
    const pMat = new THREE.MeshBasicMaterial({ color: 0xFFD700, blending: THREE.AdditiveBlending });
    setupExplosionMaterial(pMat); // 注入爆炸
    wishParticles = new THREE.InstancedMesh(pGeo, pMat, pCount);
    treeGroup.add(wishParticles);
    const dummyP = new THREE.Object3D();
    const pDirs = []; const pSpeeds = [];
    for(let i=0; i<pCount; i++) {
        dummyP.position.set(particles[i].x, particles[i].y, particles[i].z);
        dummyP.rotation.set(Math.random(),Math.random(),Math.random());
        dummyP.updateMatrix(); wishParticles.setMatrixAt(i, dummyP.matrix);
        pDirs.push(Math.random()-0.5, Math.random()-0.5, 1.0); // 向前炸
        pSpeeds.push(Math.random()*2 + 1);
    }
    fillAttributes(wishParticles.geometry, pCount, (i,v)=>v.set(pDirs[i*3], pDirs[i*3+1], pDirs[i*3+2]).normalize(), (i)=>pSpeeds[i]);
    
    // 生成特效：文字闪烁一下
    gsap.from(wishParticles.material, { opacity: 0, duration: 1 });
}

// ==========================================
// 5. 交互与弹窗
// ==========================================
const raycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2();
const modal = document.getElementById('wish-modal');
const input = document.getElementById('wish-input');
const introText = document.getElementById('intro-text');

let isModalOpen = false;

window.addEventListener('pointerdown', (event) => {
    if (isModalOpen) return;

    // 点