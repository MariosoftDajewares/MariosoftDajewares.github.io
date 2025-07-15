// home.js
// Scena 3D di sfondo stabile con nebulosa dinamica, effetto parallasse basato sul movimento del mouse,
// e particelle in movimento.

import * as THREE from './lib/three.module.js';

let camera, scene, renderer;

// Variabili per la nebulosa dinamica
let nebulaMesh;
let nebulaMaterial;
let clock = new THREE.Clock(); // Per il tempo nello shader

// Variabili per l'effetto parallasse
let mouseX = 0;
let mouseY = 0;
let targetX = 0;
let targetY = 0;
const parallaxSensitivity = 100; // Controlla l'intensità dell'effetto parallasse

// Variabili per le particelle (stelle)
let particles;
const particleCount = 20000; // Numero di particelle (raddoppiato)
const particleSpread = 1500; // Raggio di distribuzione delle particelle

function initBackgroundScene() {
    scene = new THREE.Scene();

    // Regolato il frustum per includere le particelle più lontane
    camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 1, 3000); 
    camera.position.set(0, 0, 300); // Posizione iniziale della telecamera

    renderer = new THREE.WebGLRenderer({ 
        alpha: true, // Permette la trasparenza del canvas, utile se ci sono altri elementi HTML sotto
        antialias: true // Migliora la qualità visiva rendendo i bordi più lisci
    });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(window.devicePixelRatio); // Adatta la risoluzione ai display ad alta densità
    
    // Gestione del canvas per assicurarsi che sia unico e posizionato correttamente
    const existingCanvas = document.getElementById('backgroundCanvas');
    if (existingCanvas) {
        // Se il canvas esiste già, lo rimuove e aggiunge il nuovo per evitare duplicati
        existingCanvas.parentNode.removeChild(existingCanvas);
    }
    document.body.appendChild(renderer.domElement);
    renderer.domElement.id = 'backgroundCanvas';
    renderer.domElement.style.position = 'fixed';
    renderer.domElement.style.top = '0';
    renderer.domElement.style.left = '0';
    renderer.domElement.style.width = '100vw';
    renderer.domElement.style.height = '100vh';
    renderer.domElement.style.zIndex = '-1'; // Pone il canvas dietro gli altri elementi HTML

    createDynamicNebula(); 
    createParticles(); 

    // Aggiungi listener per il ridimensionamento della finestra e il movimento del mouse
    window.addEventListener('resize', onWindowResizeBackground, false);
    window.addEventListener('mousemove', onDocumentMouseMove, false); 
}

/**
 * Gestisce il ridimensionamento della finestra per mantenere la scena responsiva.
 */
function onWindowResizeBackground() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
    // Aggiorna la risoluzione nello shader della nebulosa se presente
    if (nebulaMaterial && nebulaMaterial.uniforms.resolution) {
        nebulaMaterial.uniforms.resolution.value.set(window.innerWidth, window.innerHeight);
    }
}

/**
 * Gestisce il movimento del mouse per l'effetto parallasse.
 * Normalizza le coordinate del mouse da -1 a 1.
 * @param {MouseEvent} event - L'evento del mouse.
 */
function onDocumentMouseMove(event) {
    // Normalizza le coordinate del mouse da -1 (sinistra/basso) a 1 (destra/alto)
    mouseX = (event.clientX / window.innerWidth) * 2 - 1;
    mouseY = -(event.clientY / window.innerHeight) * 2 + 1; // Invertito per un effetto parallasse "naturale"
}

/**
 * Funzione di utilità per controllare gli errori di compilazione dello shader.
 * Utile per il debugging in fase di sviluppo.
 * @param {WebGLRenderingContext} gl - Il contesto WebGL.
 * @param {WebGLShader} shader - Lo shader da controllare.
 * @param {string} type - Il tipo di shader ('vertex' o 'fragment').
 */
function checkShaderError(gl, shader, type) {
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        console.error(`ERROR: ${type} shader compilation failed.`);
        console.error(gl.getShaderInfoLog(shader));
    }
}

/**
 * Funzione di utilità per controllare gli errori di collegamento del programma shader.
 * Utile per il debugging in fase di sviluppo.
 * @param {WebGLRenderingContext} gl - Il contesto WebGL.
 * @param {WebGLProgram} program - Il programma shader da controllare.
 */
function checkProgramError(gl, program) {
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
        console.error('ERROR: Shader program linking failed.');
        console.error(gl.getProgramInfoLog(program));
    }
    if (!gl.getProgramParameter(program, gl.VALIDATE_STATUS)) {
        console.error('ERROR: Shader program validation failed.');
        console.error(gl.getProgramInfoLog(program));
    }
}


/**
 * Crea e aggiunge una nebulosa dinamica alla scena utilizzando uno shader personalizzato.
 */
function createDynamicNebula() {
    // La sfera è grande per avvolgere completamente la scena e dare l'illusione di un cielo infinito
    const geometry = new THREE.SphereGeometry(800, 64, 64); 

    // Vertex Shader per la nebulosa: semplice pass-through
    const vertexShaderNebula = `
        precision highp float; 

        varying vec2 vUv;
        void main() {
            vUv = uv;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
    `;

    // Fragment Shader per la nebulosa: genera un rumore dinamico colorato
    const fragmentShaderNebula = `
        precision highp float; 

        uniform float time;
        uniform vec2 resolution;
        uniform vec3 color1; // Primo colore per la nebulosa
        uniform vec3 color2; // Secondo colore per la nebulosa
        uniform vec3 color3; // Terzo colore per la nebulosa

        varying vec2 vUv;

        // Funzione per generare un numero casuale basato su coordinate
        float random(vec2 co) { 
            return fract(sin(dot(co.xy ,vec2(12.9898,78.233))) * 43758.5453);
        }

        // Implementazione di un rumore di valore (simile al Perlin noise semplificato)
        float noise(vec2 st) {
            vec2 i = floor(st);
            vec2 f = fract(st);

            float a = random(i); 
            float b = random(i + vec2(1.0, 0.0)); 
            float c = random(i + vec2(0.0, 1.0)); 
            float d = random(i + vec2(1.0, 1.0)); 

            vec2 u = f * f * (3.0 - 2.0 * f); // Funzione di interpolazione smoothstep

            return mix(a, b, u.x) + 
                   (c - a) * u.y * (1.0 - u.x) + 
                   (d - b) * u.x * u.y;
        }

        // Funzione Fractional Brownian Motion (FBM) per un rumore più complesso e "nuvoloso"
        float fbm(vec2 st) {
            float value = 0.0;
            float amplitude = 0.5;
            for (int i = 0; i < 4; i++) { // 4 ottave per un buon dettaglio
                value += amplitude * noise(st);
                st *= 2.0; // Aumenta la frequenza
                amplitude *= 0.5; // Diminuisce l'ampiezza
            }
            return value;
        }

        void main() {
            // Normalizza le coordinate del frammento
            vec2 st = gl_FragCoord.xy / resolution.xy;
            st.x *= resolution.x / resolution.y; // Correzione aspetto ratio

            // Applica il rumore e lo anima nel tempo (velocità aumentata a 0.2)
            vec2 animatedSt = st * 3.0 + time * 0.2; 
            float n = fbm(animatedSt);

            // Miscela i colori in base al valore del rumore per creare l'effetto nebulosa
            vec3 finalColor = mix(mix(color1, color2, smoothstep(0.0, 0.5, n)), color3, smoothstep(0.5, 1.0, n));
            
            // Calcola l'opacità in base al rumore per rendere la nebulosa più o meno densa
            float alpha = smoothstep(0.2, 0.9, n); 
            alpha *= 0.9; // Opacità massima leggermente ridotta
            
            gl_FragColor = vec4(finalColor, alpha);
        }
    `;

    nebulaMaterial = new THREE.ShaderMaterial({
        uniforms: {
            time: { value: 0.0 }, // Uniforme per il tempo, aggiornato nell'animazione
            resolution: { value: new THREE.Vector2(window.innerWidth, window.innerHeight) }, // Risoluzione dello schermo
            color1: { value: new THREE.Color(0x000033) }, // Blu scuro
            color2: { value: new THREE.Color(0x330066) },  // Viola scuro
            color3: { value: new THREE.Color(0xFF00FF) }   // Magenta brillante
        },
        vertexShader: vertexShaderNebula,
        fragmentShader: fragmentShaderNebula,
        transparent: true, // Permette la trasparenza
        side: THREE.BackSide, // Renderizza la sfera dall'interno
        blending: THREE.AdditiveBlending // Aggiunge i colori per un effetto luminoso
    });

    nebulaMesh = new THREE.Mesh(geometry, nebulaMaterial);
    scene.add(nebulaMesh);
}

/**
 * Crea un sistema di particelle (stelle) e lo aggiunge alla scena.
 */
function createParticles() {
    const positions = new Float32Array(particleCount * 3); // Array per le coordinate x, y, z di ogni particella

    for (let i = 0; i < particleCount; i++) {
        // Distribuisce le particelle casualmente all'interno di una sfera
        positions[i * 3] = (Math.random() * 2 - 1) * particleSpread; 
        positions[i * 3 + 1] = (Math.random() * 2 - 1) * particleSpread; 
        positions[i * 3 + 2] = (Math.random() * 2 - 1) * particleSpread; 
    }

    const particleGeometry = new THREE.BufferGeometry();
    particleGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));

    // Utilizzo di THREE.PointsMaterial per una gestione più robusta delle particelle
    const particleMaterial = new THREE.PointsMaterial({
        color: 0xFFFFFF, // Colore bianco per le stelle
        size: 2.0,       // Dimensione delle particelle
        transparent: true,
        opacity: 0.8,
        blending: THREE.AdditiveBlending, // Per un effetto luminoso
        sizeAttenuation: true // Le particelle più lontane appaiono più piccole
    });

    particles = new THREE.Points(particleGeometry, particleMaterial);
    scene.add(particles);
}

/**
 * Funzione di animazione principale. Chiamata ad ogni frame.
 */
function animateBackgroundScene() {
    requestAnimationFrame(animateBackgroundScene); // Richiede il prossimo frame di animazione

    const elapsedTime = clock.getElapsedTime(); // Tempo trascorso dall'inizio

    // Aggiorna l'uniforme 'time' per lo shader della nebulosa per animarla
    if (nebulaMaterial) {
        nebulaMaterial.uniforms.time.value = elapsedTime;
    }

    // Logica del parallasse: la telecamera si muove dolcemente verso la posizione target
    targetX = -mouseX * parallaxSensitivity; 
    targetY = -mouseY * parallaxSensitivity;

    camera.position.x += (targetX - camera.position.x) * 0.05; // Movimento graduale sull'asse X
    camera.position.y += (targetY - camera.position.y) * 0.05; // Movimento graduale sull'asse Y

    camera.lookAt(scene.position); // La telecamera guarda sempre il centro della scena

    // Fa ruotare lentamente le particelle
    if (particles) {
        particles.rotation.y += 0.0005; 
        particles.rotation.x += 0.00025; 
    }

    renderer.render(scene, camera); // Renderizza la scena

    // DEBUG: Controlla errori di compilazione e linking del programma shader della nebulosa
    // (solo per la nebulosa, dato che le particelle usano un materiale standard)
    const gl = renderer.getContext();
    if (nebulaMesh && nebulaMaterial && nebulaMaterial.program && nebulaMaterial.program.program) {
        checkProgramError(gl, nebulaMaterial.program.program);
    }
}

// Avvia la scena quando la pagina è completamente caricata
window.addEventListener('load', () => {
    initBackgroundScene();
    animateBackgroundScene();
});
