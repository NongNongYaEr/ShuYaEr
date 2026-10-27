// Reusable circle shapes only: no branch IDs, positions, roots or assembly.
const tau=Math.PI*2,positive=x=>Math.max(0,x);
function contour(id,name,category,sample,{count=10,oval=1,final=false,tags=[]}={}){
  const points=n=>Array.from({length:n},(_,i)=>({id:(final?'CHILD_':'MAIN_')+i,angle:i*360/n,radius:sample(i*tau/n)}));
  return Object.freeze({id:'builtin-'+id,name,category,tags:Object.freeze(tags),shape:Object.freeze({geometry_version:2,...(final?{profile_scope:'FINAL'}:{}),profile_coarse:points(final?10:count),radius:1,oval,roll:0,profile:points(count)})});
}
export const TRUNK_MAIN_PRESETS=Object.freeze([
  contour('main-natural-round','自然圆润干','常规干形',a=>1+.06*Math.cos(3*a)+.04*Math.sin(5*a),{tags:['柔和','主点']}),
  contour('main-offset-heart','偏心老干','偏心轮廓',a=>1+.22*Math.cos(a)+.13*Math.cos(2*a-1),{tags:['不对称','偏侧']}),
  contour('main-pressed-oval','扁平受压干','常规干形',a=>1+.035*Math.sin(3*a),{oval:1.65,tags:['椭圆','扁干']}),
  contour('main-double-ridge','双侧宽脊','纵向起伏',a=>1+.2*Math.cos(2*a)+.08*Math.sin(a),{tags:['双脊','宽褶']}),
  contour('main-five-lobe','五瓣浅起伏','纵向起伏',a=>1+.2*Math.cos(5*a),{tags:['五脊','浅褶']}),
  contour('main-root-three','三向板根根盘','根盘板根',a=>1+.9*positive(Math.cos(3*a))**4,{count:12,tags:['根部','三板根']}),
  contour('main-root-five','五向板根根盘','根盘板根',a=>1+.8*positive(Math.cos(5*a))**4,{tags:['根部','五板根']}),
  contour('main-root-slope','偏坡展开根盘','根盘板根',a=>1+.6*positive(Math.cos(3*a+.6))**4+.45*positive(Math.cos(a-1))**2,{count:12,tags:['坡地','不对称','根部']}),
]);
export const TRUNK_CHILD_PRESETS=Object.freeze([
  contour('child-fine-cracks','细密纵裂轮廓','细褶精修',a=>1-.2*positive(Math.cos(8*a))**4,{count:96,final:true,tags:['细沟','子点']}),
  contour('child-wide-valleys','宽谷深褶轮廓','细褶精修',a=>1-.34*positive(Math.cos(5*a))**2,{count:96,final:true,tags:['深沟','宽沟']}),
  contour('child-offset-folds','偏心老褶轮廓','偏心轮廓',a=>1+.14*Math.sin(a)-.27*positive(Math.cos(6*a+.15*Math.sin(3*a)))**2,{count:96,final:true,tags:['不规则','老树']}),
  contour('child-double-roll','双卷树脊轮廓','细褶精修',a=>1+.22*positive(Math.cos(2*a))**3-.12*positive(Math.sin(4*a))**4,{count:96,final:true,tags:['卷边','隆脊']}),
  contour('child-open-folds','疏褶起伏轮廓','细褶精修',a=>1+.15*Math.cos(4*a)-.1*positive(Math.cos(4*a+.7))**4,{count:96,final:true,tags:['浅沟','宽脊']}),
  contour('child-root-folds','板根褶边轮廓','根盘板根',a=>1+.6*positive(Math.cos(3*a))**4-.12*positive(Math.cos(9*a+.5))**2,{count:96,final:true,tags:['根部','根盘','细沟']}),
]);
