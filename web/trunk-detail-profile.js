// Optional authoring profile. The exporter still delivers resolved wood geometry.
const clamp = (v,a,b) => Math.max(a,Math.min(b,v));
export const TRUNK_DETAIL_PROFILE_LIMIT = 25;
export function normalizeTrunkDetailProfile(raw) {
  if (!raw || raw.version !== 1 || !Array.isArray(raw.points) || raw.points.length < 3 || raw.points.length > TRUNK_DETAIL_PROFILE_LIMIT) return null;
  const points = raw.points.map(p => ({x:Number(p?.x),y:Number(p?.y)}));
  if (points.some(p=>!Number.isFinite(p.x)||!Number.isFinite(p.y)||p.x < -1||p.x > 1||p.y < -1||p.y > 1)) return null;
  if (points[0].x !== -1 || points.at(-1).x !== 1 || points[0].y !== 0 || points.at(-1).y !== 0) return null;
  if (points.some((p,i)=>i && p.x-points[i-1].x < .02-1e-10)) return null;
  return {version:1,interpolation:raw.interpolation === 'LINEAR' ? 'LINEAR' : 'SMOOTH',points};
}
export function createTrunkDetailProfileSampler(raw) {
  const profile = normalizeTrunkDetailProfile(raw);
  if (!profile) return () => 0;
  const points=profile.points;
  // Cubic easing is bounded by its two knots, including sharp narrow features.
  return x => {
    if (!Number.isFinite(x)||x <= -1||x >= 1) return 0;
    let low=0,high=points.length-1;
    while(high-low>1){const mid=(low+high)>>1;if(points[mid].x <= x)low=mid;else high=mid;}
    const a=points[low],b=points[high];let u=(x-a.x)/(b.x-a.x);
    if(profile.interpolation==='SMOOTH')u=u*u*(3-2*u);
    return a.y+(b.y-a.y)*u;
  };
}
export function moveTrunkDetailProfilePoint(raw,index,patch) {
  const profile=normalizeTrunkDetailProfile(raw);
  if(!profile||index <= 0||index >= profile.points.length-1)return profile;
  const p=profile.points[index];
  p.x=clamp(Number.isFinite(Number(patch.x))?Number(patch.x):p.x,profile.points[index-1].x+.02,profile.points[index+1].x-.02);
  p.y=clamp(Number.isFinite(Number(patch.y))?Number(patch.y):p.y,-1,1);
  return normalizeTrunkDetailProfile(profile);
}
export function insertTrunkDetailProfilePoint(raw,x,y) {
  const profile=normalizeTrunkDetailProfile(raw);
  if(!profile||profile.points.length>=TRUNK_DETAIL_PROFILE_LIMIT||!Number.isFinite(x)||!Number.isFinite(y))return null;
  const index=profile.points.findIndex(p=>p.x>x);
  if(index<1||x-profile.points[index-1].x<.02||profile.points[index].x-x<.02)return null;
  profile.points.splice(index,0,{x,y:clamp(y,-1,1)});return normalizeTrunkDetailProfile(profile);
}
export function removeTrunkDetailProfilePoint(raw,index) {
  const profile=normalizeTrunkDetailProfile(raw);
  if(!profile||profile.points.length<=3||index<=0||index>=profile.points.length-1)return null;
  profile.points.splice(index,1);return normalizeTrunkDetailProfile(profile);
}
export function insertTrunkDetailProfilePointAfter(raw,index){
  const p=normalizeTrunkDetailProfile(raw);if(!p||!Number.isInteger(index)||index<0||index>=p.points.length)return null;
  const i=Math.min(index,p.points.length-2),x=(p.points[i].x+p.points[i+1].x)/2;
  return insertTrunkDetailProfilePoint(p,x,createTrunkDetailProfileSampler(p)(x));
}
const shape=(points,interpolation='SMOOTH')=>Object.freeze({version:1,interpolation,points:points.map(([x,y])=>Object.freeze({x,y}))});
export const TRUNK_DETAIL_PROFILES=Object.freeze([
  {id:'V_GROOVE',name:'V 形沟',shape:shape([[-1,0],[0,-1],[1,0]],'LINEAR')},
  {id:'U_GROOVE',name:'圆底沟',shape:shape([[-1,0],[-.5,-.65],[0,-1],[.5,-.65],[1,0]])},
  {id:'FLAT_GROOVE',name:'平底沟',shape:shape([[-1,0],[-.45,-1],[.45,-1],[1,0]])},
  {id:'ROUND_RIDGE',name:'圆脊',shape:shape([[-1,0],[-.5,.65],[0,1],[.5,.65],[1,0]])},
  {id:'SHARP_RIDGE',name:'尖脊',shape:shape([[-1,0],[0,1],[1,0]],'LINEAR')},
  {id:'ROLLED_EDGE',name:'沟与卷边',shape:shape([[-1,0],[-.65,.55],[-.2,-1],[.3,-.45],[.65,.8],[1,0]])},
  {id:'OFFSET_GROOVE',name:'偏心沟',shape:shape([[-1,0],[-.65,-.85],[-.3,-1],[.45,-.2],[1,0]])},
  {id:'DOUBLE_RIDGE',name:'双脊夹沟',category:'沟脊组合',tags:['裂缝','卷边'],shape:shape([[-1,0],[-.65,.65],[-.25,-.5],[0,-.8],[.25,-.5],[.65,.65],[1,0]])},
  {id:'SLANTED_CUT',name:'斜肩裂口',category:'凹陷沟槽',tags:['伤痕','偏心'],shape:shape([[-1,0],[-.7,.15],[-.2,-1],[.1,-.65],[.7,-.15],[1,0]],'LINEAR')},
  {id:'PLATE_RIDGE',name:'平顶厚脊',category:'凸起脊线',tags:['宽脊','板根'],shape:shape([[-1,0],[-.5,.2],[-.3,.8],[.3,.8],[.5,.2],[1,0]])},
  {id:'SHALLOW_LIP',name:'浅槽细脊',category:'沟脊组合',tags:['细沟','疤结'],shape:shape([[-1,0],[-.55,-.35],[-.1,-.45],[.35,.35],[.65,.2],[1,0]])},
]);
