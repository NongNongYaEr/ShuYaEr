const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
export const SCULPT_PROFILES=Object.freeze([
 {id:'S01',name:'粗沟雕刻老树',preserve:.9,skin:1.15,micro:.35},
 {id:'S02',name:'榕树与融合气根',preserve:.8,skin:1.1,micro:.35},
 {id:'S03',name:'扭曲藤状树干',preserve:.8,skin:1.15,micro:.3},
 {id:'S04',name:'巨型英雄树',preserve:.8,skin:1.3,micro:.4},
 {id:'S05',name:'厚皮针叶树',preserve:.55,skin:1.25,micro:.3},
 {id:'S06',name:'光皮与剥皮树',preserve:.95,skin:.85,micro:.25},
 {id:'S07',name:'枯木与断枝树',preserve:.8,skin:1.2,micro:.3},
 {id:'S08',name:'空心树与树桩',preserve:.85,skin:1.15,micro:.3},
 {id:'S09',name:'半写实与手绘树',preserve:.85,skin:.85,micro:.1},
 {id:'S10',name:'幻想与剧情树',preserve:.75,skin:1.25,micro:.25}
]);
export const SCULPT_STYLES={natural:'自然写实',game:'游戏写实',painted:'半写实与手绘'};
const ANCHOR_RANGES={normalStrength:[0,4],barkReliefMm:[0,20],reliefMm:[.1,20],detail:[0,1]};
export function sculptAnchor(settings){return{normalStrength:settings.normalStrength??1,barkReliefMm:settings.barkReliefMm??5,reliefMm:settings.reliefMm??3,detail:settings.detail??.35};}
export function sculptProfile(id='S01'){const p=SCULPT_PROFILES.find(p=>p.id===id);if(!p)throw Error('雕刻形体档案不存在。');return{version:1,profile:p.id,style:p.id==='S09'?'painted':'game',local:true,preserve:p.preserve,skin:p.skin,micro:p.micro};}
export function validateSculptMaterial(raw,source=null){
 if(raw==null)return null;if(raw.version!==1||!SCULPT_PROFILES.some(p=>p.id===raw.profile)||!Object.hasOwn(SCULPT_STYLES,raw.style)||!Number.isFinite(raw.preserve)||raw.preserve<0||raw.preserve>1||!Number.isFinite(raw.skin)||raw.skin<0||raw.skin>2||!Number.isFinite(raw.micro)||raw.micro<0||raw.micro>1)throw Error('雕刻响应参数无效。');
 if(raw.local!==undefined&&typeof raw.local!=='boolean')throw Error('局部雕刻响应开关无效。');
 const anchor={};if(!raw.anchor)throw Error('雕刻响应缺少原始参数。');for(const[k,[min,max]]of Object.entries(ANCHOR_RANGES)){const value=raw.anchor[k];if(!Number.isFinite(value)||value<min||value>max)throw Error('雕刻响应原始参数无效。');anchor[k]=value;}
 const result={version:1,profile:raw.profile,style:raw.style,local:raw.local??false,preserve:raw.preserve,skin:raw.skin,micro:raw.micro,anchor};
 if(raw.evidence){const e=raw.evidence;if(e.algorithm!=='sculpt-multiscale-response-v1'||!/^[a-f0-9]{64}$/.test(e.sourceSHA256||'')||!Number.isFinite(e.actualHeightMeters)||e.actualHeightMeters<.1||e.actualHeightMeters>200||!Number.isFinite(e.score)||e.score<0||e.score>1||!Number.isFinite(e.localRadiusMeters)||e.localRadiusMeters<=0||!Number.isFinite(e.broadRadiusMeters)||e.broadRadiusMeters<=0||!['supported','limited'].includes(e.confidence))throw Error('雕刻响应分析记录无效。');if(!source||e.sourceSHA256===source)result.evidence={algorithm:e.algorithm,sourceSHA256:e.sourceSHA256,actualHeightMeters:e.actualHeightMeters,score:e.score,localRadiusMeters:e.localRadiusMeters,broadRadiusMeters:e.broadRadiusMeters,confidence:e.confidence};}
 return result;
}
export function applySculptMaterial(document,options,{evidence=null,rebase=false}={}){
 const next=structuredClone(document),previous=next.sculptMaterial;
 const response=validateSculptMaterial({...options,anchor:rebase||!previous?sculptAnchor(next.settings):previous.anchor,...(evidence?{evidence}:previous?.evidence?{evidence:previous.evidence}:{})},next.resources.source),a=response.anchor;
 next.settings={...next.settings,normalStrength:clamp(a.normalStrength*response.skin,0,4),barkReliefMm:a.barkReliefMm*(1-response.preserve*.9),reliefMm:clamp(a.reliefMm*(1-response.preserve*.5),.1,20),detail:response.micro*(response.style==='painted'?.4:response.style==='natural'?.8:1)};
 next.sculptMaterial=response;return next;
}
export function rebaseSculptMaterial(document){if(!document.sculptMaterial)return document;return applySculptMaterial(document,document.sculptMaterial,{rebase:true});}
export function removeSculptMaterial(document){const next=structuredClone(document);if(next.sculptMaterial)Object.assign(next.settings,next.sculptMaterial.anchor);delete next.sculptMaterial;return next;}
