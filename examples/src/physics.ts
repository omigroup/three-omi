import {
  Scene,
  PerspectiveCamera,
  WebGLRenderer,
  ACESFilmicToneMapping,
  sRGBEncoding,
  Clock,
  EquirectangularReflectionMapping,
  Mesh,
  PlaneBufferGeometry,
  MeshBasicMaterial,
  Vector3,
  Quaternion,
  Object3D,
  BoxBufferGeometry,
  MeshStandardMaterial
} from "three";
import { RGBELoader } from "three/examples/jsm/loaders/RGBELoader";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader";
import * as Rapier from "@dimforge/rapier3d-compat";

interface GameObject {
  object3d: Object3D,
  rigidBody: Rapier.RigidBody,
  helper: Object3D
}

async function createMeshObject(physicsWorld: Rapier.World, scene: Scene): Promise<GameObject> {
  const gltfLoader = new GLTFLoader();
  const { scene: mesh } = await gltfLoader
    .loadAsync(new URL("/models/pda.glb", import.meta.url).href);

  mesh.updateMatrixWorld();

  const trimesh = mesh.getObjectByName("physicsBody") as Mesh;
  trimesh.visible = false;
  const trimeshGeometry = trimesh.geometry;

  const indices = trimeshGeometry.getIndex().clone().array as Uint32Array;
  const vertices = trimeshGeometry.getAttribute("position").clone().array as Float32Array;
  
  mesh.position.y = 2;
  mesh.rotation.y = Math.PI;
  scene.add(mesh);

  const rigidBodyDesc = Rapier.RigidBodyDesc.newDynamic();
  rigidBodyDesc.mass = 1;
  rigidBodyDesc.setTranslation(mesh.position.x, mesh.position.y, mesh.position.z);
  rigidBodyDesc.setRotation(mesh.quaternion);

  const rigidBody = physicsWorld.createRigidBody(rigidBodyDesc);

  const trimeshColliderDesc = Rapier.ColliderDesc.trimesh(vertices, indices);
  physicsWorld.createCollider(trimeshColliderDesc, rigidBody.handle);

  const helper = new Mesh(trimeshGeometry, new MeshBasicMaterial({ color: 0xFFFF00, wireframe: true }));
  scene.add(helper);

  return {
    object3d: mesh,
    rigidBody,
    helper
  };
}

function createCubeObject(physicsWorld: Rapier.World, scene: Scene): GameObject {
  const cube = new Mesh(new BoxBufferGeometry(0.5, 0.5, 0.5), new MeshStandardMaterial());
  cube.position.y = 3;
  scene.add(cube);

  const rigidBodyDesc = Rapier.RigidBodyDesc.newDynamic();
  rigidBodyDesc.mass = 1;
  rigidBodyDesc.setTranslation(cube.position.x, cube.position.y, cube.position.z);
  rigidBodyDesc.setRotation(cube.quaternion);

  const rigidBody = physicsWorld.createRigidBody(rigidBodyDesc);

  const colliderDesc = Rapier.ColliderDesc.cuboid(0.25, 0.25, 0.25);
  physicsWorld.createCollider(colliderDesc, rigidBody.handle);

  const helper = new Mesh(cube.geometry, new MeshBasicMaterial({ color: 0xFFFF00, wireframe: true }));
  scene.add(helper);

  return {
    object3d: cube,
    rigidBody,
    helper
  };
}

async function main() {
  await Rapier.init();

  const physicsWorld = new Rapier.World(new Rapier.Vector3(0, -9.8, 0));

  const rgbeLoader = new RGBELoader();
  const envMap = await rgbeLoader.loadAsync(new URL("/cubemaps/venice_sunset_1k.hdr", import.meta.url).href);
  envMap.mapping = EquirectangularReflectionMapping;

  const canvas = document.getElementById("canvas");
  const scene = new Scene();
  scene.environment = envMap;
  scene.background = envMap;
  const camera = new PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.01, 1000);
  camera.position.set(-5, 3, 15);
  camera.zoom = 5.8;
  scene.add(camera);

  new OrbitControls(camera, canvas);

  const gameObjects: GameObject[] = [];

  const mesh = await createMeshObject(physicsWorld, scene);
  gameObjects.push(mesh);

  const cube = createCubeObject(physicsWorld, scene);
  gameObjects.push(cube);

  const plane = new Mesh(new PlaneBufferGeometry(10, 10, 1, 1,).rotateX(-Math.PI / 2), new MeshBasicMaterial({ color: 0xffffff }));
  scene.add(plane);

  const groundColliderDesc = Rapier.ColliderDesc.cuboid(5, 0.05, 5);
  groundColliderDesc.setTranslation(0, -0.05, 0);
  physicsWorld.createCollider(groundColliderDesc);

  const clock = new Clock();
  
  const renderer = new WebGLRenderer({ antialias: true, canvas });
  renderer.setPixelRatio(window.devicePixelRatio);
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.physicallyCorrectLights = true;
  renderer.toneMapping = ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1;
  renderer.outputEncoding = sRGBEncoding;
  renderer.setAnimationLoop(() => {
    const dt = clock.getDelta();
    physicsWorld.timestep = dt;
    physicsWorld.step();

    for (let i = 0; i < gameObjects.length; i++) {
      const { object3d, rigidBody, helper } = gameObjects[i];
      object3d.position.copy(rigidBody.translation() as Vector3);
      object3d.quaternion.copy(rigidBody.rotation() as Quaternion);
      helper.position.copy(object3d.position);
      helper.quaternion.copy(object3d.quaternion);
    }

    renderer.render(scene, camera);
  });

  function onResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  }

  window.addEventListener('resize', onResize);
  onResize();
}

main().catch(console.error);