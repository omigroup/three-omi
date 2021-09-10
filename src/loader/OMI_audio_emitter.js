import { Audio, PositionalAudio, MathUtils } from "three";

export class GLTFAudioEmitterExtension {
  constructor(parser, listener) {
    this.name = "OMI_audio_emitter";
    this.parser = parser;
    this.listener = listener;
    this.audioEmitters = [];
    this.testEl = document.createElement("audio");
    this.baseUrl = new URL(this.parser.options.path, window.location).href;
  }

  loadAudioSource(audioSourceIndex) {
    const json = this.parser.json;
    const extension = json.extensions[this.name];
    const audioSource = extension.audioSources[audioSourceIndex];

    if (audioSource.uri) {
      return new Promise((resolve) => {
        const el = document.createElement("audio");

        el.src = new URL(audioSource.uri, this.baseUrl).href;

        const onCanPlay = () => {
          el.removeEventListener("canplay", onCanPlay);
          resolve(el);
        };

        el.addEventListener("canplay", onCanPlay);
      });
    } else {
      return this.parser.getDependency(
        "bufferView",
        audioSource.bufferView
      );
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
      obj = new PositionalAudio(this.listener);
      obj.setRefDistance(audioEmitterDef.refDistance !== undefined ? audioEmitterDef.refDistance : 1);
      obj.setRolloffFactor(audioEmitterDef.rolloffFactor !== undefined ? audioEmitterDef.rolloffFactor : 1);
      obj.setDistanceModel(audioEmitterDef.distanceModel || "inverse");
      obj.setMaxDistance(audioEmitterDef.maxDistance !== undefined ? audioEmitterDef.maxDistance : 10000);
      obj.setDirectionalCone(
        MathUtils.radToDeg(audioEmitterDef.coneInnerAngle !== undefined ? audioEmitterDef.coneInnerAngle : Math.PI * 2),
        MathUtils.radToDeg(audioEmitterDef.coneOuterAngle !== undefined ? audioEmitterDef.coneOuterAngle : Math.PI * 2),
        audioEmitterDef.coneOuterGain !== undefined ? audioEmitterDef.coneOuterGain : 0
      );
    }

    obj.name = audioEmitterDef.name || "";
    obj.gain.gain.value = audioEmitterDef.gain !== undefined ? audioEmitterDef.gain : 1

    console.log(obj, obj.gain, audioEmitterDef.gain);

    return this.loadAudioSource(audioEmitterDef.source).then((source) => {
      if (source instanceof HTMLMediaElement) {
        obj.setMediaElementSource(source);
      } else {
        obj.setBuffer(source);
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

    const pending = audioEmitterIndices.map((index) =>
      this.loadAudioEmitter(index)
    );

    return Promise.all(pending).then((audioEmitters) => {
      for (const audioEmitter of audioEmitters) {
        scene.add(audioEmitter);
      }
    });
  }

  afterRoot(result) {
    return Promise.resolve(result).then((gltf) => {
      const pending = gltf.scenes.map((scene, sceneIndex) =>
        this.loadSceneEmitters(sceneIndex, scene)
      );

      return Promise.all(pending).then(() => {
        gltf.scene.traverse((obj) => {
          if (!obj.type === "Audio") {
            return;
          }

          const emitter = this.audioEmitters.find(
            (audioEmitter) => audioEmitter.obj === obj
          );

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
