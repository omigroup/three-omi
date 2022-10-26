import {
  Audio,
  PositionalAudio,
  AudioListener,
  MathUtils,
  Object3D,
  AudioLoader,
  Vector3,
  Quaternion,
  LoaderUtils,
} from "three";
import { GLTFParser, GLTF } from "three/examples/jsm/loaders/GLTFLoader";

export class GLTFAudioEmitterExtension {
  public name: string;
  public listener: AudioListener;
  public autoPlay: boolean;
  public audioEmitters: {
    autoPlay: boolean;
    obj: Audio<GainNode | PannerNode> | PositionalAudio;
  }[];

  private parser: GLTFParser;
  private audioLoader: AudioLoader;

  constructor(parser: GLTFParser, listener: AudioListener) {
    this.name = "KHR_audio";
    this.parser = parser;
    this.listener = listener;
    this.audioEmitters = [];
    this.autoPlay = true;
    this.audioLoader = new AudioLoader(this.parser.options.manager);
  }

  loadAudioSource(
    audioSourceIndex: Array<number>
  ): Promise<AudioBuffer> {
    const json = this.parser.json;
    const extension = json.extensions[this.name];
    const audioSource = extension.sources[audioSourceIndex[0]];

    if (extension.audio[audioSource.audio].uri){
      return this.audioLoader.loadAsync(
        LoaderUtils.resolveURL(
          extension.audio[audioSource.audio].uri,
          this.parser.options.path
        )
      );
    } else {
      return this.parser
        .getDependency("bufferView", extension.audio[audioSource.audio].bufferView)
        .then((buffer: ArrayBuffer) => {
          const bufferCopy = buffer.slice(0) ;
          const context = this.listener.context;
          return context.decodeAudioData(bufferCopy);
        });
    }
  }

  loadAudioEmitter(
    audioEmitterIndex: number
  ): Promise<Audio<GainNode | PannerNode> | PositionalAudio> {
    const json = this.parser.json;
    const extension = json.extensions[this.name];
    const audioEmitterDef = extension.emitters[audioEmitterIndex];

    let obj: Audio<GainNode | PannerNode> | PositionalAudio;

    if (audioEmitterDef.type === "global") {
      obj = new Audio(this.listener);
    } else {
      const audio = new PositionalAudio(this.listener);
      audio.setRefDistance(
        audioEmitterDef.refDistance !== undefined
          ? audioEmitterDef.refDistance
          : 1
      );
      audio.setRolloffFactor(
        audioEmitterDef.rolloffFactor !== undefined
          ? audioEmitterDef.rolloffFactor
          : 1
      );
      audio.setDistanceModel(audioEmitterDef.distanceModel || "inverse");
      audio.setMaxDistance(
        audioEmitterDef.maxDistance !== undefined
          ? audioEmitterDef.maxDistance
          : 10000
      );
      audio.setDirectionalCone(
        MathUtils.radToDeg(
          audioEmitterDef.coneInnerAngle !== undefined
            ? audioEmitterDef.coneInnerAngle
            : Math.PI * 2
        ),
        MathUtils.radToDeg(
          audioEmitterDef.coneOuterAngle !== undefined
            ? audioEmitterDef.coneOuterAngle
            : Math.PI * 2
        ),
        audioEmitterDef.coneOuterGain !== undefined
          ? audioEmitterDef.coneOuterGain
          : 0
      );
      obj = audio;
    }

    obj.name = audioEmitterDef.name || "";
    obj.gain.gain.value =
      audioEmitterDef.gain !== undefined ? audioEmitterDef.gain : 1;
    return this.loadAudioSource(audioEmitterDef.sources).then((source) => {
      obj.setBuffer(source);
      obj.setLoop(!!audioEmitterDef.loop);
      this.audioEmitters.push({ autoPlay: !!extension.sources[audioEmitterDef.sources[0]].autoPlay, obj });
      return obj;
    });
  }

  createNodeAttachment(
    nodeIndex: number
  ): Promise<Audio<GainNode | PannerNode> | PositionalAudio> | null {
    const json = this.parser.json;
    const nodeDef = json.nodes[nodeIndex];

    if (!nodeDef.extensions || !nodeDef.extensions[this.name]) {
      return null;
    }

    const extension = nodeDef.extensions[this.name];
    const audioEmitterIndex = extension.emitter;

    return this.loadAudioEmitter(audioEmitterIndex);
  }

  loadSceneEmitters(sceneIndex: number, scene: Object3D): Promise<void | null> {
    const json = this.parser.json;
    const sceneDef = json.scenes[sceneIndex];

    if (!sceneDef.extensions || !sceneDef.extensions[this.name]) {
      return Promise.resolve(null);
    }

    const extension = sceneDef.extensions[this.name];
    const audioEmitterIndices: number[] = extension.emitters;

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
        if (this.autoPlay) {
          this.startPlayingEmitters();
        }
      });
    });
  }

  startPlayingEmitters(): void {
    for (const emitter of this.audioEmitters) {
      if (!emitter.autoPlay) {
        return;
      }

      // HACK: Update PositionalAudio transforms using value instead of linearRampToValueAtTime
      // to avoid a bug where the transform is set to the origin for a split second at load.
      if ("panner" in emitter.obj) {
        const panner = emitter.obj.panner;
        emitter.obj.updateMatrixWorld(true);
        const position = new Vector3();
        const quaternion = new Quaternion();
        const scale = new Vector3();
        const orientation = new Vector3();
        emitter.obj.matrixWorld.decompose(position, quaternion, scale);
        orientation.set( 0, 0, 1 ).applyQuaternion( quaternion );
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
