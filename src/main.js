import './style.css'; 
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import gsap from 'gsap';

// ==========================================
// 1. 核心 Shader (方块爆炸)
// ==========================================
const globalUniforms = { 
    uExpansion: { value: 0.0 },
    uTime: { value: 0.0 }
};

function setupParticleMaterial(material) {
    material.onBeforeCompile = (shader) => {
        shader.uniforms.uExpansion = globalUniforms.uExpansion;
        shader.uniforms.uTime = globalUniforms.uTime;
        
        shader.vertexShader = `
            attribute vec3 aDirection;
            attribute float aSpeed;
            attribute vec3 aRotationAxis;
            attribute float aPart; 
            attribute float aPhase;
            
            uniform float uExpansion;
            uniform float uTime;
            
            mat4 rotationMatrix(vec3 axis, float angle) {
                axis = normalize(axis);
                float s = sin(angle); float c = cos(angle);
                float oc = 1.0 - c;
                return mat4(oc * axis.x * axis.x + c, oc * axis.x * axis.y - axis.z * s, oc * axis.z * axis.x + axis.y * s, 0.0,
                            oc * axis.x * axis.y + axis.z * s, oc * axis.y * axis.y + c, oc * axis.y * axis.z - axis.x * s, 0.0,
                            oc * axis.z * axis.x - axis.y * s, oc * axis.y * axis.z + axis.x * s, oc * axis.z * axis.z + c, 0.0,
                            0.0, 0.0, 0.0, 1.0);
            }
        ` + shader.vertexShader;
        
        shader.vertexShader = shader.vertexShader.replace(
            '#include <begin_vertex>',
            `
            #include <begin_vertex>
            
            // --- 奔跑逻辑 ---
            float runSpeed = 5.0;
            float t = uTime * runSpeed;
            vec3 runOffset = vec3(0.0);
            float runStrength = 1.0 - smoothstep(0.0, 1.0, uExpansion); 
            
            if (runStrength > 0.01) {
                if (abs(aPart - 1.0) < 0.1) { // 腿
                    float legAngle = sin(t + aPhase) * 0.8;
                    runOffset.y += sin(t + aPhase) * 0.3;
                    runOffset.z += cos(t + aPhase) * 0.6;
                }
                else if (abs(aPart - 0.0) < 0.1) { // 身
                    runOffset.y += sin(t * 2.0) * 0.05; 
                }
                else if (abs(aPart - 2.0) < 0.1) { // 尾
                    runOffset.x += sin(t) * 0.1; 
                }
            }
            transformed += runOffset * runStrength;

            // --- 爆炸逻辑 ---
            float progress = uExpansion * aSpeed;
            vec3 explodeOffset = aDirection * progress * 10.0;
            transformed += explodeOffset;
            
            if (progress > 0.01) {
                mat4 rot = rotationMatrix(aRotationAxis, progress * 5.0);
                transformed = (rot * vec4(transformed, 1.0)).xyz;
            }
            
            // --- 呼吸光效 ---
            // 模仿图片里有些方块特别亮的效果
            float pulse = 1.0 + 0.5 * sin(uTime * 5.0 + position.x * 10.0 + position.y);
            transformed *= 1.0; // 保持体积
            vNormal = normal; // 传递法线用于光照
            `
        );
    };
}

function fillAttributes(geometry, count, partID, phase) {
    const directions = []; const speeds = []; const axes = []; 
    const parts = []; const phases = [];
    for (let i = 0; i < count; i++) {
        directions.push(Math.random()-0.5, Math.random()-0.5, Math.random()-0.5);
        speeds.push(Math.random() * 0.5 + 0.5);
        axes.push(Math.random(), Math.random(), Math.random());
        parts.push(partID); 
        phases.push(phase !== undefined ? phase : 0);
    }
    geometry.setAttribute('aDirection', new THREE.InstancedBufferAttribute(new Float32Array(directions), 3));
    geometry.setAttribute('aSpeed', new THREE.InstancedBufferAttribute(new Float32Array(speeds), 1));
    geometry.setAttribute('aRotationAxis', new THREE.InstancedBufferAttribute(new Float32Array(axes), 3));
    geometry.setAttribute('aPart', new THREE.InstancedBufferAttribute(new Float32Array(parts), 1));
    geometry.setAttribute('aPhase', new THREE.InstancedBufferAttribute(new Float32Array(phases), 1));
}

// ==========================================
// 2. 场景 (纯黑 + 暖光)
// ==========================================
const scene = new THREE.Scene();
scene.background = new THREE.Color('#000000');
scene.fog = new THREE.FogExp2('#000000', 0.02);

const camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 100);
camera.position.set(-8, 3, 18); // 调整视角

const renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: "high-performance" });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.2;
document.getElementById('app').appendChild(renderer.domElement);

// 灯光：暖色调，营造火炉般的感觉
const ambientLight = new THREE.AmbientLight('#331100', 0.5);
scene.add(ambientLight);

const warmSpot = new THREE.SpotLight('#FFaa00', 10.0);
warmSpot.position.set(5, 10, 5);
warmSpot.penumbra = 0.5;
scene.add(warmSpot);

const rimLight = new THREE.SpotLight('#FF4400', 5.0); // 红色轮廓光
rimLight.position.set(-5, 2, -10);
scene.add(rimLight);

// ==========================================
// 3. 构建“体素”猛虎 (Voxel Tiger)
// ==========================================
const tigerGroup = new THREE.Group();
tigerGroup.position.x = -2; 
scene.add(tigerGroup);

// 【关键修改】使用 BoxGeometry (正方体)，还原图片里的像素风
const particleGeo = new THREE.BoxGeometry(0.08, 0.08, 0.08); 

// 材质：暖橙金，强自发光
const particleMat = new THREE.MeshStandardMaterial({
    color: '#FFaa00', // 橙金色
    roughness: 0.4,
    metalness: 0.8,
    emissive: '#FF5500', // 发红光
    emissiveIntensity: 0.6
});
setupParticleMaterial(particleMat); 

const hitboxes = [];

// 【关键修改】基于“体积”生成粒子，而不是球体
// 这样可以做出平平的背部和方方的腿
function createBoxVolume(count, size, pos, partID, phase) {
    const mesh = new THREE.InstancedMesh(particleGeo, particleMat, count);
    const dummy = new THREE.Object3D();

    for(let i=0; i<count; i++) {
        // 在长方体体积内随机 (均匀分布)
        const x = (Math.random() - 0.5) * size.x;
        const y = (Math.random() - 0.5) * size.y;
        const z = (Math.random() - 0.5) * size.z;

        dummy.position.set(x, y, z);
        // 随机旋转一点点，让方块看起来自然堆叠
        dummy.rotation.set(Math.random()*0.2, Math.random()*0.2, Math.random()*0.2);
        
        // 大小差异：有的方块大，有的小，制造图中的疏密感
        const s = Math.random() * 0.5 + 0.8;
        dummy.scale.set(s,s,s);
        
        dummy.updateMatrix();
        mesh.setMatrixAt(i, dummy.matrix);
    }
    
    fillAttributes(particleGeo, count, partID, phase);

    mesh.position.set(pos.x, pos.y, pos.z);
    tigerGroup.add(mesh);

    // 碰撞体
    const hitGeo = new THREE.BoxGeometry(size.x, size.y, size.z);
    const hitMat = new THREE.MeshBasicMaterial({ visible: false });
    const hitMesh = new THREE.Mesh(hitGeo, hitMat);
    hitMesh.position.set(pos.x, pos.y, pos.z);
    tigerGroup.add(hitMesh);
    hitboxes.push(hitMesh);

    return mesh;
}

// 组装老虎 (参考图片结构：方正的身体，粗壮的腿)
// 1. 身体：长方体
createBoxVolume(1800, {x:3.5, y:1.2, z:1.4}, {x:0, y:0, z:0}, 0, 0); 

// 2. 头部：正方体
createBoxVolume(600, {x:1.2, y:1.2, z:1.2}, {x:2.4, y:0.6, z:0}, 2, 0); 

// 3. 四肢：竖长方体
const legSize = {x:0.5, y:1.8, z:0.5};
createBoxVolume(300, legSize, {x:1.4, y:-1.2, z:0.5}, 1, 0); // 右前
createBoxVolume(300, legSize, {x:1.4, y:-1.2, z:-0.5}, 1, 0); // 左前
createBoxVolume(300, legSize, {x:-1.4, y:-1.2, z:0.5}, 1, Math.PI); // 右后
createBoxVolume(300, legSize, {x:-1.4, y:-1.2, z:-0.5}, 1, Math.PI); // 左后

// 4. 尾巴
createBoxVolume(200, {x:1.5, y:0.2, z:0.2}, {x:-2.6, y:0.5, z:0}, 2, 0);


// ==========================================
// 4. 方块文字粒子 (Voxel Text)
// ==========================================
let textMesh = null;
const textGroup = new THREE.Group();
scene.add(textGroup);

function createWishParticles(text) {
    if (textMesh) { textGroup.remove(textMesh); textMesh.geometry.dispose(); }

    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    canvas.width = 512; canvas.height = 256;
    ctx.font = 'bold 100px "Ma Shan Zheng", cursive'; 
    ctx.fillStyle = 'white'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(text, 256, 128);

    const imgData = ctx.getImageData(0,0,512,256).data;
    const particles = [];
    
    // 步长设为 5，让文字方块密集一点，显色
    const step = 5; 
    for(let y=0; y<256; y+=step) { 
        for(let x=0; x<512; x+=step) {
            if(imgData[(y*512+x)*4] > 128) {
                particles.push({
                    x: (x/512 - 0.5) * 8, 
                    y: (1 - y/256) * 4, 
                    z: 0 
                });
            }
        }
    }

    // 文字粒子也用方块
    const geo = new THREE.BoxGeometry(0.06, 0.06, 0.06);
    const mat = new THREE.MeshStandardMaterial({ 
        color: 0xFFAA00, // 暖橙
        emissive: 0xFF4400,
        emissiveIntensity: 0.8
    });
    setupParticleMaterial(mat); 

    textMesh = new THREE.InstancedMesh(geo, mat, particles.length);
    const dummy = new THREE.Object3D();
    const dirs = [];
    for(let i=0; i<particles.length; i++) {
        dummy.position.set(particles[i].x, particles[i].y, particles[i].z);
        // 随机微旋转
        dummy.rotation.set(Math.random()*0.5, Math.random()*0.5, Math.random()*0.5);
        dummy.updateMatrix();
        textMesh.setMatrixAt(i, dummy.matrix);
        dirs.push((Math.random()-0.5)*2, (Math.random()-0.5)*2, 2.0); 
    }
    fillAttributes(geo, particles.length, 3, 0);

    textGroup.add(textMesh);
    textGroup.position.set(3, 0, 0); 
    
    gsap.from(textMesh.material, { opacity: 0, duration: 1 });
    gsap.from(textGroup.position, { y: -2, duration: 1, ease: "back.out" });
}

// ==========================================
// 5. 交互
// ==========================================
const raycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2();
const modal = document.getElementById('wish-modal');
const input = document.getElementById('wish-input');
const uiLayer = document.getElementById('ui-layer');
let isModalOpen = false;

window.addEventListener('pointerdown', (event) => {
    if (isModalOpen) return;
    mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
    mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;
    raycaster.setFromCamera(mouse, camera);
    
    if (raycaster.intersectObjects(hitboxes).length > 0) {
        openModal();
    }
});

function openModal() {
    isModalOpen = true;
    modal.classList.add('visible');
    modal.classList.remove('hidden');
    input.focus();
    gsap.to(uiLayer, { opacity: 0, duration: 0.5 });
}
function closeModal() {
    isModalOpen = false;
    modal.classList.remove('visible');
    setTimeout(() => modal.classList.add('hidden'), 600);
    gsap.to(uiLayer, { opacity: 1, duration: 1 });
}
document.getElementById('wish-submit').addEventListener('click', () => {
    const text = input.value.trim();
    if (text) { createWishParticles(text); closeModal(); input.value = ''; }
});
document.getElementById('close-modal').addEventListener('click', closeModal);

// ==========================================
// 6. 渲染
// ==========================================
const renderScene = new RenderPass(scene, camera);
// Bloom 调强一点，制造图片里的光晕感
const bloomPass = new UnrealBloomPass(new THREE.Vector2(window.innerWidth, window.innerHeight), 1.2, 0.5, 0.6);
const composer = new EffectComposer(renderer);
composer.addPass(renderScene);
composer.addPass(bloomPass);

let targetExpansion = 0;
let currentExpansion = 0;
window.addEventListener('wheel', (e) => {
    targetExpansion += e.deltaY * 0.002;
    targetExpansion = Math.max(0, Math.min(targetExpansion, 6.0));
});

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true; controls.enableZoom = false; controls.maxPolarAngle = Math.PI / 1.6;
const clock = new THREE.Clock();

function animate() {
    requestAnimationFrame(animate);
    const time = clock.getElapsedTime();
    globalUniforms.uTime.value = time;
    currentExpansion += (targetExpansion - currentExpansion) * 0.05;
    globalUniforms.uExpansion.value = currentExpansion;

    tigerGroup.position.y = Math.sin(time) * 0.05;
    camera.position.x = -8 + Math.sin(time * 0.2) * 0.5;

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