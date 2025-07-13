// Importa le librerie come moduli ES
import * as THREE from './lib/three.module.js';
import { World, Vec3, Box, Plane, Body, Material, ContactMaterial, SAPBroadphase, Sphere } from './lib/cannon-es.js';
import { GLTFLoader } from './lib/GLTFLoader.js';
import { RGBELoader } from './lib/RGBELoader.js';
import { TextureLoader } from './lib/three.module.js'; // Importa TextureLoader

// Variabili globali per la scena, la telecamera, il renderer, il mondo fisico
let scene, camera, renderer, world;

// Variabili per il controllo del giocatore
let playerBody; // Cannon.js body per il giocatore
const playerHeight = 1.8; // Altezza del giocatore
const playerRadius = 0.5; // Raggio del giocatore (per la collisione a box)
const playerSpeed = 22; // Velocità di movimento del giocatore
const mouseSensitivity = 0.007; // Sensibilità del mouse (Mantenuta)
const jumpStrength = 7; // Forza del salto ridotta per un salto più realistico
let canJump = false; // Flag per controllare se il giocatore può saltare

// Oggetti per la rotazione della telecamera (mouselook)
let yawObject;   // Gestisce la rotazione orizzontale (yaw)
let pitchObject; // Gestisce la rotazione verticale (pitch)
const PI_2 = Math.PI / 2; // Limite per la rotazione verticale

// Stato degli input
let moveForward = false;
let moveBackward = false;
let moveLeft = false;
let moveRight = false;
let isLocked = false; // Stato del pointer lock

// Elemento per le istruzioni
let instructionsElement;

// Array per tenere traccia di tutti gli oggetti fisici (bersagli e sfera)
const physicalObjects = []; 

// Riferimento al corpo del terreno per la rilevazione del salto
let groundBodyRef;

// Variabile globale per il mesh del cannone
let cannonMesh;

// Inizializza la scena 3D e il mondo fisico
function init() {
    // --- Configurazione Three.js ---
    scene = new THREE.Scene();

    camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
    
    // Imposta la dimensione del renderer a tutta la finestra
    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight); 
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.outputEncoding = THREE.sRGBEncoding;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.25;

    document.body.appendChild(renderer.domElement);

    // Ottieni l'elemento delle istruzioni
    instructionsElement = document.getElementById('instructions');

    // Luci
    const ambientLight = new THREE.AmbientLight(0x404040, 2); // Luce ambientale
    scene.add(ambientLight);

    // Luce direzionale principale (esistente)
    const directionalLight = new THREE.DirectionalLight(0xffffff, 1); // Luce direzionale
    directionalLight.position.set(5, 10, 7.5);
    directionalLight.castShadow = true; // La luce direzionale proietta ombre
    // Configurazione delle ombre della luce direzionale
    directionalLight.shadow.mapSize.width = 1024; // Risoluzione della mappa d'ombra
    directionalLight.shadow.mapSize.height = 1024;
    directionalLight.shadow.camera.near = 0.5; // Limiti della camera d'ombra
    directionalLight.shadow.camera.far = 50;
    directionalLight.shadow.camera.left = -20; // Ampiezza dell'area d'ombra
    directionalLight.shadow.camera.right = 20;
    directionalLight.shadow.camera.top = 20;
    directionalLight.shadow.camera.bottom = -20;
    scene.add(directionalLight);

    // NUOVA Luce direzionale dall'alto per ombre soft e scure
    const topDownLight = new THREE.DirectionalLight(0x111111, 0.8); // Colore molto scuro, intensità 0.8
    topDownLight.position.set(0, 20, 0); // Posizionata direttamente sopra l'arena
    topDownLight.castShadow = true;
    topDownLight.shadow.mapSize.width = 512; // Risoluzione bassa per ombre soft
    topDownLight.shadow.mapSize.height = 512;
    topDownLight.shadow.camera.near = 0.1;
    topDownLight.shadow.camera.far = 50;
    topDownLight.shadow.camera.left = -30; // Ampiezza per coprire l'arena
    topDownLight.shadow.camera.right = 30;
    topDownLight.shadow.camera.top = 30;
    topDownLight.shadow.camera.bottom = -30;
    scene.add(topDownLight);


    // --- Configurazione Cannon.js ---
    world = new World();
    world.gravity.set(0, -9.82, 0); // Gravità terrestre ripristinata
    world.broadphase = new SAPBroadphase(world);

    // Materiale di base per la fisica
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

    // --- Inizializza TextureLoader (per tutti i materiali PBR) ---
    const textureLoader = new TextureLoader();

    // --- Carica le texture PBR per il pavimento ---
    const grAlbedoMap = textureLoader.load('./txt/gr_albedo.png');
    const grAOMap = textureLoader.load('./txt/gr_ao.png');
    const grHeightMap = textureLoader.load('./txt/gr_height.png'); // Usata come bump map
    const grMetallicMap = textureLoader.load('./txt/gr_metallic.png');
    const grNormalMap = textureLoader.load('./txt/gr_normal-ogl.png');
    const grRoughnessMap = textureLoader.load('./txt/gr_roughness.png');

    grAlbedoMap.encoding = THREE.sRGBEncoding;

    const tilingRepeat = 20; 
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

    // --- Definizione di groundSize e groundGeometry ---
    const groundSize = 50; // Dimensione del pavimento
    const groundGeometry = new THREE.PlaneGeometry(groundSize, groundSize); // Definizione di groundGeometry

    const groundMesh = new THREE.Mesh(groundGeometry, groundMaterialMesh);
    groundMesh.rotation.x = -Math.PI / 2;
    groundMesh.position.y = -0.5; 
    groundMesh.receiveShadow = true;
    scene.add(groundMesh);

    // --- Creazione del Pavimento (Corpo fisico Cannon.js) ---
    const groundShape = new Plane();
    const groundBody = new Body({ mass: 0, shape: groundShape, material: groundMaterial });
    groundBody.quaternion.setFromEuler(-Math.PI / 2, 0, 0); 
    groundBody.position.y = -0.5; 
    world.addBody(groundBody);
    groundBodyRef = groundBody; 

    // --- Nuovo Materiale Riflettente per i Muri ---
    const reflectiveWallMaterial = new THREE.MeshStandardMaterial({
        color: 0xaaaaaa, 
        metalness: 1.0, 
        roughness: 0.1, 
        envMapIntensity: 1.5 
    });

    // --- Creazione dei Muri ---
    const wallHeight = 20; 
    const wallThickness = 1; 
    const wallYPosition = -0.5 + wallHeight / 2; 

    // Muro Nord
    const wallNorthMesh = new THREE.Mesh(
        new THREE.BoxGeometry(groundSize + wallThickness * 2, wallHeight, wallThickness),
        reflectiveWallMaterial 
    );
    wallNorthMesh.position.set(0, wallYPosition, -groundSize / 2 - wallThickness / 2);
    wallNorthMesh.castShadow = true;
    wallNorthMesh.receiveShadow = true;
    scene.add(wallNorthMesh);

    const wallNorthBody = new Body({
        mass: 0,
        shape: new Box(new Vec3((groundSize + wallThickness * 2) / 2, wallHeight / 2, wallThickness / 2)),
        position: new Vec3(0, wallYPosition, -groundSize / 2 - wallThickness / 2),
        material: groundMaterial
    });
    world.addBody(wallNorthBody);

    // Muro Sud
    const wallSouthMesh = new THREE.Mesh(
        new THREE.BoxGeometry(groundSize + wallThickness * 2, wallHeight, wallThickness),
        reflectiveWallMaterial 
    );
    wallSouthMesh.position.set(0, wallYPosition, groundSize / 2 + wallThickness / 2);
    wallSouthMesh.castShadow = true;
    wallSouthMesh.receiveShadow = true;
    scene.add(wallSouthMesh);

    const wallSouthBody = new Body({
        mass: 0,
        shape: new Box(new Vec3((groundSize + wallThickness * 2) / 2, wallHeight / 2, wallThickness / 2)),
        position: new Vec3(0, wallYPosition, groundSize / 2 + wallThickness / 2),
        material: groundMaterial
    });
    world.addBody(wallSouthBody);

    // Muro Ovest
    const wallWestMesh = new THREE.Mesh(
        new THREE.BoxGeometry(wallThickness, wallHeight, groundSize),
        reflectiveWallMaterial 
    );
    wallWestMesh.position.set(-groundSize / 2 - wallThickness / 2, wallYPosition, 0);
    wallWestMesh.castShadow = true;
    wallWestMesh.receiveShadow = true;
    scene.add(wallWestMesh);

    const wallWestBody = new Body({
        mass: 0,
        shape: new Box(new Vec3(wallThickness / 2, wallHeight / 2, groundSize / 2)),
        position: new Vec3(-groundSize / 2 - wallThickness / 2, wallYPosition, 0),
        material: groundMaterial
    });
    world.addBody(wallWestBody);

    // Muro Est
    const wallEastMesh = new THREE.Mesh(
        new THREE.BoxGeometry(wallThickness, wallHeight, groundSize),
        reflectiveWallMaterial 
    );
    wallEastMesh.position.set(groundSize / 2 + wallThickness / 2, wallYPosition, 0);
    wallEastMesh.castShadow = true;
    wallEastMesh.receiveShadow = true;
    scene.add(wallEastMesh);

    const wallEastBody = new Body({
        mass: 0,
        shape: new Box(new Vec3(wallThickness / 2, wallHeight / 2, groundSize / 2)),
        position: new Vec3(groundSize / 2 + wallThickness / 2, wallYPosition, 0),
        material: groundMaterial
    });
    world.addBody(wallEastBody);


    // --- Caricamento HDR Skybox ---
    const pmremGenerator = new THREE.PMREMGenerator(renderer);
    pmremGenerator.compileEquirectangularShader();

    const rgbeLoader = new RGBELoader();
    rgbeLoader.load('./txt/ssky.hdr', (texture) => {
        const envMap = pmremGenerator.fromEquirectangular(texture).texture;
        texture.dispose();

        scene.environment = envMap;
        scene.background = envMap;

        // Applica la envMap anche al materiale del pavimento e dei muri
        groundMaterialMesh.envMap = envMap;
        groundMaterialMesh.needsUpdate = true;
        reflectiveWallMaterial.envMap = envMap; 
        reflectiveWallMaterial.needsUpdate = true;
    });

    // --- Creazione del Player (solo corpo fisico) ---
    const playerShape = new Box(new Vec3(playerRadius, playerHeight / 2, playerRadius));
    playerBody = new Body({
        mass: 60, 
        position: new Vec3(0, playerHeight / 2 + 1 - 0.5, 0), 
        shape: playerShape,
        fixedRotation: true
    });
    world.addBody(playerBody);

    // Listener per la collisione del giocatore per abilitare il salto
    playerBody.addEventListener('collide', (event) => {
        // Controlla se il giocatore è entrato in contatto con il terreno
        if (event.body === groundBodyRef) {
            canJump = true;
        }
    });

    // --- Aggiungi bersagli (parallelepipedi fisici) (max 8) ---
    const boxWidth = 1.3; 
    const boxHeight = 2.5; 
    const boxDepth = 0.4; 
    const boxHalfExtents = new Vec3(boxWidth / 2, boxHeight / 2, boxDepth / 2);
    const boxShape = new Box(boxHalfExtents);
    const boxMaterialMesh = new THREE.MeshStandardMaterial({ color: 0x8B4513, roughness: 0.7, metalness: 0.1 }); // Colore marrone per i bersagli

    const sphereInitialPositionX = -10;
    const sphereInitialPositionZ = -7;
    const minDistanceToSphere = 2; // Distanza minima dalla sfera

    for (let i = 0; i < 8; i++) { 
        let x, z;
        let distance;
        let attempts = 0;
        const maxAttempts = 100; 

        do {
            x = (Math.random() - 0.5) * 40; 
            z = (Math.random() - 0.5) * 40;
            distance = Math.sqrt(Math.pow(x - sphereInitialPositionX, 2) + Math.pow(z - sphereInitialPositionZ, 2));
            attempts++;
        } while (distance < minDistanceToSphere && attempts < maxAttempts);

        if (attempts === maxAttempts) {
            console.warn(`Impossibile trovare una posizione per il bersaglio ${i} a distanza minima dalla sfera dopo ${maxAttempts} tentativi.`);
            continue; 
        }

        const y = -0.5 + boxHeight / 2; 

        const mesh = new THREE.Mesh(new THREE.BoxGeometry(boxWidth, boxHeight, boxDepth), boxMaterialMesh);
        mesh.position.set(x, y, z);
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        scene.add(mesh);

        const body = new Body({
            mass: 96, 
            position: new Vec3(x, y, z),
            shape: boxShape,
            material: groundMaterial,
            fixedRotation: true 
        });
        world.addBody(body);

        physicalObjects.push({ mesh, body });
    }

    // --- Carica le texture PBR per la sfera e il cannone (materiale condiviso) ---
    const metalAlbedoMap = textureLoader.load('./txt/metal_albedo.png');
    const metalAOMap = textureLoader.load('./txt/metal_ao.png');
    const metalHeightMap = textureLoader.load('./txt/metal_Height.png'); 
    const metalMetallicMap = textureLoader.load('./txt/metal_Metallic.png');
    const metalNormalMap = textureLoader.load('./txt/metal_Normal-ogl.png');
    const metalRoughnessMap = textureLoader.load('./txt/metal_Roughness.png');

    metalAlbedoMap.encoding = THREE.sRGBEncoding;

    const sharedMetalMaterialPBR = new THREE.MeshStandardMaterial({
        map: metalAlbedoMap,
        aoMap: metalAOMap,
        bumpMap: metalHeightMap, 
        bumpScale: 0.5, 
        metalnessMap: metalMetallicMap,
        normalMap: metalNormalMap,
        roughnessMap: metalRoughnessMap,
        metalness: 1.0, 
        roughness: 0.5,
    });

    // --- Aggiungi una Sfera con Materiale PBR ---
    const sphereRadius = 2 * 1.5; 
    const sphereGeometry = new THREE.SphereGeometry(sphereRadius, 64, 64); 
    
    const sphereMesh = new THREE.Mesh(sphereGeometry, sharedMetalMaterialPBR); // Usa il materiale condiviso
    const sphereInitialPositionY = sphereRadius - 0.5; 
    const sphereInitialPosition = new Vec3(sphereInitialPositionX, sphereInitialPositionY, sphereInitialPositionZ); 
    sphereMesh.position.copy(sphereInitialPosition); 
    sphereMesh.castShadow = true;
    sphereMesh.receiveShadow = true;
    scene.add(sphereMesh);

    const sphereShape = new Sphere(sphereRadius);
    const sphereBody = new Body({
        mass: 600, 
        position: sphereInitialPosition, 
        shape: sphereShape,
        material: groundMaterial 
    });
    world.addBody(sphereBody);

    physicalObjects.push({ mesh: sphereMesh, body: sphereBody });

    // --- Caricamento del Modello GLB (Cannone) ---
    const gltfLoader = new GLTFLoader();
    gltfLoader.load('./models/cannon.glb', (gltf) => {
        cannonMesh = gltf.scene;

        // Applica lo stesso materiale della sfera al cannone
        cannonMesh.traverse((child) => {
            if (child.isMesh) {
                child.material = sharedMetalMaterialPBR;
                child.castShadow = true;
                child.receiveShadow = true;
            }
        });

        // Parametri finali per scala, posizione e rotazione del cannone
        cannonMesh.scale.set(0.7, 0.7, 0.7); // Scala finale
        cannonMesh.position.set(0.4, -0.35, 0); // Posizione finale: Y più in alto, Z a 0 (vicinissimo alla camera)
        cannonMesh.rotation.set(0, 0, Math.PI); // Rotazione sull'asse Z di 180 gradi (per girarlo al contrario)

        // Collega il cannone all'oggetto pitchObject (che segue la telecamera)
        pitchObject.add(cannonMesh);
    }, undefined, (error) => {
        console.error('Errore durante il caricamento del modello del cannone:', error);
    });


    // --- Setup Mouselook ---
    yawObject = new THREE.Object3D();
    yawObject.position.y = playerHeight / 2; 
    scene.add(yawObject);

    pitchObject = new THREE.Object3D();
    pitchObject.add(camera);
    yawObject.add(pitchObject);

    // --- Event Listeners per Pointer Lock e Input ---
    document.addEventListener('click', () => {
        if (!isLocked) {
            renderer.domElement.requestPointerLock();
        }
    });

    document.addEventListener('pointerlockchange', onPointerlockChange, false);
    document.addEventListener('mousemove', onMouseMove, false);
    document.addEventListener('keydown', onKeyDown, false);
    document.addEventListener('keyup', onKeyUp, false);

    // Gestione del ridimensionamento della finestra
    window.addEventListener('resize', onWindowResize, false);
}

// Funzione per gestire il cambio di stato del Pointer Lock
function onPointerlockChange() {
    if (document.pointerLockElement === renderer.domElement) {
        console.log('Il puntatore è bloccato.');
        isLocked = true;
        instructionsElement.style.display = 'none';
    } else {
        console.log('Il puntatore è sbloccato.');
        isLocked = false;
        instructionsElement.style.display = 'block';
        moveForward = false;
        moveBackward = false;
        moveLeft = false;
        moveRight = false;
    }
}

// Funzione per gestire il movimento del mouse (rotazione della telecamera)
function onMouseMove(event) {
    if (!isLocked) return;

    const movementX = event.movementX || event.mozMovementX || event.webkitMovementX || 0;
    const movementY = event.movementY || event.mozMovementY || event.webkitMovementY || 0;

    yawObject.rotation.y -= movementX * mouseSensitivity;

    pitchObject.rotation.x -= movementY * mouseSensitivity;
    pitchObject.rotation.x = Math.max(-PI_2, Math.min(PI_2, pitchObject.rotation.x));
}

// Funzione per gestire la pressione dei tasti
function onKeyDown(event) {
    switch (event.code) {
        case 'KeyW': moveForward = true; break;
        case 'KeyS': moveBackward = true; break;
        case 'KeyA': moveLeft = true; break;
        case 'KeyD': moveRight = true; break;
        case 'Space':
            if (canJump) {
                playerBody.velocity.y = jumpStrength; // Applica una velocità verticale per il salto
                canJump = false; // Impedisce salti multipli in aria
            }
            break;
    }
}

// Funzione per gestire il rilascio dei tasti
function onKeyUp(event) {
    switch (event.code) {
        case 'KeyW': moveForward = false; break;
        case 'KeyS': moveBackward = false; break;
        case 'KeyA': moveLeft = false; break;
        case 'KeyD': moveRight = false;
    }
}

// Funzione per gestire il ridimensionamento della finestra
function onWindowResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight); 
}

// Loop di animazione
function animate() {
    requestAnimationFrame(animate);

    world.step(1 / 60);

    // La yawObject segue la posizione del playerBody
    yawObject.position.copy(playerBody.position);
    // La telecamera è posizionata all'altezza degli occhi del giocatore
    yawObject.position.y += playerHeight / 2; 

    playerBody.quaternion.copy(yawObject.quaternion);

    const inputVelocity = new THREE.Vector3();
    if (moveForward) inputVelocity.z = -1;
    if (moveBackward) inputVelocity.z = 1;
    if (moveLeft) inputVelocity.x = -1;
    if (moveRight) inputVelocity.x = 1;

    if (inputVelocity.lengthSq() > 0) {
        inputVelocity.normalize();
    }
    
    inputVelocity.applyQuaternion(yawObject.quaternion);

    playerBody.velocity.x = inputVelocity.x * playerSpeed;
    playerBody.velocity.z = inputVelocity.z * playerSpeed;

    // Sincronizza la posizione e la rotazione di tutti gli oggetti fisici
    for (const obj of physicalObjects) {
        obj.mesh.position.copy(obj.body.position);
        obj.mesh.quaternion.copy(obj.body.quaternion);
    }

    renderer.render(scene, camera);
}

// Avvia l'applicazione quando la finestra è completamente caricata
window.onload = function() {
    init();
    animate();
};
