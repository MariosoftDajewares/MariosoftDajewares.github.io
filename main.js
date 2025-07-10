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

// Variabili globali per le dimensioni della pedana e del cilindro per chiarezza e riutilizzo
const PLATFORM_HEIGHT = 0.25;
const PLATFORM_WIDTH = 1.5;
const PLATFORM_DEPTH = 1.5; // Lunghezza della pedana sull'asse Z

const CYLINDER_RADIUS_FACTOR = 1 / 3; // 1/3 dell'altezza della pedana
const CYLINDER_LENGTH_FACTOR = 2;    // Il doppio della lunghezza del lato della pedana (DEPTH)

// Offset della pedana e del cilindro rispetto al pivot del corpo composto
// Questi verranno calcolati in createLaunchPlatform
let platformOffsetFromPivot = new CANNON.Vec3();
let cylinderOffsetFromPivot = new CANNON.Vec3();


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

    // *** Creazione della Pedana di lancio combinata con il cilindro ***
    createLaunchPlatform();

    // --- Inizializza lo slider e crea il ragdoll con la scala iniziale ---
    const ragdollScaleSlider = document.getElementById('ragdollScaleSlider');
    const ragdollScaleValueSpan = document.getElementById('ragdollScaleValue');

    // Imposta il valore iniziale dello slider e dello span
    currentRagdollScale = parseFloat(ragdollScaleSlider.value);
    ragdollScaleValueSpan.textContent = currentRagdollScale.toFixed(2);

    // Crea il ragdoll iniziale. Posizionalo sopra la pedana.
    const originalTorsoHeightForSpawn = 0.8; // Usa l'altezza originale del torso per il calcolo

    // Calcola la posizione globale del centro della pedana (non del pivot)
    const platformGlobalPosition = new CANNON.Vec3();
    launchPlatformBody.pointToWorldFrame(platformOffsetFromPivot, platformGlobalPosition);

    const ragdollSpawnX = platformGlobalPosition.x;
    // Alzato lo spawn del ragdoll di 1 unità (1m)
    const ragdollSpawnY = platformGlobalPosition.y + PLATFORM_HEIGHT / 2 + (originalTorsoHeightForSpawn / 2 * currentRagdollScale) + 1.0;
    const ragdollSpawnZ = platformGlobalPosition.z;

    createRagdoll(ragdollSpawnX, ragdollSpawnY, ragdollSpawnZ, currentRagdollScale);


    // --- Gestione dello slider per la grandezza del ragdoll ---
    ragdollScaleSlider.addEventListener('input', (event) => {
        currentRagdollScale = parseFloat(event.target.value);
        ragdollScaleValueSpan.textContent = currentRagdollScale.toFixed(2);
    });

    // --- Gestione del pulsante Respawn Ragdoll ---
    document.getElementById('respawnRagdollBtn').addEventListener('click', resetRagdollAndRespawn);


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
            restitution: 0.3
        }
    );
    physicsWorld.addContactMaterial(ragdollFloorContactMaterial);

    const ragdollPlatformContactMaterial = new CANNON.ContactMaterial(
        cannonMaterials.ragdollMaterial,
        cannonMaterials.platformMaterial,
        {
            friction: 0.7,
            restitution: 0.2
        }
    );
    physicsWorld.addContactMaterial(ragdollPlatformContactMaterial);


    physicsWorld.solver.iterations = 10;
    physicsWorld.solver.tolerance = 0.001;
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
    // Applica la scalatura alla mesh Three.js.
    // Nota: per i corpi composti come la pedana, la scalatura è gestita dal gruppo Three.js
    // e non qui individualmente per le sub-mesh.
    threeMesh.scale.set(scaleFactor, scaleFactor, scaleFactor);


    let shape;
    if (shapeData.type === 'box') {
        shape = new CANNON.Box(new CANNON.Vec3(
            shapeData.halfExtents.x * scaleFactor,
            shapeData.halfExtents.y * scaleFactor,
            shapeData.halfExtents.z * scaleFactor
        ));
    } else if (shapeData.type === 'sphere') {
        shape = new CANNON.Sphere(shapeData.radius * scaleFactor);
    } else if (shapeData.type === 'cylinder') {
        shape = new CANNON.Cylinder(
            shapeData.radius * scaleFactor,
            shapeData.radius * scaleFactor,
            shapeData.height * scaleFactor,
            8
        );
    } else {
        console.warn(`Tipo di forma fisica non supportato: ${shapeData.type}. Usando sfera di default.`);
        shape = new CANNON.Sphere(0.1 * scaleFactor);
    }

    const scaledMass = mass > 0 ? mass * Math.pow(scaleFactor, 3) : 0;

    const body = new CANNON.Body({
        mass: scaledMass,
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
function createRagdoll(x, y, z, scaleFactor = 1) {
    const originalTorsoHeight = 0.8;
    const originalTorsoWidth = 0.4;
    const originalTorsoDepth = 0.2;
    const originalHeadRadius = 0.2;
    const originalLimbRadius = 0.08;
    const originalUpperLimbHeight = 0.3;
    const originalLowerLimbHeight = 0.3;

    // Divisione del torso
    const originalUpperTorsoHeight = originalTorsoHeight * 0.6; // 60% del torso totale
    const originalLowerTorsoHeight = originalTorsoHeight * 0.4; // 40% del torso totale

    const upperTorsoHeight = originalUpperTorsoHeight * scaleFactor;
    const lowerTorsoHeight = originalLowerTorsoHeight * scaleFactor;
    const torsoWidth = originalTorsoWidth * scaleFactor;
    const torsoDepth = originalTorsoDepth * scaleFactor;
    const headRadius = originalHeadRadius * scaleFactor;
    const limbRadius = originalLimbRadius * scaleFactor;
    const upperLimbHeight = originalUpperLimbHeight * scaleFactor;
    const lowerLimbHeight = originalLowerLimbHeight * scaleFactor;

    const torsoMaterial = new THREE.MeshStandardMaterial({ color: 0x0077ff });
    const headMaterial = new THREE.MeshStandardMaterial({ color: 0xffff00 });
    const limbMaterial = new THREE.MeshStandardMaterial({ color: 0xff8800 });

    const initialPosition = new THREE.Vector3(x, y, z); // Questa è la base del ragdoll

    // --- Creazione delle Parti ---

    // Lower Torso
    const lowerTorsoMesh = new THREE.Mesh(new THREE.BoxGeometry(originalTorsoWidth, originalLowerTorsoHeight, originalTorsoDepth), torsoMaterial);
    lowerTorsoMesh.position.copy(initialPosition);
    lowerTorsoMesh.position.y += lowerTorsoHeight / 2; // Posiziona il centro del lowerTorso
    scene.add(lowerTorsoMesh);
    ragdollParts.lowerTorso = {
        mesh: lowerTorsoMesh,
        body: createRigidBody(lowerTorsoMesh, 3, lowerTorsoMesh.position, lowerTorsoMesh.quaternion,
            { type: 'box', halfExtents: new CANNON.Vec3(originalTorsoWidth / 2, originalLowerTorsoHeight / 2, originalTorsoDepth / 2) }, 'ragdollMaterial', scaleFactor)
    };

    // Upper Torso
    const upperTorsoMesh = new THREE.Mesh(new THREE.BoxGeometry(originalTorsoWidth, originalUpperTorsoHeight, originalTorsoDepth), torsoMaterial);
    upperTorsoMesh.position.set(
        initialPosition.x,
        initialPosition.y + lowerTorsoHeight + upperTorsoHeight / 2, // Posiziona sopra il lowerTorso
        initialPosition.z
    );
    scene.add(upperTorsoMesh);
    ragdollParts.upperTorso = {
        mesh: upperTorsoMesh,
        body: createRigidBody(upperTorsoMesh, 2, upperTorsoMesh.position, upperTorsoMesh.quaternion,
            { type: 'box', halfExtents: new CANNON.Vec3(originalTorsoWidth / 2, originalUpperTorsoHeight / 2, originalTorsoDepth / 2) }, 'ragdollMaterial', scaleFactor)
    };

    // Head
    const headMesh = new THREE.Mesh(new THREE.SphereGeometry(originalHeadRadius, 16, 16), headMaterial);
    headMesh.position.set(
        initialPosition.x,
        initialPosition.y + lowerTorsoHeight + upperTorsoHeight + headRadius, // Posiziona sopra l'upperTorso
        initialPosition.z
    );
    scene.add(headMesh);
    ragdollParts.head = {
        mesh: headMesh,
        body: createRigidBody(headMesh, 1, headMesh.position, headMesh.quaternion,
            { type: 'sphere', radius: originalHeadRadius }, 'ragdollMaterial', scaleFactor)
    };


    // Funzione helper per creare arti simmetrici (aggiornata per i nuovi vincoli)
    function createLimbPair(side, upperName, lowerName, offsetUpperX, offsetUpperY, offsetLowerX, offsetLowerY, rotationAxisUpper, rotationAxisLower, rotationAngle) {
        const upperLimbMesh = new THREE.Mesh(new THREE.CylinderGeometry(originalLimbRadius, originalLimbRadius, originalUpperLimbHeight, 8), limbMaterial);
        upperLimbMesh.position.set(
            initialPosition.x + offsetUpperX * side * scaleFactor,
            initialPosition.y + offsetUpperY * scaleFactor,
            initialPosition.z
        );
        upperLimbMesh.quaternion.setFromAxisAngle(rotationAxisUpper, rotationAngle * side);
        scene.add(upperLimbMesh);
        ragdollParts[upperName] = {
            mesh: upperLimbMesh,
            body: createRigidBody(upperLimbMesh, 0.5, upperLimbMesh.position, upperLimbMesh.quaternion,
                { type: 'cylinder', radius: originalLimbRadius, height: originalUpperLimbHeight }, 'ragdollMaterial', scaleFactor)
        };

        const lowerLimbMesh = new THREE.Mesh(new THREE.CylinderGeometry(originalLimbRadius, originalLimbRadius, originalLowerLimbHeight, 8), limbMaterial);
        lowerLimbMesh.position.set(
            initialPosition.x + offsetLowerX * side * scaleFactor,
            initialPosition.y + offsetLowerY * scaleFactor,
            initialPosition.z
        );
        lowerLimbMesh.quaternion.setFromAxisAngle(rotationAxisLower, rotationAngle * side);
        scene.add(lowerLimbMesh);
        ragdollParts[lowerName] = {
            mesh: lowerLimbMesh,
            body: createRigidBody(lowerLimbMesh, 0.4, lowerLimbMesh.position, lowerLimbMesh.quaternion,
                { type: 'cylinder', radius: originalLimbRadius, height: originalLowerLimbHeight }, 'ragdollMaterial', scaleFactor)
        };
    }

    // Braccia (connesse a upperTorso)
    createLimbPair(1, 'upperArmR', 'lowerArmR',
        originalTorsoWidth / 2 + originalUpperLimbHeight / 2, initialPosition.y + lowerTorsoHeight + originalUpperTorsoHeight / 2 - originalLimbRadius,
        originalTorsoWidth / 2 + originalUpperLimbHeight + originalLowerLimbHeight / 2, initialPosition.y + lowerTorsoHeight + originalUpperTorsoHeight / 2 - originalLimbRadius,
        new THREE.Vector3(0, 0, 1), new THREE.Vector3(0, 0, 1), -Math.PI / 2); // Axis for initial rotation

    createLimbPair(-1, 'upperArmL', 'lowerArmL',
        originalTorsoWidth / 2 + originalUpperLimbHeight / 2, initialPosition.y + lowerTorsoHeight + originalUpperTorsoHeight / 2 - originalLimbRadius,
        originalTorsoWidth / 2 + originalUpperLimbHeight + originalLowerLimbHeight / 2, initialPosition.y + lowerTorsoHeight + originalUpperTorsoHeight / 2 - originalLimbRadius,
        new THREE.Vector3(0, 0, 1), new THREE.Vector3(0, 0, 1), Math.PI / 2); // Axis for initial rotation

    // Gambe (connesse a lowerTorso)
    createLimbPair(1, 'upperLegR', 'lowerLegR',
        originalTorsoWidth / 2 - originalLimbRadius, initialPosition.y + originalLowerTorsoHeight / 2 - originalUpperLimbHeight / 2,
        originalTorsoWidth / 2 - originalLimbRadius, initialPosition.y + originalLowerTorsoHeight / 2 - originalUpperLimbHeight - originalLowerLimbHeight / 2,
        new THREE.Vector3(1, 0, 0), new THREE.Vector3(1, 0, 0), 0);

    createLimbPair(-1, 'upperLegL', 'lowerLegL',
        originalTorsoWidth / 2 - originalLimbRadius, initialPosition.y + originalLowerTorsoHeight / 2 - originalUpperLimbHeight / 2,
        originalTorsoWidth / 2 - originalLimbRadius, initialPosition.y + originalLowerTorsoHeight / 2 - originalUpperLimbHeight - originalLowerLimbHeight / 2,
        new THREE.Vector3(1, 0, 0), new THREE.Vector3(1, 0, 0), 0);


    // --- Creazione dei Vincoli ---

    // Collo: UpperTorso - Head (PointToPointConstraint)
    const neckOffsetUpperTorso = new CANNON.Vec3(0, originalUpperTorsoHeight / 2 * scaleFactor, 0);
    const neckOffsetHead = new CANNON.Vec3(0, -originalHeadRadius * scaleFactor, 0);
    physicsWorld.addConstraint(new CANNON.PointToPointConstraint(
        ragdollParts.upperTorso.body, neckOffsetUpperTorso,
        ragdollParts.head.body, neckOffsetHead
    ));

    // Colonna Vertebrale: LowerTorso - UpperTorso (HingeConstraint)
    const spinePivotLower = new CANNON.Vec3(0, originalLowerTorsoHeight / 2 * scaleFactor, 0); // Top of lower torso
    const spinePivotUpper = new CANNON.Vec3(0, -originalUpperTorsoHeight / 2 * scaleFactor, 0); // Bottom of upper torso
    const spineAxis = new CANNON.Vec3(1, 0, 0); // Permette di piegarsi in avanti/indietro
    const spineConstraint = new CANNON.HingeConstraint(
        ragdollParts.lowerTorso.body,
        ragdollParts.upperTorso.body,
        {
            pivotA: spinePivotLower,
            axisA: spineAxis,
            pivotB: spinePivotUpper,
            axisB: spineAxis,
            collideConnected: false,
            // CORREZIONE: Imposta i limiti direttamente come proprietà
            lowerLimit: -Math.PI / 8, // Limita la flessione della colonna (es. -22.5 gradi)
            upperLimit: Math.PI / 8  // Limita la flessione della colonna (es. +22.5 gradi)
        }
    );
    physicsWorld.addConstraint(spineConstraint);


    // Spalle: UpperTorso - UpperArm (ConeTwistConstraint)
    // Destra
    const shoulderPivotUpperTorsoR = new CANNON.Vec3(originalTorsoWidth / 2 * scaleFactor, (originalUpperTorsoHeight / 2 - originalLimbRadius) * scaleFactor, 0);
    const shoulderPivotUpperArmR = new CANNON.Vec3(-originalUpperLimbHeight / 2 * scaleFactor, 0, 0);
    const shoulderAxisUpperTorsoR = new CANNON.Vec3(0, 1, 0); // Asse di rotazione sul torso (verticale)
    const shoulderAxisUpperArmR = new CANNON.Vec3(1, 0, 0); // Asse di rotazione sull'avambraccio (lungo l'avambraccio)
    const shoulderConstraintR = new CANNON.ConeTwistConstraint(
        ragdollParts.upperTorso.body,
        ragdollParts.upperArmR.body,
        {
            pivotA: shoulderPivotUpperTorsoR,
            axisA: shoulderAxisUpperTorsoR,
            pivotB: shoulderPivotUpperArmR,
            axisB: shoulderAxisUpperArmR,
            maxConeAngle: Math.PI / 3, // 60 gradi di oscillazione
            maxTwist: Math.PI / 4,     // 45 gradi di torsione
            collideConnected: false
        }
    );
    physicsWorld.addConstraint(shoulderConstraintR);

    // Sinistra
    const shoulderPivotUpperTorsoL = new CANNON.Vec3(-originalTorsoWidth / 2 * scaleFactor, (originalUpperTorsoHeight / 2 - originalLimbRadius) * scaleFactor, 0);
    const shoulderPivotUpperArmL = new CANNON.Vec3(originalUpperLimbHeight / 2 * scaleFactor, 0, 0);
    const shoulderAxisUpperTorsoL = new CANNON.Vec3(0, 1, 0);
    const shoulderAxisUpperArmL = new CANNON.Vec3(-1, 0, 0); // Asse inverso per il braccio sinistro
    const shoulderConstraintL = new CANNON.ConeTwistConstraint(
        ragdollParts.upperTorso.body,
        ragdollParts.upperArmL.body,
        {
            pivotA: shoulderPivotUpperTorsoL,
            axisA: shoulderAxisUpperTorsoL,
            pivotB: shoulderPivotUpperArmL,
            axisB: shoulderAxisUpperArmL,
            maxConeAngle: Math.PI / 3,
            maxTwist: Math.PI / 4,
            collideConnected: false
        }
    );
    physicsWorld.addConstraint(shoulderConstraintL);


    // Gomiti: UpperArm - LowerArm (HingeConstraint)
    // Destra
    const elbowPivotUpperArmR = new CANNON.Vec3(originalUpperLimbHeight / 2 * scaleFactor, 0, 0);
    const elbowPivotLowerArmR = new CANNON.Vec3(-originalLowerLimbHeight / 2 * scaleFactor, 0, 0);
    const elbowAxisR = new CANNON.Vec3(0, 0, 1); // Asse Z per la flessione (se il braccio è lungo X)
    const elbowConstraintR = new CANNON.HingeConstraint(
        ragdollParts.upperArmR.body,
        ragdollParts.lowerArmR.body,
        {
            pivotA: elbowPivotUpperArmR,
            axisA: elbowAxisR,
            pivotB: elbowPivotLowerArmR,
            axisB: elbowAxisR,
            collideConnected: false,
            // CORREZIONE: Imposta i limiti direttamente come proprietà
            lowerLimit: 0, // Flette da dritto (0)
            upperLimit: Math.PI * 0.75 // a ~135 gradi
        }
    );
    physicsWorld.addConstraint(elbowConstraintR);

    // Sinistra
    const elbowPivotUpperArmL = new CANNON.Vec3(-originalUpperLimbHeight / 2 * scaleFactor, 0, 0);
    const elbowPivotLowerArmL = new CANNON.Vec3(originalLowerLimbHeight / 2 * scaleFactor, 0, 0);
    const elbowAxisL = new CANNON.Vec3(0, 0, -1); // Asse Z negativo per il braccio sinistro
    const elbowConstraintL = new CANNON.HingeConstraint(
        ragdollParts.upperArmL.body,
        ragdollParts.lowerArmL.body,
        {
            pivotA: elbowPivotUpperArmL,
            axisA: elbowAxisL,
            pivotB: elbowPivotLowerArmL,
            axisB: elbowAxisL,
            collideConnected: false,
            // CORREZIONE: Imposta i limiti direttamente come proprietà
            lowerLimit: 0,
            upperLimit: Math.PI * 0.75
        }
    );
    physicsWorld.addConstraint(elbowConstraintL);


    // Anche: LowerTorso - UpperLeg (ConeTwistConstraint)
    // Destra
    const hipPivotLowerTorsoR = new CANNON.Vec3(originalTorsoWidth / 2 * scaleFactor, -originalLowerTorsoHeight / 2 * scaleFactor, 0);
    const hipPivotUpperLegR = new CANNON.Vec3(0, originalUpperLimbHeight / 2 * scaleFactor, 0);
    const hipAxisLowerTorsoR = new CANNON.Vec3(0, 1, 0); // Asse di rotazione sul torso (verticale)
    const hipAxisUpperLegR = new CANNON.Vec3(0, 1, 0); // Asse di rotazione sulla gamba (lungo la gamba)
    const hipConstraintR = new CANNON.ConeTwistConstraint(
        ragdollParts.lowerTorso.body,
        ragdollParts.upperLegR.body,
        {
            pivotA: hipPivotLowerTorsoR,
            axisA: hipAxisLowerTorsoR,
            pivotB: hipPivotUpperLegR,
            axisB: hipAxisUpperLegR,
            maxConeAngle: Math.PI / 3, // 60 gradi di oscillazione
            maxTwist: Math.PI / 4,     // 45 gradi di torsione
            collideConnected: false
        }
    );
    physicsWorld.addConstraint(hipConstraintR);

    // Sinistra
    const hipPivotLowerTorsoL = new CANNON.Vec3(-originalTorsoWidth / 2 * scaleFactor, -originalLowerTorsoHeight / 2 * scaleFactor, 0);
    const hipPivotUpperLegL = new CANNON.Vec3(0, originalUpperLimbHeight / 2 * scaleFactor, 0);
    const hipAxisLowerTorsoL = new CANNON.Vec3(0, 1, 0);
    const hipAxisUpperLegL = new CANNON.Vec3(0, 1, 0);
    const hipConstraintL = new CANNON.ConeTwistConstraint(
        ragdollParts.lowerTorso.body,
        ragdollParts.upperLegL.body,
        {
            pivotA: hipPivotLowerTorsoL,
            axisA: hipAxisLowerTorsoL,
            pivotB: hipPivotUpperLegL,
            axisB: hipAxisUpperLegL,
            maxConeAngle: Math.PI / 3,
            maxTwist: Math.PI / 4,
            collideConnected: false
        }
    );
    physicsWorld.addConstraint(hipConstraintL);


    // Ginocchia: UpperLeg - LowerLeg (HingeConstraint)
    // Destra
    const kneePivotUpperLegR = new CANNON.Vec3(0, -originalUpperLimbHeight / 2 * scaleFactor, 0);
    const kneePivotLowerLegR = new CANNON.Vec3(0, originalLowerLimbHeight / 2 * scaleFactor, 0);
    const kneeAxisR = new CANNON.Vec3(1, 0, 0); // Asse X per la flessione (se la gamba è lungo Y)
    const kneeConstraintR = new CANNON.HingeConstraint(
        ragdollParts.upperLegR.body,
        ragdollParts.lowerLegR.body,
        {
            pivotA: kneePivotUpperLegR,
            axisA: kneeAxisR,
            pivotB: kneePivotLowerLegR,
            axisB: kneeAxisR,
            collideConnected: false,
            // CORREZIONE: Imposta i limiti direttamente come proprietà
            lowerLimit: 0,
            upperLimit: Math.PI * 0.75
        }
    );
    physicsWorld.addConstraint(kneeConstraintR);

    // Sinistra
    const kneePivotUpperLegL = new CANNON.Vec3(0, -originalUpperLimbHeight / 2 * scaleFactor, 0);
    const kneePivotLowerLegL = new CANNON.Vec3(0, originalLowerLimbHeight / 2 * scaleFactor, 0);
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
            // CORREZIONE: Imposta i limiti direttamente come proprietà
            lowerLimit: 0,
            upperLimit: Math.PI * 0.75
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
        // Controlla anche upperTorso e lowerTorso
        for (const partName in ragdollParts) {
            if (constraint.bodyA === ragdollParts[partName].body || constraint.bodyB === ragdollParts[partName].body) {
                isRagdollConstraint = true;
                break;
            }
        }
        if (isRagdollConstraint) {
            constraintsToRemove.push(constraint);
        }
    }
    for (const constraint of constraintsToRemove) {
        physicsWorld.removeConstraint(constraint);
    }

    // Rimuovi upperTorso e lowerTorso
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


// --- 8. Funzione per Creare la Pedana di Lancio (ora combinata con il cilindro) ---
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
        mass: 0, // Statico per ora
        material: cannonMaterials.platformMaterial
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
    launchPlatformBody.position.set(0, PLATFORM_HEIGHT / 2, 0); // Posiziona il pivot sulla superficie del pavimento

    physicsWorld.addBody(launchPlatformBody);

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
    // Non aggiungiamo al rigidBodies array se è statico (massa 0), in quanto non verrà aggiornato nel loop animate.
    // Se diventerà dinamico in futuro, dovrà essere aggiunto.
}


// --- 9. Funzione per Resettare il Ragdoll e farlo ricomparire ---
function resetRagdollAndRespawn() {
    removeRagdoll();
    // Crea un nuovo ragdoll nella posizione iniziale sopra la pedana
    const originalTorsoHeightForSpawn = 0.8; // Usa l'altezza originale del torso per il calcolo

    // Calcola la posizione globale del centro della pedana (non del pivot)
    const platformGlobalPosition = new CANNON.Vec3();
    launchPlatformBody.pointToWorldFrame(platformOffsetFromPivot, platformGlobalPosition);

    const ragdollSpawnX = platformGlobalPosition.x;
    // Alzato lo spawn del ragdoll di 1 unità (1m)
    const ragdollSpawnY = platformGlobalPosition.y + PLATFORM_HEIGHT / 2 + (originalTorsoHeightForSpawn / 2 * currentRagdollScale) + 1.0;
    const ragdollSpawnZ = platformGlobalPosition.z;

    createRagdoll(ragdollSpawnX, ragdollSpawnY, ragdollSpawnZ, currentRagdollScale);
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

        // Aggiorna la posizione del gruppo visuale della pedana
        if (launchPlatformGroup && launchPlatformBody) {
            launchPlatformGroup.position.copy(launchPlatformBody.position);
            launchPlatformGroup.quaternion.copy(launchPlatformBody.quaternion);
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
    // Ora segue il torso superiore, che è più centrale
    if (ragdollParts.upperTorso && ragdollParts.upperTorso.body) {
        controls.target.copy(ragdollParts.upperTorso.body.position);
    }

    controls.update(); // Aggiorna i controlli dopo aver modificato il target
    renderer.render(scene, camera);
}


// --- 12. Avvio dell'Applicazione ---
init();
