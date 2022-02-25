/* empty css                  */import { S as Scene, P as PerspectiveCamera, A as AudioListener, O as OrbitControls, a as AnimationMixer, x as xe, g as LoaderUtils, h as LoadingManager, G as GLTFLoader, B as Box3, V as Vector3, L as LoopRepeat, C as Clock, W as WebGLRenderer, b as ACESFilmicToneMapping, s as sRGBEncoding, T as Texture } from "../vendor.81994d2e.js";
import { G as GLTFAudioEmitterExtension } from "../OMI_audio_emitter.6dd86495.js";
async function main() {
  const canvas = document.getElementById("canvas");
  const fileInput = document.getElementById("fileInput");
  const scene = new Scene();
  const camera = new PerspectiveCamera(45, window.innerWidth / window.innerHeight, 1e-3, 1e3);
  scene.add(camera);
  const audioListener = new AudioListener();
  camera.add(audioListener);
  const controls = new OrbitControls(camera, canvas);
  controls.update();
  const animationMixer = new AnimationMixer(scene);
  let gltfScene;
  let fileObjectUrl;
  const dropzone = new xe(canvas, fileInput);
  dropzone.on("drop", async ({ files }) => {
    if (fileObjectUrl) {
      URL.revokeObjectURL(fileObjectUrl);
    }
    controls.reset();
    if (gltfScene) {
      gltfScene.traverse((obj) => {
        if (obj.geometry) {
          obj.geometry.dispose();
        }
        if (obj.material) {
          if (Array.isArray(obj.material)) {
            for (const material of obj.material) {
              for (const prop in material) {
                if (prop instanceof Texture) {
                  prop.dispose();
                }
              }
            }
          } else {
            for (const prop in obj.material) {
              if (prop instanceof Texture) {
                prop.dispose();
              }
            }
          }
        }
        if (obj.type === "Audio") {
          obj.stop();
          obj.disconnect();
        }
      });
      animationMixer.stopAllAction();
      animationMixer.uncacheRoot(animationMixer.getRoot());
      gltfScene.parent.remove(gltfScene);
    }
    let rootFile;
    let rootPath;
    Array.from(files).forEach(([path, file]) => {
      if (file.name.match(/\.(gltf|glb)$/)) {
        rootFile = file;
        rootPath = path.replace(file.name, "");
      }
    });
    let fileUrl;
    if (typeof rootFile === "string") {
      fileUrl = rootFile;
    } else {
      fileObjectUrl = fileUrl = URL.createObjectURL(rootFile);
    }
    const baseURL = LoaderUtils.extractUrlBase(fileUrl);
    const manager = new LoadingManager();
    const blobURLs = [];
    manager.setURLModifier((url, path) => {
      const normalizedURL = rootPath + decodeURI(url).replace(baseURL, "").replace(/^(\.?\/)/, "");
      if (files.has(normalizedURL)) {
        const blob = files.get(normalizedURL);
        const blobURL = URL.createObjectURL(blob);
        blobURLs.push(blobURL);
        return blobURL;
      }
      return (path || "") + url;
    });
    const gltfLoader = new GLTFLoader(manager);
    gltfLoader.register((parser) => new GLTFAudioEmitterExtension(parser, audioListener));
    const gltf = await gltfLoader.loadAsync(fileUrl);
    gltfScene = gltf.scene;
    scene.add(gltfScene);
    const box = new Box3().setFromObject(gltfScene);
    const size = box.getSize(new Vector3()).length();
    const center = box.getCenter(new Vector3());
    controls.maxDistance = size * 10;
    camera.near = size / 1e3;
    camera.far = size * 10;
    camera.updateProjectionMatrix();
    camera.position.copy(center);
    camera.position.x += size / 2;
    camera.position.y += size / 5;
    camera.position.z += size / 2;
    camera.lookAt(center);
    blobURLs.forEach(URL.revokeObjectURL);
    for (const clip of gltf.animations) {
      const action = animationMixer.clipAction(clip, gltfScene);
      action.loop = LoopRepeat;
      action.play();
    }
  });
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
    controls.update();
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
