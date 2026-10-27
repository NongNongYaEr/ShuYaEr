/**
 * Little-endian binary stream writer backed by a growing ArrayBuffer.
 */
export declare class BinaryWriter {
    _buf: ArrayBuffer;
    _view: DataView;
    _u8: Uint8Array;
    _offset: number;
    constructor(initialCapacity?: number);
    get length(): number;
    tell(): number;
    _ensure(n: number): void;
    writeU8(v: number): void;
    writeI8(v: number): void;
    writeU16(v: number): void;
    writeI16(v: number): void;
    writeU32(v: number): void;
    writeI32(v: number): void;
    writeF32(v: number): void;
    writeF64(v: number): void;
    writeU64(v: number | bigint): void;
    writeI64(v: number | bigint): void;
    /** Append raw bytes (Uint8Array). */
    writeBytes(u8: Uint8Array): void;
    /** Append a UTF-8 encoded string with no length prefix. */
    writeUtf8(str: string): void;
    /** Fill N zero bytes. */
    writeZeros(n: number): void;
    /** Return a tightly-sized Uint8Array view of the written bytes. */
    toUint8Array(): Uint8Array;
    /** Return a tightly-sized ArrayBuffer. */
    toArrayBuffer(): ArrayBufferLike;
}
//# sourceMappingURL=BinaryWriter.d.ts.map