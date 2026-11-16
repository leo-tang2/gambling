import * as THREE from 'three';

/**
 * The single hanging lamp: a warm spotlight with hard low-res shadows, a weak fill so faces
 * aren't pure black, a slow sway on its cord and an occasional flicker.
 */
export class Lamp {
  constructor({ height = 2.05, intensity = 9, rng = Math.random } = {}) {
    this.rng = rng;
    this.pivot = new THREE.Group(); // hangs from the ceiling
    this.pivot.name = 'LampPivot';
    this.pivot.position.set(0, 2.9, 0);
    this.cordLength = 2.9 - height;

    this.head = new THREE.Group();
    this.head.name = 'LampHead';
    this.head.position.y = -this.cordLength;
    this.pivot.add(this.head);

    this.spot = new THREE.SpotLight(0xffdcae, intensity, 6, 1.2, 0.45, 2);
    this.spot.name = 'LampSpot';
    this.spot.castShadow = true;
    this.spot.shadow.mapSize.set(256, 256);
    this.spot.shadow.bias = -0.002;
    this.spot.shadow.camera.near = 0.1;
    this.spot.shadow.camera.far = 4;
    this.spot.position.set(0, -0.06, 0);
    this.head.add(this.spot);
    this.target = new THREE.Object3D();
    this.target.position.set(0, -2, 0);
    this.head.add(this.target);
    this.spot.target = this.target;

    // weak bounce/fill from the bulb itself so faces read as half-lit, not black
    this.fill = new THREE.PointLight(0xffb878, 1.1, 4, 2);
    this.fill.name = 'LampFill';
    this.fill.position.set(0, -0.1, 0);
    this.head.add(this.fill);

    this.baseIntensity = intensity;
    this.baseFill = this.fill.intensity;
    this.flicker = 0; // 0..1 dip amount
    this.nextFlicker = 3 + rng() * 6;
    this.time = 0;
    this.bulbMaterial = null;
  }

  /** Optional meshes (shade, bulb) are added to `head`; `bulb` gets its emissive pulsed. */
  attachVisuals(object, bulbMaterial) {
    this.head.add(object);
    this.bulbMaterial = bulbMaterial;
  }

  update(dt) {
    this.time += dt;
    const t = this.time;
    // two slow sines make a sway that never quite repeats
    this.pivot.rotation.z = Math.sin(t * 0.55) * 0.035 + Math.sin(t * 1.3 + 1) * 0.008;
    this.pivot.rotation.x = Math.sin(t * 0.42 + 2) * 0.025;

    this.nextFlicker -= dt;
    if (this.nextFlicker <= 0) {
      this.flickerTime = 0.15 + this.rng() * 0.45;
      this.flickerElapsed = 0;
      this.nextFlicker = 4 + this.rng() * 9;
    }
    let dip = 0;
    if (this.flickerTime) {
      this.flickerElapsed += dt;
      if (this.flickerElapsed > this.flickerTime) this.flickerTime = 0;
      else dip = this.rng() < 0.5 ? 0.25 + this.rng() * 0.55 : 0;
    }
    const hum = 1 + Math.sin(t * 37) * 0.015 + Math.sin(t * 23.3) * 0.01;
    const k = hum * (1 - dip);
    this.spot.intensity = this.baseIntensity * k;
    this.fill.intensity = this.baseFill * k;
    if (this.bulbMaterial) this.bulbMaterial.emissiveIntensity = 2.5 * k;
  }
}
