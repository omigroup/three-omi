/* empty css                  */import { S as Scene, P as PerspectiveCamera, A as AudioListener, f as PointerLockControls, a as AnimationMixer, G as GLTFLoader, L as LoopRepeat, C as Clock, W as WebGLRenderer, b as ACESFilmicToneMapping, s as sRGBEncoding } from "../vendor.f074ed68.js";
import { G as GLTFAudioEmitterExtension } from "../OMI_audio_emitter.ebcfae8b.js";
async function main() {
  const canvas = document.getElementById("canvas");
  const scene = new Scene();
  const camera = new PerspectiveCamera(45, window.innerWidth / window.innerHeight, 1e-3, 1e3);
  camera.position.set(0, 1.6, 0);
  scene.add(camera);
  const audioListener = new AudioListener();
  camera.add(audioListener);
  const controls = new PointerLockControls(camera, canvas);
  const input = new Map();
  canvas.addEventListener("click", () => {
    controls.lock();
  });
  document.addEventListener("keydown", (e) => {
    input.set(e.code, true);
  });
  document.addEventListener("keyup", (e) => {
    input.set(e.code, false);
  });
  document.addEventListener("blur", (e) => {
    input.clear();
  });
  scene.add(controls.getObject());
  const animationMixer = new AnimationMixer(scene);
  const gltfLoader = new GLTFLoader();
  gltfLoader.register((parser) => new GLTFAudioEmitterExtension(parser, audioListener));
  const { scene: gltfScene, animations } = await gltfLoader.loadAsync("../scenes/outdoor-festival/OutdoorFestival.gltf");
  scene.add(gltfScene);
  for (const clip of animations) {
    const action = animationMixer.clipAction(clip, gltfScene);
    action.loop = LoopRepeat;
    action.play();
  }
  const clock = new Clock();
  const renderer = new WebGLRenderer({ antialias: true, canvas });
  renderer.setPixelRatio(window.devicePixelRatio);
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.toneMapping = ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1;
  renderer.outputEncoding = sRGBEncoding;
  renderer.setAnimationLoop(() => {
    const dt = clock.getDelta();
    animationMixer.update(dt);
    if (controls.isLocked) {
      let right = 0;
      if (input.get("KeyA")) {
        right--;
      }
      if (input.get("KeyD")) {
        right++;
      }
      controls.moveRight(right * dt * 5);
      let forward = 0;
      if (input.get("KeyW")) {
        forward++;
      }
      if (input.get("KeyS")) {
        forward--;
      }
      controls.moveForward(forward * dt * 5);
    }
    renderer.render(scene, camera);
  });
  function onResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  }
  window.addEventListener("resize", onResize);
  onResize();
}
const loadButton = document.getElementById("load-button");
const onLoad = () => {
  loadButton.removeEventListener("click", onLoad);
  loadButton.innerText = "Loading...";
  main().then(() => {
    loadButton.remove();
    document.querySelector(".controls").classList.remove("hide");
  }).catch(console.error);
};
loadButton.addEventListener("click", onLoad);
