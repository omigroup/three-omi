import * as THREE from "three";

/**
 * GLTF Loader / Importer Audio Emitter Extension
 *
 * Since Three.js requires every audio emitter to reference a listener, the listener is required to be passed in.
 *
 * Specification: https://github.com/omigroup/gltf-extensions/tree/main/extensions/2.0/KHR_audio_emitter
 */
class GLTFLoaderAudioEmitterExtension {
	/**
	 * Create a KHR_audio_emitter extension plugin.
	 * @param {GLTFParser} parser - The GLTFLoader parser instance.
	 * @param {THREE.AudioListener} listener - Audio listener to attach audio to.
	 */
	constructor(parser, listener) {
		this.parser = parser;
		this.listener = listener;
		this.name = "KHR_audio_emitter";
		this.cache = { refs: {}, uses: {} };
	}

	_markDefs() {
		const parser = this.parser;
		const nodeDefs = this.parser.json.nodes || [];
		// Iterate through all nodes and check if they have the KHR_audio_emitter extension.
		for (let nodeIndex = 0, nodeLength = nodeDefs.length; nodeIndex < nodeLength; nodeIndex++) {
			const nodeDef = nodeDefs[nodeIndex];
			// If a node defines `extensions/KHR_audio_emitter/emitter`, mark it as using that emitter.
			if (nodeDef.extensions && nodeDef.extensions[this.name] && nodeDef.extensions[this.name].emitter !== undefined) {
				parser._addNodeRef(this.cache, nodeDef.extensions[this.name].emitter);
			}
		}
	}

	_loadAudioBufferIntoEmitter(audioDataDef, audioEmitter) {
		const audioContext = new (window.AudioContext || window.webkitAudioContext)();
		let uri = audioDataDef.uri;
		if (uri === undefined) {
			const bufferView = audioDataDef.bufferView;
			const mimeType = audioDataDef.mimeType;
			if (bufferView === undefined || mimeType === undefined) {
				return Promise.reject("glTF KHR_audio_emitter import: Audio data does not have either a `uri` or `bufferView` + `mimeType`.");
			}
			return this.parser.getDependency("bufferView", bufferView).then((bufferViewData) => {
				return audioContext.decodeAudioData(bufferViewData).then(
					(decodedBuffer) => {
						audioEmitter.setBuffer(decodedBuffer);
					},
					(error) => {
						throw new Error("Failed to decode audio data. Ensure the data is valid and matches the mimeType. Error: " + error);
					}
				);
			});
		}
		const audioLoader = new THREE.AudioLoader();
		audioLoader.setPath(this.parser.options.path);
		return new Promise((resolve, reject) => {
			audioLoader.load(
				uri,
				(buffer) => {
					audioEmitter.setBuffer(buffer);
					resolve();
				},
				undefined,
				reject
			);
		});
	}

	_generateEmitterWithoutAudioData(audioEmitterDef, audioSourceDef) {
		let emitter; // Audio or PositionalAudio
		switch (audioEmitterDef.type) {
			case "global":
				emitter = new THREE.Audio(this.listener);
				break;
			case "positional":
				emitter = new THREE.PositionalAudio(this.listener);
				let positionalEmitterDef = audioEmitterDef.positional || {};
				if (positionalEmitterDef.shapeType === "cone") {
					const RAD_TO_DEG = 57.29577951308232;
					const coneInnerAngle = positionalEmitterDef.coneInnerAngle === undefined || 6.2831853071795864;
					const coneOuterAngle = positionalEmitterDef.coneOuterAngle === undefined || 6.2831853071795864;
					const coneOuterGain = positionalEmitterDef.coneOuterGain || 0.0;
					emitter.setDirectionalCone(coneInnerAngle * RAD_TO_DEG, coneOuterAngle * RAD_TO_DEG, coneOuterGain);
				}
				emitter.setDistanceModel(positionalEmitterDef.distanceModel || "inverse");
				// Zero in the spec is infinite. Three.js does not allow infinite maxDistance,
				// so we set it to a very large number if zero or missing. A million should do.
				emitter.setMaxDistance(positionalEmitterDef.maxDistance || 1000000.0);
				emitter.setRefDistance(positionalEmitterDef.refDistance || 1.0);
				emitter.setRolloffFactor(positionalEmitterDef.rolloffFactor || 1.0);
				break;
			default:
				throw new Error("glTF KHR_audio_emitter import: Unknown audio emitter type: " + audioEmitterDef.type);
		}
		let emitterGain = audioEmitterDef.gain === undefined || 1.0;
		let sourceGain = audioSourceDef.gain === undefined || 1.0;
		emitter.setVolume(emitterGain * sourceGain);
		emitter.autoplayOnClick = audioSourceDef.autoplay || false;
		emitter.playbackRate = audioSourceDef.playbackRate === undefined || 1.0;
		emitter.setLoop(audioSourceDef.loop || false);
		return emitter;
	}

	// Create a new audio emitter from the emitter definition. Called by createNodeAttachment, returns a Promise with an array of emitters.
	_generateEmitter(emitterIndex) {
		const self = this;
		const json = this.parser.json;
		const audioEmitterDefs = (json.extensions && json.extensions[this.name].emitters) || [];
		const audioEmitterDef = audioEmitterDefs[emitterIndex];
		if (audioEmitterDef === undefined) {
			throw new Error("glTF KHR_audio_emitter import: Audio emitter not found: " + emitterIndex);
		}
		const audioDataDefs = (json.extensions && json.extensions[this.name].audio) || [];
		const audioSourceDefs = (json.extensions && json.extensions[this.name].sources) || [];
		const audioEmitterSourceIndices = audioEmitterDef.sources || [];
		let ret;
		for (let i = 0; i < audioEmitterSourceIndices.length; i++) {
			const audioSourceDef = audioSourceDefs[audioEmitterSourceIndices[i]];
			if (audioSourceDef === undefined) {
				throw new Error("glTF KHR_audio_emitter import: Audio source not found: " + audioEmitterSourceIndices[i]);
			}
			let emitter = this._generateEmitterWithoutAudioData(audioEmitterDef, audioSourceDef);
			const audioDataIndex = audioSourceDef.audio;
			if (audioDataIndex !== undefined) {
				const audioDataDef = audioDataDefs[audioDataIndex];
				if (audioDataDef === undefined) {
					throw new Error("glTF KHR_audio_emitter import: Audio data not found: " + audioDataIndex);
				}
				this._loadAudioBufferIntoEmitter(audioDataDef, emitter).then(() => {
					if (emitter.autoplayOnClick) {
						emitter.stop();
						GLTFLoaderAudioEmitterExtension._autoplayAfterFirstClick(emitter, emitter.play);
					}
				});
			}
			if (ret === undefined) {
				ret = emitter;
			} else {
				ret.add(emitter);
			}
		}
		return ret;
	}

	createNodeAttachment(nodeIndex) {
		const self = this;
		const parser = this.parser;
		const nodeDef = parser.json.nodes[nodeIndex];
		const nodeEmitterExt = (nodeDef.extensions && nodeDef.extensions[this.name]) || {};
		const emitterIndex = nodeEmitterExt.emitter;

		if (emitterIndex === undefined) return null;

		return Promise.resolve(this._generateEmitter(emitterIndex)).then(function (emitter) {
			return parser._getNodeRef(self.cache, emitterIndex, emitter);
		});
	}

	afterRoot(generated) {
		const scene = generated.scene;
		const jsonScenes = this.parser.json.scenes || [{}];
		const jsonScene = jsonScenes[this.parser.json.scene || 0];
		const sceneEmitterExt = (jsonScene.extensions && jsonScene.extensions[this.name]) || {};
		const sceneEmitterIndices = sceneEmitterExt.emitters || [];
		for (let i = 0; i < sceneEmitterIndices.length; i++) {
			const emitterIndex = sceneEmitterIndices[i];
			const emitter = this._generateEmitter(emitterIndex);
			if (emitter) {
				scene.add(emitter);
			}
		}
	}

	// Web browsers require user interaction before playing audio.
	static _hasUserClicked = false;
	static _pendingAutoplayFunctions = [];
	static _autoplayAfterFirstClick(emitter, playFunc) {
		if (GLTFLoaderAudioEmitterExtension._hasUserClicked) {
			playFunc.bind(emitter)();
		} else {
			GLTFLoaderAudioEmitterExtension._pendingAutoplayFunctions.push(playFunc.bind(emitter));
		}
	}
	static _listenForUserInteraction() {
		GLTFLoaderAudioEmitterExtension._hasUserClicked = true;
		window.removeEventListener("click", GLTFLoaderAudioEmitterExtension._listenForUserInteraction);
		for (const pendingAutoplayFunc of GLTFLoaderAudioEmitterExtension._pendingAutoplayFunctions) {
			pendingAutoplayFunc();
		}
		GLTFLoaderAudioEmitterExtension._pendingAutoplayFunctions.length = 0;
	}
	static {
		window.addEventListener("click", GLTFLoaderAudioEmitterExtension._listenForUserInteraction, { once: true });
	}
}

/**
 * GLTF Exporter Audio Emitter Extension
 *
 * Since Three.js requires every audio emitter to reference a listener, the listener is required to be passed in.
 *
 * Specification: https://github.com/omigroup/gltf-extensions/tree/main/extensions/2.0/KHR_audio_emitter
 */
class GLTFExporterAudioEmitterExtension {
	constructor(writer) {
		this.writer = writer;
		this.name = "KHR_audio_emitter";
	}

	// Internal helper functions.
	static _isEqualApprox(pLeft, pRight) {
		// Check for exact equality first, required to handle "infinity" values.
		if (pLeft === pRight) {
			return true;
		}
		// Then check for approximate equality.
		const tolerance = Math.abs(pLeft) * CMP_EPSILON;
		const finalTolerance = tolerance < CMP_EPSILON ? CMP_EPSILON : tolerance;
		return Math.abs(pLeft - pRight) < finalTolerance;
	}

	/**
	 * Inserts `obj` into `arr` if no object exists.
	 * @param {Object[]} arr  Array of JSON-style objects
	 * @param {Object}   obj  Object to insert
	 * @returns {number} Index of existing or newly inserted object
	 */
	static _insertUnique(arr, obj) {
		const stringified = JSON.stringify(obj);
		const existingIndex = arr.findIndex((item) => JSON.stringify(item) === stringified);
		if (existingIndex !== -1) {
			return existingIndex;
		}
		// No match found, append and return new index.
		let arrLength = arr.length;
		arr.push(obj);
		return arrLength;
	}

	_writeAudioData(audioBufferSourceNode) {
		console.log("glTF KHR_audio_emitter export: Writing audio data is not yet implemented.");
		return {}; // TODO: Implement audio writing to bufferView.
	}

	writeNode(audioObject, nodeDef) {
		if (!(audioObject instanceof THREE.Audio)) {
			return;
		}
		let topExtensions = this.writer.json.extensions || {};
		let topEmitterExtension = topExtensions[this.name] || {};
		// Serialize the audio data.
		let audioData = topEmitterExtension.audio || [];
		let audioBufferSourceNode = audioObject.source;
		const audioDataDef = this._writeAudioData(audioBufferSourceNode);
		const audioDataIndex = GLTFExporterAudioEmitterExtension._insertUnique(audioData, audioDataDef);
		// Serialize the audio source.
		let sourceData = topEmitterExtension.sources || [];
		const sourceDef = {
			audio: audioDataIndex,
		};
		const autoplay = audioObject.autoplay || audioObject.autoplayOnClick || false;
		if (autoplay) {
			sourceDef.autoplay = autoplay;
		}
		if (audioObject.playbackRate !== 1.0) {
			sourceDef.playbackRate = audioObject.playbackRate;
		}
		if (audioObject.getLoop()) {
			sourceDef.loop = audioObject.getLoop();
		}
		const sourceIndex = GLTFExporterAudioEmitterExtension._insertUnique(sourceData, sourceDef);
		// Serialize the audio emitter.
		let emitterDef = {
			sources: [sourceIndex],
		};
		const volume = audioObject.getVolume();
		if (volume !== 1.0) {
			emitterDef.gain = volume;
		}
		if (audioObject instanceof THREE.PositionalAudio) {
			emitterDef.type = "positional";
			let positional = {
				maxDistance: audioObject.getMaxDistance(),
			};
			if (!GLTFExporterAudioEmitterExtension._isEqualApprox(audioObject.getRefDistance(), 1.0)) {
				positional.refDistance = audioObject.getRefDistance();
			}
			if (!GLTFExporterAudioEmitterExtension._isEqualApprox(audioObject.getRolloffFactor(), 1.0)) {
				positional.rolloffFactor = audioObject.getRolloffFactor();
			}
		}
		let emitterData = topEmitterExtension.emitters || [];
		const emitterIndex = GLTFExporterAudioEmitterExtension._insertUnique(emitterData, emitterDef);
		// Reference the emitter in the node.
		const nodeEmitterExt = {
			emitter: emitterIndex,
		};
		let nodeExt = nodeDef.extensions || {};
		nodeExt[this.name] = nodeEmitterExt;
		// Write everything back to the JSON.
		nodeDef.extensions = nodeExt;
		topEmitterExtension.audio = audioData;
		topEmitterExtension.sources = sourceData;
		topEmitterExtension.emitters = emitterData;
		topExtensions[this.name] = topEmitterExtension;
		this.writer.json.extensions = topExtensions;
		// Mark the extension as used.
		this.writer.extensionsUsed[this.name] = true;
	}
}

export { GLTFLoaderAudioEmitterExtension, GLTFExporterAudioEmitterExtension };
