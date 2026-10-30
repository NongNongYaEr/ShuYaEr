import {sculptFalloff,pointInPolygon} from './model-sculpt-tools.js';
// Coordinates are CSS pixels. A brush can touch a silhouette without its centre
// hitting a triangle; only explicitly allowed groups are eligible.
export function createSculptProjection(input,topology){
 const size=topology.representatives.length,x=new Float32Array(size),y=new Float32Array(size),z=new Float32Array(size),visible=new Int8Array(size);let last='';
 function update(matrix,width,height,key){if(last===key)return false;last=key;visible.fill(0);const m=matrix;
  for(let g=0;g<size;g++){const i=topology.representatives[g]*3,a=input.position[i],b=input.position[i+1],c=input.position[i+2],w=m[3]*a+m[7]*b+m[11]*c+m[15];if(w<=1e-10){z[g]=2;continue;}x[g]=((m[0]*a+m[4]*b+m[8]*c+m[12])/w+1)*width/2;y[g]=(1-(m[1]*a+m[5]*b+m[9]*c+m[13])/w)*height/2;z[g]=(m[2]*a+m[6]*b+m[10]*c+m[14])/w;}
  return true;
 }
 function allowed(g,filter){if(z[g]<-1||z[g]>1||!Number.isFinite(x[g]))return false;if(filter?.allowed&&!filter.allowed(g))return false;
  if(filter?.visible){if(!visible[g])visible[g]=filter.visible(g)?1:-1;if(visible[g]<0)return false;}return true;
 }
 function circle(cx,cy,radius,options={}){const result=[],r2=radius*radius;let nearest=null,best=Infinity;
  for(let g=0;g<size;g++){const d=(x[g]-cx)**2+(y[g]-cy)**2;if(d>r2||!allowed(g,options))continue;const weight=sculptFalloff(Math.sqrt(d)/radius,options.hardness,options.falloff);if(weight<=0)continue;result.push({g,weight});if(d<best){best=d;nearest=g;}}
  return {targets:result,nearest};
 }
 function polygon(points,options={}){if(points.length<3)return [];const minX=Math.min(...points.map(p=>p.x)),maxX=Math.max(...points.map(p=>p.x)),minY=Math.min(...points.map(p=>p.y)),maxY=Math.max(...points.map(p=>p.y));const groups=[];
  for(let g=0;g<size;g++)if(x[g]>=minX&&x[g]<=maxX&&y[g]>=minY&&y[g]<=maxY&&allowed(g,options)&&pointInPolygon(x[g],y[g],points))groups.push(g);return groups;
 }
 return {update,circle,polygon,x,y,z,clear(){last='';}};
}
