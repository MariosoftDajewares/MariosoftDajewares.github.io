// main.js
// Questo file contiene la logica principale della tua scena Three.js.

// --- 1. Inclusione dei Moduli Base ---
import * as THREE from './lib/three.module.js';
import { OrbitControls } from './lib/OrbitControls.js';
import * as CANNON from './lib/cannon-es.js';


// --- 2. Dichiarazione delle Variabili Globali della Scena e della Fisica ---
let scene;
let camera;
let renderer;
let floor;
let floorExtension; // Variabile per il prolungamento del pavimento
let controls;

let physicsWorld;
const rigidBodies = []; // Array per tenere traccia delle mesh Three.js con corpi Cannon-es
const clock = new THREE.Clock(); // Orologio per calcolare il deltaTime per la fisica

let ragdollParts = {}; // Oggetto per tenere i riferimenti alle parti del ragdoll (mesh e body)

let cannonMaterials = {};

// Variabile per il fattore di scala del ragdoll, inizializzata dal valore dello slider
let currentRagdollScale = 0.9; // Valore iniziale predefinito, sarà aggiornato dallo slider

// Riferimenti per la pedana di lancio combinata (gruppo visuale e corpo fisico)
let launchPlatformGroup; // THREE.Group per la pedana e il cilindro combinati
let launchPlatformBody;  // CANNON.Body per la pedana e il cilindro combinati
let pivotSphereMesh;     // Riferimento alla mesh della sfera al pivot

// Variabile globale per il vincolo a cerniera della palettona
let platformHingeConstraint;

// Variabili per il blocco fisico sotto la palettona
let lowerRotationStopperMesh;
let lowerRotationStopperBody;

// Ripristinate le variabili per upperRotationStopperMesh e upperRotationStopperBody
let upperRotationStopperMesh;
let upperRotationStopperBody;


// Variabili globali per le dimensioni della pedana e del cilindro per chiarezza e riutilizzo
const PLATFORM_HEIGHT = 0.5;
const PLATFORM_WIDTH = 4.0;
const PLATFORM_DEPTH = 3.0;

const CYLINDER_RADIUS_FACTOR = 1 / 3;
const CYLINDER_LENGTH_FACTOR = 2;

// Offset della pedana e del cilindro rispetto al pivot del corpo composto
// Questi verranno calcolati in createLaunchPlatform
let platformOffsetFromPivot = new CANNON.Vec3();
let cylinderOffsetFromPivot = new CANNON.Vec3();

// Fattore di padding per le collision box (leggermente più grandi delle mesh visive)
const COLLISION_PADDING_FACTOR = 1.05; // 5% di padding


// --- 3. Funzione di Inizializzazione della Scena (init) ---
async function init() {
    const canvas = document.getElementById('giostraCanvas');

    renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: true });
    renderer.setSize(canvas.clientWidth, canvas.clientHeight);
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.setClearColor(0x000000); // Sfondo nero

    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    scene = new THREE.Scene();

    camera = new THREE.PerspectiveCamera(75, canvas.clientWidth / canvas.clientHeight, 0.1, 1000);
    camera.position.set(3, 2.5, 3); // Posizione iniziale della telecamera per dare una vista migliore sul ragdoll
    camera.lookAt(0, 0, 0); // La telecamera inizialmente guarda il centro della scena

    // --- Inizializzazione del Mondo Fisico (Cannon-es) ---
    initPhysics();

    // --- Creazione del Pavimento iniziale con Materiale Semplice ---
    const floorGeometry = new THREE.BoxGeometry(48, 0.25, 48);
    const floorMaterial = new THREE.MeshStandardMaterial({
        color: 0x8B4513, // Marrone semplice
    });
    floor = new THREE.Mesh(floorGeometry, floorMaterial);
    floor.position.set(0, -0.125, 0);
    scene.add(floor);
    floor.receiveShadow = true;

    // halfExtents del corpo fisico del pavimento aggiornati per corrispondere alla geometria
    // Assicurati che il pavimento sia un corpo STATIC
    createRigidBody(floor, 0, floor.position, floor.quaternion, { type: 'box', halfExtents: new CANNON.Vec3(24, 0.125 / 2, 24) }, 'floorMaterial');

    // --- Creazione del Prolungamento del Pavimento ---
    const floorExtensionLength = 150;
    const floorExtensionWidth = 48; // Stessa larghezza del pavimento esistente
    const floorExtensionHeight = 0.25; // Stessa altezza del pavimento esistente

    const floorExtensionGeometry = new THREE.BoxGeometry(floorExtensionWidth, floorExtensionHeight, floorExtensionLength);
    const floorExtensionMaterial = new THREE.MeshStandardMaterial({
        color: 0x00FF00, // Verde
    });
    floorExtension = new THREE.Mesh(floorExtensionGeometry, floorExtensionMaterial);

    // Calcola la posizione Z per il prolungamento sul lato opposto
    // Il pavimento esistente va da Z -24 a +24. Il prolungamento inizia da Z = -24 e si estende in negativo.
    // Il centro del prolungamento sarà -24 (inizio pavimento) - (lunghezza_estensione / 2)
    floorExtension.position.set(0, -0.125, -24 - (floorExtensionLength / 2));
    scene.add(floorExtension);
    floorExtension.receiveShadow = true;

    // Corpo fisico per il prolungamento (stesse proprietà fisiche del pavimento iniziale)
    // Assicurati che il prolungamento sia un corpo STATIC
    createRigidBody(floorExtension, 0, floorExtension.position, floorExtension.quaternion,
        { type: 'box', halfExtents: new CANNON.Vec3(floorExtensionWidth / 2, floorExtensionHeight / 2, floorExtensionLength / 2) },
        'floorMaterial' // Usa lo stesso materiale fisico del pavimento iniziale
    );

    // --- Aggiunta delle Luci ---
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
    scene.add(ambientLight);

    const directionalLight = new THREE.DirectionalLight(0xffffff, 1.0);
    directionalLight.position.set(5, 10, 5);
    directionalLight.target.position.set(0, 0, 0);
    scene.add(directionalLight);
    scene.add(directionalLight.target);

    directionalLight.castShadow = true;
    directionalLight.shadow.mapSize.width = 1024;
    directionalLight.shadow.mapSize.height = 1024;
    directionalLight.shadow.camera.near = 0.5;
    directionalLight.shadow.camera.far = 50;
    directionalLight.shadow.camera.left = -10;
    directionalLight.shadow.camera.right = 10;
    directionalLight.shadow.camera.top = 10;
    directionalLight.shadow.camera.bottom = -10;
    directionalLight.shadow.bias = -0.0001;

    const fillLight = new THREE.PointLight(0xffffff, 0.3);
    fillLight.position.set(-5, 5, -5);
    scene.add(fillLight);

    // --- Impostazione dei Controlli della Telecamera (OrbitControls) ---
    controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.25;
    controls.maxPolarAngle = Math.PI / 2 - 0.15; // Limite angolo polare aggiornato
    controls.maxDistance = 4; // Limita la distanza massima della telecamera a 4 metri

    // *** Creazione della Palettona (pedana di lancio combinata con il cilindro) ***
    createLaunchPlatform();

    // Crea il blocco fisico sotto la palettona
    createLowerRotationStopper();

    // Ripristinata la chiamata a createUpperRotationStopper()
    createUpperRotationStopper();

    // --- Inizializza lo slider e crea il ragdoll con la scala iniziale ---
    const ragdollScaleSlider = document.getElementById('ragdollScaleSlider');
    const ragdollScaleValueSpan = document.getElementById('ragdollScaleValue');

    // Imposta il valore iniziale dello slider e dello span
    currentRagdollScale = parseFloat(ragdollScaleSlider.value);
    ragdollScaleValueSpan.textContent = currentRagdollScale.toFixed(2);

    // Calcola la posizione globale del centro della pedana (non del pivot)
    const platformGlobalPosition = new CANNON.Vec3();
    launchPlatformBody.pointToWorldFrame(platformOffsetFromPivot, platformGlobalPosition);

    const ragdollSpawnX = platformGlobalPosition.x;
    // Passa la posizione Y della superficie della pedana.
    // La funzione createRagdoll si occuperà di aggiungere l'offset per la profondità del ragdoll.
    const ragdollSpawnYSurface = platformGlobalPosition.y + PLATFORM_HEIGHT / 2;
    const ragdollSpawnZ = platformGlobalPosition.z;

    // Crea il ragdoll iniziale. Posizionalo sopra la pedana.
    createRagdoll(ragdollSpawnX, ragdollSpawnYSurface, ragdollSpawnZ, currentRagdollScale);


    // --- Gestione dello slider per la grandezza del ragdoll ---
    ragdollScaleSlider.addEventListener('input', (event) => {
        currentRagdollScale = parseFloat(event.target.value);
        ragdollScaleValueSpan.textContent = currentRagdollScale.toFixed(2);
    });

    // --- Gestione del pulsante Respawn Ragdoll ---
    document.getElementById('respawnRagdollBtn').addEventListener('click', resetRagdollAndRespawn);

    // Gestione del pulsante Lancia Palettona
    document.getElementById('launchPalettonaBtn').addEventListener('click', launchPalettona);


    // --- Gestione del Ridimensionamento della Finestra ---
    window.addEventListener('resize', onWindowResize, false);

    // Avvia il loop di animazione
    animate();
}


// --- 4. Funzione di Inizializzazione della Fisica (Cannon-es) ---
function initPhysics() {
    physicsWorld = new CANNON.World();
    physicsWorld.gravity.set(0, -9.82, 0);

    cannonMaterials.defaultMaterial = new CANNON.Material('defaultMaterial');
    cannonMaterials.ragdollMaterial = new CANNON.Material('ragdollMaterial');
    cannonMaterials.floorMaterial = new CANNON.Material('floorMaterial');
    cannonMaterials.platformMaterial = new CANNON.Material('platformMaterial');


    const defaultContactMaterial = new CANNON.ContactMaterial(
        cannonMaterials.defaultMaterial,
        cannonMaterials.defaultMaterial,
        {
            friction: 0.5,
            restitution: 0.7
        }
    );
    physicsWorld.addContactMaterial(defaultContactMaterial);

    const ragdollFloorContactMaterial = new CANNON.ContactMaterial(
        cannonMaterials.ragdollMaterial,
        cannonMaterials.floorMaterial,
        {
            friction: 0.8,
            restitution: 0.1 // RIDOTTO: Meno rimbalzo tra ragdoll e pavimento
        }
    );
    physicsWorld.addContactMaterial(ragdollFloorContactMaterial);

    const ragdollPlatformContactMaterial = new CANNON.ContactMaterial(
        cannonMaterials.ragdollMaterial,
        cannonMaterials.platformMaterial,
        {
            friction: 0.7,
            restitution: 0.1 // RIDOTTO: Meno rimbalzo tra ragdoll e palettona
        }
    );
    physicsWorld.addContactMaterial(ragdollPlatformContactMaterial);

    // Materiale di contatto tra palettona e pavimento per un blocco più netto
    const platformFloorContactMaterial = new CANNON.ContactMaterial(
        cannonMaterials.platformMaterial,
        cannonMaterials.floorMaterial,
        {
            friction: 0.9, // Alta frizione per evitare scivolamenti
            restitution: 0.0 // Nessun rimbalzo per un blocco più netto
        }
    );
    physicsWorld.addContactMaterial(platformFloorContactMaterial);


    physicsWorld.solver.iterations = 30; // AUMENTATO: Più iterazioni per una maggiore stabilità dei vincoli
    physicsWorld.solver.tolerance = 0.0001; // Tolleranza del risolutore abbassata
}


// --- 5. Funzione per Creare un Corpo Rigido Cannon-es e la sua Mesh Three.js ---
// Questa funzione è pensata per corpi singoli. Per i corpi composti, le forme
// vengono aggiunte direttamente al body.
function createRigidBody(
    threeMesh,
    mass,
    position,
    quaternion,
    shapeData, // Contiene le dimensioni originali per la creazione della forma fisica
    materialName = 'defaultMaterial',
    scaleFactor = 1 // Questo scaleFactor è per la mesh visiva se non è già parte di un gruppo scalato
) {
    let shape;
    if (shapeData.type === 'box') {
        shape = new CANNON.Box(new CANNON.Vec3(
            shapeData.halfExtents.x * scaleFactor * COLLISION_PADDING_FACTOR, // Applica padding
            shapeData.halfExtents.y * scaleFactor * COLLISION_PADDING_FACTOR, // Applica padding
            shapeData.halfExtents.z * scaleFactor * COLLISION_PADDING_FACTOR  // Applica padding
        ));
    } else if (shapeData.type === 'sphere') {
        shape = new CANNON.Sphere(shapeData.radius * scaleFactor * COLLISION_PADDING_FACTOR); // Applica padding
    } else if (shapeData.type === 'cylinder') {
        shape = new CANNON.Cylinder(
            shapeData.radius * scaleFactor * COLLISION_PADDING_FACTOR,   // Applica padding
            shapeData.radius * scaleFactor * COLLISION_PADDING_FACTOR,   // Applica padding
            shapeData.height * scaleFactor * COLLISION_PADDING_FACTOR, // Applica padding
            8
        );
    } else {
        console.warn(`Tipo di forma fisica non supportato: ${shapeData.type}. Usando sfera di default.`);
        shape = new CANNON.Sphere(0.1 * scaleFactor * COLLISION_PADDING_FACTOR); // Applica padding
    }

    const scaledMass = mass > 0 ? mass * Math.pow(scaleFactor, 3) : 0;

    const body = new CANNON.Body({
        mass: scaledMass,
        // Imposta esplicitamente il tipo di corpo fisico (STATIC per massa 0)
        type: scaledMass === 0 ? CANNON.Body.STATIC : CANNON.Body.DYNAMIC,
        shape: shape,
        position: new CANNON.Vec3(position.x, position.y, position.z),
        quaternion: new CANNON.Quaternion(quaternion.x, quaternion.y, quaternion.z, quaternion.w),
        material: cannonMaterials[materialName]
    });
    physicsWorld.addBody(body);

    threeMesh.userData.physicsBody = body;
    if (mass > 0) {
        rigidBodies.push(threeMesh);
    }

    threeMesh.castShadow = true;
    threeMesh.receiveShadow = true;

    return body;
}

// --- 6. Funzione per Creare l'Intero Ragdoll ---
// x, y, z rappresentano la posizione del centro del torso
// quando il ragdoll è supino.
function createRagdoll(x, ySurface, z, scaleFactor = 1) {
    // Dimensioni base del ragdoll
    const originalTorsoHeight = 0.8; // Altezza del torso quando in piedi
    const originalTorsoWidth = 0.4;
    const originalTorsoDepth = 0.2; // Profondità del torso quando in piedi (diventa altezza quando supino)
    const originalHeadRadius = 0.15;
    const originalLimbRadius = 0.08;
    const originalUpperLimbHeight = 0.3;
    const originalLowerLimbHeight = 0.3;
    const originalShoulderRadius = 0.1; // Nuova dimensione per le sfere delle spalle

    // Dimensioni scalate
    const torsoWidth = originalTorsoWidth * scaleFactor;
    const torsoHeight = originalTorsoHeight * scaleFactor; // Altezza del torso quando in piedi
    const torsoDepth = originalTorsoDepth * scaleFactor; // Profondità del torso quando in piedi
    const headRadius = originalHeadRadius * scaleFactor;
    const limbRadius = originalLimbRadius * scaleFactor;
    const upperLimbHeight = originalUpperLimbHeight * scaleFactor;
    const lowerLimbHeight = originalLowerLimbHeight * scaleFactor;
    const shoulderRadius = originalShoulderRadius * scaleFactor;

    const torsoMaterial = new THREE.MeshStandardMaterial({ color: 0x0077ff });
    const headMaterial = new THREE.MeshStandardMaterial({ color: 0xffff00 });
    const limbMaterial = new THREE.MeshStandardMaterial({ color: 0xff8800 });
    const shoulderMaterial = new THREE.MeshStandardMaterial({ color: 0x888888 }); // Grigio per le spalle

    // Posizione di base per il ragdoll (centro del torso quando supino)
    // ySurface è la superficie superiore della pedana.
    // L'altezza del corpo quando supino è la sua profondità (torsoDepth).
    const initialRagdollCenterY = ySurface + (torsoDepth / 2) + 0.05; // Piccolo offset per farlo cadere delicatamente
    const initialRagdollBasePos = new THREE.Vector3(x, initialRagdollCenterY, z);

    // Orientamento per la posa supina (ruotato di 90 gradi attorno all'asse X)
    const supineQuaternion = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), Math.PI / 2);

    // Quaternion per gli arti superiori (lunghezza lungo l'asse Z globale, parallela al busto supino)
    const armLimbQuaternion = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), Math.PI / 2);


    // --- Creazione delle Parti ---

    // Torso (singola sezione)
    const torsoMesh = new THREE.Mesh(new THREE.BoxGeometry(originalTorsoWidth, originalTorsoHeight, originalTorsoDepth), torsoMaterial);
    torsoMesh.position.copy(initialRagdollBasePos);
    torsoMesh.quaternion.copy(supineQuaternion);
    scene.add(torsoMesh);
    ragdollParts.torso = {
        mesh: torsoMesh,
        body: createRigidBody(torsoMesh, 5, torsoMesh.position, torsoMesh.quaternion,
            { type: 'box', halfExtents: new CANNON.Vec3(originalTorsoWidth / 2, originalTorsoHeight / 2, originalTorsoDepth / 2) }, 'ragdollMaterial', scaleFactor)
    };

    // Head
    const headMesh = new THREE.Mesh(new THREE.SphereGeometry(originalHeadRadius, 16, 16), headMaterial);
    headMesh.position.set(
        initialRagdollBasePos.x,
        initialRagdollBasePos.y,
        initialRagdollBasePos.z + (torsoHeight / 2 + headRadius)
    );
    headMesh.quaternion.copy(supineQuaternion);
    scene.add(headMesh);
    ragdollParts.head = {
        mesh: headMesh,
        body: createRigidBody(headMesh, 1, headMesh.position, headMesh.quaternion,
            { type: 'sphere', radius: originalHeadRadius }, 'ragdollMaterial', scaleFactor)
    };

    // --- Spalle (Nuove Sfere) ---
    // Spalla Destra
    const shoulderRMesh = new THREE.Mesh(new THREE.SphereGeometry(originalShoulderRadius, 16, 16), shoulderMaterial);
    shoulderRMesh.position.set(
        ragdollParts.torso.mesh.position.x + (torsoWidth / 2), // Sul lato del torso
        ragdollParts.torso.mesh.position.y,
        ragdollParts.torso.mesh.position.z + (torsoHeight / 2 - shoulderRadius) // Leggermente più in basso della cima del torso
    );
    shoulderRMesh.quaternion.copy(supineQuaternion); // Segue l'orientamento del torso
    scene.add(shoulderRMesh);
    ragdollParts.shoulderR = {
        mesh: shoulderRMesh,
        body: createRigidBody(shoulderRMesh, 0.3, shoulderRMesh.position, shoulderRMesh.quaternion,
            { type: 'sphere', radius: originalShoulderRadius }, 'ragdollMaterial', scaleFactor)
    };

    // Spalla Sinistra
    const shoulderLMesh = new THREE.Mesh(new THREE.SphereGeometry(originalShoulderRadius, 16, 16), shoulderMaterial);
    shoulderLMesh.position.set(
        ragdollParts.torso.mesh.position.x - (torsoWidth / 2),
        ragdollParts.torso.mesh.position.y,
        ragdollParts.torso.mesh.position.z + (torsoHeight / 2 - shoulderRadius)
    );
    shoulderLMesh.quaternion.copy(supineQuaternion);
    scene.add(shoulderLMesh);
    ragdollParts.shoulderL = {
        mesh: shoulderLMesh,
        body: createRigidBody(shoulderLMesh, 0.3, shoulderLMesh.position, shoulderLMesh.quaternion,
            { type: 'sphere', radius: originalShoulderRadius }, 'ragdollMaterial', scaleFactor)
    };


    // --- Braccia ---
    // Upper Arm Right
    const upperArmRMesh = new THREE.Mesh(new THREE.CylinderGeometry(originalLimbRadius, originalLimbRadius, originalUpperLimbHeight, 8), limbMaterial);
    // Posiziona l'avambraccio lungo l'asse Z dalla spalla
    upperArmRMesh.position.set(
        shoulderRMesh.position.x,
        shoulderRMesh.position.y,
        shoulderRMesh.position.z + (shoulderRadius + upperLimbHeight / 2) // Estende lungo Z
    );
    upperArmRMesh.quaternion.copy(armLimbQuaternion); // Usa il nuovo quaternion per allineare lungo Z
    scene.add(upperArmRMesh);
    ragdollParts.upperArmR = {
        mesh: upperArmRMesh,
        body: createRigidBody(upperArmRMesh, 0.5, upperArmRMesh.position, upperArmRMesh.quaternion,
            { type: 'cylinder', radius: originalLimbRadius, height: originalUpperLimbHeight }, 'ragdollMaterial', scaleFactor)
    };

    // Lower Arm Right
    const lowerArmRMesh = new THREE.Mesh(new THREE.CylinderGeometry(originalLimbRadius, originalLimbRadius, originalLowerLimbHeight, 8), limbMaterial);
    // Posiziona il braccio inferiore lungo l'asse Z dal braccio superiore
    lowerArmRMesh.position.set(
        upperArmRMesh.position.x,
        upperArmRMesh.position.y,
        upperArmRMesh.position.z + (upperLimbHeight / 2 + lowerLimbHeight / 2) // Estende lungo Z
    );
    lowerArmRMesh.quaternion.copy(armLimbQuaternion); // Usa il nuovo quaternion per allineare lungo Z
    scene.add(lowerArmRMesh);
    ragdollParts.lowerArmR = {
        mesh: lowerArmRMesh,
        body: createRigidBody(lowerArmRMesh, 0.4, lowerArmRMesh.position, lowerArmRMesh.quaternion,
            { type: 'cylinder', radius: originalLimbRadius, height: originalLowerLimbHeight }, 'ragdollMaterial', scaleFactor)
    };

    // Upper Arm Left (simmetrico al destro)
    const upperArmLMesh = new THREE.Mesh(new THREE.CylinderGeometry(originalLimbRadius, originalLimbRadius, originalUpperLimbHeight, 8), limbMaterial);
    // Posiziona l'avambraccio lungo l'asse Z dalla spalla
    upperArmLMesh.position.set(
        shoulderLMesh.position.x,
        shoulderLMesh.position.y,
        shoulderLMesh.position.z + (shoulderRadius + upperLimbHeight / 2) // Estende lungo Z
    );
    upperArmLMesh.quaternion.copy(armLimbQuaternion); // Usa il nuovo quaternion per allineare lungo Z
    scene.add(upperArmLMesh);
    ragdollParts.upperArmL = {
        mesh: upperArmLMesh,
        body: createRigidBody(upperArmLMesh, 0.5, upperArmLMesh.position, upperArmLMesh.quaternion,
            { type: 'cylinder', radius: originalLimbRadius, height: originalUpperLimbHeight }, 'ragdollMaterial', scaleFactor)
    };

    // Lower Arm Left
    const lowerArmLMesh = new THREE.Mesh(new THREE.CylinderGeometry(originalLimbRadius, originalLimbRadius, originalLowerLimbHeight, 8), limbMaterial);
    // Posiziona il braccio inferiore lungo l'asse Z dal braccio superiore
    lowerArmLMesh.position.set(
        upperArmLMesh.position.x,
        upperArmLMesh.position.y,
        upperArmLMesh.position.z + (upperLimbHeight / 2 + lowerLimbHeight / 2) // Estende lungo Z
    );
    lowerArmLMesh.quaternion.copy(armLimbQuaternion); // Usa il nuovo quaternion per allineare lungo Z
    scene.add(lowerArmLMesh);
    ragdollParts.lowerArmL = {
        mesh: lowerArmLMesh,
        body: createRigidBody(lowerArmLMesh, 0.4, lowerArmLMesh.position, lowerArmLMesh.quaternion,
            { type: 'cylinder', radius: originalLimbRadius, height: originalLowerLimbHeight }, 'ragdollMaterial', scaleFactor)
    };


    // --- Gambe ---
    // Upper Leg Right
    const upperLegRMesh = new THREE.Mesh(new THREE.CylinderGeometry(originalLimbRadius, originalLimbRadius, originalUpperLimbHeight, 8), limbMaterial);
    upperLegRMesh.position.set(
        ragdollParts.torso.mesh.position.x + (torsoWidth / 2 - limbRadius),
        ragdollParts.torso.mesh.position.y - (torsoHeight / 2 + upperLimbHeight / 2),
        ragdollParts.torso.mesh.position.z
    );
    upperLegRMesh.quaternion.copy(supineQuaternion); // Segue l'orientamento del torso
    scene.add(upperLegRMesh);
    ragdollParts.upperLegR = {
        mesh: upperLegRMesh,
        body: createRigidBody(upperLegRMesh, 0.8, upperLegRMesh.position, upperLegRMesh.quaternion,
            { type: 'cylinder', radius: originalLimbRadius, height: originalUpperLimbHeight }, 'ragdollMaterial', scaleFactor)
    };

    // Lower Leg Right
    const lowerLegRMesh = new THREE.Mesh(new THREE.CylinderGeometry(originalLimbRadius, originalLimbRadius, originalLowerLimbHeight, 8), limbMaterial);
    lowerLegRMesh.position.set(
        upperLegRMesh.position.x,
        upperLegRMesh.position.y - (upperLimbHeight / 2 + lowerLimbHeight / 2),
        upperLegRMesh.position.z
    );
    lowerLegRMesh.quaternion.copy(supineQuaternion);
    scene.add(lowerLegRMesh);
    ragdollParts.lowerLegR = {
        mesh: lowerLegRMesh,
        body: createRigidBody(lowerLegRMesh, 0.6, lowerLegRMesh.position, lowerLegRMesh.quaternion,
            { type: 'cylinder', radius: originalLimbRadius, height: originalLowerLimbHeight }, 'ragdollMaterial', scaleFactor)
    };

    // Upper Leg Left (simmetrico)
    const upperLegLMesh = new THREE.Mesh(new THREE.CylinderGeometry(originalLimbRadius, originalLimbRadius, originalUpperLimbHeight, 8), limbMaterial);
    upperLegLMesh.position.set(
        ragdollParts.torso.mesh.position.x - (torsoWidth / 2 - limbRadius),
        ragdollParts.torso.mesh.position.y - (torsoHeight / 2 + upperLimbHeight / 2),
        ragdollParts.torso.mesh.position.z
    );
    upperLegLMesh.quaternion.copy(supineQuaternion);
    scene.add(upperLegLMesh);
    ragdollParts.upperLegL = {
        mesh: upperLegLMesh,
        body: createRigidBody(upperLegLMesh, 0.8, upperLegLMesh.position, upperLegLMesh.quaternion,
            { type: 'cylinder', radius: originalLimbRadius, height: originalUpperLimbHeight }, 'ragdollMaterial', scaleFactor)
    };

    // Lower Leg Left
    const lowerLegLMesh = new THREE.Mesh(new THREE.CylinderGeometry(originalLimbRadius, originalLimbRadius, originalLowerLimbHeight, 8), limbMaterial);
    lowerLegLMesh.position.set(
        upperLegLMesh.position.x,
        upperLegLMesh.position.y - (upperLimbHeight / 2 + lowerLimbHeight / 2),
        upperLegLMesh.position.z
    );
    lowerLegLMesh.quaternion.copy(supineQuaternion);
    scene.add(lowerLegLMesh);
    ragdollParts.lowerLegL = {
        mesh: lowerLegLMesh,
        body: createRigidBody(lowerLegLMesh, 0.6, lowerLegLMesh.position, lowerLegLMesh.quaternion,
            { type: 'cylinder', radius: originalLimbRadius, height: originalLowerLimbHeight }, 'ragdollMaterial', scaleFactor)
    };


    // --- Creazione dei Vincoli ---

    // Collo: Torso - Head (PointToPointConstraint)
    const neckOffsetTorso = new CANNON.Vec3(0, 0, torsoHeight / 2); // Offset lungo Z del torso
    const neckOffsetHead = new CANNON.Vec3(0, 0, -headRadius); // Offset lungo Z della testa
    physicsWorld.addConstraint(new CANNON.PointToPointConstraint(
        ragdollParts.torso.body, neckOffsetTorso,
        ragdollParts.head.body, neckOffsetHead
    ));

    // Spalle: Torso - Shoulder (ConeTwistConstraint)
    // Destra
    const shoulderPivotTorsoR = new CANNON.Vec3(torsoWidth / 2, 0, (torsoHeight / 2 - shoulderRadius));
    const shoulderPivotShoulderR = new CANNON.Vec3(0, 0, -shoulderRadius); // Offset dalla sfera della spalla, ora lungo Z
    const shoulderAxisR = new CANNON.Vec3(0, 0, 1); // Asse di twist lungo l'asse Z (lunghezza del braccio)
    const shoulderConstraintR = new CANNON.ConeTwistConstraint(
        ragdollParts.torso.body,
        ragdollParts.shoulderR.body,
        {
            pivotA: shoulderPivotTorsoR,
            axisA: shoulderAxisR,
            pivotB: shoulderPivotShoulderR,
            axisB: shoulderAxisR,
            maxConeAngle: Math.PI / 4, // 45 gradi
            maxTwist: Math.PI / 6,     // 30 gradi
            collideConnected: false,
            stiffness: 1e9, // Aumentato
            relaxation: 0.001, // Ridotto
            damping: 0.9 // Aggiunto
        }
    );
    physicsWorld.addConstraint(shoulderConstraintR);

    // Sinistra
    const shoulderPivotTorsoL = new CANNON.Vec3(-torsoWidth / 2, 0, (torsoHeight / 2 - shoulderRadius));
    const shoulderPivotShoulderL = new CANNON.Vec3(0, 0, -shoulderRadius); // Offset dalla sfera della spalla, ora lungo Z
    const shoulderAxisL = new CANNON.Vec3(0, 0, 1); // Asse di twist lungo l'asse Z
    const shoulderConstraintL = new CANNON.ConeTwistConstraint(
        ragdollParts.torso.body,
        ragdollParts.shoulderL.body,
        {
            pivotA: shoulderPivotTorsoL,
            axisA: shoulderAxisL,
            pivotB: shoulderPivotShoulderL,
            axisB: shoulderAxisL,
            maxConeAngle: Math.PI / 4,
            maxTwist: Math.PI / 6,
            collideConnected: false,
            stiffness: 1e9,
            relaxation: 0.001,
            damping: 0.9
        }
    );
    physicsWorld.addConstraint(shoulderConstraintL);

    // Spalla - UpperArm (PointToPointConstraint)
    // Destra
    const shoulderToArmPivotShoulderR = new CANNON.Vec3(0, 0, shoulderRadius); // Punto sulla spalla dove si attacca il braccio
    const shoulderToArmPivotUpperArmR = new CANNON.Vec3(0, 0, -upperLimbHeight / 2); // Punto sull'avambraccio
    physicsWorld.addConstraint(new CANNON.PointToPointConstraint(
        ragdollParts.shoulderR.body, shoulderToArmPivotShoulderR,
        ragdollParts.upperArmR.body, shoulderToArmPivotUpperArmR
    ));

    // Sinistra
    const shoulderToArmPivotShoulderL = new CANNON.Vec3(0, 0, shoulderRadius); // Punto sulla spalla dove si attacca il braccio
    const shoulderToArmPivotUpperArmL = new CANNON.Vec3(0, 0, -upperLimbHeight / 2); // Punto sull'avambraccio
    physicsWorld.addConstraint(new CANNON.PointToPointConstraint(
        ragdollParts.shoulderL.body, shoulderToArmPivotShoulderL,
        ragdollParts.upperArmL.body, shoulderToArmPivotUpperArmL
    ));


    // Gomiti: UpperArm - LowerArm (HingeConstraint)
    // Destra
    const elbowPivotUpperArmR = new CANNON.Vec3(0, 0, upperLimbHeight / 2); // Estremità del braccio superiore
    const elbowPivotLowerArmR = new CANNON.Vec3(0, 0, -lowerLimbHeight / 2); // Inizio del braccio inferiore
    const elbowAxisR = new CANNON.Vec3(1, 0, 0); // Asse X per la flessione (per braccio lungo Z)
    const elbowConstraintR = new CANNON.HingeConstraint(
        ragdollParts.upperArmR.body,
        ragdollParts.lowerArmR.body,
        {
            pivotA: elbowPivotUpperArmR,
            axisA: elbowAxisR,
            pivotB: elbowPivotLowerArmR,
            axisB: elbowAxisR,
            collideConnected: false,
            lowerLimit: 0, // Flette da dritto (0)
            upperLimit: Math.PI * 0.75, // a ~135 gradi
            stiffness: 1e8,
            relaxation: 0.01,
            damping: 0.8
        }
    );
    physicsWorld.addConstraint(elbowConstraintR);

    // Sinistra
    const elbowPivotUpperArmL = new CANNON.Vec3(0, 0, upperLimbHeight / 2); // Estremità del braccio superiore
    const elbowPivotLowerArmL = new CANNON.Vec3(0, 0, -lowerLimbHeight / 2); // Inizio del braccio inferiore
    const elbowAxisL = new CANNON.Vec3(1, 0, 0); // Asse X per la flessione
    const elbowConstraintL = new CANNON.HingeConstraint(
        ragdollParts.upperArmL.body,
        ragdollParts.lowerArmL.body,
        {
            pivotA: elbowPivotUpperArmL,
            axisA: elbowAxisL,
            pivotB: elbowPivotLowerArmL,
            axisB: elbowAxisL,
            collideConnected: false,
            lowerLimit: 0,
            upperLimit: Math.PI * 0.75,
            stiffness: 1e8,
            relaxation: 0.01,
            damping: 0.8
        }
    );
    physicsWorld.addConstraint(elbowConstraintL);


    // Anche: Torso - UpperLeg (ConeTwistConstraint)
    // Destra
    const hipPivotTorsoR = new CANNON.Vec3(torsoWidth / 2, -torsoHeight / 2, 0);
    const hipPivotUpperLegR = new CANNON.Vec3(0, upperLimbHeight / 2, 0);
    const hipAxisR = new CANNON.Vec3(0, 1, 0); // Asse di twist lungo l'asse Y (lunghezza della gamba)
    const hipConstraintR = new CANNON.ConeTwistConstraint(
        ragdollParts.torso.body,
        ragdollParts.upperLegR.body,
        {
            pivotA: hipPivotTorsoR,
            axisA: hipAxisR,
            pivotB: hipPivotUpperLegR,
            axisB: hipAxisR,
            maxConeAngle: Math.PI / 4,
            maxTwist: Math.PI / 6,
            collideConnected: false,
            stiffness: 1e9,
            relaxation: 0.001,
            damping: 0.9
        }
    );
    physicsWorld.addConstraint(hipConstraintR);

    // Sinistra
    const hipPivotTorsoL = new CANNON.Vec3(-torsoWidth / 2, -torsoHeight / 2, 0);
    const hipPivotUpperLegL = new CANNON.Vec3(0, upperLimbHeight / 2, 0);
    const hipAxisL = new CANNON.Vec3(0, 1, 0);
    const hipConstraintL = new CANNON.ConeTwistConstraint(
        ragdollParts.torso.body,
        ragdollParts.upperLegL.body,
        {
            pivotA: hipPivotTorsoL,
            axisA: hipAxisL,
            pivotB: hipPivotUpperLegL,
            axisB: hipAxisL,
            maxConeAngle: Math.PI / 4,
            maxTwist: Math.PI / 6,
            collideConnected: false,
            stiffness: 1e9,
            relaxation: 0.001,
            damping: 0.9
        }
    );
    physicsWorld.addConstraint(hipConstraintL);


    // Ginocchia: UpperLeg - LowerLeg (HingeConstraint)
    // Destra
    const kneePivotUpperLegR = new CANNON.Vec3(0, -upperLimbHeight / 2, 0);
    const kneePivotLowerLegR = new CANNON.Vec3(0, lowerLimbHeight / 2, 0);
    const kneeAxisR = new CANNON.Vec3(1, 0, 0); // Asse X per la flessione
    const kneeConstraintR = new CANNON.HingeConstraint(
        ragdollParts.upperLegR.body,
        ragdollParts.lowerLegR.body,
        {
            pivotA: kneePivotUpperLegR,
            axisA: kneeAxisR,
            pivotB: kneePivotLowerLegR,
            axisB: kneeAxisR,
            collideConnected: false,
            lowerLimit: 0,
            upperLimit: Math.PI * 0.75,
            stiffness: 1e8,
            relaxation: 0.01,
            damping: 0.8
        }
    );
    physicsWorld.addConstraint(kneeConstraintR);

    // Sinistra
    const kneePivotUpperLegL = new CANNON.Vec3(0, -upperLimbHeight / 2, 0);
    const kneePivotLowerLegL = new CANNON.Vec3(0, lowerLimbHeight / 2, 0);
    const kneeAxisL = new CANNON.Vec3(1, 0, 0); // Asse X per la flessione
    const kneeConstraintL = new CANNON.HingeConstraint(
        ragdollParts.upperLegL.body,
        ragdollParts.lowerLegL.body,
        {
            pivotA: kneePivotUpperLegL,
            axisA: kneeAxisL,
            pivotB: kneePivotLowerLegL,
            axisB: kneeAxisL,
            collideConnected: false,
            lowerLimit: 0,
            upperLimit: Math.PI * 0.75,
            stiffness: 1e8,
            relaxation: 0.01,
            damping: 0.8
        }
    );
    physicsWorld.addConstraint(kneeConstraintL);
}

// --- 7. Funzione per Rimuovere il Ragdoll ---
function removeRagdoll() {
    const constraintsToRemove = [];
    for (let i = 0; i < physicsWorld.constraints.length; i++) {
        const constraint = physicsWorld.constraints[i];
        let isRagdollConstraint = false;
        // Controlla il torso (ora singolo)
        if (ragdollParts.torso && (constraint.bodyA === ragdollParts.torso.body || constraint.bodyB === ragdollParts.torso.body)) {
            isRagdollConstraint = true;
        } else {
            for (const partName in ragdollParts) {
                if (partName !== 'torso' && (constraint.bodyA === ragdollParts[partName].body || constraint.bodyB === ragdollParts[partName].body)) {
                    isRagdollConstraint = true;
                    break;
                }
            }
        }
        if (isRagdollConstraint) {
            constraintsToRemove.push(constraint);
        }
    }
    for (const constraint of constraintsToRemove) {
        physicsWorld.removeConstraint(constraint);
    }

    // Rimuovi tutte le parti del ragdoll
    for (const partName in ragdollParts) {
        const { mesh, body } = ragdollParts[partName];
        if (mesh) {
            scene.remove(mesh);
            const index = rigidBodies.indexOf(mesh);
            if (index > -1) {
                rigidBodies.splice(index, 1);
            }
        }
        if (body) {
            physicsWorld.removeBody(body);
        }
    }
    ragdollParts = {};
}


// --- 8. Funzione per Creare la Palettona (pedana di lancio combinata con il cilindro) ---
function createLaunchPlatform() {
    const platformHeight = PLATFORM_HEIGHT;
    const platformWidth = PLATFORM_WIDTH;
    const platformDepth = PLATFORM_DEPTH; // Lunghezza della pedana sull'asse Z

    const cylinderRadius = platformHeight * CYLINDER_RADIUS_FACTOR;
    const cylinderLength = platformDepth * CYLINDER_LENGTH_FACTOR;

    const platformMaterial = new THREE.MeshStandardMaterial({ color: 0xffffff }); // Bianco
    const cylinderMaterial = new THREE.MeshStandardMaterial({ color: 0xffffff }); // Stesso materiale della pedana (bianco)

    // --- Visual Meshes (Three.js) ---
    launchPlatformGroup = new THREE.Group(); // Questo gruppo rappresenterà l'oggetto combinato visivamente

    // Mesh della Pedana
    const platformBoxMesh = new THREE.Mesh(
        new THREE.BoxGeometry(platformWidth, platformHeight, platformDepth),
        platformMaterial
    );
    // Mesh del Cilindro
    const cylinderMesh = new THREE.Mesh(
        new THREE.CylinderGeometry(cylinderRadius, cylinderRadius, cylinderLength, 16),
        cylinderMaterial
    );

    // --- Corpo Fisico (Cannon-es) ---
    // Crea un singolo corpo fisico per l'oggetto combinato
    launchPlatformBody = new CANNON.Body({
        mass: 100, // Massa non zero per renderlo dinamico e permettere la rotazione con il motore
        material: cannonMaterials.platformMaterial,
        // Limita la rotazione solo all'asse X
        angularFactor: new CANNON.Vec3(1, 0, 0),
        // Aggiungi damping angolare per smorzare le rotazioni indesiderate
        angularDamping: 0.9
    });

    // 1. Calcola gli offset delle forme fisiche rispetto al punto di pivot desiderato.
    // Il punto di pivot desiderato è il centro della base del cilindro più lontana dalla pedana.
    // Immaginiamo che il pivot sia l'origine (0,0,0) del sistema di coordinate locale del launchPlatformBody.

    // Il cilindro si estende da Z=0 (pivot) a Z=cylinderLength. Il suo centro è a Z=cylinderLength/2.
    cylinderOffsetFromPivot.set(0, 0, cylinderLength / 2);

    // La pedana è adiacente al cilindro, quindi inizia a Z=cylinderLength.
    // La sua lunghezza è platformDepth. Il suo centro sarà a Z = cylinderLength + platformDepth/2.
    platformOffsetFromPivot.set(0, 0, cylinderLength + platformDepth / 2);

    // Ruota la forma del cilindro per allinearlo lungo Z (di default è Y)
    const cylinderQuaternion = new CANNON.Quaternion();
    cylinderQuaternion.setFromAxisAngle(new CANNON.Vec3(1, 0, 0), Math.PI / 2); // Ruota attorno all'asse X di 90 gradi

    // Aggiungi le forme al corpo fisico con i loro offset e orientamenti
    launchPlatformBody.addShape(new CANNON.Box(new CANNON.Vec3(platformWidth / 2, platformHeight / 2, platformDepth / 2)), platformOffsetFromPivot);
    launchPlatformBody.addShape(new CANNON.Cylinder(cylinderRadius, cylinderRadius, cylinderLength, 8), cylinderOffsetFromPivot, cylinderQuaternion);

    // Posiziona il corpo fisico combinato globalmente.
    // La sua posizione globale sarà il punto di pivot.
    // Lo posizioniamo in modo che il pivot sia sul pavimento (Y=0) e al centro (X=0).
    // Nota: la pedana ha altezza 0.25, quindi la sua base è a Y=0.
    // Il pivot è a Y=0 (sulla superficie del pavimento).
    launchPlatformBody.position.set(0, PLATFORM_HEIGHT / 2 + 0.3, 0); // Posiziona il pivot sulla superficie del pavimento

    physicsWorld.addBody(launchPlatformBody);

    // Aggiungi la palettona al rigidBodies array per l'aggiornamento della posizione visiva
    rigidBodies.push(launchPlatformGroup); // Aggiungiamo il gruppo, non il body direttamente

    // Crea il vincolo a cerniera (HingeConstraint) per la palettona
    const floorBody = floor.userData.physicsBody; // Il corpo fisico del pavimento
    const hingeGlobalPivot = new CANNON.Vec3(0, PLATFORM_HEIGHT / 2 + 0.3, 0); // Posizione globale del pivot

    // Pivot A (sul pavimento) relativo al centro del corpo del pavimento
    const pivotA = new CANNON.Vec3(
        hingeGlobalPivot.x - floorBody.position.x,
        hingeGlobalPivot.y - floorBody.position.y,
        hingeGlobalPivot.z - floorBody.position.z
    );

    // Asse per la rotazione (asse X nel sistema di coordinate globale)
    const hingeAxis = new CANNON.Vec3(1, 0, 0);

    platformHingeConstraint = new CANNON.HingeConstraint(
        floorBody,
        launchPlatformBody,
        {
            pivotA: pivotA,
            axisA: hingeAxis,
            pivotB: new CANNON.Vec3(0, 0, 0), // Il pivot è l'origine del launchPlatformBody
            axisB: hingeAxis,
            collideConnected: false, // Lascia a false per evitare auto-collisioni tra pavimento e palettona al pivot
            // Limiti di rotazione: da 0 (orizzontale) a PI/2 (90 gradi verticale)
            lowerLimit: 0,
            upperLimit: Math.PI / 2,
            // Aumenta la rigidità del vincolo
            stiffness: 1e8, // Un valore molto alto per una rigidità quasi perfetta
            relaxation: 4 // Un valore basso per meno "molleggiamento"
        }
    );
    physicsWorld.addConstraint(platformHingeConstraint);


    // --- Posiziona le Mesh Visive all'interno del Gruppo ---
    // L'origine del gruppo è il punto di pivot del corpo fisico.
    // Le mesh devono essere posizionate relativamente a questo pivot.
    // Le loro posizioni relative nel gruppo sono gli stessi offset usati per le forme fisiche.

    platformBoxMesh.position.copy(platformOffsetFromPivot);
    cylinderMesh.position.copy(cylinderOffsetFromPivot);
    cylinderMesh.quaternion.copy(cylinderQuaternion); // Applica la stessa rotazione della forma Cannon-es

    launchPlatformGroup.add(platformBoxMesh);
    launchPlatformGroup.add(cylinderMesh);

    scene.add(launchPlatformGroup);
    launchPlatformGroup.castShadow = true;
    launchPlatformGroup.receiveShadow = true; // Il gruppo può ricevere/proiettare ombre, ma anche le singole mesh devono farlo

    platformBoxMesh.castShadow = true;
    platformBoxMesh.receiveShadow = true;
    cylinderMesh.castShadow = true;
    cylinderMesh.receiveShadow = true;

    // Collega il gruppo visuale al corpo fisico
    launchPlatformGroup.userData.physicsBody = launchPlatformBody;

    // Crea e aggiungi la sfera rossa al punto di pivot
    const pivotSphereRadius = cylinderRadius * 2.4; // Raggio raddoppiato
    const pivotSphereGeometry = new THREE.SphereGeometry(pivotSphereRadius, 32, 32);
    const pivotSphereMaterial = new THREE.MeshStandardMaterial({ color: 0xff0000 }); // Rosso
    pivotSphereMesh = new THREE.Mesh(pivotSphereGeometry, pivotSphereMaterial);

    // La sfera è posizionata al centro del corpo combinato (il pivot)
    // Quindi la sua posizione globale sarà la stessa del launchPlatformBody
    pivotSphereMesh.position.copy(launchPlatformBody.position);
    scene.add(pivotSphereMesh);
    pivotSphereMesh.castShadow = true;
    pivotSphereMesh.receiveShadow = true;
}

// Funzione per creare il blocco fisico sotto la palettona
function createLowerRotationStopper() {
    const stopperHeight = 0.1;
    const stopperWidth = PLATFORM_WIDTH;
    const stopperDepth = CYLINDER_LENGTH_FACTOR * PLATFORM_DEPTH + PLATFORM_DEPTH; // Copre tutta la lunghezza della palettona

    const stopperGeometry = new THREE.BoxGeometry(stopperWidth, stopperHeight, stopperDepth);
    const stopperMaterial = new THREE.MeshStandardMaterial({
        color: 0x0000ff, // Blu per debug, poi trasparente
        transparent: true,
        opacity: 0.0 // Rendi invisibile
    });
    lowerRotationStopperMesh = new THREE.Mesh(stopperGeometry, stopperMaterial);

    // Posiziona il centro del blocco.
    // La palettona ha il suo pivot a Y = PLATFORM_HEIGHT / 2 + 0.3.
    // La base della pedana è a Y = (PLATFORM_HEIGHT / 2 + 0.3) - (PLATFORM_HEIGHT / 2) = 0.3.
    // Il blocco deve essere leggermente sotto questa base.
    // Se il blocco ha altezza 0.1, il suo centro sarà a Y = 0.05 per avere la parte superiore a Y = 0.1.
    // La posizione Z del blocco deve coprire l'intera lunghezza della palettona dal pivot.
    // La palettona si estende da Z=0 (pivot) a Z=cylinderLength + platformDepth (4.5).
    // Quindi il centro Z del blocco sarà a (cylinderLength + platformDepth) / 2 = 4.5 / 2 = 2.25.
    lowerRotationStopperMesh.position.set(0, stopperHeight / 2, stopperDepth / 2); // Posiziona il centro del blocco

    scene.add(lowerRotationStopperMesh);
    lowerRotationStopperMesh.receiveShadow = false; // Modificato: non riceve ombre
    lowerRotationStopperMesh.castShadow = false; // Modificato: non proietta ombre

    lowerRotationStopperBody = new CANNON.Body({
        mass: 0, // Deve essere statico
        type: CANNON.Body.STATIC,
        shape: new CANNON.Box(new CANNON.Vec3(stopperWidth / 2, stopperHeight / 2, stopperDepth / 2)),
        position: new CANNON.Vec3(0, stopperHeight / 2, stopperDepth / 2),
        material: cannonMaterials.floorMaterial // Usa lo stesso materiale del pavimento per collisioni coerenti
    });
    physicsWorld.addBody(lowerRotationStopperBody);
}

// Funzione per creare il blocco fisico per la rotazione superiore (ripristinata e modificata)
function createUpperRotationStopper() {
    const upperStopperWidth = PLATFORM_WIDTH * 1.5; // Larghezza maggiore per catturare la palettona
    const upperStopperHeight = 0.1; // Sottile
    const upperStopperDepth = 0.1; // Sottile

    const stopperMaterial = new THREE.MeshStandardMaterial({
        color: 0xffa500, // Arancione per debug, poi trasparente
        transparent: true,
        opacity: 0.0 // Rendi invisibile
    });
    upperRotationStopperMesh = new THREE.Mesh(new THREE.BoxGeometry(upperStopperWidth, upperStopperHeight, upperStopperDepth), stopperMaterial);

    // Posizione Y del pivot della palettona
    const pivotY = PLATFORM_HEIGHT / 2 + 0.3;

    // Calcola la lunghezza del cilindro
    const cylinderLength = PLATFORM_DEPTH * CYLINDER_LENGTH_FACTOR;

    // Posizione del blocco: al 60% della lunghezza del cilindro, partendo dal pivot
    const upperStopperY = pivotY + (cylinderLength * 0.6); // Modificato: 60% della lunghezza del cilindro
    const upperStopperX = 0; // Centrato sull'asse X
    const upperStopperZ = 0; // Allineato con il pivot

    upperRotationStopperMesh.position.set(upperStopperX, upperStopperY, upperStopperZ);
    scene.add(upperRotationStopperMesh);
    upperRotationStopperMesh.receiveShadow = false; // Modificato: non riceve ombre
    upperRotationStopperMesh.castShadow = false; // Modificato: non proietta ombre

    upperRotationStopperBody = new CANNON.Body({
        mass: 0, // Deve essere statico
        type: CANNON.Body.STATIC,
        shape: new CANNON.Box(new CANNON.Vec3(upperStopperWidth / 2, upperStopperHeight / 2, upperStopperDepth / 2)),
        position: new CANNON.Vec3(upperStopperX, upperStopperY, upperStopperZ),
        material: cannonMaterials.floorMaterial // Usa lo stesso materiale del pavimento per collisioni coerenti
    });
    physicsWorld.addBody(upperRotationStopperBody);
}


// Funzione per lanciare la palettona
function launchPalettona() {
    if (platformHingeConstraint) {
        // I limiti di rotazione sono già impostati in createLaunchPlatform() e sono permanenti.
        // Il motore spingerà la palettona fino al limite superiore (90 gradi).
        platformHingeConstraint.enableMotor();
        platformHingeConstraint.setMotorSpeed(10); // Velocità del motore
        platformHingeConstraint.setMotorMaxForce(5000); // Forza massima del motore

        // Disabilita il motore dopo un breve ritardo. La palettona si fermerà al limite superiore.
        setTimeout(() => {
            if (platformHingeConstraint) {
                platformHingeConstraint.disableMotor();
            }
        }, 750); // Regola questo tempo se la rotazione non raggiunge il limite o lo supera troppo
    }
}


// --- 9. Funzione per Resettare il Ragdoll e farlo ricomparire ---
function resetRagdollAndRespawn() {
    // Rimuovi il ragdoll esistente
    removeRagdoll();

    // Rimuovi la palettona, la sfera pivot e gli stopper esistenti
    // Rimuovi il vecchio vincolo
    if (platformHingeConstraint) {
        physicsWorld.removeConstraint(platformHingeConstraint);
    }
    // Rimuovi il corpo della palettona e il suo gruppo visivo
    if (launchPlatformBody) {
        physicsWorld.removeBody(launchPlatformBody);
        const index = rigidBodies.indexOf(launchPlatformGroup);
        if (index > -1) {
            rigidBodies.splice(index, 1);
        }
    }
    if (launchPlatformGroup) {
        scene.remove(launchPlatformGroup);
    }
    if (pivotSphereMesh) {
        scene.remove(pivotSphereMesh);
    }
    // Rimuovi e ricrea il blocco fisico sotto la palettona
    if (lowerRotationStopperBody) {
        physicsWorld.removeBody(lowerRotationStopperBody);
    }
    if (lowerRotationStopperMesh) {
        scene.remove(lowerRotationStopperMesh);
    }
    // Rimuovi e ricrea il blocco fisico per la rotazione superiore
    if (upperRotationStopperBody) {
        physicsWorld.removeBody(upperRotationStopperBody);
    }
    if (upperRotationStopperMesh) {
        scene.remove(upperRotationStopperMesh);
    }

    // Ricrea la palettona, la sfera pivot e gli stopper nelle loro posizioni iniziali corrette
    createLaunchPlatform();
    createLowerRotationStopper();
    createUpperRotationStopper();

    // Ora crea il nuovo ragdoll. Posizionalo sopra la pedana.
    // Calcola la posizione globale del centro della pedana (non del pivot)
    const platformGlobalPosition = new CANNON.Vec3();
    launchPlatformBody.pointToWorldFrame(platformOffsetFromPivot, platformGlobalPosition);

    const ragdollSpawnX = platformGlobalPosition.x;
    // Passa la posizione Y della superficie della pedana.
    // La funzione createRagdoll si occuperà di aggiungere l'offset per la profondità del ragdoll.
    const ragdollSpawnYSurface = platformGlobalPosition.y + PLATFORM_HEIGHT / 2;
    const ragdollSpawnZ = platformGlobalPosition.z;

    createRagdoll(ragdollSpawnX, ragdollSpawnYSurface, ragdollSpawnZ, currentRagdollScale);
}


// --- 10. Funzione per il Ridimensionamento della Finestra ---
function onWindowResize() {
    const canvas = document.getElementById('giostraCanvas');
    camera.aspect = canvas.clientWidth / canvas.clientHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(canvas.clientWidth, canvas.clientHeight);
}


// --- 11. Funzione di Animazione (animate) ---
function animate() {
    requestAnimationFrame(animate);

    const deltaTime = clock.getDelta();

    if (physicsWorld) {
        physicsWorld.step(1 / 60, deltaTime, 3);

        // Aggiorna la posizione del gruppo visuale della palettona
        if (launchPlatformGroup && launchPlatformBody) {
            launchPlatformGroup.position.copy(launchPlatformBody.position);
            launchPlatformGroup.quaternion.copy(launchPlatformBody.quaternion);
        }
        // Aggiorna la posizione della sfera pivot (se la palettona si muovesse)
        if (pivotSphereMesh && launchPlatformBody) {
            pivotSphereMesh.position.copy(launchPlatformBody.position);
        }


        for (let i = 0; i < rigidBodies.length; i++) {
            const objThree = rigidBodies[i];
            const objCannon = objThree.userData.physicsBody;

            if (!objCannon) continue;

            objThree.position.copy(objCannon.position);
            objThree.quaternion.copy(objCannon.quaternion);
        }
    }

    // La telecamera segue il ragdoll
    // Ora segue il torso, che è centrale
    if (ragdollParts.torso && ragdollParts.torso.body) {
        controls.target.copy(ragdollParts.torso.body.position);
    }

    controls.update(); // Aggiorna i controlli dopo aver modificato il target
    renderer.render(scene, camera);
}


// --- 12. Avvio dell'Applicazione ---
init();
