// main.js
// Questa scena � configurata per la visualizzazione di modelli complessi,
// con attenzione all'illuminazione, alle ombre e al rendering di qualit�.

// --- 1. Inclusione dei Moduli Base ---
import * as THREE from './lib/three.module.js';
import { OrbitControls } from './lib/OrbitControls.js';
import { GLTFLoader } from './lib/GLTFLoader.js';
import { RGBELoader } from './lib/RGBELoader.js';


// --- 2. Dichiarazione delle Variabili Globali della Scena ---
let scene;
let camera;
let renderer;
let controls;

let floorGLB; // Variabile per tenere traccia del modello GLB usato come pavimento
let loadedModel; // Variabile per tenere traccia del modello GLB caricato


// --- 3. Funzione di Inizializzazione della Scena (init) ---
function init() {
    const canvas = document.getElementById('giostraCanvas');

    // --- Renderer ---
    renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: true });
    renderer.setSize(canvas.clientWidth, canvas.clientHeight);
    renderer.setPixelRatio(window.devicePixelRatio); // Rende la scena nitida su schermi HiDPI
    renderer.setClearColor(0x000000); // Sfondo nero

    // Abilita le ombre sul renderer
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap; // Ombre pi� morbide

    // Impostazioni di Tone Mapping e Encoding per una migliore resa dei colori e luminosit�
    renderer.toneMapping = THREE.ACESFilmicToneMapping; // Tone mapping cinematografico
    renderer.toneMappingExposure = 1.25; // Regola l'esposizione
    renderer.outputEncoding = THREE.sRGBEncoding; // Corretta gestione dello spazio colore

    // --- Scena ---
    scene = new THREE.Scene();

    // --- Camera ---
    camera = new THREE.PerspectiveCamera(75, canvas.clientWidth / canvas.clientHeight, 0.1, 1000);
    camera.position.set(5, 5, 5); // Posizione iniziale della telecamera
    camera.lookAt(0, 0, 0); // La telecamera inizialmente guarda il centro della scena

    // --- Controlli della Telecamera (OrbitControls) ---
    controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true; // Abilita lo smorzamento per un movimento pi� fluido
    controls.dampingFactor = 0.05; // Fattore di smorzamento
    controls.maxPolarAngle = Math.PI / 2 - 0.05; // Limita l'angolo polare per non andare sotto il pavimento
    controls.minDistance = 0; // Distanza minima di zoom
    controls.maxDistance = 20; // Distanza massima di zoom
    controls.target.y = 2.0; // Mantenuto il target Y del tuo codice
    controls.update(); // Aggiorna i controlli dopo aver modificato il target

    // --- Caricamento del Pavimento come Modello GLB ---
    loadGLBAsFloor('./models/floor.glb'); // Carica il tuo modello GLB per il pavimento


    // --- Luci: Direzionali e Spot (senza AmbientLight o HemisphereLight) ---

    // Luce Direzionale (simula il sole)
    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.4); // Colore bianco, intensit� 0.4 (dal tuo codice)
    directionalLight.position.set(10, 15, 10); // Posizione della luce
    directionalLight.target.position.set(0, 0, 0); // La luce punta al centro della scena
    scene.add(directionalLight);
    scene.add(directionalLight.target); // Aggiungi il target alla scena per posizionarlo

    directionalLight.castShadow = true; // Questa luce proietta ombre

    // Configurazione della telecamera delle ombre per la luce direzionale
    directionalLight.shadow.mapSize.width = 2048; // Risoluzione della mappa delle ombre
    directionalLight.shadow.mapSize.height = 2048;
    directionalLight.shadow.camera.near = 0.5;
    directionalLight.shadow.camera.far = 50;
    // --- MODIFICA QUI: Aumenta l'area delle ombre per il pavimento pi� grande ---
    directionalLight.shadow.camera.left = -45; // Estendi l'area delle ombre
    directionalLight.shadow.camera.right = 45;
    directionalLight.shadow.camera.top = 45;
    directionalLight.shadow.camera.bottom = -45;
    directionalLight.shadow.bias = -0.0001; // Combatte lo shadow acne
    directionalLight.shadow.normalBias = 0.05; // Combatte il Peter Panning

    // Luce Spot (simula un faro)
    const spotLight = new THREE.SpotLight(0xff3500, 0.8); // Colore arancione, intensit� 0.8 (dal tuo codice)
    spotLight.position.set(-8, 10, -8); // Posizione della luce spot
    spotLight.target.position.set(0, 0, 0); // La luce spot punta al centro
    spotLight.angle = Math.PI / 6; // Angolo del cono di luce
    spotLight.penumbra = 0.1; // Sfocatura dei bordi del cono di luce
    spotLight.decay = 2; // Decadimento dell'intensit� con la distanza
    spotLight.distance = 50; // Distanza massima della luce
    scene.add(spotLight);
    scene.add(spotLight.target);

    spotLight.castShadow = true; // Questa luce proietta ombre

    // Configurazione della telecamera delle ombre per la luce spot
    spotLight.shadow.mapSize.width = 1024;
    spotLight.shadow.mapSize.height = 1024;
    spotLight.shadow.camera.near = 0.5;
    spotLight.shadow.camera.far = 50;
    spotLight.shadow.bias = -0.0001;
    spotLight.shadow.normalBias = 0.05;


    // --- Caricamento della Skybox Notturna da file EXR ---
    const rgbeLoader = new RGBELoader();
    rgbeLoader.load('./txt/ssky.hdr', function (texture) {
        texture.mapping = THREE.EquirectangularReflectionMapping; // Mappatura equirettangolare per HDRIs
        scene.environment = texture; // Usa la HDRI per l'illuminazione basata sull'immagine (PBR)
        scene.background = texture;  // Usa la HDRI come sfondo della scena
    }, undefined, (error) => {
        console.error('Errore nel caricamento della skybox EXR:', error);
        scene.background = new THREE.Color(0x444488);
    });


    // --- Caricamento del Modello GLB Principale (DEVO.glb) ---
    loadDEVOModel('./models/DEVO.glb', 2.0); // Carica il modello DEVO.glb con un fattore di scala


    // --- Gestione del Ridimensionamento della Finestra ---
    window.addEventListener('resize', onWindowResize, false);

    // Avvia il loop di animazione
    animate();
}

// --- Funzione per Caricare un Modello GLB come Pavimento ---
async function loadGLBAsFloor(floorModelPath) {
    const loader = new GLTFLoader();

    try {
        const gltf = await loader.loadAsync(floorModelPath);
        floorGLB = gltf.scene; // Assegna il modello del pavimento alla variabile globale

        floorGLB.position.set(0, -5, 0); // Mantieni la posizione a 0,0,0
        // --- MODIFICA QUI: Aumenta la scala del pavimento ---
        floorGLB.scale.set(3.0, 3.0, 3.0); // Scala molto pi� grande per un pavimento pi� ampio
        
        // Assegna un materiale MeshStandardMaterial bianco a tutte le mesh del pavimento
        const whiteMaterial = new THREE.MeshStandardMaterial({ color: 0xffffff }); // Materiale bianco
        floorGLB.traverse((child) => {
            if (child.isMesh) {
                child.material = whiteMaterial; // Assegna il nuovo materiale
                child.receiveShadow = true;
                child.castShadow = false; // Il pavimento solitamente non proietta ombre significative su altri oggetti
                child.material.needsUpdate = true;
            }
        });
    
        scene.add(floorGLB);
        console.log('Modello GLB usato come pavimento caricato con successo:', floorModelPath);

    } catch (error) {
        console.error('Errore durante il caricamento del modello GLB del pavimento:', error);
    }
}


// --- Funzione per Caricare il Modello DEVO.glb e applicare materiale opaco ---
async function loadDEVOModel(modelPath, scaleFactor = 1.0) {
    const loader = new GLTFLoader();

    try {
        const gltf = await loader.loadAsync(modelPath);
        loadedModel = gltf.scene; // Assegna il modello caricato alla variabile globale

        // Imposta la scala del modello
        loadedModel.scale.set(6, 6, 6);
        // --- MODIFICA QUI: Posiziona il modello pi� a sinistra (-X) e pi� in alto (+Y) ---
        loadedModel.position.set(-2, 1.5, 0); // Esempio: -2 sull'asse X (sinistra), 1.5 sull'asse Y (in alto)

        // Materiale nero opaco
        const matteBlackMaterial = new THREE.MeshStandardMaterial({
            color: 0x000000, // Nero
            roughness: 0.8,  // Elevata rugosit� per un aspetto opaco
            metalness: 0.1   // Bassa metallicit� per un aspetto non metallico
        });

        // Assicurati che il modello proietti e riceva ombre e applica il nuovo materiale
        loadedModel.traverse((child) => {
            if (child.isMesh) {
                child.material = matteBlackMaterial; // Applica il materiale nero opaco
                child.castShadow = true;
                child.receiveShadow = true;
                child.material.needsUpdate = true; // Assicurati che i materiali vengano aggiornati
            }
        });

        scene.add(loadedModel);
        console.log('Modello GLB DEVO.glb caricato con successo:', modelPath);

        // Opzionale: Centra la telecamera sul modello caricato
        const box = new THREE.Box3().setFromObject(loadedModel);
        const center = box.getCenter(new THREE.Vector3());
        const size = box.getSize(new THREE.Vector3());

        const maxDim = Math.max(size.x, size.y, size.z);
        const fov = camera.fov * (Math.PI / 180);
        let cameraZ = Math.abs(maxDim / 2 / Math.tan(fov / 2));
        cameraZ *= 1.5; // Aggiungi un po' di spazio extra

        camera.position.set(center.x + cameraZ, center.y + cameraZ, center.z + cameraZ); // Posiziona la telecamera
        camera.lookAt(center); // Fai in modo che la telecamera guardi il centro del modello
        controls.target.copy(center); // Aggiorna il target dei controlli
        controls.update(); // Aggiorna i controlli dopo aver cambiato il target
        controls.minDistance = cameraZ / 5; // Regola la distanza minima di zoom
        controls.maxDistance = cameraZ * 5; // Regola la distanza massima di zoom

    } catch (error) {
        console.error('Errore durante il caricamento del modello GLB DEVO.glb:', error);
    }
}


// --- 4. Funzione per il Ridimensionamento della Finestra ---
function onWindowResize() {
    const canvas = document.getElementById('giostraCanvas');
    camera.aspect = canvas.clientWidth / canvas.clientHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(canvas.clientWidth, canvas.clientHeight);
}


// --- 5. Funzione di Animazione (animate) ---
function animate() {
    requestAnimationFrame(animate);

    // Aggiorna i controlli della telecamera
    controls.update();

    // Esegui il rendering della scena
    renderer.render(scene, camera);
}


// --- 6. Avvio dell'Applicazione ---
init();
