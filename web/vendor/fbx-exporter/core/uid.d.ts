/**
 * Stable string-key → 64-bit FBX UID generator with collision-resistant caching.
 *
 * FBX UIDs are signed int64. We keep generated values below 2^63
 * and resolve collisions by linear probing.
 */
/** FNV-1a hash over UTF-8 bytes of `s`, returned as BigInt in [0, 2^64). */
declare function fnv1a64(s: any): bigint;
export declare class UidRegistry {
    _keyToUid: Map<string, bigint>;
    _uidToKey: Map<bigint, string>;
    constructor();
    /**
     * Return a stable 64-bit UID for `key`. Two calls with the same string
     * return the same UID. Different strings get different UIDs (collisions
     * resolved by linear probing).
     *
     * @param {string} key
     * @returns {bigint}
     */
    get(key: any): bigint;
    /** Reverse lookup (debugging). */
    keyOf(uid: any): string;
    /** Number of allocated UIDs. */
    get size(): number;
}
/** Stable string key for an arbitrary scene entity. `id` is usually `object.uuid`. */
export declare function entityKey(typeName: any, id: any): string;
export declare function geometryKey(objectUuid: any): string;
export declare function materialKey(materialUuid: any): string;
export declare function textureKey(textureUuid: any): string;
export declare function videoKey(textureUuid: any): string;
export declare function modelKey(objectUuid: any): string;
export declare function boneKey(armatureUuid: any, boneUuid: any): string;
export declare function boneAttrKey(armatureUuid: any, boneUuid: any): string;
export declare function skinDeformerKey(armatureUuid: any, meshUuid: any): string;
export declare function clusterKey(armatureUuid: any, meshUuid: any, boneUuid: any): string;
export declare function bindPoseKey(objectUuid: any, meshUuid: any): string;
export declare function animStackKey(clipUuid: any): string;
export declare function animLayerKey(clipUuid: any): string;
export declare function animCurveNodeKey(clipUuid: any, targetUuid: any, propName: any): string;
export declare function animCurveKey(clipUuid: any, targetUuid: any, propName: any, axis: any): string;
export declare const documentKey: (name: any) => string;
export declare const blendShapeDeformerKey: (geometryUuid: any) => string;
export declare const blendShapeChannelKey: (geometryUuid: any, channelIndex: any, channelName: any) => string;
export declare const shapeGeometryKey: (geometryUuid: any, channelIndex: any, channelName: any) => string;
export declare const __testing__: {
    fnv1a64: typeof fnv1a64;
};
export {};
//# sourceMappingURL=uid.d.ts.map