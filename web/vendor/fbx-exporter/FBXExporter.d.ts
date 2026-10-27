/**
 * Public exporter facade — public API + plugin hook surface in the style of
 * three.js's GLTFExporter (examples/jsm/exporters/GLTFExporter.js: class
 * GLTFExporter at line 104).
 *
 * Usage:
 *   const exporter = new FBXExporter();
 *   const bytes = await exporter.parseAsync(scene, options);
 *   fs.writeFileSync('out.fbx', bytes);
 *
 * Sync vs async — parseSync works for scenes with no textures OR with
 * DataTextures only (our PNG encoder is synchronous). HTMLImageElement /
 * ImageBitmap / canvas-backed Textures require the async `canvas.toBlob`
 * pipeline; use parseAsync (or pass `options.embedTextures: false` to
 * skip).
 */
interface Object3DLike {
    uuid: string;
    name?: string;
    traverse: (cb: (o: any) => void) => void;
    updateMatrixWorld: (force?: boolean) => void;
    [key: string]: any;
}
interface AnimationClipLike {
    name: string;
    duration: number;
    tracks: unknown[];
}
export type FBXAxis = 'X' | 'Y' | 'Z' | '-X' | '-Y' | '-Z';
export type FBXPreset = 'threejs' | 'unity' | 'unreal' | 'blender' | 'maya';
export interface FBXExportOptions {
    /** Tool preset: picks axisUp / axisForward / unitScale / bakeSpaceTransform defaults. */
    preset?: FBXPreset;
    /** Overrides preset.axisUp. */
    axisUp?: FBXAxis;
    /** Overrides preset.axisForward. */
    axisForward?: FBXAxis;
    /** Written to GlobalSettings.UnitScaleFactor. */
    unitScale?: number;
    /** Pre-multiply axis matrix into Vertices+Normals (geometry-only). */
    bakeSpaceTransform?: boolean;
    /** FBX format version (7400 or 7500 supported). */
    version?: number;
    /** Animation framerate (default 24). */
    fps?: number;
    /** Embed texture image bytes vs reference by path. */
    embedTextures?: boolean;
    /** Explicit AnimationClip array (otherwise collected from input.animations). */
    animations?: AnimationClipLike[];
    /** Set false to skip the entire AnimStack/Curve emit. */
    includeAnimations?: boolean;
    /** Skip Object3Ds with .visible === false. */
    onlyVisible?: boolean;
    /** Predicate filter — return false to skip an object. */
    objectFilter?: (object: Object3DLike) => boolean;
    /** Emit Object3D.userData as user-defined Properties70 (U flag). */
    customProperties?: boolean;
    /** Override the FBX Creator metadata string. */
    creator?: string;
}
/** Plugin callback signature — receives the collected SceneData before serialization. */
export type FBXExporterPlugin = (sceneData: any) => void;
export declare class FBXExporter {
    pluginCallbacks: FBXExporterPlugin[];
    /** GLTFExporter-style plugin registration. */
    register(callback: FBXExporterPlugin): this;
    unregister(callback: FBXExporterPlugin): this;
    /**
     * Synchronous parse. Texture embedding only works for DataTextures
     * (encoded via the inline PNG encoder). HTMLImage / canvas textures must
     * go through parseAsync.
     */
    parseSync(input: Object3DLike, options?: FBXExportOptions): Uint8Array;
    parse(input: Object3DLike, onDone: (bytes: Uint8Array) => void, onError?: (err: Error) => void, options?: FBXExportOptions): void;
    /** Asynchronous parse — waits for canvas-based texture encodings. */
    parseAsync(input: Object3DLike, options?: FBXExportOptions): Promise<Uint8Array>;
}
export {};
//# sourceMappingURL=FBXExporter.d.ts.map