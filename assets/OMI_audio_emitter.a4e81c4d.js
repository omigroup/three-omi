import { c as Audio, d as PositionalAudio, M as MathUtils } from "./vendor.46967636.js";
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
    let obj;
    if (audioEmitterDef.type === "global") {
      obj = new Audio(this.listener);
    } else {
      obj = new PositionalAudio(this.listener);
      obj.setRefDistance(audioEmitterDef.refDistance !== void 0 ? audioEmitterDef.refDistance : 1);
      obj.setRolloffFactor(audioEmitterDef.rolloffFactor !== void 0 ? audioEmitterDef.rolloffFactor : 1);
      obj.setDistanceModel(audioEmitterDef.distanceModel || "inverse");
      obj.setMaxDistance(audioEmitterDef.maxDistance !== void 0 ? audioEmitterDef.maxDistance : 1e4);
      obj.setDirectionalCone(MathUtils.radToDeg(audioEmitterDef.coneInnerAngle !== void 0 ? audioEmitterDef.coneInnerAngle : Math.PI * 2), MathUtils.radToDeg(audioEmitterDef.coneOuterAngle !== void 0 ? audioEmitterDef.coneOuterAngle : Math.PI * 2), audioEmitterDef.coneOuterGain !== void 0 ? audioEmitterDef.coneOuterGain : 0);
    }
    obj.name = audioEmitterDef.name || "";
    obj.setVolume(audioEmitterDef.volume !== void 0 ? audioEmitterDef.volume : 1);
    return this.loadAudioClip(audioEmitterDef.clip).then((clip) => {
      if (clip instanceof HTMLMediaElement) {
        obj.setMediaElementSource(clip);
      } else {
        obj.setBuffer(clip);
      }
      if (obj.hasPlaybackControl) {
        obj.setLoop(!!audioEmitterDef.loop);
      } else {
        obj.source.mediaElement.loop = !!audioEmitterDef.loop;
      }
      this.audioEmitters.push({ autoPlay: !!audioEmitterDef.autoPlay, obj });
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
      return null;
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
export { GLTFAudioEmitterExtension as G };
