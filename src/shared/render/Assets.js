import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { pixelate } from './textures.js';

/** Load .glb files from /models and enforce the pixel look on everything inside. */
export async function loadModels(names, onProgress) {
  const loader = new GLTFLoader();
  const out = {};
  let done = 0;
  await Promise.all(names.map(async (name) => {
    try {
      const gltf = await loader.loadAsync(`/models/${name}.glb`);
      prepare(gltf.scene);
      out[name] = gltf.scene;
    } catch (err) {
      console.warn(`model ${name} failed to load, using gray-box`, err);
      out[name] = null;
    }
    onProgress?.(++done / names.length);
  }));
  return out;
}

export function prepare(root) {
  root.traverse((o) => {
    if (!o.isMesh) return;
    o.castShadow = true;
    o.receiveShadow = true;
    const mats = Array.isArray(o.material) ? o.material : [o.material];
    for (const m of mats) {
      if (m.map) pixelate(m.map);
      if (m.emissiveMap) pixelate(m.emissiveMap);
      m.flatShading = true;
      m.metalness = 0;
      m.roughness = Math.max(0.6, m.roughness ?? 1);
      m.side = THREE.FrontSide;
      m.needsUpdate = true;
    }
  });
  return root;
}

/** Find the first mesh with a given node name. */
export function findMesh(root, name) {
  let hit = null;
  root?.traverse((o) => { if (!hit && o.isMesh && (o.name === name || o.parent?.name === name)) hit = o; });
  return hit;
}
