/**
 * FBX property type tags (single byte stored in front of each property in the binary stream).
 *
 * Scalars use uppercase ASCII; arrays use lowercase. Array properties are followed by a
 * `(length, encoding, comp_len)` header — see FBXElem._addArrayHelper.
 */
export declare const BOOL: number;
export declare const CHAR: number;
export declare const INT8: number;
export declare const INT16: number;
export declare const INT32: number;
export declare const INT64: number;
export declare const FLOAT32: number;
export declare const FLOAT64: number;
export declare const BYTES: number;
export declare const STRING: number;
export declare const INT32_ARRAY: number;
export declare const INT64_ARRAY: number;
export declare const FLOAT32_ARRAY: number;
export declare const FLOAT64_ARRAY: number;
export declare const BOOL_ARRAY: number;
export declare const BYTE_ARRAY: number;
/** Threshold above which array payloads are zlib-compressed (encoding=1). */
export declare const ARRAY_COMPRESS_THRESHOLD = 128;
//# sourceMappingURL=dataTypes.d.ts.map