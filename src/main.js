import './style.css'; 
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import gsap from 'gsap';

// ==========================================
// 0. 初始化 UI 结构
// ==========================================
document.body.innerHTML += `
  <div id="app"></div>
  <div id="ui-layer">
    <h1 class="title-en">GOLDEN TIGER</h1>
    <h2 class="title-cn">你的守护神</h2>
    <div class="hint">TOUCH THE SPIRIT</div>
  </div>
  <div id="wish-modal" class="hidden">
    <div class="modal-content">
      <div id="close-modal">✕</div>
      <h3 class="modal-title">MAKE A WISH</h3>
      <input type="text" id="wish-input" placeholder="..." autocomplete="off">
      <button id="wish-submit">IGNITE</button>
    </div>
  </div>
`;

// UI 进场动画 (极慢，高级感)
gsap.to('.title-en', { opacity: 1, x: 0, duration: 2.5, ease: "power2.out", delay: 1 });
gsap.to('.title-cn', { opacity: 1, x: 0, duration: 2.5, ease: "power2.out", delay: 1.5 });
gsap.to('.hint', { opacity: 0.6, duration: 3, delay: 3 });


// ==========================================
// 1. 核心 Shader: 注入奔跑动画逻辑
// ==========================================
// 我们把动画写在 Shader 里，这样几千个粒子才不会卡
const globalUniforms = { 
    uTime: { value: 0 },
    uSpeed: { value: 1.0 } // 奔跑速度
};

function setupTigerMaterial(material) {
    material.onBeforeCompile = (shader) => {
        shader.uniforms.uTime = globalUniforms.uTime;
        shader.uniforms.uSpeed = globalUniforms.uSpeed;
        
        // 顶点着色器：计算粒子位移
        shader.vertexShader = `
            uniform float uTime;
            uniform float uSpeed;
            attribute vec3 aOffset; // 粒子的原始偏移
            attribute float aPhase; // 动画相位
            attribute float aPart;  // 部位 ID: 0=身, 1=头, 2=腿, 3=尾
            
            // 旋转函数
            mat4 rotateX(float angle) {
                float s = sin(angle); float c = cos(angle);
                return mat4(1,0,0,0, 0,c,-s,0, 0,s,c,0, 0,0,0,1);
            }
            mat4 rotateZ(float angle) {
                float s = sin(angle); float c = cos(angle);
                return mat4(c,-s,0,0, s,c,0,0, 0,0,1,0, 0,0,0,1);
            }
            
            ${shader.vertexShader}
        `;
        
        shader.vertexShader = shader.vertexShader.replace(
            '#include <begin_vertex>',
            `
            #include <begin_vertex>
            
            float t = uTime * 4.0 * uSpeed;
            
            // 1. 身体起伏 (Body)
            if (aPart < 0.5) {
                transformed.y += sin(t * 2.0) * 0.1; 
                transformed.x += sin(t) * 0.05; // 左右微摆
            }
            // 2. 头部 (Head) - 稍微滞后一点
            else if (aPart < 1.5) {
                transformed.y += sin(t * 2.0 - 0.5) * 0.1;
                // 偶尔转头
                // transformed = (rotateX(sin(uTime)*0.1) * vec4(transformed, 1.0)).xyz;
            }
            // 3. 腿部 (Legs) - 绕枢轴旋转
            else if (aPart < 2.5) {
                // 简单模拟：根据相位做椭圆运动
                float runCycle = t + aPhase;
                transformed.y += sin(runCycle) * 0.5;
                transformed.z += cos(runCycle) * 0.8;
            }
            // 4. 尾巴 (Tail) - 正弦波
            else {
                float wave = sin(t + transformed.x * 2.0);
                transformed.y += wave * 0.2;
                transformed.z += cos(t) * 0.1;
            }
            
            // 整体流体感：粒子微动
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
// 2. 极简高级场景
// ==========================================
const scene = new THREE.Scene();
scene.background = new THREE.Color('#000000'); // 纯黑
scene.fog = new THREE.FogExp2('#000000', 0.02);

const camera = new THREE.PerspectiveCamera(35, window.innerWidth / window.innerHeight, 0.1, 100);
// 侧面长焦视角，更像电影
camera.position.set(-8, 1, 15); 
camera.lookAt(0, 0, 0);

const renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: "high-performance" });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;
document.getElementById('app').appendChild(renderer.domElement);

// --- 顶级布光 (Noir Lighting) ---
// 1. 极其微弱的环境光
const ambientLight = new THREE.AmbientLight('#111111', 1.0);
scene.add(ambientLight);

// 2. 强轮廓光 (Rim Light) - 关键！从背面打过来，勾勒边缘
const rimLight = new THREE.SpotLight('#4466ff', 10.0);
rimLight.position.set(-5, 5, -10);
rimLight.lookAt(0,0,0);
rimLight.penumbra = 0.5;
scene.add(rimLight);

// 3. 暖金主光 (Key Light) - 照亮局部
const keyLight = new THREE.DirectionalLight('#FFD700', 2.0);
keyLight.position.set(5, 5, 5);
scene.add(keyLight);


// ==========================================
// 3. 粒子猛虎 (Procedural)
// ==========================================
const tigerGroup = new THREE.Group();
scene.add(tigerGroup);

// 材质：高反光金属金
const tigerMat = new THREE.MeshStandardMaterial({ 
    color: '#FFD700', 
    roughness: 0.15, 
    metalness: 1.0, 
    emissive: '#332200', 
    emissiveIntensity: 0.2 
});
setupTigerMaterial(tigerMat);

// 辅助生成器
function createPart(count, scale, pos, partID, phaseFunc) {
    // 使用八面体，像钻石一样闪烁
    const geo = new THREE.OctahedronGeometry(0.04, 0); 
    const mesh = new THREE.InstancedMesh(geo, tigerMat, count);
    
    const dummy = new THREE.Object3D();
    for(let i=0; i<count; i++) {
        // 在体积内随机分布
        const x = (Math.random()-0.5);
        const y = (Math.random()-0.5);
        const z = (Math.random()-0.5);
        if(x*x+y*y+z*z > 0.25) { i--; continue; } // 球形过滤
        
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

// 组装老虎
// 1. 身体 (Part 0)
createPart(2000, {x:4.5, y:1.5, z:1.5}, {x:0, y:0, z:0}, 0);

// 2. 头部 (Part 1)
const headMesh = createPart(800, {x:1.4, y:1.4, z:1.4}, {x:2.5, y:0.8, z:0}, 1);
// 头部点击检测区
const headHitbox = new THREE.Mesh(new THREE.SphereGeometry(1.0), new THREE.MeshBasicMaterial({visible:false}));
headHitbox.position.copy(headMesh.position);
tigerGroup.add(headHitbox);

// 3. 四肢 (Part 2)
const legScale = {x:0.6, y:2.2, z:0.6};
createPart(400, legScale, {x:1.5, y:-1.2, z:0.6}, 2, ()=>0); // 右前
createPart(400, legScale, {x:1.5, y:-1.2, z:-0.6}, 2, ()=>Mat