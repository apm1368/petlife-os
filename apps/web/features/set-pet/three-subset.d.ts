/**
 * The small part of three.js (owner-approved for the «ست پت» 3D preview, #368 P31) that Garment3D uses. three ships
 * no TypeScript types and @types/three would add more packages, so the subset is declared here.
 */
declare module "three" {
  export const SRGBColorSpace: string;
  export const DoubleSide: number;
  export class Vector2 {
    constructor(x?: number, y?: number);
    x: number;
    y: number;
  }
  export class Vector3 {
    x: number;
    y: number;
    z: number;
    set(x: number, y: number, z: number): this;
  }
  export class Euler {
    x: number;
    y: number;
    z: number;
  }
  export class Color {
    constructor(color?: string | number);
  }
  export class Object3D {
    position: Vector3;
    rotation: Euler;
    add(...objects: Object3D[]): this;
    remove(...objects: Object3D[]): this;
  }
  export class Group extends Object3D {}
  export class Scene extends Object3D {}
  export class OrthographicCamera extends Object3D {
    constructor(left: number, right: number, top: number, bottom: number, near?: number, far?: number);
    left: number;
    right: number;
    top: number;
    bottom: number;
    updateProjectionMatrix(): void;
    lookAt(x: number, y: number, z: number): void;
  }
  export class Light extends Object3D {}
  export class AmbientLight extends Light {
    constructor(color?: string | number, intensity?: number);
  }
  export class DirectionalLight extends Light {
    constructor(color?: string | number, intensity?: number);
  }
  export class Path {
    moveTo(x: number, y: number): this;
    lineTo(x: number, y: number): this;
    quadraticCurveTo(cpx: number, cpy: number, x: number, y: number): this;
  }
  export class Shape extends Path {}
  export class BufferGeometry {
    translate(x: number, y: number, z: number): this;
    dispose(): void;
  }
  export class ExtrudeGeometry extends BufferGeometry {
    constructor(shape: Shape, options?: { depth?: number; bevelEnabled?: boolean; bevelThickness?: number; bevelSize?: number; bevelSegments?: number; curveSegments?: number });
  }
  export class ShapeGeometry extends BufferGeometry {
    constructor(shape: Shape, curveSegments?: number);
  }
  export class Texture {
    colorSpace: string;
    repeat: Vector2;
    offset: Vector2;
    anisotropy: number;
    needsUpdate: boolean;
    dispose(): void;
  }
  export class CanvasTexture extends Texture {
    constructor(canvas: HTMLCanvasElement);
  }
  export class Material {
    dispose(): void;
  }
  export class MeshStandardMaterial extends Material {
    constructor(params?: { color?: string | number | Color; roughness?: number; metalness?: number; side?: number });
  }
  export class MeshBasicMaterial extends Material {
    constructor(params?: { map?: Texture; transparent?: boolean; depthWrite?: boolean; side?: number });
  }
  export class Mesh extends Object3D {
    constructor(geometry?: BufferGeometry, material?: Material);
  }
  export class WebGLRenderer {
    constructor(params?: { canvas?: HTMLCanvasElement; antialias?: boolean; alpha?: boolean; powerPreference?: string });
    domElement: HTMLCanvasElement;
    outputColorSpace: string;
    capabilities: { getMaxAnisotropy(): number };
    setPixelRatio(ratio: number): void;
    setSize(width: number, height: number, updateStyle?: boolean): void;
    render(scene: Scene, camera: OrthographicCamera): void;
    dispose(): void;
  }
}
