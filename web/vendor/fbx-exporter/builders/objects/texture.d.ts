/**
 * Emit FBX `Texture` + `Video` nodes for a three.js Texture.
 *
 * Texture node carries UV transform, wrap modes and the filename hint
 * FBXLoader uses to pick a TextureLoader. Video node carries the actual
 * `Content` bytes when embedded.
 *
 * Connection direction (handled in textureCollector / SceneCollector):
 *   OO  Video   → Texture   (FBXLoader.loadTexture reads `connections.get(tex.id).children[0]`)
 *   OP  Texture → Material  (relationship name picks the material slot)
 */
/**
 * @param {object} ctx
 * @param {FBXElem} ctx.parent
 * @param {object}  ctx.textureEntry  output of textureCollector.collectTextures
 * @param {TemplateBundle} ctx.templates
 */
export declare function writeTexture({ parent, textureEntry, templates }: {
    parent: any;
    textureEntry: any;
    templates: any;
}): void;
/**
 * Emit the Video node carrying (optionally) the embedded image bytes.
 */
export declare function writeVideo({ parent, textureEntry, templates }: {
    parent: any;
    textureEntry: any;
    templates: any;
}): void;
//# sourceMappingURL=texture.d.ts.map