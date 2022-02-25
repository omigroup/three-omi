import { Object3D, Audio, PositionalAudio } from "three";

interface OMIAudioSource {}

interface OMIAudioEmitter {}

type MP3Encoder = (
  buffer: AudioBuffer | HTMLMediaElement
) => Promise<ArrayBuffer>;

// Taken from Three.js
// https://github.com/mrdoob/three.js/blob/master/examples/jsm/exporters/GLTFExporter.js#L290
function getPaddedBufferSize(bufferSize: number): number {
  return Math.ceil(bufferSize / 4) * 4;
}

// Taken from Three.js
// https://github.com/mrdoob/three.js/blob/master/examples/jsm/exporters/GLTFExporter.js#L303
function getPaddedArrayBuffer(
  arrayBuffer: ArrayBuffer,
  paddingByte: number = 0
): ArrayBuffer {
  const paddedLength = getPaddedBufferSize(arrayBuffer.byteLength);

  if (paddedLength !== arrayBuffer.byteLength) {
    const array = new Uint8Array(paddedLength);
    array.set(new Uint8Array(arrayBuffer));

    if (paddingByte !== 0) {
      for (let i = arrayBuffer.byteLength; i < paddedLength; i++) {
        array[i] = paddingByte;
      }
    }

    return array.buffer;
  }

  return arrayBuffer;
}

export class GLTFExporterAudioEmitterExtension {
  name = "OMI_audio_emitter";
  audioSourceData: (AudioBuffer | HTMLAudioElement)[] = [];
  audioEmitters: OMIAudioEmitter[] = [];

  constructor(private writer: any, private mp3Encoder: MP3Encoder) {}

  writeNode(object: Object3D, nodeDef: any) {
    const objectType = object.type;

    if (objectType === "Audio" || objectType === "PositionalAudio") {
      let audio = object as Audio;

      if (audio.sourceType !== "buffer") {
        console.warn(
          `Skipping exporting audio node with unsupported sourceType: ${audio.sourceType}`
        );
        return;
      }

      const audioEmitterDef: any = {
        loop:
          (audio.hasPlaybackControl ? audio.loop : audio.source?.loop) || false,
        gain: audio.gain.gain.value,
        autoPlay: true, // TODO
        source: this.audioSourceData.length,
      };

      if (objectType === "Audio") {
        audioEmitterDef.type = "global";
      } else {
        const positionalAudio = object as PositionalAudio;
        audioEmitterDef.type = "positional";
        audioEmitterDef.distanceModel = positionalAudio.getDistanceModel();
        audioEmitterDef.refDistance = positionalAudio.getRefDistance();
        audioEmitterDef.rolloffFactor = positionalAudio.getRolloffFactor();
        audioEmitterDef.maxDistance = positionalAudio.getMaxDistance();
        audioEmitterDef.coneInnerAngle = positionalAudio.panner.coneInnerAngle;
        audioEmitterDef.coneOuterAngle = positionalAudio.panner.coneOuterAngle;
        audioEmitterDef.coneOuterGain = positionalAudio.panner.coneOuterGain;
        nodeDef.extensions = nodeDef.extensions || {};
        nodeDef.extensions[this.name] = {
          audioEmitter: this.audioEmitters.length - 1,
        };
      }

      this.audioEmitters.push(audioEmitterDef);
      this.audioSourceData.push(
        audio.source!.buffer ||
          ((audio.source! as unknown as any).mediaElement as HTMLMediaElement)
      );
    }
  }

  afterParse() {
    if (this.audioEmitters.length === 0) {
      return;
    }

    const root = this.writer.json;

    const globalAudioEmitterIndices: number[] = [];

    for (let i = 0; i < this.audioEmitters.length; i++) {
      globalAudioEmitterIndices.push(i);
    }

    if (globalAudioEmitterIndices.length > 0) {
      const sceneDef = root.scenes[root.scene];
      sceneDef.extensions = sceneDef.extensions || {};
      sceneDef.extensions[this.name] = {
        audioEmitters: globalAudioEmitterIndices,
      };
    }

    // TODO: Remove global emitter objects

    this.writer.pending.push(this.writeAudioSources());
  }

  async writeAudioSources() {
    const root = this.writer.json;

    const audioSources: any[] = [];

    const encodedAudioSourceData = await Promise.all(
      this.audioSourceData.map(this.mp3Encoder)
    );

    for (const data of encodedAudioSourceData) {
      const buffer = getPaddedArrayBuffer(data);

      const bufferViewDef = {
        buffer: this.writer.processBuffer(buffer),
        byteOffset: this.writer.byteOffset,
        byteLength: buffer.byteLength,
      };

      this.writer.byteOffset += buffer.byteLength;
      const bufferView = this.writer.json.bufferViews.push(bufferViewDef) - 1;

      audioSources.push({
        bufferView,
        mimeType: "audio/mpeg"
      });
    }

    root.extensions = root.extensions || {};
    root.extensions[this.name] = {
      audioSources,
      audioEmitters: this.audioEmitters,
    };
    this.writer.extensionsUsed[this.name] = true;
  }
}
