// main.js
// Questo file contiene la logica principale della tua scena Three.js,
// ora utilizzando Cannon-es per la simulazione fisica.

// --- 1. Inclusione dei Moduli Base ---
import * as THREE from './lib/three.module.js';
import { OrbitControls } from './lib/OrbitControls.js';
import * as CANNON from './lib/cannon-es.js'; // Importa Cannon-es


// --- 2. Dichiarazione delle Variabili Globali della Scena e della Fisica ---
let scene;
let camera;
let renderer;
let floor;
let floorExtension; // Variabile per il prolungamento del pavimento
let controls;

let physicsWorld; // Il mondo fisico di Cannon-es
const rigidBodies = []; // Array per tenere traccia delle mesh Three.js con corpi Cannon-es
const clock = new THREE.Clock(); // Orologio per calcolare il deltaTime per la fisica

// Variabili per il cubo
let cubeMesh;
let cubeBody;

// Riferimenti per la pedana di lancio combinata (gruppo visuale e corpo fisico)
let launchPlatformGroup; // THREE.Group per la pedana e il cilindro combinati
let launchPlatformBody;  // CANNON.Body per la pedana e il cilindro combinati
// Rimosso: let pivotSphereMesh; // Riferimento alla mesh della sfera al pivot

// Variabile globale per il vincolo a cerniera della palettona
let platformHingeConstraint;

// Rimosse: Variabili per i blocchi fisici di rotazione (lowerRotationStopper, upperRotationStopper)

// Oggetto per memorizzare i materiali Cannon-es per nome
let cannonMaterials = {};

// Variabili globali per le dimensioni della pedana e del cilindro per chiarezza e riutilizzo
const PLATFORM_HEIGHT = 0.5;
const PLATFORM_WIDTH = 4.0;
const PLATFORM_DEPTH = 3.0;

const CYLINDER_RADIUS_FACTOR = 1 / 3;
const CYLINDER_LENGTH_FACTOR = 2;


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
    camera.position.set(3, 2.5, 3); // Posizione iniziale della telecamera per dare una vista migliore sul cubo
    camera.lookAt(0, 0, 0); // La telecamera inizialmente guarda il centro della scena

    // --- Inizializzazione del Mondo Fisico (Cannon-es) ---
    initPhysics(); // Chiamata diretta, Cannon-es è un modulo sincrono

    // --- Creazione del Pavimento iniziale con Materiale Semplice ---
    const floorGeometry = new THREE.BoxGeometry(48, 0.25, 48);
    const floorMaterial = new THREE.MeshStandardMaterial({
        color: 0x8B4513, // Marrone semplice
    });
    floor = new THREE.Mesh(floorGeometry, floorMaterial);
    floor.position.set(0, -0.125, 0);
    scene.add(floor);
    floor.receiveShadow = true;

    // Crea il corpo fisico per il pavimento (statico)
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
    floorExtension.position.set(0, -0.125, -24 - (floorExtensionLength / 2));
    scene.add(floorExtension);
    floorExtension.receiveShadow = true;

    // Crea il corpo fisico per il prolungamento (statico)
    createRigidBody(floorExtension, 0, floorExtension.position, floorExtension.quaternion,
        { type: 'box', halfExtents: new CANNON.Vec3(floorExtensionWidth / 2, floorExtensionHeight / 2, floorExtensionLength / 2) }, 'floorMaterial'
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
    // MODIFICATO: Estese le dimensioni della telecamera delle ombre per coprire una scena più ampia
    directionalLight.shadow.camera.near = 0.5;
    directionalLight.shadow.camera.far = 50;
    directionalLight.shadow.camera.left = -30;
    directionalLight.shadow.camera.right = 30;
    directionalLight.shadow.camera.top = 30;
    directionalLight.shadow.camera.bottom = -30;
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

    // Rimosso: Creazione dei blocchi fisici sotto e sopra la palettona

    // Calcola la posizione globale del centro della pedana (non del pivot)
    // Usiamo la posizione del gruppo Three.js, che sarà sincronizzata con il corpo fisico
    const platformGlobalPosition = launchPlatformGroup.position;

    const cubeSpawnX = platformGlobalPosition.x;
    // MODIFICATO: Posiziona il cubo direttamente sopra la superficie della pedana con un piccolo offset
    let cubeSpawnYSurface = platformGlobalPosition.y + PLATFORM_HEIGHT / 2 + 0.25; // Altezza della superficie + metà altezza cubo
    const cubeSpawnZ = platformGlobalPosition.z;

    // Crea il cubo iniziale. Posizionalo sopra la pedana.
    createCube(cubeSpawnX, cubeSpawnYSurface, cubeSpawnZ);


    // --- Gestione del pulsante Respawn Cubo ---
    document.getElementById('respawnRagdollBtn').addEventListener('click', resetSceneAndRespawn); // Rinominato

    // --- Gestione del pulsante Lancia Palettona ---
    document.getElementById('launchPalettonaBtn').addEventListener('click', launchPalettona);


    // --- Gestione del Ridimensionamento della Finestra ---
    window.addEventListener('resize', onWindowResize, false);

    // Avvia il loop di animazione
    animate();
}


// --- 4. Funzione di Inizializzazione della Fisica (Cannon-es) ---
function initPhysics() {
    physicsWorld = new CANNON.World();
    physicsWorld.gravity.set(0, -9.82, 0); // Imposta la gravità (X, Y, Z)

    // Inizializza i materiali Cannon-es
    cannonMaterials.defaultMaterial = new CANNON.Material('defaultMaterial');
    cannonMaterials.floorMaterial = new CANNON.Material('floorMaterial');
    cannonMaterials.platformMaterial = new CANNON.Material('platformMaterial');
    cannonMaterials.cubeMaterial = new CANNON.Material('cubeMaterial'); // Nuovo materiale per il cubo

    // Definisci come interagiscono i materiali
    const defaultContactMaterial = new CANNON.ContactMaterial(
        cannonMaterials.defaultMaterial,
        cannonMaterials.defaultMaterial,
        {
            friction: 0.5,
            restitution: 0.7 // Rimbalzo generale
        }
    );
    physicsWorld.addContactMaterial(defaultContactMaterial);

    const floorContactMaterial = new CANNON.ContactMaterial(
        cannonMaterials.floorMaterial,
        cannonMaterials.platformMaterial,
        {
            friction: 0.5,
            restitution: 0.5
        }
    );
    physicsWorld.addContactMaterial(floorContactMaterial);

    const cubeFloorContactMaterial = new CANNON.ContactMaterial(
        cannonMaterials.cubeMaterial,
        cannonMaterials.floorMaterial,
        {
            friction: 0.8,
            restitution: 0.3
        }
    );
    physicsWorld.addContactMaterial(cubeFloorContactMaterial);

    const cubePlatformContactMaterial = new CANNON.ContactMaterial(
        cannonMaterials.cubeMaterial,
        cannonMaterials.platformMaterial,
        {
            friction: 0.7,
            restitution: 0.2
        }
    );
    physicsWorld.addContactMaterial(cubePlatformContactMaterial);


    // Impostazioni del solver (migliora stabilità e performance)
    physicsWorld.solver.iterations = 10;
    physicsWorld.solver.tolerance = 0.001;
}


// --- 5. Funzione per Creare un Corpo Rigido Cannon-es e la sua Mesh Three.js ---
function createRigidBody(
    threeMesh,
    mass,
    position,
    quaternion,
    shapeData, // Contiene le dimensioni per la creazione della forma fisica
    materialName = 'defaultMaterial'
) {
    let shape;
    if (shapeData.type === 'box') {
        shape = new CANNON.Box(shapeData.halfExtents); // halfExtents sono metà delle dimensioni
    } else if (shapeData.type === 'sphere') {
        shape = new CANNON.Sphere(shapeData.radius);
    } else if (shapeData.type === 'cylinder') {
        shape = new CANNON.Cylinder(shapeData.radius, shapeData.radius, shapeData.height, 8);
        // I cilindri di Cannon-es sono allineati lungo l'asse Y.
        // Se la tua geometria Three.js è lungo un altro asse,
        // potresti dover ruotare la forma fisica.
        // Esempio per un cilindro lungo l'asse X:
        // const q = new CANNON.Quaternion();
        // q.setFromAxisAngle(new CANNON.Vec3(0, 0, 1), Math.PI / 2);
        // shape.orientation = q;
    } else {
        console.warn(`Tipo di forma fisica non supportato: ${shapeData.type}. Usando sfera di default.`);
        shape = new CANNON.Sphere(0.1);
    }

    // Crea il corpo fisico Cannon-es
    const body = new CANNON.Body({
        mass: mass,
        shape: shape,
        position: new CANNON.Vec3(position.x, position.y, position.z),
        quaternion: new CANNON.Quaternion(quaternion.x, quaternion.y, quaternion.z, quaternion.w),
        material: cannonMaterials[materialName] // Assegna il materiale fisico
    });

    // Imposta damping per smorzare il movimento
    if (mass > 0) {
        body.linearDamping = 0.1;
        body.angularDamping = 0.9;
    }

    physicsWorld.addBody(body);

    // Collega la mesh Three.js al corpo fisico Cannon-es
    threeMesh.userData.physicsBody = body;

    // Aggiungi solo i corpi dinamici all'array per la sincronizzazione
    // I corpi statici (massa 0) non hanno bisogno di essere sincronizzati ogni frame
    if (mass > 0) {
        rigidBodies.push(threeMesh);
    }

    // Abilita le ombre per le mesh
    threeMesh.castShadow = true;
    threeMesh.receiveShadow = true;

    return body;
}


// --- Funzione per Creare il Cubo ---
function createCube(x, y, z) {
    // Rimuovi il cubo esistente se presente
    if (cubeMesh) {
        removePhysicsBody(cubeMesh); // Rimuove il corpo fisico
        scene.remove(cubeMesh);
        // Rimuovi anche dalla lista di rigidBodies se era dinamico
        const index = rigidBodies.indexOf(cubeMesh);
        if (index > -1) {
            rigidBodies.splice(index, 1);
        }
        cubeMesh = null;
        cubeBody = null;
    }

    const cubeSize = 0.5; // Dimensione fissa del cubo
    const cubeMass = 1; // Massa del cubo

    const cubeGeometry = new THREE.BoxGeometry(cubeSize, cubeSize, cubeSize);
    const cubeMaterial = new THREE.MeshStandardMaterial({ color: 0x00ff00 }); // Cubo verde

    cubeMesh = new THREE.Mesh(cubeGeometry, cubeMaterial);
    cubeMesh.position.set(x, y, z);
    scene.add(cubeMesh);

    // Crea il corpo fisico per il cubo
    cubeBody = createRigidBody(
        cubeMesh,
        cubeMass,
        cubeMesh.position,
        cubeMesh.quaternion,
        { type: 'box', halfExtents: new CANNON.Vec3(cubeSize / 2, cubeSize / 2, cubeSize / 2) },
        'cubeMaterial'
    );
}


// --- 6. Funzione per Creare la Palettona (pedana di lancio combinata con il cilindro) ---
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

    // MODIFICATO: Posizione iniziale del gruppo (il pivot)
    // Il pivot è ora posizionato alla base del cilindro, al centro.
    // L'altezza è impostata per allineare la base del cilindro con la parte superiore del pavimento.
    const initialGroupPosition = new THREE.Vector3(0, 0.125 + 0.01, 0); // 0.125 (metà altezza pavimento) + piccolo offset
    launchPlatformGroup.position.copy(initialGroupPosition);
    scene.add(launchPlatformGroup);

    // Mesh del Cilindro
    const cylinderMesh = new THREE.Mesh(
        new THREE.CylinderGeometry(cylinderRadius, cylinderRadius, cylinderLength, 16),
        cylinderMaterial
    );
    // Posiziona il cilindro in modo che la sua base sia al pivot del gruppo (Z=0)
    // La geometria del cilindro di Three.js è centrata sull'asse Y.
    // Dopo la rotazione di 90 gradi attorno all'asse X, l'altezza è lungo Z.
    // Quindi, per avere la base a Z=0 nel gruppo, il centro deve essere a Z = cylinderLength / 2.
    cylinderMesh.position.set(0, 0, cylinderLength / 2);
    // Ruota la mesh del cilindro per allinearlo lungo Z (di default è Y)
    const cylinderQuaternionVisual = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), Math.PI / 2);
    cylinderMesh.quaternion.copy(cylinderQuaternionVisual);
    launchPlatformGroup.add(cylinderMesh);


    // Mesh della Pedana
    const platformBoxMesh = new THREE.Mesh(
        new THREE.BoxGeometry(platformWidth, platformHeight, platformDepth),
        platformMaterial
    );
    // La pedana è posizionata dopo il cilindro, quindi il suo centro sarà a
    // cylinderLength (fine del cilindro) + platformDepth / 2
    platformBoxMesh.position.set(0, 0, cylinderLength + platformDepth / 2);
    launchPlatformGroup.add(platformBoxMesh);


    launchPlatformGroup.castShadow = true;
    launchPlatformGroup.receiveShadow = true;
    platformBoxMesh.castShadow = true;
    platformBoxMesh.receiveShadow = true;
    cylinderMesh.castShadow = true;
    cylinderMesh.receiveShadow = true;


    // --- Corpo Fisico (Cannon-es) - Corpo Composto ---
    const mass = 300;

    // Crea un singolo corpo Cannon-es e aggiungi più forme ad esso per creare un corpo composto
    launchPlatformBody = new CANNON.Body({
        mass: mass,
        position: new CANNON.Vec3(initialGroupPosition.x, initialGroupPosition.y, initialGroupPosition.z),
        quaternion: new CANNON.Quaternion(launchPlatformGroup.quaternion.x, launchPlatformGroup.quaternion.y, launchPlatformGroup.quaternion.z, launchPlatformGroup.quaternion.w),
        material: cannonMaterials.platformMaterial
    });

    // Forma del cilindro
    const cylinderShape = new CANNON.Cylinder(cylinderRadius, cylinderRadius, cylinderLength, 16);
    // Posiziona la forma del cilindro in modo che la sua base sia al pivot del corpo (Z=0)
    const cannonCylinderQuaternion = new CANNON.Quaternion().setFromAxisAngle(new CANNON.Vec3(1, 0, 0), Math.PI / 2); // Ruota per allineare il cilindro Cannon-es (default Y-axis)
    launchPlatformBody.addShape(cylinderShape, new CANNON.Vec3(0, 0, cylinderLength / 2), cannonCylinderQuaternion);


    // Forma della pedana
    const platformShape = new CANNON.Box(new CANNON.Vec3(platformWidth / 2, platformHeight / 2, platformDepth / 2));
    // La pedana è posizionata dopo il cilindro, quindi il suo centro sarà a
    // cylinderLength (fine del cilindro) + platformDepth / 2
    launchPlatformBody.addShape(platformShape, new CANNON.Vec3(0, 0, cylinderLength + platformDepth / 2));

    // Imposta damping per smorzare il movimento
    launchPlatformBody.linearDamping = 0.1;
    launchPlatformBody.angularDamping = 0.9;

    physicsWorld.addBody(launchPlatformBody);

    // Collega il gruppo visuale al corpo fisico di Cannon-es
    launchPlatformGroup.userData.physicsBody = launchPlatformBody;

    // Aggiungi il corpo dinamico alla lista per la sincronizzazione
    rigidBodies.push(launchPlatformGroup);


    // Crea il vincolo a cerniera (HingeConstraint) per la palettona
    const floorBody = floor.userData.physicsBody; // Il corpo fisico del pavimento

    // Pivot A (sul pavimento) relativo al centro del corpo del pavimento
    const pivotA = new CANNON.Vec3(
        initialGroupPosition.x - floorBody.position.x,
        initialGroupPosition.y - floorBody.position.y,
        initialGroupPosition.z - floorBody.position.z
    );

    // Pivot B (sulla palettona) relativo al centro del corpo della palettona (che è il pivot del gruppo)
    const pivotB = new CANNON.Vec3(0, 0, 0); // Il pivot del gruppo è il centro del corpo composto

    // Asse per la rotazione (asse X nel sistema di coordinate globale)
    const hingeAxis = new CANNON.Vec3(1, 0, 0);

    platformHingeConstraint = new CANNON.HingeConstraint(
        floorBody,
        launchPlatformBody,
        {
            pivotA: pivotA,
            pivotB: pivotB,
            axisA: hingeAxis, // Asse relativo al corpo A
            axisB: hingeAxis, // Asse relativo al corpo B
            lowerLimit: 0,       // Imposta il limite inferiore qui
            upperLimit: Math.PI / 2, // Imposta il limite superiore qui
            collideConnected: false // Non far collidere i corpi connessi
        }
    );
    physicsWorld.addConstraint(platformHingeConstraint);
}

// Rimosse: Funzioni createLowerRotationStopper e createUpperRotationStopper

// Funzione per lanciare la palettona
function launchPalettona() {
    if (launchPlatformBody) {
        // Applica un torque impulsivo al corpo fisico della palettona
        // per farlo ruotare attorno all'asse X.
        const torqueMagnitude = 8000; // Regola questo valore per più o meno forza
        // Il torque in Cannon-es è un Vec3 che rappresenta la coppia di forze (componenti X, Y, Z)
        const torque = new CANNON.Vec3(torqueMagnitude, 0, 0); // Torque lungo l'asse X

        // Applica il torque al centro di massa del corpo
        launchPlatformBody.applyTorque(torque);
        // Non c'è bisogno di distruggere oggetti Cannon-es come in Ammo.js
    }
}


// Funzione ausiliaria per rimuovere un corpo fisico e la sua mesh
function removePhysicsBody(mesh) {
    if (mesh && mesh.userData.physicsBody) {
        const body = mesh.userData.physicsBody;
        physicsWorld.removeBody(body); // Cannon-es usa removeBody()
        // Rimuovi la mesh dall'array di sincronizzazione
        const index = rigidBodies.indexOf(mesh);
        if (index > -1) {
            rigidBodies.splice(index, 1);
        }
        mesh.userData.physicsBody = null; // Rimuovi il riferimento
    }
}

// --- Funzione per Resettare la Scena e far ricomparire gli oggetti dinamici ---
function resetSceneAndRespawn() { // Rinominato da resetCubeAndRespawn
    // 1. Rimuovi il cubo esistente
    if (cubeMesh) {
        removePhysicsBody(cubeMesh);
        scene.remove(cubeMesh);
        cubeMesh = null;
        cubeBody = null;
    }

    // 2. Rimuovi la palettona e la sfera pivot esistenti
    // Rimuovi prima il vincolo
    if (platformHingeConstraint) {
        physicsWorld.removeConstraint(platformHingeConstraint);
        platformHingeConstraint = null;
    }

    // Poi i corpi fisici associati alla palettona
    if (launchPlatformGroup) {
        removePhysicsBody(launchPlatformGroup);
        scene.remove(launchPlatformGroup);
        launchPlatformGroup = null;
        launchPlatformBody = null;
    }
    // Rimosso: if (pivotSphereMesh) { scene.remove(pivotSphereMesh); pivotSphereMesh = null; }
    // Rimosse: Rimozione dei blocchi fisici di rotazione

    // 3. Ricrea tutti gli oggetti dinamici e i loro vincoli
    // Il pavimento e il suo prolungamento sono statici e non vengono toccati qui.
    createLaunchPlatform();

    const platformGlobalPosition = launchPlatformGroup.position;
    const cubeSpawnX = platformGlobalPosition.x;
    // MODIFICATO: Posiziona il cubo direttamente sopra la superficie della pedana con un piccolo offset
    let cubeSpawnYSurface = platformGlobalPosition.y + PLATFORM_HEIGHT / 2 + 0.25; // Altezza della superficie + metà altezza cubo
    const cubeSpawnZ = platformGlobalPosition.z;

    createCube(cubeSpawnX, cubeSpawnYSurface, cubeSpawnZ);
}


// --- 7. Funzione per il Ridimensionamento della Finestra ---
function onWindowResize() {
    const canvas = document.getElementById('giostraCanvas');
    // L'aspetto del canvas è già gestito dal CSS per mantenere l'orientamento orizzontale.
    // Qui ci assicuriamo che la telecamera si adatti alle dimensioni effettive del canvas.
    camera.aspect = canvas.clientWidth / canvas.clientHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(canvas.clientWidth, canvas.clientHeight);
}


// --- 8. Funzione di Animazione (animate) ---
function animate() {
    requestAnimationFrame(animate);

    const deltaTime = 1 / 60; // Frequenza fissa di 60 FPS per la fisica
    // Esegui un passo della simulazione fisica di Cannon-es
    physicsWorld.step(deltaTime, clock.getDelta(), 3); // fixedTimeStep, deltaTime, maxSubSteps

    // Sincronizza le mesh Three.js con i corpi fisici di Cannon-es
    for (let i = 0; i < rigidBodies.length; i++) {
        const objThree = rigidBodies[i];
        const objCannon = objThree.userData.physicsBody;

        // Se il corpo fisico è stato rimosso, salta
        if (!objCannon) continue;

        objThree.position.copy(objCannon.position);
        objThree.quaternion.copy(objCannon.quaternion);
    }

    controls.update(); // Aggiorna i controlli della telecamera
    renderer.render(scene, camera);
}


// --- 9. Avvio dell'Applicazione ---
init();
