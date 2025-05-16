import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { GLTFLoaderAudioEmitterExtension } from "./khr_audio_emitter.js";

// Set up the scene, light, and renderer.
const scene = new THREE.Scene();
const renderer = new THREE.WebGLRenderer();
let main = document.querySelector("main");
renderer.setSize(main.offsetWidth, main.offsetHeight);
const directionalLight = new THREE.DirectionalLight(0xffffff, 10.0);
scene.add(directionalLight);

// Set up the camera, listener, and controls.
const camera = new THREE.PerspectiveCamera(75, main.offsetWidth / main.offsetHeight, 0.05, 500);
camera.position.z = 1;
camera.position.y = 0.25;
let controls = new OrbitControls(camera, renderer.domElement);
controls.zoomSpeed = 4.0;

// Set up the listener and animation mixer.
const listener = new THREE.AudioListener();
camera.add(listener);
const clock = new THREE.Clock();
const animationMixer = new THREE.AnimationMixer(scene);

// Set up a render loop.
function animate() {
	controls.update();
	animationMixer.update(clock.getDelta());
	renderer.render(scene, camera);
}
renderer.setAnimationLoop(animate);

// Resize the renderer when the window is resized.
window.addEventListener("resize", function () {
	renderer.setSize(main.offsetWidth, main.offsetHeight);
	camera.aspect = main.offsetWidth / main.offsetHeight;
	camera.updateProjectionMatrix();
});

// Update the listener volume when the volume slider is changed.
let volumeSlider = document.getElementById("volumeSlider");
const initialVolumeSqrt = volumeSlider.value / 100;
listener.setMasterVolume(initialVolumeSqrt * initialVolumeSqrt);
volumeSlider.addEventListener("input", function () {
	const volumeSqrt = volumeSlider.value / 100;
	listener.setMasterVolume(volumeSqrt * volumeSqrt);
});

// Set up the glTF loader with the audio emitter extension.
const gltfLoader = new GLTFLoader();
gltfLoader.register((parser) => new GLTFLoaderAudioEmitterExtension(parser, listener));

let loadedObject = null;

// Function to dispose of the loaded object and its children. Why doesn't Three.js include something like this?
function disposeObject(object) {
	object.traverse(function (child) {
		// If the child is an audio object, stop the sound.
		if (child instanceof THREE.Audio) {
			child.stop();
		}
		for (const key in child) {
			// Run dispose if it has a dispose method.
			if (child[key] && typeof child[key].dispose === "function") {
				child[key].dispose();
			} else if (key !== "children") {
				delete child[key];
			}
		}
	});
}

function loadAndReplace(url) {
	console.log("Loading: " + url);
	if (loadedObject) {
		scene.remove(loadedObject);
		disposeObject(loadedObject);
	} else {
		main.replaceChildren(renderer.domElement);
	}
	gltfLoader.load(
		url,
		function (generated) {
			loadedObject = generated.scene;
			scene.add(loadedObject);
			for (const clip of generated.animations) {
				const action = animationMixer.clipAction(clip, loadedObject);
				action.loop = THREE.LoopRepeat;
				action.play();
			}
		},
		undefined,
		function (error) {
			console.error(error);
		}
	);
}

window.loadAndReplace = loadAndReplace;
