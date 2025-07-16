import * as THREE from './lib/three.module.js';

export function createInteractiveFluidScene(containerId, initialColor) {
    const container = document.getElementById(containerId);
    if (!container) {
        console.error(`Container with ID '${containerId}' not found.`);
        return;
    }

    let camera, scene, renderer;
    let mainMaterial, mainPlane;
    let mouse = new THREE.Vector2();
    let isMouseDown = false;

    // --- Render Targets per la "scia" (feedback loop) ---
    let renderTargetA, renderTargetB;
    let currentRenderTarget; 
    let previousRenderTarget; 
    
    let rtScene, rtCamera, rtMaterial, rtPlane; 

    // Valori regolati per un effetto più visibile e denso
    const trailDecay = 0.97; 
    const trailStrength = 0.25; 
    const waveDistortionInfluence = 0.25; 
    const waveTrailAmplitude = 2.0; 
    // `fluidColorContrast` non sarà più usato direttamente allo stesso modo,
    // ma la sua funzione sarà integrata nel nuovo approccio al colore.

    // Uniforms per il main shader (il tuo fluido)
    const mainUniforms = {
        u_time: { value: 0.0 },
        u_resolution: { value: new THREE.Vector2(window.innerWidth, window.innerHeight) },
        u_fluid_color: { value: new THREE.Color(initialColor || 0x0077ff) },
        u_trail_texture: { value: null }, 
        u_wave_frequency: { value: 60.0 }, 
        u_wave_amplitude: { value: 0.07 } 
    };

    // Uniforms per lo shader del Render Target (per disegnare la "scia")
    const rtUniforms = {
        u_mouse_pos: { value: new THREE.Vector2(-1, -1) }, 
        u_strength: { value: 0.0 }, 
        u_trail_decay: { value: trailDecay },
        u_current_texture: { value: null } 
    };

    // --- VERTEX SHADERS (semplici, comuni a entrambi gli shader) ---
    const vertexShader = `
        varying vec2 vUv;
        void main() {
            vUv = uv;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
    `;

    // --- FRAGMENT SHADER per la "scia" (Render Target) ---
    const rtFragmentShader = `
        uniform vec2 u_mouse_pos;
        uniform float u_strength;
        uniform float u_trail_decay;
        uniform sampler2D u_current_texture; 

        varying vec2 vUv;

        void main() {
            vec4 existingColor = texture2D(u_current_texture, vUv) * u_trail_decay;

            float dist = distance(vUv, u_mouse_pos);
            float brush = smoothstep(0.1, 0.0, dist); 
            
            gl_FragColor = existingColor + vec4(vec3(brush * u_strength), 1.0);
        }
    `;

    // --- FRAGMENT SHADER per il fluido (main scene) ---
    const fluidFragmentShader = `
        uniform float u_time;
        uniform vec2 u_resolution;
        uniform vec3 u_fluid_color;
        uniform sampler2D u_trail_texture; 
        uniform float u_wave_frequency;
        uniform float u_wave_amplitude;

        varying vec2 vUv;

        float random(vec2 st) {
            return fract(sin(dot(st.xy, vec2(12.9898, 78.233))) * 43758.5453123);
        }

        float noise(vec2 st) {
            vec2 i = floor(st);
            vec2 f = fract(st);

            float a = random(i);
            float b = random(i + vec2(1.0, 0.0));
            float c = random(i + vec2(0.0, 1.0));
            float d = random(i + vec2(1.0, 1.0));

            vec2 u = f * f * (3.0 - 2.0 * f); 
            return mix(a, b, u.x) + (c - a) * u.y * (1.0 - u.x) + (d - b) * u.x * u.y;
        }

        float fbm(vec2 st) {
            float value = 0.0;
            float amplitude = 0.5;
            float frequency = 0.0;
            for (int i = 0; i < 4; i++) { 
                value += amplitude * noise(st);
                st *= 2.0; 
                amplitude *= 0.5; 
            }
            return value;
        }

        void main() {
            vec2 st = vUv * 3.0; 

            vec4 trail = texture2D(u_trail_texture, vUv);
            float trailInfluence = trail.r; 

            vec2 distortedUv = vUv + trailInfluence * ${waveDistortionInfluence.toFixed(2)} * sin(u_time * 2.0 + vUv.x * 10.0);
            
            float noiseValue = fbm(distortedUv * u_wave_frequency + u_time * 0.05);

            float waveEffect = noiseValue * u_wave_amplitude + trailInfluence * ${waveTrailAmplitude.toFixed(1)}; 

            // --- NUOVE MODIFICHE PER EFFETTO 3D E NESSUN NERO SOTTO ---
            // Colore base più luminoso e uniforme per evitare il nero
            vec3 baseColor = u_fluid_color * 0.7; // Un colore di base più chiaro, sempre visibile

            // Aggiungi un senso di "profondità" variando la luminosità/saturazione con il rumore
            // waveEffect (che include noiseValue e trailInfluence) determina la "superficie"
            // Le aree con waveEffect più alto saranno più luminose e vicine al colore puro
            // Le aree con waveEffect più basso saranno leggermente più scure/desaturate, simulando profondità
            
            // Applica l'effetto dell'onda per simulare punti luce/riflessi
            vec3 finalColor = baseColor + u_fluid_color * waveEffect * 0.5; 
            
            // Mixa il colore per dare un senso di "lucentezza" dove l'effetto è forte
            // e mantieni un colore più denso dove è debole, evitando il nero.
            // Il mix va da un colore leggermente più scuro/denso a un colore più vibrante e illuminato
            finalColor = mix(baseColor * 0.6, finalColor, smoothstep(0.0, 1.0, waveEffect));

            // Potresti anche provare a moltiplicare per un fattore leggermente più alto per un effetto più luminoso complessivo
            // finalColor *= 1.2; 

            gl_FragColor = vec4(finalColor, 1.0);
        }
    `;

    function init() {
        renderer = new THREE.WebGLRenderer({ antialias: true });
        renderer.setSize(window.innerWidth, window.innerHeight);
        renderer.setPixelRatio(window.devicePixelRatio); 
        container.appendChild(renderer.domElement); 

        const rtOptions = {
            minFilter: THREE.LinearFilter,
            magFilter: THREE.LinearFilter,
            format: THREE.RGBAFormat,
            type: THREE.FloatType 
        };
        renderTargetA = new THREE.WebGLRenderTarget(window.innerWidth, window.innerHeight, rtOptions);
        renderTargetB = new THREE.WebGLRenderTarget(window.innerWidth, window.innerHeight, rtOptions);
        
        currentRenderTarget = renderTargetA;
        previousRenderTarget = renderTargetB;

        rtCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
        rtScene = new THREE.Scene();
        rtMaterial = new THREE.ShaderMaterial({
            uniforms: rtUniforms,
            vertexShader: vertexShader,
            fragmentShader: rtFragmentShader
        });
        rtPlane = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), rtMaterial);
        rtScene.add(rtPlane);

        camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
        scene = new THREE.Scene();
        mainMaterial = new THREE.ShaderMaterial({
            uniforms: mainUniforms,
            vertexShader: vertexShader,
            fragmentShader: fluidFragmentShader
        });
        mainPlane = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), mainMaterial);
        scene.add(mainPlane);

        mainUniforms.u_trail_texture.value = previousRenderTarget.texture;

        window.addEventListener('resize', onWindowResize, false);
        
        renderer.domElement.addEventListener('mousemove', onMove, false);
        renderer.domElement.addEventListener('mousedown', onDown, false);
        renderer.domElement.addEventListener('mouseup', onUp, false);
        
        renderer.domElement.addEventListener('touchmove', onMove, { passive: false });
        renderer.domElement.addEventListener('touchstart', onDown, { passive: false });
        renderer.domElement.addEventListener('touchend', onUp, { passive: false });
    }

    function onWindowResize() {
        renderer.setSize(window.innerWidth, window.innerHeight);
        renderer.setPixelRatio(window.devicePixelRatio);

        renderTargetA.setSize(window.innerWidth, window.innerHeight);
        renderTargetB.setSize(window.innerWidth, window.innerHeight);

        mainUniforms.u_resolution.value.set(window.innerWidth, window.innerHeight);
    }

    function updateMousePosition(clientX, clientY) {
        mouse.x = (clientX / window.innerWidth);
        mouse.y = 1.0 - (clientY / window.innerHeight);
    }

    function onMove(event) {
        if (event.touches) { 
            if (event.touches.length > 0) {
                updateMousePosition(event.touches[0].clientX, event.touches[0].clientY);
            }
        } else { 
            updateMousePosition(event.clientX, event.clientY);
        }
        if (isMouseDown) {
            rtUniforms.u_strength.value = trailStrength;
            rtUniforms.u_mouse_pos.value.copy(mouse);
        }
        event.preventDefault(); 
    }

    function onDown(event) {
        isMouseDown = true;
        onMove(event); 
    }

    function onUp() {
        isMouseDown = false;
        rtUniforms.u_strength.value = 0.0; 
    }

    function animate() {
        requestAnimationFrame(animate);

        [currentRenderTarget, previousRenderTarget] = [previousRenderTarget, currentRenderTarget];

        renderer.setRenderTarget(currentRenderTarget);
        rtUniforms.u_current_texture.value = previousRenderTarget.texture; 
        renderer.render(rtScene, rtCamera);
        
        renderer.setRenderTarget(null); 
        mainUniforms.u_trail_texture.value = currentRenderTarget.texture;
        mainUniforms.u_time.value += 0.01; 
        renderer.render(scene, camera);
    }

    init();
    animate();

    return {
        setFluidColor: (hexColor) => {
            mainUniforms.u_fluid_color.value.set(new THREE.Color(hexColor));
        }
    };
}