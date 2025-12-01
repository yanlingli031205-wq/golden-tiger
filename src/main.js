import './style.css'; 
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import gsap from 'gsap';

// ==========================================
// 1. 核心引擎：Shader 爆炸逻辑 (The Soul)
// ==========================================
// 这个 uniform 控制所有粒子（老虎+文字）的爆炸
const globalUniforms = { uExpansion: { value: 0.0 } };

function setupParticleMaterial(material) {
    material.onBeforeCompile = (shader) => {
        shader.uniforms.uExpansion = globalUniforms.uExpansion;
        // 顶点着色器注入
        shader.vertexShader = `
            attribute vec3 aDirection;
            attribute float aSpeed;
            attribute vec3 aRotationAxis;
            uniform float uExpansion;
            
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
            
            float progress = uExpansion * aSpeed;
            
            // 1. 爆炸位移
            vec3 offset = aDirection * progress * 12.0; // 炸得远一点
            transformed += offset;
            
            // 2. 旋转飞散
            if (progress > 0.01) {
                mat4 rot = rotationMatrix(aRotationAxis, progress * 5.0);
                transformed = (rot * vec4(transformed, 1.0)).xyz;
            }
            
            // 3. 自身闪烁微动 (呼吸感)
            transformed *= (1.0 + sin(position.y * 10.0 + uExpansion) * 0.1);
            `
        );
    };
}

// 辅助函数：填充粒子属性
function fillAttributes(geometry, count, getDirFunc) {
    const directions = []; const speeds = []; const axes = []; const dummyDir = new THREE.Vector3();
    for (let i = 0; i < count; i++) {
        if (getDirFunc) {
            getDirFunc(i, dummyDir);
            directions.push(dummyDir.x, dummyDir.y, dummyDir.z);
        } else {
            // 默认向外炸
            directions.push(Math.random()-0.5, Math.random()-0.5, Math.random()-0.5);
        }
        speeds.push(Math.random() * 0.5 + 0.5);
        axes.push(Math.random(), Math.random(), Math.random());
    }
    geometry.setAttribute('aDirection', new THREE.InstancedBufferAttribute(new Float32Array(directions), 3));
    geometry.setAttribute('aSpeed', new THREE.InstancedBufferAttribute(new Float32Array(speeds), 1));
    geometry.setAttribute('aRotationAxis', new THREE.InstancedBufferAttribute(new Float32Array(axes), 3));
}

// ==========================================
// 2. 场景设置 (Cinematic Dark)
// ==========================================
const scene = new THREE.Scene();
scene.background = new THREE.Color('#050505');
scene.fog = new THREE.FogExp2('#050505', 0.02);

const camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 100);
camera.position.set(-6, 2, 16); // 侧视构图

const renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: "high-performance" });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.2;
document.getElementById('app').appendChild(renderer.domElement);

// 灯光 (Rim Light 重头戏)
const ambientLight = new THREE.AmbientLight('#111111', 1.0);
scene.add(ambientLight);

const rimLight = new THREE.SpotLight('#FFFACD', 8.0); // 强烈的背光
rimLight.position.set(-5, 5, -10);
rimLight.lookAt(0,0,0);
scene.add(rimLight);

const goldLight = new THREE.PointLight('#FFD700', 2.0, 20); // 局部补光
goldLight.position.set(5, 5, 5);
scene.add(goldLight);


// ==========================================
// 3. 构建粒子猛虎 (Procedural)
// ==========================================
const tigerGroup = new THREE.Group();
tigerGroup.position.x = -2; // 稍微居左
scene.add(tigerGroup);

// 材质：金钻粒子
const particleMat = new THREE.MeshStandardMaterial({
    color: '#FFD700',
    roughness: 0.2,
    metalness: 1.0,
    emissive: '#553300',
    emissiveIntensity: 0.2
});
setupParticleMaterial(particleMat); // 注入灵魂

// 隐形 Hitbox 集合 (用于点击检测)
const hitboxes = [];

function createBodyPart(count, scale, pos, name) {
    // 几何体：八面体 (钻石感)
    const geo = new THREE.OctahedronGeometry(0.05, 0);
    const mesh = new THREE.InstancedMesh(geo, particleMat, count);
    const dummy = new THREE.Object3D();
    const dirs = []; // 爆炸方向

    for(let i=0; i<count; i++) {
        // 在椭球体内随机分布
        const x = (Math.random()-0.5);
        const y = (Math.random()-0.5);
        const z = (Math.random()-0.5);
        if(x*x+y*y+z*z > 0.25) { i--; continue; } // 过滤成球状

        dummy.position.set(x*2, y*2, z*2);
        dummy.rotation.set(Math.random()*Math.PI, Math.random()*Math.PI, 0);
        // 粒子大小随机，制造闪烁感
        const s = Math.random() * 0.8 + 0.2;
        dummy.scale.set(s,s,s);
        
        dummy.updateMatrix();
        mesh.setMatrixAt(i, dummy.matrix);
        
        // 记录爆炸方向：沿法线向外
        dirs.push(x, y, z); 
    }
    
    // 填充 Shader 属性
    const dummyVec = new THREE.Vector3();
    fillAttributes(geo, count, (i, v) => v.set(dirs[i*3], dirs[i*3+1], dirs[i*3+2]).normalize());

    mesh.scale.set(scale.x, scale.y, scale.z);
    mesh.position.set(pos.x, pos.y, pos.z);
    tigerGroup.add(mesh);

    // 创建对应的隐形碰撞体
    const hitGeo = new THREE.SphereGeometry(1, 8, 8); // 简化碰撞体
    const hitMat = new THREE.MeshBasicMaterial({ visible: false });
    const hitMesh = new THREE.Mesh(hitGeo, hitMat);
    hitMesh.scale.set(scale.x, scale.y, scale.z);
    hitMesh.position.set(pos.x, pos.y, pos.z);
    hitMesh.name = "TigerPart_" + name;
    tigerGroup.add(hitMesh);
    hitboxes.push(hitMesh);

    return mesh;
}

// 组装老虎 (抽象形态)
createBodyPart(2000, {x:4.0, y:1.5, z:1.5}, {x:0, y:0, z:0}, "Body");
createBodyPart(800, {x:1.3, y:1.3, z:1.3}, {x:2.5, y:0.8, z:0}, "Head");
createBodyPart(400, {x:0.6, y:2.0, z:0.6}, {x:1.5, y:-1.2, z:0.6}, "LegFL");
createBodyPart(400, {x:0.6, y:2.0, z:0.6}, {x:1.5, y:-1.2, z:-0.6}, "LegFR");
createBodyPart(400, {x:0.6, y:2.0, z:0.6}, {x:-1.5, y:-1.2, z:0.6}, "LegBL");
createBodyPart(400, {x:0.6, y:2.0, z:0.6}, {x:-1.5, y:-1.2, z:-0.6}, "LegBR");
createBodyPart(300, {x:2.0, y:0.3, z:0.3}, {x:-3.0, y:0.5, z:0}, "Tail");


// ==========================================
// 4. 书法粒子系统 (Flying Calligraphy)
// ==========================================
let textMesh = null;
const textGroup = new THREE.Group();
scene.add(textGroup);

function createWishParticles(text) {
    // 清理旧的
    if (textMesh) { textGroup.remove(textMesh); textMesh.geometry.dispose(); }

    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    canvas.width = 512; canvas.height = 256;
    // 使用毛笔字体
    ctx.font = '100px "Ma Shan Zheng", cursive'; 
    ctx.fillStyle = 'white'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(text, 256, 128);

    const imgData = ctx.getImageData(0,0,512,256).data;
    const particles = [];
    for(let y=0; y<256; y+=3) { // 密度适中
        for(let x=0; x<512; x+=3) {
            if(imgData[(y*512+x)*4] > 128) {
                // 粒子化坐标
                particles.push({
                    x: (x/512 - 0.5) * 8, 
                    y: (1 - y/256) * 4, 
                    z: 0 
                });
            }
        }
    }

    const geo = new THREE.OctahedronGeometry(0.04, 0);
    const mat = new THREE.MeshBasicMaterial({ 
        color: 0xFFD700, 
        transparent: true, 
        opacity: 0.8,
        blending: THREE.AdditiveBlending 
    });
    // 【关键】文字粒子也注入爆炸逻辑！
    setupParticleMaterial(mat); 

    textMesh = new THREE.InstancedMesh(geo, mat, particles.length);
    const dummy = new THREE.Object3D();
    const dirs = [];
    for(let i=0; i<particles.length; i++) {
        dummy.position.set(particles[i].x, particles[i].y, particles[i].z);
        dummy.rotation.set(Math.random(), Math.random(), 0);
        dummy.updateMatrix();
        textMesh.setMatrixAt(i, dummy.matrix);
        // 文字爆炸方向：向前炸开
        dirs.push((Math.random()-0.5)*2, (Math.random()-0.5)*2, 2.0); 
    }
    fillAttributes(geo, particles.length, (i,v)=>v.set(dirs[i*3], dirs[i*3+1], dirs[i*3+2]).normalize());

    textGroup.add(textMesh);
    
    // 放置在右侧
    textGroup.position.set(3, 0, 0);
    
    // 入场动画：像墨水一样浮现
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
    
    // 检测是否点击了老虎身体的任何部分
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
    // 隐藏左侧 UI
    gsap.to(uiLayer, { opacity: 0, duration: 0.5 });
    // 相机拉近特效
    gsap.to(camera.position, { x: -4, y: 1, z: 10, duration: 1.0 });
}

function closeModal() {
    isModalOpen = false;
    modal.classList.remove('visible');
    setTimeout(() => modal.classList.add('hidden'), 600);
    // 相机复位
    gsap.to(camera.position, { x: -6, y: 2, z: 16, duration: 1.0 });
}

document.getElementById('wish-submit').addEventListener('click', () => {
    const text = input.value.trim();
    if (text) {
        createWishParticles(text); // 生成书法粒子
        closeModal();
        input.value = '';
    }
});
document.getElementById('close-modal').addEventListener('click', () => {
    closeModal();
    gsap.to(uiLayer, { opacity: 1, duration: 1 }); // 如果没许愿关闭，恢复UI
});


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
    targetExpansion = Math.max(0, Math.min(targetExpansion, 6.0)); // 允许炸得很开
});

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true; controls.enableZoom = false; 
controls.maxPolarAngle = Math.PI / 1.6;

const clock = new THREE.Clock();

function animate() {
    requestAnimationFrame(animate);
    const time = clock.getElapsedTime();
    
    // 1. 爆炸插值
    currentExpansion += (targetExpansion - currentExpansion) * 0.05;
    globalUniforms.uExpansion.value = currentExpansion;

    // 2. 老虎微动 (悬浮感)
    tigerGroup.position.y = Math.sin(time) * 0.1;
    tigerGroup.rotation.y = Math.sin(time * 0.2) * 0.1;

    // 3. 文字粒子漂浮
    if (textMesh) {
        textGroup.rotation.y = Math.sin(time * 0.5) * 0.05;
        textGroup.position.y = Math.sin(time * 0.3) * 0.1;
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