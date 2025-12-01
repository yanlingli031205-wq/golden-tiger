import './style.css'; 
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import gsap from 'gsap';

// ==========================================
// 1. 核心引擎：Shader (奔跑 + 爆炸 + 闪烁)
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
            attribute float aPart; // 0=身, 1=腿, 2=头/尾
            attribute float aPhase; // 跑步相位
            
            uniform float uExpansion;
            uniform float uTime;
            
            // 旋转矩阵
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
            
            // --- A. 奔跑动画逻辑 (当没有爆炸时生效) ---
            float runSpeed = 5.0;
            float t = uTime * runSpeed;
            vec3 runOffset = vec3(0.0);
            
            // 只有当爆炸很小时才明显奔跑，炸开了就停止动作
            float runStrength = 1.0 - smoothstep(0.0, 1.0, uExpansion); 
            
            if (runStrength > 0.01) {
                // 1. 腿部 (aPart == 1.0)
                if (abs(aPart - 1.0) < 0.1) {
                    float legAngle = sin(t + aPhase) * 0.8;
                    // 简单的绕枢轴旋转模拟
                    runOffset.y += sin(t + aPhase) * 0.3;
                    runOffset.z += cos(t + aPhase) * 0.6;
                }
                // 2. 身体 (aPart == 0.0)
                else if (abs(aPart - 0.0) < 0.1) {
                    runOffset.y += sin(t * 2.0) * 0.1; // 上下起伏
                }
                // 3. 尾巴 (aPart == 2.0)
                else if (abs(aPart - 2.0) < 0.1) {
                    runOffset.x += sin(t) * 0.1; // 左右摆
                }
            }
            
            transformed += runOffset * runStrength;

            // --- B. 爆炸逻辑 (优先级更高) ---
            float progress = uExpansion * aSpeed;
            
            // 1. 爆炸位移
            vec3 explodeOffset = aDirection * progress * 12.0;
            transformed += explodeOffset;
            
            // 2. 旋转飞散
            if (progress > 0.01) {
                mat4 rot = rotationMatrix(aRotationAxis, progress * 5.0);
                transformed = (rot * vec4(transformed, 1.0)).xyz;
            }
            
            // --- C. 闪烁特效 (Sparkle) ---
            // 根据时间改变大小，制造 bling bling 效果
            float sparkle = 1.0 + 0.3 * sin(uTime * 10.0 + position.x * 20.0);
            transformed *= sparkle;
            `
        );
    };
}

// 辅助函数：填充粒子属性
function fillAttributes(geometry, count, partID, phase) {
    const directions = []; const speeds = []; const axes = []; 
    const parts = []; const phases = [];
    
    for (let i = 0; i < count; i++) {
        // 爆炸方向：随机
        directions.push(Math.random()-0.5, Math.random()-0.5, Math.random()-0.5);
        speeds.push(Math.random() * 0.5 + 0.5);
        axes.push(Math.random(), Math.random(), Math.random());
        parts.push(partID); // 记录部位
        phases.push(phase !== undefined ? phase : 0); // 记录相位
    }
    geometry.setAttribute('aDirection', new THREE.InstancedBufferAttribute(new Float32Array(directions), 3));
    geometry.setAttribute('aSpeed', new THREE.InstancedBufferAttribute(new Float32Array(speeds), 1));
    geometry.setAttribute('aRotationAxis', new THREE.InstancedBufferAttribute(new Float32Array(axes), 3));
    geometry.setAttribute('aPart', new THREE.InstancedBufferAttribute(new Float32Array(parts), 1));
    geometry.setAttribute('aPhase', new THREE.InstancedBufferAttribute(new Float32Array(phases), 1));
}

// ==========================================
// 2. 场景设置
// ==========================================
const scene = new THREE.Scene();
scene.background = new THREE.Color('#000000');
scene.fog = new THREE.FogExp2('#000000', 0.02);

const camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 100);
camera.position.set(-6, 2, 16); 

const renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: "high-performance" });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;
document.getElementById('app').appendChild(renderer.domElement);

// 灯光
const ambientLight = new THREE.AmbientLight('#222222', 1.0);
scene.add(ambientLight);

const rimLight = new THREE.SpotLight('#FFFACD', 8.0); 
rimLight.position.set(-5, 5, -10);
rimLight.lookAt(0,0,0);
scene.add(rimLight);

const goldLight = new THREE.PointLight('#FFD700', 3.0, 20); 
goldLight.position.set(5, 5, 5);
scene.add(goldLight);


// ==========================================
// 3. 构建粒子猛虎 (带奔跑属性)
// ==========================================
const tigerGroup = new THREE.Group();
tigerGroup.position.x = -3; // 居左
scene.add(tigerGroup);

// 材质：超高光泽金
const particleMat = new THREE.MeshStandardMaterial({
    color: '#FFD700',
    roughness: 0.05, // 极低粗糙度 = 极高反光
    metalness: 1.0,  // 纯金属
    emissive: '#443300',
    emissiveIntensity: 0.4 // 自发光增强
});
setupParticleMaterial(particleMat); 

const hitboxes = [];

function createBodyPart(count, scale, pos, partID, phase) {
    const geo = new THREE.OctahedronGeometry(0.06, 0); // 粒子稍微大一点点
    const mesh = new THREE.InstancedMesh(geo, particleMat, count);
    const dummy = new THREE.Object3D();

    for(let i=0; i<count; i++) {
        const x = (Math.random()-0.5);
        const y = (Math.random()-0.5);
        const z = (Math.random()-0.5);
        if(x*x+y*y+z*z > 0.25) { i--; continue; } 

        dummy.position.set(x*2, y*2, z*2);
        dummy.rotation.set(Math.random()*Math.PI, Math.random()*Math.PI, 0);
        // 随机缩放
        const s = Math.random() * 0.8 + 0.2;
        dummy.scale.set(s,s,s);
        
        dummy.updateMatrix();
        mesh.setMatrixAt(i, dummy.matrix);
    }
    
    // 填充 Shader 属性 (传入 partID 和 phase)
    fillAttributes(geo, count, partID, phase);

    mesh.scale.set(scale.x, scale.y, scale.z);
    mesh.position.set(pos.x, pos.y, pos.z);
    tigerGroup.add(mesh);

    // 碰撞体
    const hitGeo = new THREE.SphereGeometry(1, 8, 8);
    const hitMat = new THREE.MeshBasicMaterial({ visible: false });
    const hitMesh = new THREE.Mesh(hitGeo, hitMat);
    hitMesh.scale.set(scale.x, scale.y, scale.z);
    hitMesh.position.set(pos.x, pos.y, pos.z);
    tigerGroup.add(hitMesh);
    hitboxes.push(hitMesh);

    return mesh;
}

// 组装老虎 (定义部位 ID: 0=身, 1=腿, 2=头/尾)
createBodyPart(2000, {x:4.0, y:1.5, z:1.5}, {x:0, y:0, z:0}, 0, 0); // 身
createBodyPart(800, {x:1.3, y:1.3, z:1.3}, {x:2.5, y:0.8, z:0}, 2, 0); // 头

// 四肢 (Part 1, 带相位 phase)
// 左前(0), 右后(0) 同相
createBodyPart(400, {x:0.6, y:2.0, z:0.6}, {x:1.5, y:-1.2, z:0.5}, 1, 0); 
createBodyPart(400, {x:0.6, y:2.0, z:0.6}, {x:-1.5, y:-1.2, z:-0.5}, 1, 0); 
// 右前(PI), 左后(PI) 反相
createBodyPart(400, {x:0.6, y:2.0, z:0.6}, {x:1.5, y:-1.2, z:-0.5}, 1, Math.PI); 
createBodyPart(400, {x:0.6, y:2.0, z:0.6}, {x:-1.5, y:-1.2, z:0.5}, 1, Math.PI); 

// 尾巴
createBodyPart(300, {x:2.0, y:0.3, z:0.3}, {x:-3.0, y:0.5, z:0}, 2, 0);


// ==========================================
// 4. 稀疏闪耀文字粒子系统
// ==========================================
let textMesh = null;
const textGroup = new THREE.Group();
scene.add(textGroup);

function createWishParticles(text) {
    if (textMesh) { textGroup.remove(textMesh); textMesh.geometry.dispose(); }

    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    canvas.width = 512; canvas.height = 256;
    ctx.font = '100px "Ma Shan Zheng", cursive'; 
    ctx.fillStyle = 'white'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(text, 256, 128);

    const imgData = ctx.getImageData(0,0,512,256).data;
    const particles = [];
    
    // 【关键修改】步长从 3 改为 6 -> 粒子变稀疏
    const step = 6; 
    
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

    // 粒子调大一点，弥补稀疏感
    const geo = new THREE.OctahedronGeometry(0.06, 0);
    // 文字也用超闪材质
    const mat = new THREE.MeshStandardMaterial({ 
        color: 0xFFD700, 
        roughness: 0.0,
        metalness: 1.0,
        emissive: 0xFFD700,
        emissiveIntensity: 0.5
    });
    // 注入爆炸 Shader
    setupParticleMaterial(mat); 

    textMesh = new THREE.InstancedMesh(geo, mat, particles.length);
    const dummy = new THREE.Object3D();
    const dirs = [];
    for(let i=0; i<particles.length; i++) {
        dummy.position.set(particles[i].x, particles[i].y, particles[i].z);
        dummy.rotation.set(Math.random(), Math.random(), 0);
        // 随机大小，制造“星尘”感
        const s = Math.random() * 0.5 + 0.5;
        dummy.scale.set(s,s,s);
        dummy.updateMatrix();
        textMesh.setMatrixAt(i, dummy.matrix);
        // 文字爆炸方向：向前炸开
        dirs.push((Math.random()-0.5)*2, (Math.random()-0.5)*2, 2.0); 
    }
    // 文字的 partID 设为 3 (不参与奔跑动画)
    fillAttributes(geo, particles.length, 3, 0);

    textGroup.add(textMesh);
    textGroup.position.set(3, 0, 0); // 放在右侧
    
    gsap.from(textMesh.material, { opacity: 0, duration: 2 });
    gsap.from(textGroup.position, { y: -2, duration: 2, ease: "power2.out" });
}


// ==========================================
// 5. 交互系统
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
    
    // 检测点击老虎
    const intersects = raycaster.intersectObjects(hitboxes);
    if (intersects.length > 0) {
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
    if (text) {
        createWishParticles(text); 
        closeModal();
        input.value = '';
    }
});
document.getElementById('close-modal').addEventListener('click', closeModal);


// ==========================================
// 6. 渲染循环
// ==========================================
const renderScene = new RenderPass(scene, camera);
const bloomPass = new UnrealBloomPass(new THREE.Vector2(window.innerWidth, window.innerHeight), 1.0, 0.2, 0.85);
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
controls.enableDamping = true; controls.enableZoom = false; 
controls.maxPolarAngle = Math.PI / 1.6;

const clock = new THREE.Clock();

function animate() {
    requestAnimationFrame(animate);
    const time = clock.getElapsedTime();
    globalUniforms.uTime.value = time;
    
    // 爆炸插值
    currentExpansion += (targetExpansion - currentExpansion) * 0.05;
    globalUniforms.uExpansion.value = currentExpansion;

    // 漂浮感
    tigerGroup.position.y = Math.sin(time) * 0.05;
    
    // 视角微动
    camera.position.x = -6 + Math.sin(time * 0.2) * 0.5;

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