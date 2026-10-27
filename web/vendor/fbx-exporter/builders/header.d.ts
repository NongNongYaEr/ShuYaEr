/**
 * Emit FBXHeaderExtension, FileId, CreationTime, Creator, GlobalSettings,
 * Documents and References.
 */
/**
 * @param {object} ctx
 * @param {object} ctx.root        FBXElem root container
 * @param {object} ctx.settings    user options
 * @param {string} ctx.sceneName   scene name (becomes the FBX Document name)
 * @param {object} ctx.uidRegistry UidRegistry for document UID allocation
 */
export declare function writeHeaderSection({ root, settings, sceneName }: {
    root: any;
    settings: any;
    sceneName?: string;
}): void;
//# sourceMappingURL=header.d.ts.map