/**
 * SkinnedMesh → FBX skinning nodes.
 *
 *   1. `Deformer (Skin)`   — one per SkinnedMesh; holds skin metadata.
 *   2. `Deformer (Cluster)` (a.k.a. SubDeformer) — one per bone per skin;
 *       carries per-vertex Indexes/Weights and the bind-time bone transforms.
 *   3. `Pose (BindPose)`   — one per SkinnedMesh; PoseNode subtree pinning the
 *       mesh + each bone's world matrix at bind time.
 *
 * Matrix encoding: FBX stores 4×4 matrices as a flat 16-element float64 array
 * in COLUMN-MAJOR order. three.js's `Matrix4.elements` is already column-major
 * (Matrix4.js docstring), so we write `.elements` verbatim — no transpose.
 */
/**
 * Write the Skin Deformer + per-bone Cluster nodes for one SkinnedMesh.
 *
 * @param {object} ctx
 * @param {FBXElem} ctx.parent       Objects container
 * @param {Object}  ctx.skin         SceneCollector skin entry (deformerUid, clusters[])
 * @param {string}  ctx.armatureName  Name to embed in the Deformer attrName
 */
export declare function writeSkinDeformer({ parent, skin, armatureName }: {
    parent: any;
    skin: any;
    armatureName?: string;
}): void;
/**
 * Write the BindPose record for a SkinnedMesh.
 *
 * The BindPose lists every Model (mesh + bones) along with its world matrix
 * at the bind moment. FBXLoader's parsePoseNodes (FBXLoader.js:1611) reads
 * this as a fallback bind pose for bones not in a cluster — for our purposes
 * it's a courtesy to other DCC tools.
 */
export declare function writeBindPose({ parent, skin, meshUid, meshName }: {
    parent: any;
    skin: any;
    meshUid: any;
    meshName: any;
}): void;
//# sourceMappingURL=skin.d.ts.map