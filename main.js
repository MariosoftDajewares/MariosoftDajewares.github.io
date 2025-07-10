// main.js

import * as THREE from './lib/three.module.js';

import { OrbitControls } from './lib/OrbitControls.js';

 import { GLTFLoader } from './lib/GLTFLoader.js';

import * as CANNON from './lib/cannon-es.js';
 
 // import { RGBELoader } from './lib/RGBELoader.js';


// --- 2. Dichiarazione delle Variabili Globali della Scena ---
 
let scene;      // La scena 3D dove posizioneremo gli oggetti.
let camera;     // La telecamera che inquadra la scena.
let renderer;   // Il renderer che disegna la scena sul canvas.
let floor;      // Il nostro oggetto pavimento.
let controls;   // I controlli per la telecamera (OrbitControls).


// --- 3. Funzione di Inizializzazione della Scena (init) ---
function init() {
	
    // Ottieni il riferimento al canvas HTML tramite il suo ID.
	
    const canvas = document.getElementById('giostraCanvas');

    // Crea il renderer WebGL
	
    renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: true });

    // Imposta la dimensione del renderer per occupare l'intera finestra del browser.
    
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(window.devicePixelRatio);

    // Imposta il colore di sfondo della scena (nero puro).
    
    renderer.setClearColor(0xffffff);
    
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap; // Ombre più morbide

    // Crea la scena.
    scene = new THREE.Scene();

    // Crea la telecamera prospettica.
    // Parametri: FOV (Field of View), Aspect Ratio, Near Clipping Plane, Far Clipping Plane.
    // FOV: 75 gradi (un buon valore per iniziare).
    // Aspect Ratio: Larghezza della finestra / Altezza della finestra.
    // Near/Far: Distanza minima e massima degli oggetti visibili dalla telecamera.
    camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);

    // Posiziona la telecamera in modo decentrato per mostrare bene il pavimento e lo sfondo.
    // Si trova in alto, a destra e in avanti rispetto all'origine (0,0,0).
    camera.position.set(10, 12, 25); // X, Y, Z
    camera.lookAt(0, 0, 0); // Fai in modo che la telecamera guardi verso l'origine.


    // --- Creazione del Pavimento Marrone ---
    // Geometria del pavimento: una scatola (BoxGeometry).
    // Dimensioni: 4m (larghezza) x 0.25m (altezza) x 4m (profondità).
    const floorGeometry = new THREE.BoxGeometry(24, 0.5, 24);
	const floorMaterial = new THREE.MeshStandardMaterial({
        color: 0x5C4033, // Un marrone più scuro e ricco (es. Dark Sienna)
        roughness: 0.8,  // Rende la superficie meno riflettente, più opaca
        metalness: 0.15,  // Un tocco di metallicità per un leggero luccichio
         //clearcoat: 0.5,    // Aggiunge un rivestimento trasparente (come una vernice lucida)
         //clearcoatRoughness: 0.15 // La rugosità di questo rivestimento (meno rugoso = più lucido)
    });

    // Crea la mesh del pavimento combinando geometria e materiale.
    floor = new THREE.Mesh(floorGeometry, floorMaterial);

    floor.position.set(0, -0.25, 0);
    scene.add(floor); // Aggiungi il pavimento alla scena.

 
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.3);
    scene.add(ambientLight);

    
    const pointLight1 = new THREE.PointLight(0xddffff, 1.8);
    pointLight1.position.set(3, 7, 3); // Posizionata in alto, in avanti e a destra.
    scene.add(pointLight1);

    
    const pointLight2 = new THREE.PointLight(0xffffdd, 1.8);
    pointLight2.position.set(-3, 8, -3); // Posizionata in alto, in avanti e a sinistra.
    scene.add(pointLight2);

    // --- Impostazione dei Controlli della Telecamera (OrbitControls) ---
    // Permette all'utente di ruotare, zoomare e spostare la telecamera con il mouse.
    
    controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true; // Abilita lo "smorzamento" per un movimento più fluido.
    controls.dampingFactor = 0.25; // Fattore di smorzamento.

    // --- Gestione del Ridimensionamento della Finestra ---
    // Aggiungi un listener per l'evento di ridimensionamento della finestra.
    // Quando la finestra cambia dimensione, aggiorna l'aspect ratio della telecamera e la dimensione del renderer.
    
    window.addEventListener('resize', onWindowResize, false);
    
}


// --- 4. Funzione per il Ridimensionamento della Finestra ---
function onWindowResize() {
    // Aggiorna l'aspect ratio della telecamera.
    camera.aspect = window.innerWidth / window.innerHeight;
    // Aggiorna la matrice di proiezione della telecamera dopo aver cambiato l'aspect ratio.
    camera.updateProjectionMatrix();
    // Aggiorna la dimensione del renderer.
    renderer.setSize(window.innerWidth, window.innerHeight);
}

// --- 5. Funzione di Animazione (animate) ---

// Questa funzione viene chiamata ripetutamente per aggiornare e renderizzare la scena.

function animate() {
	
    // Richiede al browser di chiamare 'animate' al prossimo frame disponibile.
    // Questo crea un loop di animazione fluido.
    requestAnimationFrame(animate);

    // Aggiorna i controlli della telecamera (necessario se 'enableDamping' è true).
    controls.update();

    // Renderizza la scena con la telecamera corrente.
    renderer.render(scene, camera);
}

// --- 6. Avvio dell'Applicazione ---

// Chiama la funzione di inizializzazione per impostare la scena.
init();
// Avvia il loop di animazione.
animate();
