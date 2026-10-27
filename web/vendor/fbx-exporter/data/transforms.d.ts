/**
 * Coordinate space / unit scaling helpers.
 *
 * Two responsibilities:
 *
 *  1. Resolve a `preset` (`'unity' | 'unreal' | 'blender' | 'maya' | 'threejs'`)
 *     into concrete `axisUp` / `axisForward` / `unitScale` /
 *     `bakeSpaceTransform` settings. Three.js itself uses Y-up + Z-forward
 *     (same as Blender / Maya / Unity defaults). Only Unreal needs a different
 *     axis convention (Z-up, X-forward).
 *
 *  2. Compute the `globalMatrix` that maps three.js coordinates to the
 *     target axis convention, plus its inverse-transposed companion for
 *     normal vectors.
 *
 * When `bakeSpaceTransform: true`, the matrix is applied to vertex positions
 * + normals during geometry export. Object transforms keep
 * their original local TRS — only the geometry data shifts.
 *
 * When `bakeSpaceTransform: false`, the FBX file's GlobalSettings UpAxis /
 * FrontAxis / CoordAxis fields tell importers how to re-orient; vertices
 * stay in three.js's coordinate space. This is the lighter-touch option but
 * less portable (some importers ignore the axis fields).
 */
import { Matrix4 } from 'three';
/**
 * Tool-specific export presets. Picks the right axis conventions for
 * common targets so users don't memorise the FBX encoding.
 *
 * - threejs: identity output (Y-up Z-forward, meters). Matches three.js
 *   FBXLoader's expectations for clean round-trip.
 * - unity:   same as threejs (Unity defaults to Y-up Z-forward and the
 *   FBX importer respects file axes).
 * - unreal:  Z-up + X-forward (Unreal's native convention). bake disabled
 *   so the file declares axes in GlobalSettings and Unreal's own importer
 *   handles the rotation. See "About bakeSpaceTransform" below.
 * - blender: Y-up Z-forward. unitScale=100 because Blender stores meters
 *   but the FBX spec expects centimeters as the canonical unit.
 * - maya:    same as blender.
 *
 * Each preset is the DEFAULT; user-provided `axisUp` / `axisForward` /
 * `unitScale` / `bakeSpaceTransform` in options override the preset.
 *
 * About bakeSpaceTransform — known limitations:
 *   When bake=true, ONLY Vertices and Normals are pre-multiplied by
 *   globalMatrix. Object Lcl transforms, Cluster matrices, animation
 *   curves, and light/camera transforms are NOT baked. This means bake=true
 *   produces an internally INCONSISTENT file for any scene with non-
 *   origin object placement, skinning, animation, or lights/cameras.
 *
 *   For most workflows, leave bake=false: the FBX file declares its axes
 *   in GlobalSettings.UpAxis/FrontAxis/CoordAxis and modern importers
 *   (Unity, Unreal, Blender, Maya) respect them. The flag is kept as an
 *   opt-in for the narrow "single mesh, no transforms" Unreal asset case.
 */
export declare const PRESETS: {
    threejs: {
        axisUp: string;
        axisForward: string;
        unitScale: number;
        bakeSpaceTransform: boolean;
    };
    unity: {
        axisUp: string;
        axisForward: string;
        unitScale: number;
        bakeSpaceTransform: boolean;
    };
    unreal: {
        axisUp: string;
        axisForward: string;
        unitScale: number;
        bakeSpaceTransform: boolean;
    };
    blender: {
        axisUp: string;
        axisForward: string;
        unitScale: number;
        bakeSpaceTransform: boolean;
    };
    maya: {
        axisUp: string;
        axisForward: string;
        unitScale: number;
        bakeSpaceTransform: boolean;
    };
};
/**
 * Apply a preset's defaults to a settings object. Explicit option values
 * always win over the preset; absent (undefined) keys fall through to the
 * preset value.
 *
 * If no `preset` is named, the 'threejs' preset is used as the fallback so
 * unset axis/unit keys land on sane Y-up Z-forward / scale=1 defaults.
 */
export declare function resolvePreset(settings: any): any;
/**
 * Build a rotation matrix that maps three.js's (Y-up, -Z-forward) axes to
 * the FBX file's chosen (axisUp, axisForward) axes.
 */
export declare function buildAxisMatrix(axisUp: any, axisForward: any): Matrix4;
/**
 * Resolve a settings bag into a full `transformContext`:
 *   - `globalMatrix`: axis + scale matrix to apply if bakeSpaceTransform
 *   - `globalMatrixInvTransposed`: for normals (translation stripped + normalized)
 *   - `bake`: whether vertex/normal data should be pre-multiplied
 *   - `unitScale`: the resolved UnitScaleFactor to write into GlobalSettings
 */
export declare function buildTransformContext(settings: any): {
    axisUp: any;
    axisForward: any;
    unitScale: any;
    bake: boolean;
    globalMatrix: Matrix4;
    globalMatrixInvTransposed: Matrix4;
    isIdentity: boolean;
};
/**
 * In-place apply a Matrix4 (rotation + uniform/non-uniform scale) to a
 * flat XYZ Float64 vertex buffer. Matrix is column-major Matrix4.elements.
 */
export declare function bakeVertices(verts: any, matrix: any): void;
/**
 * In-place apply a Matrix4's rotation (3x3 upper-left) to a flat XYZ Float64
 * normal buffer. Caller passes the INVERSE-TRANSPOSED matrix (build via
 * buildTransformContext). Optionally normalises if the source matrix had
 * scale.
 */
export declare function bakeNormals(normals: any, invTransposed: any): void;
//# sourceMappingURL=transforms.d.ts.map