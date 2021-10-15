import { Audio, PositionalAudio, AudioListener, MathUtils, Scene, Object3D } from "three";
import { GLTFParser, GLTF } from "three/examples/jsm/loaders/GLTFLoader";

export class GLTFAudioEmitterExtension {
  public name: string;
  public listener: AudioListener;
  public audioEmitters: { autoPlay: boolean, obj: Audio<GainNode | PannerNode> }[];

  private parser: GLTFParser;
  private baseUrl: string;

  constructor(parser: GLTFParser, listener: AudioListener) {
    this.name = "OMI_audio_emitter";
    this.parser = parser;
    this.listener = listener;
    this.audioEmitters = [];
    this.baseUrl = new URL((this.parser as unknown as any).options.path, window.location.href).href;
  }

  loadAudioSource(audioSourceIndex: number): Promise<ArrayBuffer | HTMLAudioElement> {
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

  loadAudioEmitter(audioEmitterIndex: number): Promise<Audio<GainNode | PannerNode>> {
    const json = this.parser.json;
    const extension = json.extensions[this.name];
    const audioEmitterDef = extension.audioEmitters[audioEmitterIndex];

    let obj: Audio<GainNode | PannerNode>;

    if (audioEmitterDef.type === "global") {
      obj = new Audio(this.listener);
    } else {
      const audio = new PositionalAudio(this.listener);
      audio.setRefDistance(audioEmitterDef.refDistance !== undefined ? audioEmitterDef.refDistance : 1);
      audio.setRolloffFactor(audioEmitterDef.rolloffFactor !== undefined ? audioEmitterDef.rolloffFactor : 1);
      audio.setDistanceModel(audioEmitterDef.distanceModel || "inverse");
      audio.setMaxDistance(audioEmitterDef.maxDistance !== undefined ? audioEmitterDef.maxDistance : 10000);
      audio.setDirectionalCone(
        MathUtils.radToDeg(audioEmitterDef.coneInnerAngle !== undefined ? audioEmitterDef.coneInnerAngle : Math.PI * 2),
        MathUtils.radToDeg(audioEmitterDef.coneOuterAngle !== undefined ? audioEmitterDef.coneOuterAngle : Math.PI * 2),
        audioEmitterDef.coneOuterGain !== undefined ? audioEmitterDef.coneOuterGain : 0
      );
      obj = audio;
    }

    obj.name = audioEmitterDef.name || "";
    obj.gain.gain.value = audioEmitterDef.gain !== undefined ? audioEmitterDef.gain : 1

    return this.loadAudioSource(audioEmitterDef.source).then((source) => {
      if (source instanceof HTMLMediaElement) {
        obj.setMediaElementSource(source);
      } else {
        obj.setBuffer(source as unknown as AudioBuffer);
      }

      if (obj.hasPlaybackControl) {
        obj.setLoop(!!audioEmitterDef.loop);
      } else {
        (obj.source as unknown as any).mediaElement.loop = !!audioEmitterDef.loop;
      }

      this.audioEmitters.push({ autoPlay: !!audioEmitterDef.autoPlay, obj });

      return obj;
    });
  }

  createNodeAttachment(nodeIndex: number): Promise<Audio<GainNode | PannerNode>> | null {
    const json = this.parser.json;
    const nodeDef = json.nodes[nodeIndex];

    if (!nodeDef.extensions || !nodeDef.extensions[this.name]) {
      return null;
    }

    const extension = nodeDef.extensions[this.name];
    const audioEmitterIndex = extension.audioEmitter;

    return this.loadAudioEmitter(audioEmitterIndex);
  }

  loadSceneEmitters(sceneIndex: number, scene: Object3D): Promise<void | null> {
    const json = this.parser.json;
    const sceneDef = json.scenes[sceneIndex];

    if (!sceneDef.extensions || !sceneDef.extensions[this.name]) {
      return Promise.resolve(null);
    }

    const extension = sceneDef.extensions[this.name];
    const audioEmitterIndices: number[] = extension.audioEmitters;

    const pending = audioEmitterIndices.map((index) =>
      this.loadAudioEmitter(index)
    );

    return Promise.all(pending).then((audioEmitters) => {
      for (const audioEmitter of audioEmitters) {
        scene.add(audioEmitter);
      }
    });
  }

  afterRoot(result: GLTF) {
    return Promise.resolve(result).then((gltf) => {
      const pending = gltf.scenes.map((scene, sceneIndex) =>
        this.loadSceneEmitters(sceneIndex, scene)
      );

      return Promise.all(pending).then(() => {
        gltf.scene.traverse((obj) => {
          if (obj.type !== "Audio") {
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
              (emitter.obj!.source! as unknown as any).mediaElement.play();
            }
          }
        });

        return gltf;
      });
    });
  }
}
