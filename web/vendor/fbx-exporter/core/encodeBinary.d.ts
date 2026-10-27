declare function versionContext(version: any): {
    use64: boolean;
    metaSize: number;
    sentinelSize: number;
};
/**
 * Serialize an FBXElem root tree to a binary FBX file buffer.
 *
 * `root` MUST be an FBXElem with an empty id (acts as an anonymous container of
 * top-level sections like FBXHeaderExtension, GlobalSettings, Documents, ...).
 *
 * Returns a Uint8Array.
 */
export declare function encodeBinaryFBX(root: any, { version }?: {
    version?: number;
}): Uint8Array<ArrayBufferLike>;
export declare const __testing__: {
    HEAD_MAGIC: Uint8Array<ArrayBuffer>;
    FOOT_ID: Uint8Array<ArrayBuffer>;
    TAIL_MAGIC: Uint8Array<ArrayBuffer>;
    TIME_ID: Uint8Array<ArrayBuffer>;
    FILE_ID: Uint8Array<ArrayBuffer>;
    versionContext: typeof versionContext;
};
export {};
//# sourceMappingURL=encodeBinary.d.ts.map