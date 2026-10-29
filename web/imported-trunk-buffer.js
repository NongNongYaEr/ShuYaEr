// Copy the source-vertex mapping directly into the final GPU buffer. Avoid a
// temporary JS array and one slice array per vertex on high resolution meshes.
export function indexedTrunkAttribute(source,indices,size){
 const values=new Float32Array(indices.length*size);
 for(let i=0;i<indices.length;i++){const from=indices[i]*size,to=i*size;for(let k=0;k<size;k++)values[to+k]=source[from+k];}
 return values;
}
