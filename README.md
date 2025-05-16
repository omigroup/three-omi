# Three.js OMI glTF extensions

This repository contains Three.js implementations of [OMI glTF extensions](https://github.com/omigroup/gltf-extensions).

Try it out here: https://omigroup.github.io/three-omi/

## Run the demo locally

Assuming you have [Node.js](https://nodejs.org/en) 18+ installed, including the `npm` and `npx` commands, run these commands to clone the repository and start a local server:

```sh
git clone https://github.com/omigroup/three-omi
cd three-omi
npm install
npx vite
```

## Using the library in your Three.js project

Install with this command:

```sh
npm install -S three three-omi
```

Then use it like this:

```js
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { GLTFLoaderAudioEmitterExtension } from "three-omi/khr_audio_emitter.js";

// Set up your scene, camera, and renderer here.

// The extension needs a reference to your AudioListener.
// Make sure you have one added as a child of your camera.
const listener = new THREE.AudioListener();
camera.add(listener);

// Create a glTF loader and register the extension.
const gltfLoader = new GLTFLoader();
gltfLoader.register((parser) => new GLTFLoaderAudioEmitterExtension(parser, listener));

gltfLoader.load(
	"path/to/your/model.glb",
	function (generated) {
		scene.add(generated.scene);
	},
	undefined,
	function (error) {
		console.error(error);
	}
);
```
