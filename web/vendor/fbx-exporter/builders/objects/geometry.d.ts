/**
 * BufferGeometry → FBX `Geometry` node.
 *
 * Specialised for three.js geometry, which:
 *   - is always tessellated as triangles (no n-gons),
 *   - stores attributes in flat typed arrays,
 *   - optionally has an index buffer; without one, position is per-vertex
 *     in draw order.
 *
 * The output layout matches three.js FBXLoader (genGeometry / parseGeoNode):
 *   - Vertices            float64[]
 *   - PolygonVertexIndex  int32[]  (every 3rd index XOR -1 → face terminator)
 *   - Edges               int32[]  (loop indices, empty for our case is fine)
 *   - GeometryVersion     124
 *   - LayerElementNormal     ByPolygonVertex / IndexToDirect
 *   - LayerElementUV[]       ByPolygonVertex / IndexToDirect (uv, uv1, uv2, uv3)
 *   - LayerElementColor      ByPolygonVertex / IndexToDirect
 *   - LayerElementMaterial   AllSame / IndexToDirect (single material) or
 *                            ByPolygon / IndexToDirect (multi-material via groups)
 *   - Layer                  TOC referencing the elements above
 */
/**
 * @param {object} ctx
 * @param {object} ctx.parent       FBXElem to attach the Geometry node to (usually Objects)
 * @param {BufferGeometry} ctx.geometry
 * @param {bigint} ctx.uid
 * @param {string} ctx.name
 * @param {import('../../core/templates.js').TemplateBundle} ctx.templates
 * @param {number} ctx.materialSlotCount  number of unique FBX materials linked to this mesh
 * @param {Array<{ start: number, count: number, materialIndex: number }>} ctx.groups
 *        Forwarded from the Mesh; we use it to emit LayerElementMaterial when > 1 slot.
 * @param {number[]} [ctx.slotRemap]  Maps `mesh.material[i]` index → FBX-side
 *        material slot, accounting for duplicate Material instances being
 *        deduped on export.
 */
export declare function writeGeometry(ctx: any): void;
//# sourceMappingURL=geometry.d.ts.map