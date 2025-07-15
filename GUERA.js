// GUERA.js
// Questa scena implementa una torretta fissa con mouselook e sparo di proiettili.
// Aggiunta una struttura instabile da far crollare.
// Reset del gioco associato al tasto 'R'.
// Torretta sollevata di 0.3 sull'asse Y.
// Aggiunte due strutture instabili limitrofe di diverso tipo e forma.
// Sensibilità del mouse ripristinata e collisioni dei cilindri migliorate.

// --- 1. Inclusione dei Moduli Base ---
// Assicurati che questi percorsi siano corretti rispetto al tuo file GUERA.js
import * as THREE from './lib/three.module.js';
import { World, Vec3, Box, Plane, Body, Material, ContactMaterial, SAPBroadphase, Sphere, Cylinder } from './lib/cannon-es.js';
import { GLTFLoader } from './lib/GLTFLoader.js';
import { RGBELoader } from './lib/RGBELoader.js';
import { TextureLoader } from './lib/three.module.js';
import { PointerLockControls } from './lib/PointerLockControls.js'; // Importa PointerLockControls

// Variabili globali per la scena, la telecamera, il renderer, il mondo fisico
let scene, camera, renderer, world;
let controls; // Controlli del puntatore

// Variabili per gli elementi UI creati dinamicamente
let blocker, instructions;

// Variabili per il player (posizione della torretta)
let playerBody;
const playerHeight = 1.8; // Altezza base della telecamera
const PI_2 = Math.PI / 2; // Costante per pi greco mezzi

// Oggetto per la mesh della canna della torretta
let turretBarrelMesh;

let isLocked = false; // Stato del pointer lock

// Variabili per i proiettili
const projectiles = [];
const projectileSpeed = 100; // Velocità iniziale del proiettile (m/s)
const projectileMass = 10; // Massa del proiettile (kg)
const maxProjectileDistanceSq = 250 * 250; // Distanza massima al quadrato per la rimozione (250 metri per proiettili più veloci)

// Variabili per le dimensioni della canna
const barrelHeight = 2.0;

// Array per tutte le strutture instabili (ora conterrà più torri di diversi tipi)
const unstableStructure = [];

// Inizializza la scena 3D e il mondo fisico
function init() {
    const canvas = document.getElementById('gueraCanvas');

    if (!canvas) {
        console.error("Errore: Impossibile trovare l'elemento canvas con ID 'gueraCanvas'. Assicurati che l'ID sia corretto e che l'elemento esista nell'HTML prima che lo script venga eseguito.");
        return;
    }
    
    // --- Configurazione Renderer, Scena, Telecamera ---
    scene = new THREE.Scene();
    camera = new THREE.PerspectiveCamera(75, canvas.offsetWidth / canvas.offsetHeight, 0.1, 1000);
    
    renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: true });
    renderer.setSize(canvas.offsetWidth, canvas.offsetHeight); 
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.outputEncoding = THREE.sRGBEncoding;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.25;

    // --- Luci ---
    const ambientLight = new THREE.AmbientLight(0x404040, 2);
    scene.add(ambientLight);

    const directionalLight = new THREE.DirectionalLight(0xffffff, 1); 
    directionalLight.position.set(5, 10, 7.5);
    directionalLight.castShadow = true; 
    directionalLight.shadow.mapSize.width = 1024; 
    directionalLight.shadow.mapSize.height = 1024;
    directionalLight.shadow.camera.near = 0.5; 
    directionalLight.shadow.camera.far = 50;
    directionalLight.shadow.camera.left = -20; 
    directionalLight.shadow.camera.right = 20;
    directionalLight.shadow.camera.top = 20;
    directionalLight.shadow.camera.bottom = -20;
    scene.add(directionalLight);

    const topDownLight = new THREE.DirectionalLight(0x111111, 0.8); 
    topDownLight.position.set(0, 20, 0); 
    topDownLight.castShadow = true;
    topDownLight.shadow.mapSize.width = 512; 
    topDownLight.shadow.mapSize.height = 512;
    topDownLight.shadow.camera.near = 0.1;
    topDownLight.shadow.camera.far = 50;
    topDownLight.shadow.camera.left = -30; 
    topDownLight.shadow.camera.right = 30;
    topDownLight.shadow.camera.top = 30;
    topDownLight.shadow.camera.bottom = -30;
    scene.add(topDownLight);

    // --- Mondo Fisico Cannon.js ---
    world = new World();
    world.gravity.set(0, -9.82, 0);
    world.broadphase = new SAPBroadphase(world);

    const groundMaterial = new Material('groundMaterial');
    const defaultContactMaterial = new ContactMaterial(
        groundMaterial,
        groundMaterial,
        {
            friction: 0.4,
            restitution: 0.1
        }
    );
    world.addContactMaterial(defaultContactMaterial);

    // --- Terreno con Texture PBR ---
    const textureLoader = new TextureLoader();

    const grAlbedoMap = textureLoader.load('./txt/gr_albedo.png');
    const grAOMap = textureLoader.load('./txt/gr_ao.png');
    const grHeightMap = textureLoader.load('./txt/gr_height.png'); 
    const grMetallicMap = textureLoader.load('./txt/gr_metallic.png');
    const grNormalMap = textureLoader.load('./txt/gr_normal-ogl.png');
    const grRoughnessMap = textureLoader.load('./txt/gr_roughness.png');

    grAlbedoMap.encoding = THREE.sRGBEncoding;

    const tilingRepeat = 14; 
    grAlbedoMap.repeat.set(tilingRepeat, tilingRepeat);
    grAOMap.repeat.set(tilingRepeat, tilingRepeat);
    grHeightMap.repeat.set(tilingRepeat, tilingRepeat);
    grMetallicMap.repeat.set(tilingRepeat, tilingRepeat);  
    grNormalMap.repeat.set(tilingRepeat, tilingRepeat);
    grRoughnessMap.repeat.set(tilingRepeat, tilingRepeat);

    grAlbedoMap.wrapS = grAlbedoMap.wrapT = THREE.RepeatWrapping;
    grAOMap.wrapS = grAOMap.wrapT = THREE.RepeatWrapping;
    grHeightMap.wrapS = grHeightMap.wrapT = THREE.RepeatWrapping;
    grMetallicMap.wrapS = grMetallicMap.wrapT = THREE.RepeatWrapping;
    grNormalMap.wrapS = grNormalMap.wrapT = THREE.RepeatWrapping;
    grRoughnessMap.wrapS = grRoughnessMap.wrapT = THREE.RepeatWrapping;

    const groundMaterialMesh = new THREE.MeshStandardMaterial({
        map: grAlbedoMap,
        aoMap: grAOMap,
        bumpMap: grHeightMap,  
        bumpScale: 0.5,  
        metalnessMap: grMetallicMap,
        normalMap: grNormalMap,
        normalScale: new THREE.Vector2(1.5, 1.5),  
        roughnessMap: grRoughnessMap,
        metalness: 0.0,
        roughness: 0.8,
    });

    const groundSize = 100;
    const groundGeometry = new THREE.PlaneGeometry(groundSize, groundSize); 

    const groundMesh = new THREE.Mesh(groundGeometry, groundMaterialMesh);
    groundMesh.rotation.x = -Math.PI / 2;
    groundMesh.position.y = -0.5;  
    groundMesh.receiveShadow = true;
    scene.add(groundMesh);

    const groundShape = new Plane();
    const groundBody = new Body({ mass: 0, shape: groundShape, material: groundMaterial });
    groundBody.quaternion.setFromEuler(-Math.PI / 2, 0, 0);  
    groundBody.position.y = -0.5;  
    world.addBody(groundBody);

    // --- Environment Map (HDR) ---
    const pmremGenerator = new THREE.PMREMGenerator(renderer);
    pmremGenerator.compileEquirectangularShader();

    const rgbeLoader = new RGBELoader();
    rgbeLoader.load('./txt/ssky.hdr', (texture) => {
        const envMap = pmremGenerator.fromEquirectangular(texture).texture;
        texture.dispose();

        scene.environment = envMap;
        scene.background = envMap;

        groundMaterialMesh.envMap = envMap;
        groundMaterialMesh.needsUpdate = true;
    });

    // --- Corpo Fisico del Player (per la posizione della torretta) ---
    const playerShape = new Box(new Vec3(0.1, 0.1, 0.1));
    playerBody = new Body({
        mass: 0, // Massa 0 per renderlo statico
        // Solleva la torretta di 0.3 sull'asse Y
        position: new Vec3(0, playerHeight / 2 + 0.5 + 0.3, 0),
        shape: playerShape,
        fixedRotation: true
    });
    world.addBody(playerBody);

    // --- Controlli del Puntatore (PointerLockControls) ---
    // Ripristinato all'uso standard senza parametri di sensibilità
    controls = new PointerLockControls(camera, document.body);

    // Imposta gli angoli polari per limitare la rotazione verticale (pitch) della telecamera.
    // Math.PI / 2 è l'orizzontale. Limita a 0.4 * PI_2 sopra e sotto l'orizzontale.
    controls.minPolarAngle = Math.PI / 2 - (PI_2 * 0.4); // Limite superiore (guarda in alto)
    controls.maxPolarAngle = Math.PI / 2 + (PI_2 * 0.4); // Limite inferiore (guarda in basso)

    // Aggiunge l'oggetto principale dei controlli alla scena.
    // Questo oggetto contiene la telecamera e gestisce la rotazione orizzontale (yaw).
    scene.add(controls.getObject());

    // --- Canna della Torretta (Mesh) ---
    const barrelRadiusTop = 0.2;
    const barrelRadiusBottom = 0.3;
    const barrelRadialSegments = 32;
    const barrelGeometry = new THREE.CylinderGeometry(barrelRadiusTop, barrelRadiusBottom, barrelHeight, barrelRadialSegments);
    const barrelMaterial = new THREE.MeshStandardMaterial({ color: 0x444444, roughness: 0.5, metalness: 0.8 });

    turretBarrelMesh = new THREE.Mesh(barrelGeometry, barrelMaterial);
    // Posiziona la canna leggermente davanti e sotto la telecamera
    turretBarrelMesh.position.set(0, -0.6, -1.0);
    turretBarrelMesh.rotation.x = Math.PI / 2; // Ruota per allineare con la direzione di sparo
    turretBarrelMesh.castShadow = true;
    turretBarrelMesh.receiveShadow = true;
    // La canna è un figlio della telecamera, quindi si muove e ruota con essa.
    camera.add(turretBarrelMesh);

    // --- UI Dinamica (Istruzioni) ---
    // Crea il div blocker
    blocker = document.createElement('div');
    blocker.id = 'blocker';
    blocker.style.position = 'fixed'; // Usa fixed per coprire l'intera viewport
    blocker.style.width = '100%';
    blocker.style.height = '100%';
    blocker.style.backgroundColor = 'rgba(0,0,0,0.7)';
    blocker.style.display = 'flex';
    blocker.style.flexDirection = 'column';
    blocker.style.justifyContent = 'center';
    blocker.style.alignItems = 'center';
    blocker.style.textAlign = 'center';
    blocker.style.color = 'white';
    blocker.style.fontSize = '2em';
    blocker.style.cursor = 'pointer';
    blocker.style.zIndex = '100';
    document.body.appendChild(blocker);

    // Crea il div instructions
    instructions = document.createElement('div');
    instructions.id = 'instructions';
    instructions.style.padding = '20px';
    instructions.style.background = 'rgba(0,0,0,0.8)';
    instructions.style.borderRadius = '10px';
    instructions.innerHTML = `
        <p>Clicca per giocare</p>
        <p>
            Muovi: W, A, S, D (Non attivo per torretta fissa)<br/>
            Guarda: Mouse<br/>
            Spara: Click sinistro del mouse o Spazio<br/>
            Reset: Tasto 'R'
        </p>
    `;
    blocker.appendChild(instructions);

    // --- Creazione delle Strutture Instabili ---
    // Torri di cubi
    createBoxStructure(10, -15);
    createBoxStructure(10, -5);
    createBoxStructure(10, -25);

    // Nuove torri di sfere
    createSphereStructure(20, -15); // A destra delle torri di cubi
    
    // Nuove torri di cilindri
    createCylinderStructure(0, -15); // A sinistra delle torri di cubi

    // --- Event Listeners ---
    // Listener per il click sul blocker per bloccare il puntatore
    blocker.addEventListener('click', () => {
        if (!isLocked) {
            controls.lock();
        }
    });

    // Event listeners per lo stato del Pointer Lock
    controls.addEventListener('lock', function () {
        isLocked = true;
        blocker.style.display = 'none'; // Nasconde il blocker quando il puntatore è bloccato
        console.log('Puntatore bloccato.');
    });

    controls.addEventListener('unlock', function () {
        isLocked = false;
        blocker.style.display = 'flex'; // Mostra il blocker quando il puntatore è sbloccato
        console.log('Puntatore sbloccato.');
    });

    // Gestione dello sparo con il click del mouse
    document.addEventListener('click', onMouseClick, false); 
    // Gestione dello sparo con la barra spaziatrice o il tasto 'R' per il reset
    document.addEventListener('keydown', onKeyDown, false);

    window.addEventListener('resize', onWindowResize, false);
}

/**
 * Crea una torre di blocchi cubici instabile e la aggiunge alla scena e al mondo fisico.
 * @param {number} xPos - La posizione X iniziale della torre.
 * @param {number} zPos - La posizione Z iniziale della torre.
 */
function createBoxStructure(xPos, zPos) {
    const boxSize = 2; // Dimensione del lato del cubo
    const boxMass = 5; // Massa di ogni cubo
    const numBoxes = 7; // Numero di cubi nella torre

    const boxGeometry = new THREE.BoxGeometry(boxSize, boxSize, boxSize);
    const boxMaterial = new THREE.MeshStandardMaterial({ 
        color: 0x8B4513, // Marrone per i blocchi
        roughness: 0.7, 
        metalness: 0.1 
    });

    for (let i = 0; i < numBoxes; i++) {
        const mesh = new THREE.Mesh(boxGeometry, boxMaterial);
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        scene.add(mesh);

        const shape = new Box(new Vec3(boxSize / 2, boxSize / 2, boxSize / 2));
        const body = new Body({ mass: boxMass, shape: shape });

        // Posiziona i blocchi uno sopra l'altro usando xPos e zPos
        body.position.set(xPos, boxSize / 2 + i * boxSize, zPos);
        
        // Alterna la rotazione per rendere la torre più instabile
        if (i % 2 === 0) {
            body.quaternion.setFromAxisAngle(new Vec3(0, 1, 0), Math.PI / 4); // Ruota di 45 gradi
        }

        world.addBody(body);
        unstableStructure.push({ mesh: mesh, body: body });
    }
}

/**
 * Crea una torre di sfere instabile e la aggiunge alla scena e al mondo fisico.
 * @param {number} xPos - La posizione X iniziale della torre.
 * @param {number} zPos - La posizione Z iniziale della torre.
 */
function createSphereStructure(xPos, zPos) {
    const sphereRadius = 1.2; // Raggio della sfera
    const sphereMass = 4; // Massa di ogni sfera (leggermente meno dei cubi per farle rotolare)
    const numSpheres = 5; // Numero di sfere nella torre

    const sphereGeometry = new THREE.SphereGeometry(sphereRadius, 32, 32);
    const sphereMaterial = new THREE.MeshStandardMaterial({ 
        color: 0x0077B6, // Blu per le sfere
        roughness: 0.4, 
        metalness: 0.2 
    });

    for (let i = 0; i < numSpheres; i++) {
        const mesh = new THREE.Mesh(sphereGeometry, sphereMaterial);
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        scene.add(mesh);

        const shape = new Sphere(sphereRadius);
        const body = new Body({ mass: sphereMass, shape: shape });

        // Posiziona le sfere una sopra l'altra
        body.position.set(xPos, sphereRadius + i * sphereRadius * 2, zPos);
        
        world.addBody(body);
        unstableStructure.push({ mesh: mesh, body: body });
    }
}

/**
 * Crea una torre di cilindri instabile e la aggiunge alla scena e al mondo fisico.
 * @param {number} xPos - La posizione X iniziale della torre.
 * @param {number} zPos - La posizione Z iniziale della torre.
 */
function createCylinderStructure(xPos, zPos) {
    // Modificati raggio e altezza per migliorare la stabilità e la collisione
    const cylinderRadius = 1.5; // Aumentato il raggio
    const cylinderHeight = 2.0; // Diminuita l'altezza
    const cylinderMass = 8; // Aumentata la massa
    const numCylinders = 4; // Numero di cilindri nella torre

    const cylinderGeometry = new THREE.CylinderGeometry(cylinderRadius, cylinderRadius, cylinderHeight, 32);
    const cylinderMaterial = new THREE.MeshStandardMaterial({ 
        color: 0x228B22, // Verde foresta per i cilindri
        roughness: 0.6, 
        metalness: 0.1 
    });

    for (let i = 0; i < numCylinders; i++) {
        const mesh = new THREE.Mesh(cylinderGeometry, cylinderMaterial);
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        scene.add(mesh);

        // Assicurati che la forma Cannon.js corrisponda alla geometria Three.js
        const shape = new Cylinder(cylinderRadius, cylinderRadius, cylinderHeight, 32);
        const body = new Body({ mass: cylinderMass, shape: shape });

        // Posiziona i cilindri uno sopra l'altro, alternando l'orientamento
        if (i % 2 === 0) {
            // Verticale
            body.position.set(xPos, cylinderHeight / 2 + i * cylinderHeight, zPos);
        } else {
            // Orizzontale (ruotato sull'asse Z)
            body.position.set(xPos, cylinderHeight / 2 + i * cylinderHeight, zPos);
            // Ruota il corpo fisico per allinearlo con la mesh orizzontale
            body.quaternion.setFromAxisAngle(new Vec3(0, 0, 1), Math.PI / 2);
        }
        
        world.addBody(body);
        unstableStructure.push({ mesh: mesh, body: body });
    }
}

// Funzione per gestire lo sparo con il click del mouse
function onMouseClick(event) {
    if (isLocked && event.button === 0) { // Click sinistro del mouse
        shootProjectile();
    }
}

// Funzione per gestire lo sparo con la barra spaziatrice o il tasto R
function onKeyDown(event) {
    if (isLocked) {
        if (event.code === 'Space') {
            shootProjectile();
        } else if (event.code === 'KeyR') { // Reset con il tasto 'R'
            resetGame();
        }
    }
}

function shootProjectile() {
    const projectileRadius = 0.2;
    const projectileGeometry = new THREE.SphereGeometry(projectileRadius, 16, 16);
    const projectileMaterial = new THREE.MeshStandardMaterial({ color: 0xff0000, roughness: 0.5, metalness: 0.8 });
    const projectileMesh = new THREE.Mesh(projectileGeometry, projectileMaterial);
    projectileMesh.castShadow = true;

    const projectileShape = new Sphere(projectileRadius);
    const projectileBody = new Body({ mass: projectileMass, shape: projectileShape });

    // Ottieni la posizione e la direzione della telecamera nel mondo
    const cameraWorldPosition = new THREE.Vector3();
    camera.getWorldPosition(cameraWorldPosition);

    const cameraWorldDirection = new THREE.Vector3();
    camera.getWorldDirection(cameraWorldDirection);

    // Calcola la posizione di partenza del proiettile leggermente davanti alla telecamera
    const spawnOffset = projectileRadius * 2 + 0.5; // Distanza dalla telecamera
    const projectileStartPosition = new THREE.Vector3().copy(cameraWorldPosition).add(cameraWorldDirection.multiplyScalar(spawnOffset));

    projectileMesh.position.copy(projectileStartPosition);
    projectileBody.position.copy(projectileStartPosition);

    // Imposta la velocità del proiettile basata sulla direzione della telecamera
    const initialVelocity = new Vec3(
        cameraWorldDirection.x * projectileSpeed,
        cameraWorldDirection.y * projectileSpeed,
        cameraWorldDirection.z * projectileSpeed
    );
    projectileBody.velocity.copy(initialVelocity);

    scene.add(projectileMesh);
    world.addBody(projectileBody);

    projectiles.push({ mesh: projectileMesh, body: projectileBody, initialPosition: projectileStartPosition.clone() });
}

function onWindowResize() {
    const canvas = document.getElementById('gueraCanvas');
    if (!canvas) return; 
    const width = canvas.offsetWidth;
    const height = canvas.offsetHeight;

    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    renderer.setSize(width, height);
}

function animate() {
    requestAnimationFrame(animate);

    world.step(1 / 60); // Aggiorna il mondo fisico

    // Aggiorna la posizione dei proiettili e rimuovi quelli fuori portata
    for (let i = projectiles.length - 1; i >= 0; i--) {
        const p = projectiles[i];
        p.mesh.position.copy(p.body.position);
        p.mesh.quaternion.copy(p.body.quaternion);

        const distanceSq = p.mesh.position.distanceToSquared(p.initialPosition);

        // Rimuovi il proiettile se troppo lontano o sotto il terreno
        if (distanceSq > maxProjectileDistanceSq || p.mesh.position.y < -5) { 
            scene.remove(p.mesh);
            world.removeBody(p.body);
            projectiles.splice(i, 1);
        }
    }

    // Aggiorna la posizione e la rotazione dei blocchi delle strutture instabili
    unstableStructure.forEach(item => {
        item.mesh.position.copy(item.body.position);
        item.mesh.quaternion.copy(item.body.quaternion);
    });

    renderer.render(scene, camera);
}

// Funzione per resettare il gioco
function resetGame() {
    // Rimuovi tutti i proiettili esistenti dalla scena e dal mondo fisico
    projectiles.forEach(p => {
        scene.remove(p.mesh);
        world.removeBody(p.body);
    });
    projectiles.length = 0; // Svuota l'array dei proiettili

    // Rimuovi e ricrea tutte le strutture instabili
    unstableStructure.forEach(item => {
        scene.remove(item.mesh);
        world.removeBody(item.body);
    });
    unstableStructure.length = 0; // Svuota l'array della struttura

    // Ricrea tutte le torri
    createBoxStructure(10, -15);
    createBoxStructure(10, -5);
    createBoxStructure(10, -25);
    createSphereStructure(20, -15);
    createCylinderStructure(0, -15);

    // Riposiziona la telecamera (e di conseguenza la torretta) alla posizione iniziale
    controls.getObject().position.set(playerBody.position.x, playerBody.position.y, playerBody.position.z);
    controls.getObject().rotation.set(0, 0, 0); // Resetta la rotazione orizzontale (yaw)
    camera.rotation.set(0, 0, 0); // Resetta la rotazione verticale (pitch) della telecamera

    // Sblocca e poi riblocca il puntatore per aggiornare lo stato e mostrare le istruzioni
    controls.unlock();
    // Il blocco automatico avverrà al click sul blocker, come da logica UI
}

// Avvia il gioco quando la finestra è completamente caricata
window.onload = function() {
    init();
    animate();
};
