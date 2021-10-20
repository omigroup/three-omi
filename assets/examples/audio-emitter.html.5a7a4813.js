/* empty css                  */import { S as Scene, P as PerspectiveCamera, A as AudioListener, a as AnimationMixer, G as GLTFLoader, L as LoopRepeat, C as Clock, W as WebGLRenderer, b as ACESFilmicToneMapping, s as sRGBEncoding } from "../vendor.f074ed68.js";
import { G as GLTFAudioEmitterExtension } from "../OMI_audio_emitter.0a8d7409.js";
async function main() {
  const scene = new Scene();
  const camera = new PerspectiveCamera(45, window.innerWidth / window.innerHeight, 1e-3, 1e3);
  camera.position.set(0, 1.6, 0);
  scene.add(camera);
  const audioListener = new AudioListener();
  camera.add(audioListener);
  const animationMixer = new AnimationMixer(scene);
  const gltfLoader = new GLTFLoader();
  gltfLoader.register((parser) => new GLTFAudioEmitterExtension(parser, audioListener));
  const { scene: gltfScene, animations } = await gltfLoader.loadAsync("../scenes/simple/OMI_audio_emitter-simple.gltf");
  scene.add(gltfScene);
  for (const clip of animations) {
    const action = animationMixer.clipAction(clip, gltfScene);
    action.loop = LoopRepeat;
    action.play();
  }
  const clock = new Clock();
  const canvas = document.getElementById("canvas");
  const renderer = new WebGLRenderer({ antialias: true, canvas });
  renderer.setPixelRatio(window.devicePixelRatio);
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.toneMapping = ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1;
  renderer.outputEncoding = sRGBEncoding;
  renderer.setAnimationLoop(() => {
    const dt = clock.getDelta();
    animationMixer.update(dt);
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
  }).catch(console.error);
};
loadButton.addEventListener("click", onLoad);
