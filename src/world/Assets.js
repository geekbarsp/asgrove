import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';

// Relative to the page so the build works from any sub-path (e.g. GitHub Pages)
export const BASE = import.meta.env.BASE_URL + 'assets/';

// Real-world size (metres) of one tile of each Poly Haven texture.
export const TEX_SIZE = {
  decrepit_wallpaper: 2.5, old_wood_floor: 3, ceiling_interior: 2, worn_plaster_wall: 1.8,
  peeling_painted_wall: 1.8, dirty_carpet: 1.2, dirty_tiles: 2.26, damaged_concrete_floor: 4.5,
  dark_brick_wall: 1.6, dark_wood: 2, rusty_metal_02: 1, wood_peeling_paint_weathered: 1.6, wooden_panels: 2.1,
};

export const MODEL_IDS = [
  'GothicBed_01', 'old_bed_frame', 'GothicCabinet_01', 'ClassicNightstand_01', 'vintage_grandfather_clock_01',
  'WoodenChair_01', 'Rockingchair_01', 'WoodenTable_01', 'ornate_mirror_01', 'Chandelier_01', 'wooden_bookshelf_worn',
  'vintage_cabinet_01', 'fancy_picture_frame_01', 'hanging_picture_frame_02', 'wheelchair_01', 'vintage_oil_lamp',
  'wooden_candlestick', 'power_box_01', 'vintage_flashlight', 'pull_chain_light_socket', 'old_gas_mask', 'medical_box',
  'vintage_suitcase', 'cardboard_box_01', 'wooden_crate_01', 'Sofa_01', 'street_rat', 'drawer_cabinet',
  'steel_frame_shelves_01', 'GothicCommode_01', 'Television_01', 'ArmChair_01', 'spinning_wheel_01', 'bolt_cutters_01',
  'wine_barrel_01', 'WoodenTable_03', 'dining_chair_02', 'brass_candleholders', 'gothic_statue',
];

export class Assets {
  constructor(renderer) {
    this.renderer = renderer;
    this.manager = new THREE.LoadingManager();
    this.texLoader = new THREE.TextureLoader(this.manager);
    this.gltf = new GLTFLoader(this.manager);
    this.gltf.setMeshoptDecoder(MeshoptDecoder);
    this.textures = new Map();
    this.materials = new Map();
    this.models = new Map();
    this.aniso = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  }

  _tex(url, srgb) {
    const t = this.texLoader.load(url);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.anisotropy = this.aniso;
    if (srgb) t.colorSpace = THREE.SRGBColorSpace;
    return t;
  }

  textureSet(id) {
    if (!this.textures.has(id)) {
      const base = `${BASE}textures/${id}/`;
      this.textures.set(id, {
        map: this._tex(base + 'diff.webp', true),
        normalMap: this._tex(base + 'nor.webp', false),
        arm: this._tex(base + 'arm.webp', false),
      });
    }
    return this.textures.get(id);
  }

  // PBR material using world-space UVs (geometry is authored in metres / TEX_SIZE).
  material(id, opts = {}) {
    const key = id + JSON.stringify(opts);
    if (this.materials.has(key)) return this.materials.get(key);
    const t = this.textureSet(id);
    const m = new THREE.MeshStandardMaterial({
      map: t.map, normalMap: t.normalMap, roughnessMap: t.arm, metalnessMap: t.arm, aoMap: t.arm,
      aoMapIntensity: 0.9, roughness: 1, metalness: opts.metal ?? 0.0,
      normalScale: new THREE.Vector2(opts.normal ?? 1.1, opts.normal ?? 1.1),
      color: opts.color ? new THREE.Color(opts.color) : new THREE.Color(1, 1, 1),
      envMapIntensity: opts.env ?? 0.5,
      side: opts.side ?? THREE.FrontSide,
    });
    m.name = id;
    this.materials.set(key, m);
    return m;
  }

  async loadModels(ids, onProgress) {
    let done = 0;
    await Promise.all(ids.map(async (id) => {
      try {
        const g = await this.gltf.loadAsync(`${BASE}models/${id}.glb`);
        g.scene.traverse((o) => {
          if (o.isMesh) {
            o.castShadow = true;
            o.receiveShadow = true;
            const mats = Array.isArray(o.material) ? o.material : [o.material];
            mats.forEach((m) => {
              m.envMapIntensity = 0.6;
              if (m.map) m.map.anisotropy = this.aniso;
            });
          }
        });
        this.models.set(id, g.scene);
      } catch (e) { console.warn('model failed', id, e); }
      onProgress?.(++done / ids.length);
    }));
  }

  async loadCreature() {
    const [bot, head] = await Promise.all([
      this.gltf.loadAsync(BASE + 'models/creature/Xbot.glb'),
      this.gltf.loadAsync(BASE + 'models/creature/LeePerrySmith.glb'),
    ]);
    const tl = this.texLoader;
    const col = tl.load(BASE + 'models/creature/Map-COL.webp'); col.colorSpace = THREE.SRGBColorSpace; col.flipY = false;
    const nor = tl.load(BASE + 'models/creature/Infinite-Level_02_Tangent_SmoothUV.webp'); nor.flipY = false;
    this.creature = { bot, head: head.scene, headCol: col, headNor: nor };
  }

  // Clone of a loaded model (shares geometry & materials).
  model(id) {
    const src = this.models.get(id);
    if (!src) return new THREE.Group();
    return src.clone(true);
  }
}
