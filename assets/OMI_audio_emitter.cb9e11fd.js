var __defProp = Object.defineProperty;
var __defNormalProp = (obj, key, value) => key in obj ? __defProp(obj, key, { enumerable: true, configurable: true, writable: true, value }) : obj[key] = value;
var __publicField = (obj, key, value) => {
  __defNormalProp(obj, typeof key !== "symbol" ? key + "" : key, value);
  return value;
};
import { c as AudioLoader, d as LoaderUtils, e as Audio, f as PositionalAudio, M as MathUtils, V as Vector3, Q as Quaternion } from "./vendor.611c1a8c.js";
const p = function polyfill() {
  const relList = document.createElement("link").relList;
  if (relList && relList.supports && relList.supports("modulepreload")) {
    return;
  }
  for (const link of document.querySelectorAll('link[rel="modulepreload"]')) {
    processPreload(link);
  }
  new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      if (mutation.type !== "childList") {
        continue;
      }
      for (const node of mutation.addedNodes) {
        if (node.tagName === "LINK" && node.rel === "modulepreload")
          processPreload(node);
      }
    }
  }).observe(document, { childList: true, subtree: true });
  function getFetchOpts(script) {
    const fetchOpts = {};
    if (script.integrity)
      fetchOpts.integrity = script.integrity;
    if (script.referrerpolicy)
      fetchOpts.referrerPolicy = script.referrerpolicy;
    if (script.crossorigin === "use-credentials")
      fetchOpts.credentials = "include";
    else if (script.crossorigin === "anonymous")
      fetchOpts.credentials = "omit";
    else
      fetchOpts.credentials = "same-origin";
    return fetchOpts;
  }
  function processPreload(link) {
    if (link.ep)
      return;
    link.ep = true;
    const fetchOpts = getFetchOpts(link);
    fetch(link.href, fetchOpts);
  }
};
p();
class GLTFAudioEmitterExtension {
  constructor(parser, listener) {
    __publicField(this, "name");
    __publicField(this, "listener");
    __publicField(this, "playing");
    __publicField(this, "audioEmitters");
    __publicField(this, "parser");
    __publicField(this, "audioLoader");
    this.name = "OMI_audio_emitter";
    this.parser = parser;
    this.listener = listener;
    this.audioEmitters = [];
    this.playing = true;
    this.audioLoader = new AudioLoader(this.parser.options.manager);
  }
  loadAudioSource(audioSourceIndex) {
    const json = this.parser.json;
    const extension = json.extensions[this.name];
    const audioSource = extension.audioSources[audioSourceIndex];
    if (audioSource.uri) {
      return this.audioLoader.loadAsync(LoaderUtils.resolveURL(audioSource.uri, this.parser.options.path));
    } else {
      return this.parser.getDependency("bufferView", audioSource.bufferView).then((buffer) => {
        const bufferCopy = buffer.slice(0);
        const context = this.listener.context;
        return context.decodeAudioData(bufferCopy);
      });
    }
  }
  loadAudioEmitter(audioEmitterIndex) {
    const json = this.parser.json;
    const extension = json.extensions[this.name];
    const audioEmitterDef = extension.audioEmitters[audioEmitterIndex];
    let obj;
    if (audioEmitterDef.type === "global") {
      obj = new Audio(this.listener);
    } else {
      const audio = new PositionalAudio(this.listener);
      audio.setRefDistance(audioEmitterDef.refDistance !== void 0 ? audioEmitterDef.refDistance : 1);
      audio.setRolloffFactor(audioEmitterDef.rolloffFactor !== void 0 ? audioEmitterDef.rolloffFactor : 1);
      audio.setDistanceModel(audioEmitterDef.distanceModel || "inverse");
      audio.setMaxDistance(audioEmitterDef.maxDistance !== void 0 ? audioEmitterDef.maxDistance : 1e4);
      audio.setDirectionalCone(MathUtils.radToDeg(audioEmitterDef.coneInnerAngle !== void 0 ? audioEmitterDef.coneInnerAngle : Math.PI * 2), MathUtils.radToDeg(audioEmitterDef.coneOuterAngle !== void 0 ? audioEmitterDef.coneOuterAngle : Math.PI * 2), audioEmitterDef.coneOuterGain !== void 0 ? audioEmitterDef.coneOuterGain : 0);
      obj = audio;
    }
    obj.name = audioEmitterDef.name || "";
    obj.gain.gain.value = audioEmitterDef.gain !== void 0 ? audioEmitterDef.gain : 1;
    return this.loadAudioSource(audioEmitterDef.source).then((source) => {
      obj.setBuffer(source);
      obj.setLoop(!!audioEmitterDef.loop);
      this.audioEmitters.push({ playing: !!audioEmitterDef.playing, obj });
      return obj;
    });
  }
  createNodeAttachment(nodeIndex) {
    const json = this.parser.json;
    const nodeDef = json.nodes[nodeIndex];
    if (!nodeDef.extensions || !nodeDef.extensions[this.name]) {
      return null;
    }
    const extension = nodeDef.extensions[this.name];
    const audioEmitterIndex = extension.audioEmitter;
    return this.loadAudioEmitter(audioEmitterIndex);
  }
  loadSceneEmitters(sceneIndex, scene) {
    const json = this.parser.json;
    const sceneDef = json.scenes[sceneIndex];
    if (!sceneDef.extensions || !sceneDef.extensions[this.name]) {
      return Promise.resolve(null);
    }
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
        if (this.playing) {
          this.startPlayingEmitters();
        }
      });
    });
  }
  startPlayingEmitters() {
    for (const emitter of this.audioEmitters) {
      if (!emitter.playing) {
        return;
      }
      if ("panner" in emitter.obj) {
        const panner = emitter.obj.panner;
        emitter.obj.updateMatrixWorld(true);
        const position = new Vector3();
        const quaternion = new Quaternion();
        const scale = new Vector3();
        const orientation = new Vector3();
        emitter.obj.matrixWorld.decompose(position, quaternion, scale);
        orientation.set(0, 0, 1).applyQuaternion(quaternion);
        panner.positionX.value = position.x;
        panner.positionY.value = position.y;
        panner.positionZ.value = position.z;
        panner.orientationX.value = orientation.x;
        panner.orientationY.value = orientation.y;
        panner.orientationZ.value = orientation.z;
      }
      emitter.obj.play();
    }
  }
}
export { GLTFAudioEmitterExtension as G };
