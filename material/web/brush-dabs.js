// Filter repeated samples within a gesture by physical spacing, never by triangle barycentric scale.
export function shouldSkipDab(mesh,previous,next,{sameGesture=false,actualHeightMeters=10}={}){
  if(!sameGesture||!previous||previous.face!==next.face||next.operation==='smooth')return false;
  for(const key of ['value','operation','radiusMeters','hardness','strength'])if(previous[key]!==next[key])return false;
  const ids=[0,1,2].map(c=>mesh.indices[next.face*3+c]),b=next.bary[1]-previous.bary[1],c=next.bary[2]-previous.bary[2],delta=[0,1,2].map(k=>(mesh.pos[ids[1]*3+k]-mesh.pos[ids[0]*3+k])*b+(mesh.pos[ids[2]*3+k]-mesh.pos[ids[0]*3+k])*c),meters=Math.hypot(...delta)*actualHeightMeters/mesh.height;
  return meters<next.radiusMeters*.2;
}
