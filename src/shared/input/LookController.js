import * as THREE from 'three';

const tmpQ = new THREE.Quaternion();
const tmpE = new THREE.Euler(0, 0, 0, 'YXZ');
const tmpM = new THREE.Matrix4();
const UP = new THREE.Vector3(0, 1, 0);

/**
 * Seated first-person camera.
 * - The pointer only turns the view near the screen edges, so the table stays still while
 *   you click chips and buttons in the middle.
 * - "Shots" blend the camera to a framed close-up (board cards, peeking at your hand, the
 *   game-over scene) and back. `blend` goes 0 → 1.
 */
export class LookController {
  constructor(camera, { yawRange = 0.55, pitchUp = 0.16, pitchRest = -0.2, smoothing = 4.5, edge = 0.18 } = {}) {
    this.camera = camera;
    this.camera.rotation.order = 'YXZ';
    Object.assign(this, { yawRange, pitchUp, pitchRest, smoothing, edge });
    this.basePos = camera.position.clone();
    this.baseFov = camera.fov;
    this.yaw = 0;
    this.pitch = pitchRest;
    this.targetYaw = 0;
    this.targetPitch = pitchRest;
    this.override = null; // {yaw, pitch}
    this.locked = false; // ignore the pointer (menus, cutscenes)
    this.shot = { pos: new THREE.Vector3(), quat: new THREE.Quaternion(), fov: camera.fov };
    this.blend = 0;
    this.shake = 0;
    this.drunk = 0; // 0..1 slow woozy sway
    this.time = 0;
  }

  /** u, v in 0..1 screen space (0,0 top-left). */
  aim(u, v) {
    if (this.locked) return;
    const e = this.edge;
    if (u < e) this.targetYaw = this.yawRange * Math.min(1, (e - u) / e);
    else if (u > 1 - e) this.targetYaw = -this.yawRange * Math.min(1, (u - (1 - e)) / e);
    else this.targetYaw *= 0.0; // back to centre when the pointer is in the middle
    this.targetPitch = v < e * 0.8 ? this.pitchRest + (this.pitchUp - this.pitchRest) * (1 - v / (e * 0.8)) : this.pitchRest;
  }

  /** Point the shot camera at `look` from `pos`. */
  setShot(pos, look, fov = this.baseFov, up = UP) {
    this.shot.pos.copy(pos);
    tmpM.lookAt(pos, look, up);
    this.shot.quat.setFromRotationMatrix(tmpM);
    this.shot.fov = fov;
  }

  update(dt) {
    const ty = this.override ? this.override.yaw : this.targetYaw;
    const tp = this.override ? this.override.pitch : this.targetPitch;
    const k = 1 - Math.exp(-this.smoothing * dt);
    this.yaw += (ty - this.yaw) * k;
    this.pitch += (tp - this.pitch) * k;
    tmpE.set(this.pitch, this.yaw, 0, 'YXZ');
    tmpQ.setFromEuler(tmpE);
    const b = this.blend;
    this.camera.position.lerpVectors(this.basePos, this.shot.pos, b);
    this.camera.quaternion.copy(tmpQ).slerp(this.shot.quat, b);
    const fov = this.baseFov + (this.shot.fov - this.baseFov) * b;
    if (Math.abs(this.camera.fov - fov) > 1e-3) {
      this.camera.fov = fov;
      this.camera.updateProjectionMatrix();
    }
    this.time += dt;
    if (this.drunk > 0.001) {
      const t = this.time;
      this.camera.rotateZ((Math.sin(t * 0.8) * 0.035 + Math.sin(t * 1.9) * 0.01) * this.drunk);
      this.camera.rotateX(Math.sin(t * 0.6 + 1) * 0.012 * this.drunk);
      this.camera.rotateY(Math.sin(t * 0.45 + 2) * 0.02 * this.drunk);
    }
    if (this.shake > 0.0005) {
      this.camera.rotateX((Math.random() - 0.5) * this.shake);
      this.camera.rotateY((Math.random() - 0.5) * this.shake);
      this.shake *= Math.exp(-7 * dt);
    }
  }
}
