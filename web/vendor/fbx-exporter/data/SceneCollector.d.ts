/**
 * Walk a three.js scene, classify each object into FBX entity categories,
 * dedupe shared BufferGeometry / Material instances, allocate UIDs, register
 * template users, and build the OO/OP connection graph.
 */
/**
 * Build the export plan for `input`. Caller owns the result; pass it through
 * to the builders.
 */
export declare function collectScene(input: any, settings?: any): any;
//# sourceMappingURL=SceneCollector.d.ts.map