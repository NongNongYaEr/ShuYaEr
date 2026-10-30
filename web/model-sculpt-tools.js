export const SCULPT_TOOLS={
 GRAB:['抓取','hand','圆圈覆盖网格即可拖动；落笔后固定作用区'],SNAKE:['拉长 / 蛇钩','move-up-right','从空白处拉出枝尖，沿拖动方向逐渐收细'],
 BEND:['枝段弯曲','spline','设置固定起点与枝端，拖动尖端弯曲'],TAPER:['枝端收尖','cone','设置两点后调整收尖、长度与截面'],
 INFLATE:['鼓起 / 压入','move-up-right','沿表面法线调整；Alt 临时反向'],PINCH:['收拢 / 扩张','minimize','收拢网格；Alt 临时扩张'],
 SMOOTH:['平滑','waves','缓和折痕，可选择保形或修平'],FLATTEN:['压平 / 填平','align-center','向落笔处的平均平面修整；可只压高处或只填低处'],
 RESTORE:['局部还原','history','逐渐恢复到本次进入前的形态，保留其他区域'],MASK:['保护遮罩','shield','涂抹保护；Alt 擦除，深色区域不受雕刻影响']
};
export const BRUSH_DEFAULT={radius:90,unit:'view',strength:.35,falloff:'smooth',hardness:.15,spacing:.18,stabilize:0,accumulate:false,reverse:false,front:true,volume:true};
export const SCULPT_DEFAULT={...BRUSH_DEFAULT,strength:1,tool:'GRAB',taper:.8,transition:.1,thickness:1,twist:0,keepLength:false,basis:'world',rangeFeather:.15,maskVisible:true,maskOpacity:.72,rootLock:false,rootHeight:.08,scope:'screen',wireframe:false,flatten:'both',shared:false};
export function clampBrush(key,value,unit='view'){
 const ranges={radius:unit==='view'?[2,600]:[.001,100],strength:[.01,1],hardness:[0,.95],spacing:[.03,1],stabilize:[0,.9],taper:[0,.99],transition:[0,.9],thickness:[.05,5],twist:[-180,180],maskOpacity:[0,1],rootHeight:[0,.8],rangeFeather:[0,1]};
 if(!ranges[key])return value;const n=Number(value);return Math.max(ranges[key][0],Math.min(ranges[key][1],Number.isFinite(n)?n:ranges[key][0]));
}
export function sculptFalloff(distance,hardness=.15,shape='smooth'){
 const t=Math.max(0,Math.min(1,(distance-hardness)/Math.max(.001,1-hardness)));
 return shape==='hard'?(distance<1?1:0):shape==='linear'?1-t:shape==='sharp'?(1-t)**3:1-t*t*(3-2*t);
}
export function brushSamples(from,to,spacing,remainder=0){
 const distance=Math.hypot(to.x-from.x,to.y-from.y),points=[];if(distance<1e-8)return {points,remainder};
 const step=Math.max(.5,spacing);let at=step-remainder;for(;at<=distance+1e-8;at+=step)points.push({x:from.x+(to.x-from.x)*at/distance,y:from.y+(to.y-from.y)*at/distance});
 return {points,remainder:(remainder+distance)%step};
}
export function pointInPolygon(x,y,points){let inside=false;for(let i=0,j=points.length-1;i<points.length;j=i++){const a=points[i],b=points[j];if((a.y>y)!==(b.y>y)&&x<(b.x-a.x)*(y-a.y)/(b.y-a.y)+a.x)inside=!inside;}return inside;}

export function sculptSelectionWeights(t,selected,softness=.15){const count=selected.length,dist=new Int32Array(count).fill(-1),queue=[];let maximum=0;for(let g=0;g<count;g++)if(selected[g]){let boundary=false;for(let j=t.edgesAt[g];j<t.edgesAt[g+1];j++)if(!selected[t.edges[j]]){boundary=true;break;}if(boundary){dist[g]=0;queue.push(g);}}for(let i=0;i<queue.length;i++){const g=queue[i];for(let j=t.edgesAt[g];j<t.edgesAt[g+1];j++){const n=t.edges[j];if(selected[n]&&dist[n]<0){dist[n]=dist[g]+1;maximum=Math.max(maximum,dist[n]);queue.push(n);}}}const width=Math.max(1,(maximum+1)*softness);return Float32Array.from(selected,(v,g)=>{if(!v)return 0;if(!softness||dist[g]<0)return 1;const n=Math.min(1,(dist[g]+1)/width);return n*n*(3-2*n);});}
