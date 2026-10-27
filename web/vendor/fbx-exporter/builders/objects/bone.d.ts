/**
 * Bone → FBX `NodeAttribute` (LimbNode) node.
 *
 * (the "Bones data" sub-loop). Each Bone has:
 *   - NodeAttribute uid (separate from the Model uid),
 *   - subtype "LimbNode",
 *   - TypeFlags "Skeleton",
 *   - Properties70 from the Bone template (only `Size` is set per-instance;
 *     finalize emits anything else from the template).
 *
 * The Bone's own Model is written by writeModel (model.js) — the LimbNode
 * subtype is selected there.
 */
/**
 * @param {object} ctx
 * @param {FBXElem} ctx.parent       Objects container
 * @param {Bone}    ctx.bone         three.js Bone instance
 * @param {bigint}  ctx.attrUid      this NodeAttribute's allocated uid
 * @param {TemplateBundle} ctx.templates
 */
export declare function writeBoneAttribute({ parent, bone, attrUid, templates }: {
    parent: any;
    bone: any;
    attrUid: any;
    templates: any;
}): void;
//# sourceMappingURL=bone.d.ts.map