// main.js
// Questa scena è configurata per la visualizzazione di modelli complessi,
// con attenzione all'illuminazione, alle ombre e al rendering di qualità.

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

let floorMesh; // Variabile per tenere traccia della mesh del pavimento (ora una box)
let loadedModel; // Variabile per tenere traccia del modello GLB caricato


// --- 3. Funzione di Inizializzazione della Scena (init) ---
function init() {
    const canvas = document.getElementById('giostraCanvas');

    // --- Renderer ---
    renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: true });
    // Utilizza offsetWidth e offsetHeight per ottenere le dimensioni renderizzate dal CSS
    // Questo assicura che il renderer si adatti alle dimensioni effettive del canvas nel DOM
    renderer.setSize(canvas.offsetWidth, canvas.offsetHeight);
    renderer.setPixelRatio(window.devicePixelRatio); // Rende la scena nitida su schermi HiDPI
    renderer.setClearColor(0x000000); // Sfondo nero

    // Abilita le ombre sul renderer
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap; // Ombre più morbide

    // Impostazioni di Tone Mapping e Encoding per una migliore resa dei colori e luminosità
    renderer.toneMapping = THREE.ACESFilmicToneMapping; // Tone mapping cinematografico
    renderer.toneMappingExposure = 1.25; // Regola l'esposizione
    renderer.outputEncoding = THREE.sRGBEncoding; // Corretta gestione dello spazio colore

    // --- Scena ---
    scene = new THREE.Scene();

    // --- Camera ---
    // Utilizza offsetWidth e offsetHeight per calcolare l'aspect ratio corretto
    camera = new THREE.PerspectiveCamera(75, canvas.offsetWidth / canvas.offsetHeight, 0.1, 1000);
    camera.position.set(5, 5, 5); // Posizione iniziale della telecamera
    camera.lookAt(0, 0, 0); // La telecamera inizialmente guarda il centro della scena

    // --- Controlli della Telecamera (OrbitControls) ---
    controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true; // Abilita lo smorzamento per un movimento più fluido
    controls.dampingFactor = 0.05; // Fattore di smorzamento
    controls.maxPolarAngle = Math.PI / 2 - 0.05; // Limita l'angolo polare per non andare sotto il pavimento
    controls.minDistance = 0; // Distanza minima di zoom
    controls.maxDistance = 20; // Distanza massima di zoom
    controls.target.y = 2.0; // Mantenuto il target Y del tuo codice
    controls.update(); // Aggiorna i controlli dopo aver modificato il target

    // --- Creazione del Pavimento come Box ---
    createFloorBox(); // Chiama la nuova funzione per creare il pavimento


    // --- Luci: Direzionali e Spot (senza AmbientLight o HemisphereLight) ---

    // Luce Direzionale (simula il sole)
    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.4); // Colore bianco, intensità 0.4 (dal tuo codice)
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
    directionalLight.shadow.camera.left = -45; // Estendi l'area delle ombre
    directionalLight.shadow.camera.right = 45;
    directionalLight.shadow.camera.top = 45;
    directionalLight.shadow.camera.bottom = -45;
    directionalLight.shadow.bias = -0.0001; // Combatte lo shadow acne
    directionalLight.shadow.normalBias = 0.05; // Combatte il Peter Panning

    // Luce Spot (simula un faro)
    const spotLight = new THREE.SpotLight(0xff3500, 0.8); // Colore arancione, intensità 0.8 (dal tuo codice)
    spotLight.position.set(-8, 10, -8); // Posizione della luce spot
    spotLight.target.position.set(0, 0, 0); // La luce spot punta al centro
    spotLight.angle = Math.PI / 6; // Angolo del cono di luce
    spotLight.penumbra = 0.1; // Sfocatura dei bordi del cono di luce
    spotLight.decay = 2; // Decadimento dell'intensità con la distanza
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

    loadDEVOModel('./models/DEVO.glb', 2.0); // Carica il modello DEVO.glb con un fattore di scala

    window.addEventListener('resize', onWindowResize, false);

    // Avvia il loop di animazione
    animate();
}
// --- Funzione per Creare una Box come Pavimento ---
function createFloorBox() {
    const geometry = new THREE.BoxGeometry(90, 0.1, 90);
    const whiteMaterial = new THREE.MeshStandardMaterial({ color: 0xffffff }); // Materiale bianco

    floorMesh = new THREE.Mesh(geometry, whiteMaterial);
    floorMesh.position.set(0, -5, 0);  // Posizione identica al precedente pavimento GLB
    floorMesh.receiveShadow = true;
    floorMesh.castShadow = false;
    scene.add(floorMesh);
    console.log('Pavimento creato come box con successo.');
}

async function loadDEVOModel(modelPath, scaleFactor = 1.0) {
    const loader = new GLTFLoader();

    try {
        const gltf = await loader.loadAsync(modelPath);
        loadedModel = gltf.scene; // Assegna il modello caricato alla variabile globale

        // Imposta la scala del modello
        loadedModel.scale.set(6, 6, 6);
        // --- MODIFICA QUI: Posiziona il modello più a sinistra (-X) e più in alto (+Y) ---
        loadedModel.position.set(-2, 1.5, 0); // Esempio: -2 sull'asse X (sinistra), 1.5 sull'asse Y (in alto)

        // Materiale nero opaco
        const matteBlackMaterial = new THREE.MeshStandardMaterial({
            color: 0x000000, // Nero
            roughness: 0.8,  // Elevata rugosità per un aspetto opaco
            metalness: 0.1    // Bassa metallicità per un aspetto non metallico
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
    // Utilizza offsetWidth e offsetHeight per ottenere le dimensioni renderizzate dal CSS
    camera.aspect = canvas.offsetWidth / canvas.offsetHeight; // Usa offsetWidth/Height
    camera.updateProjectionMatrix();
    renderer.setSize(canvas.offsetWidth, canvas.offsetHeight); // Usa offsetWidth/Height
}

function animate() {
    requestAnimationFrame(animate);

    controls.update();

    renderer.render(scene, camera);
}

// Chiamata a init() solo dopo che il DOM è completamente caricato
window.onload = init;
