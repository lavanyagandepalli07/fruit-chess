const canvas = document.getElementById("game");
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 1000);
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });

export { scene, camera, renderer };
