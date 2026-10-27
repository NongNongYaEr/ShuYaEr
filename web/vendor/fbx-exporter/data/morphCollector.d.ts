/**
 * Detect morph targets on a three.js Mesh and build the FBX-side BlendShape
 * plan: one `BlendShape` Deformer per mesh, one `BlendShapeChannel`
 * SubDeformer per morph target, one `Geometry (Shape)` per channel.
 *
 * Three.js stores morphs as `geometry.morphAttributes.position` (an array of
 * BufferAttributes, one per channel). `geometry.morphTargetsRelative` flags
 * whether they are deltas (true, common) or absolute positions (false).
 * FBX requires delta values; we convert if needed.
 *
 * `mesh.morphTargetDictionary` (set by GLTFLoader or manually) maps channel
 * name → index.
 */
/**
 * @param {object} ctx
 * @param {Mesh}    ctx.mesh
 * @param {UidRegistry}    ctx.uids
 * @param {TemplateBundle} ctx.templates
 * @returns {?object} morphPlan or null if the mesh has no morphs
 */
export declare function collectMorph({ mesh, uids, templates }: {
    mesh: any;
    uids: any;
    templates: any;
}): {
    mesh: any;
    geometry: any;
    blendShapeUid: any;
    channels: any[];
};
//# sourceMappingURL=morphCollector.d.ts.map