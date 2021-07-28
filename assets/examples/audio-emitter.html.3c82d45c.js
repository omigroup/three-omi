/* empty css                  */import { A as Audio, P as PositionalAudio, S as Scene, a as PerspectiveCamera, b as AudioListener, c as AnimationMixer, G as GLTFLoader, L as LoopRepeat, C as Clock, W as WebGLRenderer, d as ACESFilmicToneMapping, s as sRGBEncoding } from "../vendor.f3ae7721.js";
class GLTFAudioEmitterExtension {
  constructor(parser, listener) {
    this.name = "OMI_audio_emitter";
    this.parser = parser;
    this.listener = listener;
    this.audioEmitters = [];
    this.testEl = document.createElement("audio");
    this.baseUrl = new URL(this.parser.options.path, window.location).href;
  }
  loadAudioClip(audioClipIndex) {
    const json = this.parser.json;
    const extension = json.extensions[this.name];
    const audioClipDef = extension.audioClips[audioClipIndex];
    console.log("loadAudioClip", audioClipIndex);
    for (const source of audioClipDef.sources) {
      if (this.testEl.canPlayType(source.mimeType)) {
        if (source.uri) {
          return new Promise((resolve, reject) => {
            const el = document.createElement("audio");
            el.src = new URL(source.uri, this.baseUrl).href;
            const onCanPlay = () => {
              el.removeEventListener("canplay", onCanPlay);
              resolve(el);
            };
            el.addEventListener("canplay", onCanPlay);
          });
        } else {
          return this.parser.getDependency("bufferView", source.bufferView);
        }
      }
    }
    return Promise.reject(new Error(`Unsupported audio clip ${audioClipDef.name}`));
  }
  loadAudioEmitter(audioEmitterIndex) {
    const json = this.parser.json;
    const extension = json.extensions[this.name];
    const audioEmitterDef = extension.audioEmitters[audioEmitterIndex];
    console.log("loadAudioEmitter", audioEmitterIndex);
    let obj;
    if (audioEmitterDef.type === "global") {
      obj = new Audio(this.listener);
    } else {
      obj = new PositionalAudio(this.listener);
      obj.setRefDistance(audioEmitterDef.refDistance);
      obj.setRolloffFactor(audioEmitterDef.rolloffFactor);
      obj.setDistanceModel(audioEmitterDef.distanceModel);
      obj.setMaxDistance(audioEmitterDef.maxDistance);
      obj.setDirectionalCone(audioEmitterDef.coneInnerAngle, audioEmitterDef.coneOuterAngle, audioEmitterDef.coneOuterGain);
    }
    obj.name = audioEmitterDef.name;
    obj.setVolume(audioEmitterDef.volume);
    obj.setLoop(audioEmitterDef.loop);
    return this.loadAudioClip(audioEmitterDef.clip).then((clip) => {
      if (clip instanceof HTMLMediaElement) {
        console.log(clip);
        obj.setMediaElementSource(clip);
      } else {
        obj.setBuffer(clip);
      }
      this.audioEmitters.push({ autoPlay: audioEmitterDef.autoPlay, obj });
      console.log("audioEmitters", { autoPlay: audioEmitterDef.autoPlay, obj });
      return obj;
    });
  }
  createNodeAttachment(nodeIndex) {
    const json = this.parser.json;
    const nodeDef = json.nodes[nodeIndex];
    if (!nodeDef.extensions || !nodeDef.extensions[this.name]) {
      return null;
    }
    console.log("createNodeAttachment", nodeIndex);
    const extension = nodeDef.extensions[this.name];
    const audioEmitterIndex = extension.audioEmitter;
    return this.loadAudioEmitter(audioEmitterIndex);
  }
  loadSceneEmitters(sceneIndex, scene) {
    const json = this.parser.json;
    const sceneDef = json.scenes[sceneIndex];
    if (!sceneDef.extensions || !sceneDef.extensions[this.name]) {
      return null;
    }
    console.log("loadSceneEmitters", sceneIndex);
    const extension = sceneDef.extensions[this.name];
    const audioEmitterIndices = extension.audioEmitters;
    const pending = audioEmitterIndices.map((index) => this.loadAudioEmitter(index));
    return Promise.all(pending).then((audioEmitters) => {
      for (const audioEmitter of audioEmitters) {
        scene.add(audioEmitter);
      }
    });
  }
  afterRoot(result) {
    return Promise.resolve(result).then((gltf) => {
      const pending = gltf.scenes.map((scene, sceneIndex) => this.loadSceneEmitters(sceneIndex, scene));
      return Promise.all(pending).then(() => {
        gltf.scene.traverse((obj) => {
          if (!obj.type === "Audio") {
            return;
          }
          const emitter = this.audioEmitters.find((audioEmitter) => audioEmitter.obj === obj);
          if (!emitter) {
            return;
          }
          if (emitter.autoPlay) {
            if (emitter.obj.hasPlaybackControl) {
              emitter.obj.play();
            } else {
              emitter.obj.source.mediaElement.play();
            }
          }
        });
        return gltf;
      });
    });
  }
}
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
  const { scene: gltfScene, animations } = await gltfLoader.loadAsync("/models/OMI_audio_emitter-simple.gltf");
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
