// main.js
// Questa scena è configurata per la visualizzazione di modelli complessi,
// con attenzione all'illuminazione, alle ombre e al rendering di qualità.

// --- 1. Inclusione dei Moduli Base ---
import * as THREE from './lib/three.module.js';
import { OrbitControls } from './lib/OrbitControls.js';
import { GLTFLoader } from './lib/GLTFLoader.js';
import { RGBELoader } from './lib/RGBELoader.js';
// Rimosso: import { TextureLoader } from './lib/TextureLoader.js'; // Non più necessario per il pavimento GLB


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
    renderer.shadowMap.type = THREE.PCFSoftShadowMap; // Ombre più morbide

    // Impostazioni di Tone Mapping e Encoding per una migliore resa dei colori e luminosità
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
    controls.enableDamping = true; // Abilita lo smorzamento per un movimento più fluido
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
    directionalLight.shadow.camera.left = -15; // Estendi l'area delle ombre
    directionalLight.shadow.camera.right = 15;
    directionalLight.shadow.camera.top = 15;
    directionalLight.shadow.camera.bottom = -15;
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


    // --- Caricamento del Modello GLB Principale ---
    loadGLBModel('./models/FC.glb', 2.0); // Percorso del modello e fattore di scala


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

        // Posiziona il pavimento. Potrebbe essere necessario aggiustare questi valori
        // a seconda di come il tuo modello GLB è stato esportato da Blender.
        // Se è un piano orizzontale centrato all'origine, queste impostazioni dovrebbero andare bene.
        floorGLB.position.set(0, -0.3, 0); // Mantieni la posizione a 0,0,0
        floorGLB.scale.set(0.3,0.3,0.3);
	    // Se il tuo modello è stato esportato con l'asse Z come "up", potresti doverlo ruotare
        // floorGLB.rotation.x = -Math.PI / 2; // Ruota di -90 gradi sull'asse X per renderlo orizzontale

        // Assicurati che tutte le mesh all'interno del modello del pavimento ricevano ombre
        floorGLB.traverse((child) => {
            if (child.isMesh) {
                child.receiveShadow = true;
                // Se vuoi che il pavimento proietti ombre su altri oggetti (es. se ha delle sporgenze)
                // child.castShadow = true;
                if (child.material.isMeshStandardMaterial || child.material.isMeshPhysicalMaterial) {
                    child.material.needsUpdate = true;
                }
            }
        });
	
        scene.add(floorGLB);
        console.log('Modello GLB usato come pavimento caricato con successo:', floorModelPath);

    } catch (error) {
        console.error('Errore durante il caricamento del modello GLB del pavimento:', error);
    }
}


// --- Funzione per Caricare un Modello GLB Principale ---
async function loadGLBModel(modelPath, scaleFactor = 1.0) {
    const loader = new GLTFLoader();

    try {
        const gltf = await loader.loadAsync(modelPath);
        loadedModel = gltf.scene; // Assegna il modello caricato alla variabile globale

        // Imposta la scala del modello
        loadedModel.scale.set(scaleFactor, scaleFactor, scaleFactor);
        loadedModel.position.y = 0; // Posiziona il modello principale a Y=0 come da tuo codice

        // Assicurati che il modello proietti e riceva ombre
        loadedModel.traverse((child) => {
            if (child.isMesh) {
                child.castShadow = true;
                child.receiveShadow = true;
                // Se il modello ha materiali PBR, assicurati che siano compatibili con le ombre
                if (child.material.isMeshStandardMaterial || child.material.isMeshPhysicalMaterial) {
                    child.material.needsUpdate = true; // Assicurati che i materiali vengano aggiornati
                }
            }
        });

        scene.add(loadedModel);
        console.log('Modello GLB caricato con successo:', modelPath);

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
        console.error('Errore durante il caricamento del modello GLB:', error);
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
