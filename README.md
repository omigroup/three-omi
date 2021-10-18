# three-omi

A sandbox for reference implementations of [OMI gltf-extensions](https://github.com/omigroup/gltf-extensions) for three.js

## Installation

```
npm install -S three three-omi
```

### OMI_audio_emitter Extension

```js
import { AudioListener } from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader";
import { GLTFAudioEmitterExtension } from "three-omi";

// The extension needs a reference to your player's AudioEmitter
const audioListener = new AudioListener();

const gltfLoader = new GLTFLoader();
gltfLoader.register(parser => new GLTFAudioEmitterExtension(parser, audioListener));
const { scene } = await gltfLoader.loadAsync("OutdoorFestival.gltf");


```

## Examples

A live version of the examples is running [here]( omigroup.github.io/three-omi ).

Run the examples locally by running:

```
cd three-omi
npm install
npm run dev
```