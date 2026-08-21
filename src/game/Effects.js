import * as THREE from 'three';

// Lightweight particle system + pooled visual FX: boost flames, drifting dust,
// banana-slip stars, pickup sparkle rings. Single GPU Points buffer for perf.
export class Effects {
  constructor(scene, capacity = 1200) {
    this.scene = scene;
    this.capacity = capacity;
    this.cursor = 0;
    this.pos = new Float32Array(capacity * 3);
    this.col = new Float32Array(capacity * 3);
    this.vel = new Float32Array(capacity * 3);
    this.life = new Float32Array(capacity);   // 0 = dead
    this.maxLife = new Float32Array(capacity);
    this.size = new Float32Array(capacity);
    this.gravity = new Float32Array(capacity);

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('color', new THREE.BufferAttribute(this.col, 3).setUsage(THREE.DynamicDrawUsage));
    this.points = new THREE.Points(geo, new THREE.PointsMaterial({
      size: 0.5, vertexColors: true, transparent: true, opacity: 0.9, depthWrite: false,
      sizeAttenuation: true, blending: THREE.AdditiveBlending,
    }));
    this.points.frustumCulled = false;
    scene.add(this.points);

    // shockwave ring pool
    this.rings = [];
    this.ringMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.8, depthWrite: false, blending: THREE.AdditiveBlending });
    for (let i = 0; i < 8; i++) {
      const r = new THREE.Mesh(new THREE.RingGeometry(0.5, 0.62, 32), this.ringMat.clone());
      r.visible = false; r.rotation.x = -Math.PI / 2;
      scene.add(r);
      this.rings.push({ mesh: r, life: 0, max: 1 });
    }
  }

  spawn(pos, vel, color, opts = {}) {
    const life = opts.life ?? 0.7;
    const i = this.cursor;
    this.cursor = (this.cursor + 1) % this.capacity;
    this.pos[i * 3] = pos.x; this.pos[i * 3 + 1] = pos.y; this.pos[i * 3 + 2] = pos.z;
    this.vel[i * 3] = vel.x; this.vel[i * 3 + 1] = vel.y; this.vel[i * 3 + 2] = vel.z;
    this.col[i * 3] = color.r; this.col[i * 3 + 1] = color.g; this.col[i * 3 + 2] = color.b;
    this.life[i] = life;
    this.maxLife[i] = life;
    this.size[i] = opts.size ?? 0.5;
    this.gravity[i] = opts.gravity ?? 0;
  }

  boost(pos, dir, color = new THREE.Color(1, 0.6, 0.2), n = 6) {
    for (let k = 0; k < n; k++) {
      const v = new THREE.Vector3(
        -dir.x * (6 + Math.random() * 5),
        (Math.random() - 0.2) * 3,
        -dir.z * (6 + Math.random() * 5)
      );
      this.spawn(
        new THREE.Vector3(pos.x, pos.y + 0.3, pos.z),
        v, color.clone().multiplyScalar(0.7 + Math.random() * 0.5),
        { life: 0.35 + Math.random() * 0.3, size: 0.4 + Math.random() * 0.4 }
      );
    }
  }

  dust(pos, color = new THREE.Color(0.9, 0.85, 0.75), n = 4) {
    for (let k = 0; k < n; k++) {
      this.spawn(
        pos, new THREE.Vector3((Math.random() - 0.5) * 4, Math.random() * 3, (Math.random() - 0.5) * 4),
        color.clone().multiplyScalar(0.7 + Math.random() * 0.4),
        { life: 0.5 + Math.random() * 0.4, size: 0.35, gravity: -4 }
      );
    }
  }

  spinStars(pos, n = 14) {
    const yellow = new THREE.Color(1, 0.9, 0.2);
    for (let k = 0; k < n; k++) {
      const a = Math.random() * 6.28, sp = 2 + Math.random() * 6;
      this.spawn(
        pos.clone(), new THREE.Vector3(Math.cos(a) * sp, 2 + Math.random() * 5, Math.sin(a) * sp),
        yellow, { life: 0.6 + Math.random() * 0.5, size: 0.5, gravity: -6 }
      );
    }
  }

  ring(pos, color, max = 2.4) {
    const r = this.rings.find((x) => x.life <= 0) || this.rings[0];
    r.life = r.max = max;
    r.mesh.position.copy(pos);
    r.mesh.material.color.copy(color);
    r.mesh.visible = true;
  }

  update(dt) {
    const arr = this.pos, col = this.col, vel = this.vel, life = this.life;
    const size = this.size, grav = this.gravity;
    for (let i = 0; i < this.capacity; i++) {
      if (life[i] <= 0) continue;
      life[i] -= dt;
      if (life[i] <= 0) { life[i] = 0; this._setZero(i); continue; }
      vel[i * 3 + 1] += grav[i] * dt;
      arr[i * 3] += vel[i * 3] * dt;
      arr[i * 3 + 1] += vel[i * 3 + 1] * dt;
      arr[i * 3 + 2] += vel[i * 3 + 2] * dt;
      // fade color toward transparent near end
      const k = Math.max(0, life[i] / (this.maxLife[i] || 1));
      col[i * 3] *= k; col[i * 3 + 1] *= k; col[i * 3 + 2] *= k;
    }
    this.points.geometry.attributes.position.needsUpdate = true;
    this.points.geometry.attributes.color.needsUpdate = true;
    this.points.material.size = 0.5;

    for (const r of this.rings) {
      if (r.life <= 0) continue;
      r.life -= dt;
      const k = 1 - r.life / r.max;
      r.mesh.scale.setScalar(k * r.max * 3);
      r.mesh.material.opacity = (1 - k) * 0.9;
      if (r.life <= 0) r.mesh.visible = false;
    }
  }

  // Zero out a dead particle so it does not linger as a frozen glowing point.
  // y is pushed far below the ground so it can never be visible even if color
  // somehow survives; color and velocity are also cleared for buffer reuse.
  _setZero(i) {
    this.pos[i * 3] = 0; this.pos[i * 3 + 1] = -999; this.pos[i * 3 + 2] = 0;
    this.vel[i * 3] = 0; this.vel[i * 3 + 1] = 0; this.vel[i * 3 + 2] = 0;
    this.col[i * 3] = 0; this.col[i * 3 + 1] = 0; this.col[i * 3 + 2] = 0;
  }
}
