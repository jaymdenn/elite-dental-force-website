// Hand-refined implementation of object-sculpt-spec.json (refine-spec r3: sphere-chain).
// Each wreath element is a chain of spheres + frustums along its medial axis using the
// MEASURED radius profile (shapes.json) — capsules, peanuts, and dumbbells emerge from
// data with a true round cross-section. Rim = same chain padded by the MEASURED white
// ring thickness, sitting behind. No layout logic — geometry is data.
import * as THREE from "three";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { WREATH } from "./instances.js";

function enamel(color, opts = {}) {
  return new THREE.MeshPhysicalMaterial({
    color,
    metalness: 0.0,
    roughness: opts.roughness ?? 0.35,
    clearcoat: 1.0,
    clearcoatRoughness: 0.2,
    envMapIntensity: opts.envMapIntensity ?? 0.9,
  });
}

function chainBlob(inst, radiusPad, mat) {
  const g = new THREE.Group();
  if (inst.len / inst.w < 1.35) {
    const r = inst.w / 2 + radiusPad;
    g.add(new THREE.Mesh(new THREE.SphereGeometry(r, 32, 24), mat));
    return g;
  }
  // surface of revolution: envelope of measured-profile spheres (union of the
  // sphere-chain, as one smooth lathe) — plump rounded forms, exact waists
  const L = inst.len;
  const N = inst.profile.length;
  const base = inst.w / 2;
  if (inst.type === "capsule") {
    // constant-width stadium bar: clean capsule, no envelope scallops
    const r = base + radiusPad;
    const m = new THREE.Mesh(
      new THREE.CapsuleGeometry(r, Math.max(L - 2 * r, 0.001), 12, 32),
      mat,
    );
    m.rotation.z = -Math.PI / 2;
    g.add(m);
    return g;
  }
  const raw = [];
  for (let i = 0; i < N; i++) {
    let r = inst.profile[i];
    if (r < 0.006) continue;
    // peanut/dumbbell waists are identity but never pinch below 42% width
    r = Math.max(r, base * 0.42);
    raw.push({ x: ((i + 0.5) / N - 0.5) * L, r: r + radiusPad });
  }
  // densify 3x so the sphere-union envelope stays smooth between samples
  const samples = [];
  for (let i = 0; i < raw.length; i++) {
    samples.push(raw[i]);
    if (i < raw.length - 1) {
      const a = raw[i],
        b = raw[i + 1];
      samples.push({
        x: (2 * a.x + b.x) / 3,
        r: Math.max(a.r, (2 * a.r + b.r) / 3),
      });
      samples.push({
        x: (a.x + 2 * b.x) / 3,
        r: Math.max(b.r, (a.r + 2 * b.r) / 3),
      });
    }
  }
  if (samples.length === 0) samples.push({ x: 0, r: inst.w / 2 + radiusPad });
  const x0 = samples[0].x - samples[0].r;
  const x1 = samples[samples.length - 1].x + samples[samples.length - 1].r;
  const env = (x) => {
    let best = 0;
    for (const s of samples) {
      const d = x - s.x;
      if (Math.abs(d) < s.r)
        best = Math.max(best, Math.sqrt(s.r * s.r - d * d));
    }
    return best;
  };
  const pts = [];
  const M = 56;
  for (let i = 0; i <= M; i++) {
    const x = x0 + (i / M) * (x1 - x0);
    pts.push(new THREE.Vector2(Math.max(env(x), 0.0001), x));
  }
  const geo = new THREE.LatheGeometry(pts, 32);
  const m = new THREE.Mesh(geo, mat);
  m.rotation.z = -Math.PI / 2; // lathe axis y -> element x
  g.add(m);
  return g;
}

export function createEdfEmblemModel(options = {}) {
  const mode = options.mode ?? "final"; // blockout | structural | final
  const root = new THREE.Group();
  root.name = "EDF Molecular Wreath Emblem";
  const nodes = { root },
    meshes = {};

  const gray = () =>
    new THREE.MeshStandardMaterial({ color: 0x9aa2ad, roughness: 0.6 });
  const tint = (c) =>
    new THREE.MeshStandardMaterial({ color: c, roughness: 0.6 });

  if (options.plate !== false) {
    const s = 1.42,
      rr = 0.5;
    const shape = new THREE.Shape();
    shape.moveTo(-s + rr, -s);
    shape.lineTo(s - rr, -s);
    shape.absarc(s - rr, -s + rr, rr, -Math.PI / 2, 0);
    shape.lineTo(s, s - rr);
    shape.absarc(s - rr, s - rr, rr, 0, Math.PI / 2);
    shape.lineTo(-s + rr, s);
    shape.absarc(-s + rr, s - rr, rr, Math.PI / 2, Math.PI);
    shape.lineTo(-s, -s + rr);
    shape.absarc(-s + rr, -s + rr, rr, Math.PI, Math.PI * 1.5);
    const geo = new THREE.ExtrudeGeometry(shape, {
      depth: 0.1,
      bevelEnabled: true,
      bevelThickness: 0.02,
      bevelSize: 0.02,
      bevelSegments: 4,
    });
    const mat =
      mode === "blockout"
        ? gray()
        : new THREE.MeshStandardMaterial({
            color: 0x0a0d16,
            roughness: 0.85,
            envMapIntensity: 0.4,
          });
    const plate = new THREE.Mesh(geo, mat);
    plate.name = "plate";
    plate.position.z = -0.26;
    plate.receiveShadow = true;
    root.add(plate);
    nodes.plate = plate;
    meshes.plate = plate;
  }

  const wreath = new THREE.Group();
  wreath.name = "wreath";
  root.add(wreath);
  nodes.wreath = wreath;

  const rimMatFinal = enamel(0xf8fbff, { roughness: 0.22 });
  const structuralTints = {
    capsule: 0x4a90d9,
    dumbbell: 0xd97a4a,
    dot: 0x6ad94a,
  };

  for (const inst of WREATH.elements) {
    const pivot = new THREE.Group();
    pivot.name = inst.id;
    pivot.position.set(inst.x, inst.y, 0);
    pivot.rotation.z = (inst.rot * Math.PI) / 180;
    pivot.userData.explodeDir = new THREE.Vector3(
      inst.x,
      inst.y,
      0,
    ).normalize();

    const blueMat =
      mode === "blockout"
        ? gray()
        : mode === "structural"
          ? tint(structuralTints[inst.type])
          : enamel(new THREE.Color(inst.color));
    const rimMat =
      mode === "blockout"
        ? gray()
        : mode === "structural"
          ? tint(0xdddddd)
          : rimMatFinal;

    const rimTotal = WREATH.rimOffset + (options.rimPad ?? 0);
    const rim = chainBlob(inst, rimTotal, rimMat);
    // rim must sit far enough back that its (larger) front surface stays
    // behind the blue fill's crown: offset > rim pad
    rim.position.z = -(inst.w / 2) * 0.55 - rimTotal - 0.02;
    rim.name = inst.id + "-rim";
    const fill = chainBlob(inst, 0.03, blueMat);
    fill.name = inst.id + "-fill";
    pivot.add(rim, fill);
    pivot.traverse((o) => {
      if (o.isMesh) {
        o.castShadow = true;
        o.receiveShadow = true;
      }
    });
    wreath.add(pivot);
    nodes[inst.id] = pivot;
  }

  root.userData.sculptRuntime = { nodes, meshes };
  return root;
}

export function createEmblemLights(mode = "reference") {
  const g = new THREE.Group();
  const key = new THREE.DirectionalLight(
    0xf4f8ff,
    mode === "grazing" ? 3.2 : 2.4,
  );
  if (mode === "grazing") key.position.set(4.5, 0.6, 1.4);
  else key.position.set(-1.2, 1.5, 2.2).multiplyScalar(2.4);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  key.shadow.bias = -0.0002;
  g.add(key);
  const fill = new THREE.DirectionalLight(0xb9d4ff, 0.7);
  fill.position.set(1.5, -0.6, 1.2).multiplyScalar(2.4);
  g.add(fill);
  g.add(new THREE.AmbientLight(0x304060, 0.35));
  return g;
}

export function createEmblemEnvironment(renderer) {
  const pmrem = new THREE.PMREMGenerator(renderer);
  const tex = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  pmrem.dispose();
  return tex;
}
