/**
 * Emit AnimationStack / AnimationLayer / AnimationCurveNode / AnimationCurve
 * nodes, plus their OO / OP connections.
 *
 * Per stack, we emit:
 *   AnimationStack (uid)            — Properties70.LocalStart/Stop/ReferenceStart/Stop (KTime)
 *   AnimationLayer (uid)            — one per stack
 *   AnimationCurveNode (uid×K)      — one per (target, property), Properties70 has d|X/d|Y/d|Z initial values
 *   AnimationCurve (uid×3K)         — one per axis, KeyTime / KeyValueFloat / KeyAttrFlags
 *
 * Connections (OO + OP):
 *   OO  AnimLayer → AnimStack
 *   OO  AnimCurveNode → AnimLayer
 *   OP  AnimCurveNode → Model   relationship: "Lcl Translation" / "Lcl Rotation" / "Lcl Scaling"
 *   OP  AnimCurve → AnimCurveNode  relationship: "d|X" / "d|Y" / "d|Z"
 */
/**
 * @param {object} ctx
 * @param {FBXElem} ctx.parent       Objects container
 * @param {object[]} ctx.stacks      output of animationCollector.buildAnimationPlan
 * @param {TemplateBundle} ctx.templates
 */
export declare function writeAnimationNodes({ parent, stacks, templates }: {
    parent: any;
    stacks: any;
    templates: any;
}): void;
//# sourceMappingURL=animation.d.ts.map