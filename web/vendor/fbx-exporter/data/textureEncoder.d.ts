/**
 * Minimal PNG encoder + canvas-based fallback for converting three.js
 * textures into bytes that FBX can embed.
 *
 * Why custom: GLTFExporter uses HTMLCanvasElement.toBlob, which is browser-
 * only. Our exporter has to also work in Node for tests. DataTexture
 * (raw pixels in a Uint8Array) is the only thing we can reliably encode in
 * Node without a JSDOM/canvas-node setup, so we write a tiny PNG encoder
 * for that path. Browser textures (HTMLImageElement / ImageBitmap / canvas
 * sources) still go through the canvas path.
 */
/**
 * Encode an RGBA8 pixel buffer to a PNG bytes blob.
 *
 * Input: `rgba` is a Uint8Array of length `width × height × 4` with
 * row-major layout (row 0 at the top — same convention as the canvas
 * 2D context and three.js `DataTexture.image.data` when `flipY === false`).
 */
export declare function encodeRGBA8PNG(rgba: any, width: any, height: any): Uint8Array<ArrayBuffer>;
/**
 * Encode any three.js Texture to PNG bytes.
 *
 * @returns {Promise<{ bytes: Uint8Array, extension: string }>}
 */
export declare function encodeTexture(texture: any): Promise<unknown>;
//# sourceMappingURL=textureEncoder.d.ts.map