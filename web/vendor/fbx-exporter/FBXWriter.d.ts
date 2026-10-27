/**
 * Pipeline orchestrator — produces a complete FBX `FBXElem` tree from a
 * collected SceneData, then hands it to `encodeBinaryFBX`.
 *
 * Drives the per-section builders in order:
 *   1. fbx_header_elements      → header.js
 *   2. fbx_documents_elements   → header.js (writeDocuments)
 *   3. fbx_references_elements  → header.js
 *   4. fbx_definitions_elements → definitions.js
 *   5. fbx_objects_elements     → builders/objects/*
 *   6. fbx_connections_elements → connections.js
 *   7. fbx_takes_elements       → empty Takes stub
 */
/**
 * @param {ReturnType<import('./data/SceneCollector.js').collectScene>} sceneData
 * @returns {Uint8Array}
 */
export declare function writeFBX(sceneData: any): Uint8Array<ArrayBufferLike>;
//# sourceMappingURL=FBXWriter.d.ts.map