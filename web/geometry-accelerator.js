let backend=null;
export const installGeometryAccelerator=value=>{backend=value;};
export const geometryAcceleratorState=()=>backend?{name:backend.name,...backend.stats}:{name:'javascript-reference'};
export function computeGeometryNormals(geometry){if(!backend?.normals(geometry))geometry.computeVertexNormals();}
export function computeGeometryTangents(geometry){if(!backend?.tangents(geometry))geometry.computeTangents();}
export const accelerateSurfaceTangents=(geometry,rings,seamOffset)=>backend?.surfaceTangents?.(geometry,rings,seamOffset)||false;
