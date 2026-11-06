// Reproject corner evidence onto the working mesh without changing its UV or
// geometry. Working UV tools retain the original triangle/corner order.
export function projectSculptResponse(source,working,field){
 if(field?.algorithm!=='sculpt-corner-response-v1'||field.sourceSHA256!==source.sourceSHA256||!(field.corners instanceof Float32Array)||field.corners.length!==source.indices.length||working.indices.length!==source.indices.length||field.corners.some(v=>!Number.isFinite(v)||v<0||v>1))throw Error('局部雕刻响应不属于当前源模型。');
 const n=working.pos.length/3,values=new Float32Array(n),counts=new Uint32Array(n);
 for(let c=0;c<working.indices.length;c++){const id=working.indices[c];if(id>=n)throw Error('局部雕刻响应的工作顶点无效。');values[id]+=field.corners[c];counts[id]++;}
 for(let i=0;i<n;i++)values[i]=counts[i]?values[i]/counts[i]:0;return values;
}
export function sculptReliefFactors(preserve,score){const p=Math.max(0,Math.min(1,preserve)),s=Math.max(0,Math.min(1,score));return{broad:(1-p*s*.9)/Math.max(.1,1-p*.9),medium:(1-p*s*.5)/Math.max(.5,1-p*.5)};}
