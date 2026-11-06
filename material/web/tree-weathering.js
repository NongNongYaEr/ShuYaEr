import {computeRayAO} from './ray-ao.js';

export const WEATHERING_VERSION=1;
export const WEATHERING_ROLES=['深褐沟槽沉积','灰白凸脊风化','赭色根部沉积','地衣风格薄附着','接缝湿痕','根部厚苔'];
const clamp=x=>Math.max(0,Math.min(1,x)),smooth=(a,b,x)=>{const t=clamp((x-a)/(b-a));return t*t*(3-2*t);};
export const weatheringRule=(surface,effect)=>surface?.masks.find(m=>m.id===effect.maskRef)?.items.find(r=>r.type==='treeweather'&&r.enabled&&r.strength>0);
function hash(x,y,z,seed){let h=Math.imul(x,374761393)^Math.imul(y,668265263)^Math.imul(z,2147483647)^seed;h=Math.imul(h^(h>>>13),1274126177);return((h^(h>>>16))>>>0)/4294967295;}
function noise(x,y,z,scale,seed){x/=scale;y/=scale;z/=scale;const ix=Math.floor(x),iy=Math.floor(y),iz=Math.floor(z),u=x-ix,v=y-iy,w=z-iz,a=u*u*(3-2*u),b=v*v*(3-2*v),c=w*w*(3-2*w),mix=(x,y,t)=>x+(y-x)*t;return mix(mix(mix(hash(ix,iy,iz,seed),hash(ix+1,iy,iz,seed),a),mix(hash(ix,iy+1,iz,seed),hash(ix+1,iy+1,iz,seed),a),b),mix(mix(hash(ix,iy,iz+1,seed),hash(ix+1,iy,iz+1,seed),a),mix(hash(ix,iy+1,iz+1,seed),hash(ix+1,iy+1,iz+1,seed),a),b),c);}

// The source mesh owns these two AO fields. They never replace viewport shading AO.
// Shared by all six layers and independent of UV packing, bark colors and view direction.
export function prepareWeatheringAO(source,actualHeightMeters,scale=1,progress=()=>{}){
 const common={pos:source.pos,normal:source.normal,indices:source.indices,height:source.height,samples:48};
 const short=computeRayAO({...common,range:.12*scale/actualHeightMeters},v=>progress(v*.5)).ao;
 const broad=computeRayAO({...common,range:.65*scale/actualHeightMeters},v=>progress(.5+v*.5)).ao;
 return {short,broad,metadata:{algorithm:'tree-weathering-v1',actualHeightMeters,scale,samples:48,shortRangeMeters:.12*scale,broadRangeMeters:.65*scale,sourceSHA256:source.sourceSHA256,vertices:short.length}};
}
export function weatheringGeometry({short,broad,signed,wideSigned}){
 const cavity=smooth(.02,.32,-signed),contact=smooth(.08,.55,1-short),shade=smooth(.06,.5,1-broad);
 // Positive local sign excludes flat hollow floors, even when broad subtraction is positive.
 const ridge=smooth(.03,.24,signed)*smooth(.025,.25,signed-wideSigned/3)*broad;
 return {cavity,contact,shade,ridge,broad};
}
export function weatheringCoverage({position,cavity,contact,shade,ridge,broad},{role=0,scale=1,rootHeightMeters=1.85,seed=0,density=1}={}){
 const [px,py,pz]=position,x=px/scale,y=py/scale,z=pz/scale;
 const cloud=noise(x,y,z,.28,193+seed),colony=noise(x,y,z,.115,811+seed),grain=noise(x,y,z,.012,177+seed),patch=noise(x,y,z,.065,397+seed),streak=noise(x,y*.065,z,.04,733+seed);
 const low=1-smooth(rootHeightMeters*.4595,rootHeightMeters,py),support=clamp(Math.max(cavity,contact,shade*.9)*1.8);
 const gray=clamp(ridge*1.85)*(.45+.55*smooth(.24,.74,cloud));
 const lichen=smooth(.52,.57,patch*.60+grain*.25+.075)*(.20+.80*clamp(ridge*1.6))*(.45+.55*broad)*(1-support*.65);
 const values=[support*(1-gray*.25),gray,smooth(.42,.66,colony)*support*(1-smooth(rootHeightMeters*.081,rootHeightMeters*.5405,py))*.75,lichen,clamp(Math.max(shade*.8,contact)*1.85)*low*(.60+.40*smooth(.28,.7,streak)),support*low*(.42+.58*smooth(.28,.64,colony))*(1-gray*.65)*(1-lichen*.55)];
 return role==null?values.map(v=>clamp(v*density)):clamp(values[role]*density);
}
// Material types remain ordinary independent effects; only distribution uses the new rule.
export const WEATHERING_LAYERS=[
 ['stain',{surfaceAmount:.94,surfaceColor:'#362a1e',surfaceRoughness:.93,surfaceGrainCm:1,surfaceVariation:.25}],
 ['dust',{surfaceAmount:.95,surfaceColor:'#cfccbc',surfaceRoughness:.96,surfaceHeightMm:0,surfaceBarkKeep:1,surfaceVariation:.3}],
 ['dust',{surfaceAmount:.8,surfaceColor:'#966034',surfaceRoughness:.94,surfaceHeightMm:0,surfaceBarkKeep:1,surfaceVariation:.45},.8],
 ['dust',{surfaceAmount:1,surfaceColor:'#c8cfaf',surfaceRoughness:.98,surfaceHeightMm:.16,surfaceGrainCm:.16,surfaceNormalStrength:.9,surfaceBarkKeep:1,surfaceVariation:.7,surfaceAO:.15}],
 ['wet',{wet:.9,wetEnabled:true,wetDarken:.65,wetRough:.24},.9],
 ['moss',{mossEnabled:true,mossColor:'#596328',mossRough:.94,mossNormalStrength:1.1,mossFiberMm:.75,mossThicknessMm:3,mossClumpCm:2.5,mossPorosity:.58,mossAO:.45}]
].map(([type,params,opacity=1],role)=>({type,name:WEATHERING_ROLES[role],params,opacity,channels:{color:true,roughness:true,height:role===3||role===5,ao:role===3||role===5},rules:[{type:'treeweather',params:{role},combine:'replace'}]}));
