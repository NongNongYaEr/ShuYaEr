const unit=a=>{const l=Math.hypot(...a)||1;return a.map(v=>v/l);};
// CPU oracle for the shared shader's linear RGB and projection convention.
export function referenceNormalGradient(samples,axisGradients,weights,{directX=false,strength=1}={}){
 const result=[0,0,0],planes=[[2,1],[0,2],[0,1]];
 for(let p=0;p<3;p++){const n=unit(samples[p].map(v=>v*2-1)),z=Math.max(.05,n[2]),s=[n[0]/z,n[1]/z*(directX?-1:1)],axes=planes[p];for(let k=0;k<3;k++)result[k]+=(axisGradients[axes[0]][k]*s[0]+axisGradients[axes[1]][k]*s[1])*weights[p]*strength;}
 return result;
}
export function combineNormalGradients(normal,reference,height,{bump=1,weight=1}={}){return unit(normal.map((v,k)=>v+bump*(reference[k]*weight-height[k])));}
