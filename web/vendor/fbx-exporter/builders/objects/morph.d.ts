/**
 * Emit BlendShape Deformer + BlendShapeChannel SubDeformers + Geometry(Shape)
 * nodes for morph targets on a mesh.
 *
 * For each mesh with morphs we produce:
 *   - 1 Deformer (BlendShape)                       — top-level
 *   - N Deformer (BlendShapeChannel) (SubDeformer)  — one per morph target
 *   - N Geometry (Shape)                            — delta geometry per target
 *
 * Connections (handled in SceneCollector pass 2):
 *   OO  BlendShape         → base Geometry
 *   OO  BlendShapeChannel  → BlendShape
 *   OO  ShapeGeometry      → BlendShapeChannel
 */
/**
 * @param {object} ctx
 * @param {FBXElem} ctx.parent       Objects container
 * @param {object}  ctx.morphPlan    output of morphCollector.collectMorph
 * @param {TemplateBundle} ctx.templates
 */
export declare function writeMorph({ parent, morphPlan, templates }: {
    parent: any;
    morphPlan: any;
    templates: any;
}): void;
//# sourceMappingURL=morph.d.ts.map