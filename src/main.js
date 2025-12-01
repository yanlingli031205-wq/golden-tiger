import './style.css'; 
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import gsap from 'gsap';

// ==========================================
// 1. 核心 Shader (保持滚轮爆炸功能)
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
// 2. 场景与灯光
// ==========================================
const scene = new THREE.Scene();
scene.background = new THREE.Color('#050505'); // 纯黑背景
scene.fog = new THREE.FogExp2('#050505', 0.03);

const camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 100);
camera.position.set(0, 2, 18); // 稍微抬高视角

const renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: "high-performance" });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;
document.getElementById('app').appendChild(renderer.domElement);

const ambientLight = new THREE.AmbientLight('#222222', 1.0);
scene.add(ambientLight);

const mainLight = new THREE.DirectionalLight('#FFD700', 3.0);
mainLight.position.set(5, 5, 10);
scene.add(mainLight);

const rimLight = new THREE.SpotLight('#44aaff', 5.0);
rimLight.position.set(-10, 5, -5);
scene.add(rimLight);

// ==========================================
// 3. 构建粒子猛虎 (Procedural Particle Tiger)
// ==========================================
const tigerGroup = new THREE.Group();
tigerGroup.position.x = -4.0; // 【关键】老虎在左边奔跑
scene.add(tigerGroup);

// 通用材质
const goldMat = new THREE.MeshStandardMaterial({ 
    color: '#FFD700', roughness: 0.2, metalness: 1.0, 
    emissive: '#AA6600', emissiveIntensity: 0.2 
});
setupExplosionMaterial(goldMat);

const blackMat = new THREE.MeshStandardMaterial({ 
    color: '#111111', roughness: 0.9, metalness: 0.5 
});
setupExplosionMaterial(blackMat);

// 辅助：创建一个装满粒子的形状
function createParticleShape(geometry, count, material, scaleMult=1) {
    const mesh = new THREE.InstancedMesh(new THREE.OctahedronGeometry(0.05 * scaleMult, 0), material, count);
    const dummy = new THREE.Object3D();
    const dirs = []; const speeds = [];
    
    // 在几何体表面/内部随机采样点
    // 这里简化：用包围盒范围内的随机点，然后判断是否在几何体内
    // 为了性能，我们直接用基础形状的数学公式分布
    
    for(let i=0; i<count; i++) {
        // 简单的立方体分布，靠 geometry 的形状决定最终位置不太容易
        // 我们直接把粒子挂载在 Group 下，形状由外部 Group 的缩放决定
        const x = (Math.random()-0.5);
        const y = (Math.random()-0.5);
        const z = (Math.random()-0.5);
        
        // 简单的球形过滤，让粒子聚集成团
        if (x*x + y*y + z*z > 0.25) { i--; continue; } 

        dummy.position.set(x*2, y*2, z*2); // 归一化到 -0.5 ~ 0.5
        dummy.rotation.set(Math.random()*Math.PI, Math.random()*Math.PI, 0);
        const s = Math.random() * 0.5 + 0.5;
        dummy.scale.set(s,s,s);
        dummy.updateMatrix();
        mesh.setMatrixAt(i, dummy.matrix);
        
        dirs.push(x, y, z);
        speeds.push(Math.random() + 0.5);
    }
    fillAttributes(mesh.geometry, count, (i,v)=>v.set(dirs[i*3], dirs[i*3+1], dirs[i*3+2]).normalize(), (i)=>speeds[i]);
    return mesh;
}

// --- 身体部件 (Body Parts) ---
const bodyGroup = new THREE.Group();
tigerGroup.add(bodyGroup);
// 身体：长条形的金色粒子云
const bodyMesh = createParticleShape(null, 2000, goldMat);
bodyMesh.scale.set(4, 1.5, 1.5); // 拉长
bodyGroup.add(bodyMesh);
// 条纹：少量的黑色粒子
const stripeMesh = createParticleShape(null, 500, blackMat);
stripeMesh.scale.set(4.1, 1.55, 1.55);
bodyGroup.add(stripeMesh);


// --- 头部 (Head) - 关键交互点 ---
const headGroup = new THREE.Group();
headGroup.position.set(2.2, 0.8, 0); // 身体前方
bodyGroup.add(headGroup);

// 头主体
const headMesh = createParticleShape(null, 800, goldMat);
headMesh.scale.set(1.2, 1.2, 1.2);
headGroup.add(headMesh);

// 隐形点击区 (Hitbox) - 用于射线检测
const headHitbox = new THREE.Mesh(
    new THREE.SphereGeometry(0.8, 16, 16),
    new THREE.MeshBasicMaterial({ visible: false })
);
headHitbox.name = "TigerHead";
headGroup.add(headHitbox);


// --- 四肢 (Legs) ---
// 辅助函数：创建一条腿
function createLeg(x, y, z) {
    const legG = new THREE.Group();
    legG.position.set(x, y, z);
    const legM = createParticleShape(null, 400, goldMat);
    legM.scale.set(0.6, 2.0, 0.6);
    legM.position.y = -1.0; // 枢轴在顶部
    legG.add(legM);
    return legG;
}

const legFL = createLeg(1.5, -0.5, 0.5);
const legFR = createLeg(1.5, -0.5, -0.5);
const legBL = createLeg(-1.5, -0.5, 0.5);
const legBR = createLeg(-1.5, -0.5, -0.5);
tigerGroup.add(legFL, legFR, legBL, legBR);

// --- 尾巴 (Tail) ---
const tailGroup = new THREE.Group();
tailGroup.position.set(-2.0, 0.2, 0);
const tailMesh = createParticleShape(null, 300, goldMat);
tailMesh.scale.set(2.0, 0.3, 0.3);
tailMesh.position.x = -1.0; // 向后延伸
tailGroup.add(tailMesh);
bodyGroup.add(tailGroup); // 尾巴连着身体


// ==========================================
// 4. 文字粒子系统 (在右侧生成)
// ==========================================
let textGroup = new THREE.Group();
textGroup.position.x = 3.0; // 【关键】放在右侧
scene.add(textGroup);

let wishParticles = null;

function createWishParticles(text) {
    if (wishParticles) {
        textGroup.remove(wishParticles);
        wishParticles.geometry.dispose();
    }
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    canvas.width = 512; canvas.height = 256; // 加高一点以防换行
    // 字体设置
    ctx.font = 'bold 60px "Cinzel", serif'; 
    ctx.fillStyle = 'white'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    
    // 简单的自动换行逻辑
    const words = text.split(' ');
    let line = '';
    let y = 100;
    const lineHeight = 70;
    
    for(let n = 0; n < words.length; n++) {
        const testLine = line + words[n] + ' ';
        const metrics = ctx.measureText(testLine);
        if (metrics.width > 480 && n > 0) {
             ctx.fillText(line, 256, y);
             line = words[n] + ' ';
             y += lineHeight;
        } else {
             line = testLine;
        }
    }
    ctx.fillText(line, 256, y);

    const imgData = ctx.getImageData(0,0,512,256).data;
    const particles = [];
    for(let y=0; y<256; y+=3) {
        for(let x=0; x<512; x+=3) {
            if(imgData[(y*512 + x)*4] > 128) {
                // 坐标映射
                const u = (x / 512 - 0.5) * 8; 
                const v = (1 - y / 256) * 4; 
                particles.push({x: u, y: v, z: 0}); 
            }
        }
    }
    const pCount = particles.length;
    const pGeo = new THREE.OctahedronGeometry(0.04, 0);
    const pMat = new THREE.MeshBasicMaterial({ color: 0xFFD700, blending: THREE.AdditiveBlending });
    setupExplosionMaterial(pMat); 
    
    wishParticles = new THREE.InstancedMesh(pGeo, pMat, pCount);
    textGroup.add(wishParticles);
    
    const dummyP = new THREE.Object3D();
    const pDirs = []; const pSpeeds = [];
    for(let i=0; i<pCount; i++) {
        dummyP.position.set(particles[i].x, particles[i].y, particles[i].z);
        dummyP.rotation.set(Math.random(),Math.random(),Math.random());
        dummyP.updateMatrix(); wishParticles.setMatrixAt(i, dummyP.matrix);
        // 爆炸方向：向屏幕外炸
        pDirs.push(Math.random()-0.5, Math.random()-0.5, 1.0); 
        pSpeeds.push(Math.random()*2 + 1);
    }
    fillAttributes(wishParticles.geometry, pCount, (i,v)=>v.set(pDirs[i*3], pDirs[i*3+1], pDirs[i*3+2]).normalize(), (i)=>pSpeeds[i]);
    
    // 特效：闪现
    gsap.from(wishParticles.material, { opacity: 0, duration: 1.5 });
    gsap.from(textGroup.position, { x: 5.0, duration: 1.5, ease: "power2.out" }); // 从右边滑入
}


// ==========================================
// 5. 交互与动画
// ==========================================
const raycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2();
const modal = document.getElementById('wish-modal');
const input = document.getElementById('wish-input');
let isModalOpen = false;

window.addEventListener('pointerdown', (event) => {
    if (isModalOpen) return;
    mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
    mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;
    raycaster.setFromCamera(mouse, camera);
    const intersects = raycaster.intersectObject(headHitbox); // 检测是否点击老虎头
    
    if (intersects.length > 0) {
        // 点击老虎头 -> 咆哮 + 打开弹窗
        roarAnimation();
        setTimeout(openModal, 500);
    }
});

function roarAnimation() {
    // 咆哮动作：头猛烈晃动，张嘴(模拟)
    gsap.to(headGroup.scale, { x: 1.5, y: 1.5, z: 1.5, duration: 0.1, yoyo: true, repeat: 3 });
    gsap.to(headGroup.rotation, { z: 0.5, duration: 0.1, yoyo: true, repeat: 5 });
    // 屏幕震动感
    gsap.to(camera.position, { x: 0.2, duration: 0.05, yoyo: true, repeat: 5, onComplete: () => camera.position.set(0,2,18) });
}

function openModal() {
    isModalOpen = true;
    modal.classList.add('visible');
    modal.classList.remove('hidden');
    input.focus();
}

function closeModal() {
    isModalOpen = false;
    modal.classList.remove('visible');
    setTimeout(() => modal.classList.add('hidden'), 500);
}

document.getElementById('wish-submit').addEventListener('click', () => {
    const text = input.value.trim();
    if (text) {
        createWishParticles(text);
        closeModal();
        input.value = '';
        // 发送完后，老虎跑快一点庆祝
        runSpeedMultiplier = 2.0;
        setTimeout(() => runSpeedMultiplier = 1.0, 2000);
    }
});
document.getElementById('close-modal').addEventListener('click', closeModal);


// ==========================================
// 6. 渲染循环 (Running Animation)
// ==========================================
const renderScene = new RenderPass(scene, camera);
const bloomPass = new UnrealBloomPass(new THREE.Vector2(window.innerWidth, window.innerHeight), 1.0, 0.4, 0.85);
const composer = new EffectComposer(renderer);
composer.addPass(renderScene);
composer.addPass(bloomPass);

let targetExpansion = 0;
let currentExpansion = 0;
let runSpeedMultiplier = 1.0;

window.addEventListener('wheel', (e) => {
    targetExpansion += e.deltaY * 0.002;
    targetExpansion = Math.max(0, Math.min(targetExpansion, 5.0));
});

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true; controls.enableZoom = false; 
// 锁定视角，不要自动旋转，否则看不清老虎跑步
controls.autoRotate = false; 
controls.maxPolarAngle = Math.PI / 1.6;

const clock = new THREE.Clock();

function animate() {
    requestAnimationFrame(animate);
    const time = clock.getElapsedTime();
    
    // 1. 爆炸逻辑
    currentExpansion += (targetExpansion - currentExpansion) * 0.05;
    globalUniforms.uExpansion.value = currentExpansion;

    // 2. 奔跑动画 (Running Cycle)
    // 速度
    const speed = time * 8.0 * runSpeedMultiplier;
    
    // 身体起伏
    bodyGroup.position.y = Math.sin(speed * 2) * 0.1;
    bodyGroup.rotation.z = Math.sin(speed) * 0.05; // 身体轻微扭动

    // 腿部摆动 (对角线原则：左前+右后 一组，右前+左后 一组)
    legFL.rotation.z = Math.sin(speed) * 0.8;
    legBR.rotation.z = Math.sin(speed) * 0.8;
    
    legFR.rotation.z = Math.sin(speed + Math.PI) * 0.8;
    legBL.rotation.z = Math.sin(speed + Math.PI) * 0.8;
    
    // 膝盖弯曲模拟 (简单版)
    legFL.position.y = Math.max(-0.5, -0.5 + Math.sin(speed) * 0.3);
    legFR.position.y = Math.max(-0.5, -0.5 + Math.sin(speed + Math.PI) * 0.3);

    // 尾巴摆动
    tailGroup.rotation.z = Math.sin(speed * 0.5) * 0.5;
    tailGroup.rotation.y = Math.cos(speed * 0.5) * 0.3;

    // 头稍微看一点镜头
    headGroup.lookAt(camera.position);

    // 3. 文字粒子漂浮
    if (wishParticles) {
        textGroup.rotation.y = Math.sin(time) * 0.05;
        textGroup.position.y = Math.sin(time * 0.5) * 0.1;
    }

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