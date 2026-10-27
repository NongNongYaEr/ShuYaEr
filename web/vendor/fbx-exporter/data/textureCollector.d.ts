/**
 * Detect textures on three.js materials and build a plan of FBX
 * Texture + Video records to emit.
 *
 * Three.js material slot → FBX property name mapping is derived from
 * FBXLoader.parseParameters (FBXLoader.js:668-723) — we round-trip with
 * the same names the loader recognises.
 *
 * Texture encoding is asynchronous (canvas.toBlob is async) so this module
 * exposes two phases:
 *   - collectTextures(...)        synchronous: detect, allocate UIDs, build
 *                                  connections.
 *   - encodeTextures(plan)        async: fills in the per-texture image
 *                                  bytes by calling textureEncoder.encodeTexture.
 */
export declare const TEXTURE_SLOTS: {
    map: string;
    emissiveMap: string;
    normalMap: string;
    bumpMap: string;
    alphaMap: string;
    specularMap: string;
    aoMap: string;
    displacementMap: string;
    envMap: string;
};
/**
 * Synchronously detect every texture used by `materials` and allocate the
 * FBX-side UIDs + connections. The texture-image bytes are filled in later
 * by `encodeTextures` (async).
 *
 * @param {object} ctx
 * @param {Map<Material, {uid: bigint}>} ctx.materials  output of SceneCollector
 * @param {UidRegistry}    ctx.uids
 * @param {TemplateBundle} ctx.templates
 * @param {Array<[string, bigint, bigint, string?]>} ctx.connections
 * @returns {object} plan — `{ textures: Map<Texture, entry> }`
 */
export declare function collectTextures({ materials, uids, templates, connections }: {
    materials: any;
    uids: any;
    templates: any;
    connections: any;
}): {
    textures: Map<any, any>;
};
/**
 * Asynchronously encode every texture in the plan. Run before passing the
 * plan to writeFBX so the Video Content bytes are populated.
 */
export declare function encodeTextures(plan: any): Promise<void>;
//# sourceMappingURL=textureCollector.d.ts.map