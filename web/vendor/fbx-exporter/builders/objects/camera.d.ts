/**
 * three.js Camera → FBX `NodeAttribute::Camera`.
 *
 * Supported types:
 *   PerspectiveCamera   → CameraProjectionType=0
 *   OrthographicCamera  → CameraProjectionType=1  (FBXLoader logs a warning
 *                                                  and falls back to Object3D;
 *                                                  Maya / Unreal handle it.)
 *
 * FBXLoader.js:1140-1227 reads:
 *   CameraProjectionType   → 0 perspective / 1 orthographic
 *   NearPlane              → near / 1000   ← three.js FBXLoader quirk
 *   FarPlane               → far  / 1000   ← same quirk
 *   AspectWidth / Height   → aspect = w/h
 *   FieldOfView            → fov (degrees, used directly)
 *   FocalLength            → camera.setFocalLength()
 *
 * On the near/far division: FBXLoader hardcodes /1000, presumably assuming
 * the file is in millimeters. We written values are
 * `near × settings.unitScale`. Three.js → FBX → three.js round-trip of
 * near/far is off by 1/(1000/unitScale), a known three.js FBXLoader issue.
 */
/**
 * @param {object}      ctx
 * @param {FBXElem}     ctx.parent
 * @param {Camera}      ctx.camera
 * @param {bigint}      ctx.attrUid
 * @param {TemplateBundle} ctx.templates
 * @param {object}      [ctx.settings]
 */
export declare function writeCameraAttribute({ parent, camera, attrUid, templates, settings }: any): void;
//# sourceMappingURL=camera.d.ts.map