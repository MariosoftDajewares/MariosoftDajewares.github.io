// GLB_loader.js
// Gestisce la scena Three.js per il caricamento di modelli GLB e controlli UI.

import * as THREE from './lib/three.module.js';
import { OrbitControls } from './lib/OrbitControls.js';
import { GLTFLoader } from './lib/GLTFLoader.js';

let camera, scene, renderer, controls;
let loadedModel = null; // Variabile per tenere traccia del modello caricato
let floorMesh = null;   // Variabile per tenere traccia del mesh del pavimento

// Mappa dei colori per facilitare la conversione da nome a valore esadecimale Three.js
const colorMap = {
    'Bianco': 0xffffff,
    'Grigio': 0x404040, // Un grigio medio, simile a quello che avevi
    'Nero': 0x000000
};

// Funzione per inizializzare la scena Three.js
function initScene() {
    // Inizializzazione della scena
    scene = new THREE.Scene();
    scene.background = new THREE.Color(colorMap['Bianco']); // Sfondo iniziale Bianco (MODIFICATO)

    // Inizializzazione della telecamera
    camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 2000);
    camera.position.set(0, 0, 5); // Posizione iniziale della telecamera

    // Inizializzazione del renderer
    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(window.devicePixelRatio);

    // Collega il renderer al canvas specificato nell'HTML
    const canvasContainer = document.getElementById('threeJsCanvas');
    if (canvasContainer) {
        // Aggiunge il renderer al div container, non lo sostituisce
        canvasContainer.appendChild(renderer.domElement);
    } else {
        // Fallback se il container non esiste, ma l'HTML dovrebbe fornirlo
        document.body.appendChild(renderer.domElement);
        renderer.domElement.id = 'threeJsRenderCanvas'; // ID diverso per il canvas effettivo
    }

    // Inizializzazione degli OrbitControls
    controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true; // Abilita lo smorzamento (inerzia)
    controls.dampingFactor = 0.05;
    controls.screenSpacePanning = false; // Non permette il panning nello spazio dello schermo
    controls.minDistance = 1;
    controls.maxDistance = 100;

    // Aggiungi luci alla scena
    const ambientLight = new THREE.AmbientLight(0x404040, 5); // Luce ambientale (colore, intensità)
    scene.add(ambientLight);
    const directionalLight = new THREE.DirectionalLight(0xffffff, 3); // Luce direzionale
    directionalLight.position.set(1, 1, 1).normalize();
    scene.add(directionalLight);

    // Crea il pavimento
    const planeGeometry = new THREE.PlaneGeometry(100, 100); // Grande abbastanza per un'ampia scena
    // Materiale standard per il pavimento, double-sided per essere visibile da entrambi i lati
    const planeMaterial = new THREE.MeshStandardMaterial({ color: colorMap['Bianco'], side: THREE.DoubleSide }); // Pavimento iniziale Bianco (MODIFICATO)
    floorMesh = new THREE.Mesh(planeGeometry, planeMaterial);
    floorMesh.rotation.x = Math.PI / 2; // Ruota per renderlo orizzontale (il piano di default è XY)
    floorMesh.position.y = -1; // Posiziona leggermente sotto l'origine per i modelli
    scene.add(floorMesh);

    // Aggiungi un listener per il ridimensionamento della finestra
    window.addEventListener('resize', onWindowResize, false);

    // Aggiungi gli elementi GUI
    setupGUI();
}

// Funzione per gestire il ridimensionamento della finestra
function onWindowResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
}

// Funzione di animazione (loop di rendering)
function animate() {
    requestAnimationFrame(animate);
    controls.update(); // Aggiorna i controlli in ogni frame
    renderer.render(scene, camera); // Renderizza la scena
}

// Funzione per aggiornare il colore di sfondo della scena
function updateBackgroundColor(colorName) {
    const hexColor = colorMap[colorName];
    if (hexColor !== undefined) {
        scene.background = new THREE.Color(hexColor);
    }
}

// Funzione per aggiornare il colore del pavimento
function updateFloorColor(colorName) {
    const hexColor = colorMap[colorName];
    if (hexColor !== undefined && floorMesh) {
        floorMesh.material.color.set(hexColor);
    }
}

// Funzione per configurare gli elementi dell'interfaccia utente (GUI)
function setupGUI() {
    // Contenitore per i controlli GUI
    const guiContainer = document.createElement('div');
    // Modificato: Aggiunto z-10 per assicurare che sia sopra il canvas
    // Aggiunto bg-gray-800 e p-4 per renderlo più visibile
    guiContainer.className = 'absolute bottom-4 left-1/2 -translate-x-1/2 flex flex-col md:flex-row space-y-2 md:space-y-0 md:space-x-4 z-10 bg-gray-800 p-4 rounded-lg shadow-lg';
    document.body.appendChild(guiContainer);

    // Input per il caricamento del file GLB
    const fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.accept = '.glb'; // Accetta solo file GLB
    fileInput.className = 'p-2 rounded-md bg-gray-700 text-white cursor-pointer hover:bg-gray-600 transition-colors'; // Stile Tailwind
    fileInput.onchange = handleFileUpload; // Collega la funzione di caricamento
    guiContainer.appendChild(fileInput);

    // Selettore colore sfondo
    const backgroundColorSelect = document.createElement('select');
    backgroundColorSelect.className = 'p-2 rounded-md bg-gray-700 text-white cursor-pointer hover:bg-gray-600 transition-colors';
    guiContainer.appendChild(backgroundColorSelect);

    // Aggiungi opzioni al selettore di sfondo
    for (const colorName in colorMap) {
        const option = document.createElement('option');
        option.value = colorName;
        option.textContent = `Sfondo: ${colorName}`;
        backgroundColorSelect.appendChild(option);
    }
    backgroundColorSelect.value = 'Bianco'; // Imposta il valore predefinito a Bianco (MODIFICATO)
    backgroundColorSelect.onchange = (e) => updateBackgroundColor(e.target.value);

    // Selettore colore pavimento
    const floorColorSelect = document.createElement('select');
    floorColorSelect.className = 'p-2 rounded-md bg-gray-700 text-white cursor-pointer hover:bg-gray-600 transition-colors';
    guiContainer.appendChild(floorColorSelect);

    // Aggiungi opzioni al selettore del pavimento
    for (const colorName in colorMap) {
        const option = document.createElement('option');
        option.value = colorName;
        option.textContent = `Pavimento: ${colorName}`;
        floorColorSelect.appendChild(option);
    }
    floorColorSelect.value = 'Bianco'; // Imposta il valore predefinito a Bianco (MODIFICATO)
    floorColorSelect.onchange = (e) => updateFloorColor(e.target.value);

    // Pulsante per svuotare la scena
    const clearButton = document.createElement('button');
    clearButton.textContent = 'Svuota Scena';
    clearButton.className = 'p-2 rounded-md bg-red-700 text-white cursor-pointer hover:bg-red-600 transition-colors'; // Stile Tailwind
    clearButton.onclick = clearScene; // Collega la funzione per svuotare
    guiContainer.appendChild(clearButton);
}

// Funzione per gestire il caricamento del file GLB
function handleFileUpload(event) {
    const file = event.target.files[0];
    if (!file) return;

    // Rimuovi il modello precedente se esiste
    if (loadedModel) {
        clearScene();
    }

    const reader = new FileReader();
    reader.onload = (e) => {
        const loader = new GLTFLoader();
        loader.parse(e.target.result, '', (gltf) => {
            loadedModel = gltf.scene;
            scene.add(loadedModel);

            // Calcola il bounding box del modello per centrarlo e scalarlo
            const box = new THREE.Box3().setFromObject(loadedModel);
            const center = box.getCenter(new THREE.Vector3());
            const size = box.getSize(new THREE.Vector3());

            // Centra il modello
            loadedModel.position.sub(center);

            // Scala il modello per adattarlo alla vista
            const maxDim = Math.max(size.x, size.y, size.z);
            const fov = camera.fov * (Math.PI / 180);
            const cameraZ = Math.abs(maxDim / 2 / Math.tan(fov / 2));
            camera.position.z = cameraZ + 5; // Posiziona la telecamera un po' più indietro
            camera.position.x = 0;
            camera.position.y = 0;
            camera.lookAt(scene.position); // Fai in modo che la telecamera guardi il centro

            controls.target.set(0, 0, 0); // Reimposta il target dei controlli al centro
            controls.update(); // Aggiorna i controlli dopo aver modificato la telecamera
            console.log('Modello GLB caricato con successo!');
        }, undefined, (error) => {
            console.error('Errore durante il caricamento del modello GLB:', error);
            // Utilizzo di un messaggio box personalizzato invece di alert()
            const messageBox = document.createElement('div');
            messageBox.className = 'message-box'; // Usa la classe CSS definita nell'HTML
            messageBox.innerHTML = `
                <div class="message-box-content">
                    <p class="text-red-600 mb-4">Errore durante il caricamento del modello GLB.</p>
                    <p class="text-sm text-gray-700 mb-4">Controlla la console per i dettagli tecnici.</p>
                    <button class="bg-blue-500 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded" onclick="this.parentNode.parentNode.remove()">Chiudi</button>
                </div>
            `;
            document.body.appendChild(messageBox);
        });
    };
    reader.readAsArrayBuffer(file); // Leggi il file come ArrayBuffer
}

// Funzione per svuotare la scena rimuovendo il modello caricato
function clearScene() {
    if (loadedModel) {
        // Rimuovi il modello dalla scena
        scene.remove(loadedModel);
        
        // Dealloca la memoria della geometria e dei materiali del modello
        loadedModel.traverse((object) => {
            if (object.isMesh) {
                if (object.geometry) {
                    object.geometry.dispose();
                }
                if (object.material) {
                    // Se il materiale è un array, itera su di esso
                    if (Array.isArray(object.material)) {
                        object.material.forEach(material => material.dispose());
                    } else {
                        object.material.dispose();
                    }
                }
            }
        });
        loadedModel = null; // Resetta il riferimento al modello
        console.log('Scena svuotata.');

        // Reimposta la telecamera e i controlli alla posizione iniziale
        camera.position.set(0, 0, 5);
        controls.target.set(0, 0, 0);
        controls.update();
    }
}

// Avvia la scena quando la pagina è completamente caricata
window.addEventListener('load', () => {
    initScene();
    animate();
});
