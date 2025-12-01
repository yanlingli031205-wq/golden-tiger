import './style.css'; 
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import gsap from 'gsap';

// ==========================================
// 1. 核心 Shader (爆炸效果保持)
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
// 2. 场景与高燃灯光
// ==========================================
const scene = new THREE.Scene();
scene.background = new THREE.Color('#020000'); // 近似纯黑
scene.fog = new THREE.FogExp2('#020000', 0.02);

const camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 100);
camera.position.set(0, 2, 22);

const renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: "high-performance" });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.2;
document.getElementById('app').appendChild(renderer.domElement);

// 灯光配置：烈火色调
const ambientLight = new THREE.AmbientLight('#331111', 1.0); // 暗红环境光
scene.add(ambientLight);
const mainLight = new THREE.DirectionalLight('#FFaa00', 3.0); // 金色主光
mainLight.position.set(5, 5, 10);
scene.add(mainLight);
const fireLight = new THREE.PointLight('#FF4500', 5.0, 20); // 底部火光
fireLight.position.set(0, -5, 5);
scene.add(fireLight);

// ==========================================
// 3. 粒子猛虎 (Tiger) - 放在左侧
// ==========================================
const tigerGroup = new THREE.Group();
tigerGroup.position.set(-6, -2, 0); // 放在左下侧奔跑
tigerGroup.rotation.y = 0.4; // 稍微侧身朝向屏幕中心
scene.add(tigerGroup);

const goldMat = new THREE.MeshStandardMaterial({ 
    color: '#FFD700', roughness: 0.1, metalness: 1.0, 
    emissive: '#AA4400', emissiveIntensity: 0.4 
});
setupExplosionMaterial(goldMat);

const blackMat = new THREE.MeshStandardMaterial({ 
    color: '#111111', roughness: 0.9, metalness: 0.5 
});
setupExplosionMaterial(blackMat);

// 通用粒子生成器
function createParticleShape(count, material, scaleMult=1) {
    const mesh = new THREE.InstancedMesh(new THREE.OctahedronGeometry(0.06 * scaleMult, 0), material, count);
    const dummy = new THREE.Object3D();
    const dirs = []; const speeds = [];
    for(let i=0; i<count; i++) {
        const x = (Math.random()-0.5);
        const y = (Math.random()-0.5);
        const z = (Math.random()-0.5);
        if (x*x + y*y + z*z > 0.25) { i--; continue; } 
        dummy.position.set(x*2, y*2, z*2);
        dummy.rotation.set(Math.random()*Math.PI, Math.random()*Math.PI, 0);
        dummy.scale.setScalar(Math.random() * 0.5 + 0.5);
        dummy.updateMatrix();
        mesh.setMatrixAt(i, dummy.matrix);
        dirs.push(x, y, z);
        speeds.push(Math.random() + 0.5);
    }
    fillAttributes(mesh.geometry, count, (i,v)=>v.set(dirs[i*3], dirs[i*3+1], dirs[i*3+2]).normalize(), (i)=>speeds[i]);
    return mesh;
}

// 老虎部件
const bodyGroup = new THREE.Group();
tigerGroup.add(bodyGroup);
const bodyMesh = createParticleShape(2500, goldMat); bodyMesh.scale.set(4, 1.5, 1.5); bodyGroup.add(bodyMesh);
const stripeMesh = createParticleShape(600, blackMat); stripeMesh.scale.set(4.1, 1.55, 1.55); bodyGroup.add(stripeMesh);

const headGroup = new THREE.Group(); headGroup.position.set(2.2, 0.8, 0); bodyGroup.add(headGroup);
const headMesh = createParticleShape(1000, goldMat); headMesh.scale.set(1.3, 1.3, 1.3); headGroup.add(headMesh);
const headHitbox = new THREE.Mesh(new THREE.SphereGeometry(1.0), new THREE.MeshBasicMaterial({visible:false}));
headHitbox.name = "TigerHead"; headGroup.add(headHitbox);

function createLeg(x,y,z) {
    const g = new THREE.Group(); g.position.set(x,y,z);
    const m = createParticleShape(500, goldMat); m.scale.set(0.7, 2.2, 0.7); m.position.y = -1.0;
    g.add(m); return g;
}
const legFL = createLeg(1.5, -0.5, 0.5); const legFR = createLeg(1.5, -0.5, -0.5);
const legBL = createLeg(-1.5, -0.5, 0.5); const legBR = createLeg(-1.5, -0.5, -0.5);
tigerGroup.add(legFL, legFR, legBL, legBR);
const tailGroup = new THREE.Group(); tailGroup.position.set(-2.0, 0.2, 0);
const tailMesh = createParticleShape(400, goldMat); tailMesh.scale.set(2.0, 0.3, 0.3); tailMesh.position.x = -1.0;
tailGroup.add(tailMesh); bodyGroup.add(tailGroup);

// ==========================================
// 4. 文字粒子系统 (中文从下升起，英文固定)
// ==========================================
const textGroup = new THREE.Group();
textGroup.position.set(2, 0, 0); // 文字整体在右侧
scene.add(textGroup);

// 英文标题 (GOLDEN TIGER)
function createEnglishTitle() {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    canvas.width = 1024; canvas.height = 128;
    ctx.font = 'bold 60px "Cinzel", serif';
    ctx.fillStyle = 'white'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText("GOLDEN TIGER, YOUR GUARDIAN", 512, 64);
    
    // 生成粒子
    const imgData = ctx.getImageData(0,0,1024,128).data;
    const particles = [];
    for(let y=0; y<128; y+=2) {
        for(let x=0; x<1024; x+=2) {
            if(imgData[(y*1024+x)*4]>128) {
                particles.push({x: (x/1024-0.5)*12, y: (1-y/128)*1.5 + 2, z: 0}); // y+2 放在上面
            }
        }
    }
    const mesh = new THREE.InstancedMesh(new THREE.OctahedronGeometry(0.02,0), goldMat, particles.length);
    const dummy = new THREE.Object3D();
    const dirs=[], speeds=[];
    for(let i=0; i<particles.length; i++){
        dummy.position.set(particles[i].x, particles[i].y, particles[i].z);
        dummy.updateMatrix(); mesh.setMatrixAt(i, dummy.matrix);
        dirs.push(Math.random()-0.5, Math.random()-0.5, 1); speeds.push(Math.random()*2+1);
    }
    fillAttributes(mesh.geometry, particles.length, (i,v)=>v.set(dirs[i*3],dirs[i*3+1],dirs[i*3+2]).normalize(), (i)=>speeds[i]);
    textGroup.add(mesh);
    
    // 英文入场动画
    mesh.position.y = -5; // 初始在下面
    mesh.material.opacity = 0;
    gsap.to(mesh.position, { y: 0, duration: 2, ease: "power2.out", delay: 0.5 });
    gsap.to(mesh.material, { opacity: 1, duration: 2, delay: 0.5 });
}

// 中文竖排粒子生成器 (花体字)
function createChineseChar(char, offsetX) {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    canvas.width = 256; canvas.height = 256;
    ctx.font = '200px "Ma Shan Zheng", cursive'; // 毛笔字体
    ctx.fillStyle = 'white'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(char, 128, 128);
    
    const imgData = ctx.getImageData(0,0,256,256).data;
    const particles = [];
    for(let y=0; y<256; y+=3) { // 精度适中
        for(let x=0; x<256; x+=3) {
            if(imgData[(y*256+x)*4]>128) {
                particles.push({x: (x/256-0.5)*3, y: (1-y/256)*3, z: 0});
            }
        }
    }
    const mesh = new THREE.InstancedMesh(new THREE.OctahedronGeometry(0.03,0), goldMat, particles.length);
    const dummy = new THREE.Object3D();
    const dirs=[], speeds=[];
    for(let i=0; i<particles.length; i++){
        dummy.position.set(particles[i].x, particles[i].y, particles[i].z);
        dummy.updateMatrix(); mesh.setMatrixAt(i, dummy.matrix);
        dirs.push(Math.random()-0.5, Math.random()-0.5, 1); speeds.push(Math.random()*2+1);
    }
    fillAttributes(mesh.geometry, particles.length, (i,v)=>v.set(dirs[i*3],dirs[i*3+1],dirs[i*3+2]).normalize(), (i)=>speeds[i]);
    
    // 定位
    mesh.position.set(offsetX, -10, 0); // 初始在地下
    textGroup.add(mesh);
    return mesh;
}

// 生成文字队列
createEnglishTitle();
// "金色大老虎"
const chars1 = ['金', '色', '大', '老', '虎'];
chars1.forEach((char, i) => {
    const mesh = createChineseChar(char, (i - 2) * 2.5); // 横向排列
    // 动画：一个接一个升起
    gsap.to(mesh.position, { y: 0, duration: 1.5, ease: "back.out(1.2)", delay: 1.5 + i * 0.2 });
});
// "你的守护神"
const chars2 = ['你', '的', '守', '护', '神'];
chars2.forEach((char, i) => {
    const mesh = createChineseChar(char, (i - 2) * 2.5);
    // 放在第二行
    gsap.to(mesh.position, { y: -3.5, duration: 1.5, ease: "back.out(1.2)", delay: 2.5 + i * 0.2 });
});


// ==========================================
// 5. 炎火系统 (Hellfire)
// ==========================================
const fireCount = 2000;
const fireGeo = new THREE.BufferGeometry();
const firePos = new Float32Array(fireCount * 3);
const fireLife = new Float32Array(fireCount); // 生命周期

for(let i=0; i<fireCount; i++) {
    firePos[i*3] = (Math.random()-0.5) * 20; // 宽范围
    firePos[i*3+1] = (Math.random()-0.5) * 5 - 5; // 底部
    firePos[i*3+2] = (Math.random()-0.5) * 10;
    fireLife[i] = Math.random();
}
fireGeo.setAttribute('position', new THREE.BufferAttribute(firePos, 3));

const fireMat = new THREE.PointsMaterial({
    color: 0xFF4500, size: 0.15, transparent: true, opacity: 0.8, 
    blending: THREE.AdditiveBlending, sizeAttenuation: true
});
const fireSystem = new THREE.Points(fireGeo, fireMat);
scene.add(fireSystem);

// ==========================================
// 6. 金龙绕飞 (Golden Dragon Spirit)
// ==========================================
const dragonLen = 100; // 龙身长度
const dragonGeo = new THREE.SphereGeometry(0.15, 8, 8);
const dragonMat = new THREE.MeshBasicMaterial({ color: 0xFFD700 });
const dragonMesh = new THREE.InstancedMesh(dragonGeo, dragonMat, dragonLen);
scene.add(dragonMesh);

const dragonPath = [];
const dragonDummy = new THREE.Object3D();

// ==========================================
// 7. 交互与弹窗
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
    if (raycaster.intersectObject(headHitbox).length > 0) {
        roarAnimation();
        setTimeout(openModal, 500);
    }
});

function roarAnimation() {
    gsap.to(headGroup.scale, { x: 1.5, y: 1.5, z: 1.5, duration: 0.1, yoyo: true, repeat: 3 });
    gsap.to(camera.position, { x: 0.5, duration: 0.05, yoyo: true, repeat: 5, onComplete: () => camera.position.set(0,2,22) });
}

function openModal() {
    isModalOpen = true; modal.classList.add('visible'); modal.classList.remove('hidden'); input.focus();
}
function closeModal() {
    isModalOpen = false; modal.classList.remove('visible'); setTimeout(() => modal.classList.add('hidden'), 500);
}
document.getElementById('wish-submit').addEventListener('click', () => {
    if(input.value.trim()) { createEnglishTitle(); closeModal(); input.value = ''; } // 简单重置文字特效
});
document.getElementById('close-modal').addEventListener('click', closeModal);

// ==========================================
// 8. 渲染循环
// ==========================================
const renderScene = new RenderPass(scene, camera);
// 强烈的 Bloom 效果，制造火焰感
const bloomPass = new UnrealBloomPass(new THREE.Vector2(window.innerWidth, window.innerHeight), 1.5, 0.4, 0.85);
const composer = new EffectComposer(renderer);
composer.addPass(renderScene);
composer.addPass(bloomPass);

let targetExpansion = 0; let currentExpansion = 0;
window.addEventListener('wheel', (e) => {
    targetExpansion += e.deltaY * 0.002;
    targetExpansion = Math.max(0, Math.min(targetExpansion, 5.0));
});

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true; controls.enableZoom = false; controls.autoRotate = false;
const clock = new THREE.Clock();

function animate() {
    requestAnimationFrame(animate);
    const time = clock.getElapsedTime();
    currentExpansion += (targetExpansion - currentExpansion) * 0.05;
    globalUniforms.uExpansion.value = currentExpansion;

    // 1. 老虎奔跑
    const speed = time * 8.0;
    bodyGroup.position.y = Math.sin(speed * 2) * 0.1;
    legFL.rotation.z = Math.sin(speed) * 0.8; legBR.rotation.z = Math.sin(speed) * 0.8;
    legFR.rotation.z = Math.sin(speed + Math.PI) * 0.8; legBL.rotation.z = Math.sin(speed + Math.PI) * 0.8;
    legFL.position.y = Math.max(-0.5, -0.5 + Math.sin(speed) * 0.3); legFR.position.y = Math.max(-0.5, -0.5 + Math.sin(speed + Math.PI) * 0.3);
    tailGroup.rotation.z = Math.sin(speed * 0.5) * 0.5;

    // 2. 炎火上升
    const fPos = fireGeo.attributes.position.array;
    for(let i=0; i<fireCount; i++) {
        // Y轴上升
        fPos[i*3+1] += 0.05 + Math.random()*0.05;
        // 扰动
        fPos[i*3] += Math.sin(time + fPos[i*3+1])*0.02;
        // 循环
        if(fPos[i*3+1] > 3) {
            fPos[i*3+1] = -6;
            fPos[i*3] = (Math.random()-0.5)*20;
        }
    }
    fireGeo.attributes.position.needsUpdate = true;

    // 3. 金龙飞舞 (Lissajous Curve)
    const dX = Math.sin(time * 1.5) * 10;
    const dY = Math.cos(time * 0.8) * 4;
    const dZ = Math.sin(time * 0.5) * 5;
    dragonPath.unshift({x:dX, y:dY, z:dZ}); // 记录头的位置
    if(dragonPath.length > dragonLen) dragonPath.pop(); // 保持长度

    for(let i=0; i<dragonPath.length; i++) {
        dragonDummy.position.set(dragonPath[i].x, dragonPath[i].y, dragonPath[i].z);
        // 龙头大，龙尾小
        const scale = (1 - i/dragonLen) * 2.0;
        dragonDummy.scale.set(scale, scale, scale);
        dragonDummy.updateMatrix();
        dragonMesh.setMatrixAt(i, dragonDummy.matrix);
    }
    dragonMesh.instanceMatrix.needsUpdate = true;

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