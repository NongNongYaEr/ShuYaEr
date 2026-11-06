// Automatic model-form effects. Source geometry chooses placement; PBR remains independent.
const n=(label,min,max,step,value,unit='')=>({kind:'number',label,min,max,step,value,unit,group:'material'});
const color=(value)=>({kind:'color',label:'色调',value,group:'material'});
function form(name,description,{tint,rough,amount=.55,keep=1,height=0,ao=.15,width=20,channels=['color','roughness','height','ao']}){return{name,description,layerKind:'adjustment',channels,fields:{formWidthCm:n('影响宽度',1,200,1,width,'cm'),formNaturalness:n('自然变化',0,1,.01,.45),formThreshold:n('识别阈值',0,.8,.01,.06),formRootHeightMeters:n('根部过渡高度',.01,200,.05,1.5,'m'),surfaceColor:color(tint),surfaceAmount:n('材质变化',0,1,.01,amount),surfaceRoughness:n('目标粗糙度',.05,1,.01,rough),surfaceNormalStrength:n('附加凹凸强度',0,3,.05,1),surfaceHeightMm:n('沉积细起伏',0,2,.01,height,'mm'),surfaceGrainCm:n('沉积颗粒尺寸',.1,10,.05,.6,'cm'),surfaceVariation:n('颗粒变化',0,1,.01,.4),surfaceAO:n('附加遮蔽',0,.8,.01,ao),surfaceBarkKeep:n('保留原树皮凹凸',0,1,.01,keep)}};}
export const FORM_EFFECT_TYPES={
 groove:form('沟槽沉积','自动沿模型凹槽和遮蔽区域叠加沉积色差与粗糙度。',{tint:'#756449',rough:.95,amount:.5,height:.08,ao:.12}),
 ridge:form('凸脊风化','自动识别外露凸脊，生成柔和断续的漂浅与表面变化。',{tint:'#c0ad89',rough:.9,amount:.48,keep:.9,width:15,ao:0}),
 contact:form('接触深化','结合模型AO与凹曲率，仅调整接触位置的附加遮蔽。',{tint:'#ffffff',rough:.9,amount:.65,ao:.25,width:10,channels:['ao']}),
 rootwet:form('根部潮湿','自动结合低位、凹槽及模型AO形成不均匀湿润过渡。',{tint:'#4d4738',rough:.48,amount:.45,ao:0,width:25,channels:['color','roughness']})
};
export const isFormEffect=type=>Object.hasOwn(FORM_EFFECT_TYPES,type);
export const formDependencies=type=>isFormEffect(type)||type==='burl'?['ao','curvature']:[];
export const formDistributionKey=e=>isFormEffect(e.type)&&!e.distribution?[e.type,e.seed,e.params.formWidthCm,e.params.formNaturalness,e.params.formThreshold,e.type==='rootwet'?e.params.formRootHeightMeters:0]:null;
export function formMaskWeight(type,{ao=1,convex=0,concave=0,noise=.5,heightMeters=0},p){
 const clamp=x=>Math.max(0,Math.min(1,x)),smooth=(a,b,x)=>{const t=clamp((x-a)/Math.max(1e-8,b-a));return t*t*(3-2*t);};
 const shade=clamp(1-ao),threshold=p.formThreshold??.06,natural=p.formNaturalness??.45;
 let signal=type==='ridge'?convex*(.65+.35*ao):type==='contact'?shade*(.35+.65*clamp(concave*3)):type==='rootwet'?Math.max(concave*.7,shade):concave*.75+shade*.25;
 const selected=smooth(threshold,threshold+.22,signal+(noise-.5)*natural*.06);
 const variation=1-natural*(.15+.65*(1-noise));
 const height=type==='rootwet'?1-smooth((p.formRootHeightMeters??1.5)*.65,p.formRootHeightMeters??1.5,heightMeters):1;
 return clamp(selected*variation*height);
}
export const FORM_SURFACE_GLSL=`
Surface formSurface(int type,Surface s,vec3 p,vec3 n,float seed){
 float amount=effectParameter(0,.5),rough=effectParameter(1,.9),normal=effectParameter(2,1.),height=effectParameter(3,0.),grain=max(effectParameter(4,.006),.001),variation=effectParameter(5,.4),ao=effectParameter(6,.15),keep=effectParameter(7,1.);
 s.layerCoverage=amount;
 if(type==13){if(uPass==-1||uPass==2||uPass==5||uPass==10)s.localAO*=max(.45,1.-amount*ao);return s;}
 vec3 tint=effectColor(vec3(.5));float fine=organicNoise(p,grain,vec3(17.+seed*.37,9.+seed*.19,31.+seed*.53));
 if(type==11)s.color=mix(s.color,s.color*(.62+fine*variation*.08)+tint*.09,amount);
 if(type==12)s.color=mix(s.color,s.color*(1.20+fine*variation*.05)+tint*.025,amount);
 if(type==14)s.color*=1.-amount*(.3+(1.-fine)*variation*.08);
 s.rough=mix(s.rough,clamp(rough+(fine-.5)*variation*.04,.05,1.),amount);
 float retained=mix(1.,keep,amount);s.h*=retained;s.normalWeight*=retained;s.detailGradient*=retained;s.coatH=s.coatH*retained+amount*normal*height*(.2+fine*.8)/uTreeHeight;
 if(uPass==-1||uPass==2||uPass==5||uPass==10)s.localAO*=1.-amount*ao*(1.-fine)*.3;
 return s;
}
`;
