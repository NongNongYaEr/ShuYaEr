/**
 * Object3D → FBX `Model` node + optional `NodeAttribute` for "Null" empties.
 *
 * Property writes use the template-aware writer so values that match the
 * default in Definitions are omitted from the per-instance Properties70.
 */
/**
 * Write a single Model node.
 *
 * @param {object} ctx
 * @param {FBXElem} ctx.parent   `Objects` container
 * @param {Object3D} ctx.object
 * @param {bigint} ctx.uid
 * @param {TemplateBundle} ctx.templates
 */
export declare function writeModel({ parent, object, uid, templates, overrideTranslation, overrideMatrix, hasLookAtTarget, customProperties }: {
    parent: any;
    object: any;
    uid: any;
    templates: any;
    overrideTranslation?: any;
    overrideMatrix?: any;
    hasLookAtTarget?: any;
    customProperties?: any;
}): void;
/**
 * Write a `NodeAttribute` node for an Object3D / Group ("Null" empty).
 */
export declare function writeNullAttribute({ parent, name, uid, templates }: {
    parent: any;
    name: any;
    uid: any;
    templates: any;
}): void;
//# sourceMappingURL=model.d.ts.map