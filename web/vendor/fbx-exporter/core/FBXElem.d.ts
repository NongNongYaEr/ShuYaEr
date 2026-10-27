/**
 * A single node in the FBX binary tree.
 *
 * Construct with `new FBXElem(id)` where `id` is an ASCII string ≤ 255 bytes.
 * Add typed properties via the `add*` methods and child nodes via `addChild`.
 *
 * Two-phase write: `_calcOffsets()` resolves end-offsets; `_write()` emits bytes.
 * Use the top-level `encodeBinaryFBX()` helper instead of calling these directly.
 */
export declare class FBXElem {
    id: string;
    _idBytes: Uint8Array;
    propsType: number[];
    propsData: Uint8Array[];
    elems: FBXElem[];
    _endOffset: number;
    _propsLength: number;
    constructor(id: string);
    addChild(elem: any): any;
    /** Create + add a child by id, optionally seeding props. */
    addEmpty(id: any): any;
    addBool(v: any): void;
    addChar(byte: any): void;
    addInt8(v: any): void;
    addInt16(v: any): void;
    addInt32(v: any): void;
    addInt64(v: any): void;
    addFloat32(v: any): void;
    addFloat64(v: any): void;
    /** Raw bytes property (FBX type tag 'R'). */
    addBytes(u8: any): void;
    /** String property (FBX type tag 'S'). FBX strings are length-prefixed bytes. */
    addString(str: any): void;
    /** Internal: encode a typed-array payload into FBX array prop format. */
    _addArray(typeTag: any, elementCount: any, rawBytes: any): void;
    addBoolArray(arr: any): void;
    addByteArray(arr: any): void;
    addInt32Array(arr: any): void;
    addInt64Array(arr: any): void;
    addFloat32Array(arr: any): void;
    addFloat64Array(arr: any): void;
    /**
     * Recursively compute end offsets.
     * `ctx` carries the version-dependent meta + sentinel sizes.
     * `isLast` indicates whether this elem is the last sibling at its level.
     */
    _calcOffsets(offset: any, isLast: any, ctx: any): any;
    _calcOffsetsChildren(offset: any, isLast: any, ctx: any): any;
    /** Emit bytes into the BinaryWriter. */
    _write(bw: any, isLast: any, ctx: any): void;
    _writeChildren(bw: any, isLast: any, ctx: any): void;
}
//# sourceMappingURL=FBXElem.d.ts.map