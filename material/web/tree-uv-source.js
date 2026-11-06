// Old UV seams duplicate vertices. Feed the native chart builder a stable
// source-order copy, then restore exact current-workmesh corner references.
export function canonicalTreeUvInput(guided,source){
 if(!guided.mesh)return null;const used=new Uint8Array(source.pos.length/3);for(const f of guided.remainingFaces)for(let c=0;c<3;c++)used[source.indices[f*3+c]]=1;
 const vertices=[],map=new Int32Array(used.length).fill(-1);for(let i=0;i<used.length;i++)if(used[i]){map[i]=vertices.length;vertices.push(i);}const pos=new Float32Array(vertices.length*3),normal=new Float32Array(vertices.length*3),uv=new Float32Array(vertices.length*2),indices=new Uint32Array(guided.mesh.indices.length);
 for(let i=0;i<vertices.length;i++){const old=vertices[i];pos.set(source.pos.subarray(old*3,old*3+3),i*3);normal.set(source.normal.subarray(old*3,old*3+3),i*3);uv.set(source.uv.subarray(old*2,old*2+2),i*2);}
 for(let f=0;f<guided.remainingFaces.length;f++)for(let c=0;c<3;c++)indices[f*3+c]=map[source.indices[guided.remainingFaces[f]*3+c]];
 return{input:{pos,normal,uv,indices,faceGroups:guided.mesh.faceGroups.slice()},expectedIndices:indices.slice()};
}
export function restoreTreeUvCorners(guided,native,expected){
 if(native.indices.length!==expected.length)throw Error('树结构UV源面数量不一致。');const count=expected.length,pos=new Float32Array(count*3),normal=new Float32Array(count*3),uv=new Float32Array(count*2),sourceIndices=guided.mesh.indices.slice(),indices=Uint32Array.from({length:count},(_,i)=>i);
 for(let c=0;c<count;c++){const v=native.indices[c],old=sourceIndices[c];if(native.sourceIndices[v]!==expected[c])throw Error('树结构UV源面角顺序不一致。');for(let k=0;k<3;k++){const p=guided.mesh.pos[old*3+k],n=guided.mesh.normal[old*3+k];if(native.pos[v*3+k]!==p||native.normal[v*3+k]!==n)throw Error('树结构UV不能改变源位置或法线。');pos[c*3+k]=p;normal[c*3+k]=n;}uv.set(native.uv.subarray(v*2,v*2+2),c*2);}
 return{pos,normal,uv,indices,sourceIndices};
}
