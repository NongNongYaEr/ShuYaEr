/**
 * Collect three.js AnimationClip[] from a scene and turn them into the FBX
 * `AnimStack → AnimLayer → AnimCurveNode → AnimCurve` structure.
 *
 * The output is a plan, not bytes. Bytes are emitted by builders/objects/
 * animation.js using these structures.
 */
/**
 * Gather every AnimationClip in the scene without duplicates.
 *
 * three.js stores clips in different places depending on the loader:
 * - GLTFLoader puts them on the imported scene (root.animations).
 * - FBXLoader stores them on the returned Group (root.animations).
 * - Manual code sometimes attaches them to specific objects.
 *
 * We walk the whole tree and dedupe by reference.
 */
export declare function collectAnimationClips(input: any): any[];
/**
 * Build the per-clip animation plan.
 *
 * @param {object} ctx
 * @param {Object3D}        ctx.root        scene root
 * @param {AnimationClip[]} ctx.clips
 * @param {UidRegistry}     ctx.uids
 * @param {TemplateBundle}  ctx.templates
 * @param {object}          ctx.settings
 * @param {object[]}        [ctx.meshes]    SceneCollector mesh entries — used
 *                                          to resolve `Mesh.morphTargetInfluences[N]`
 *                                          tracks back to the right
 *                                          BlendShapeChannel UID.
 * @returns {object[]} stacks
 */
export declare function buildAnimationPlan({ root, clips, uids, templates, settings, meshes }: {
    root: any;
    clips: any;
    uids: any;
    templates: any;
    settings: any;
    meshes?: any[];
}): any[];
//# sourceMappingURL=animationCollector.d.ts.map