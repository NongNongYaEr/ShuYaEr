import {createGuideFrame} from './guide-frame.js';
import {createRouteClearance} from './route-clearance.js';
import {createRouteDetour} from './route-detour.js';
import {createRouteLattice} from './route-lattice.js';

const TAU=2*Math.PI;

export function guideSampler(THREE,guide){
  const points=guide.points.map(v=>new THREE.Vector3(...v));
  const lengths=[0];
  for(let i=1;i<points.length;i++)lengths.push(lengths.at(-1)+points[i-1].distanceTo(points[i]));
  const length=lengths.at(-1);
  function at(distance){
    distance=Math.max(0,Math.min(distance,length));
    let i=1;
    while(i<lengths.length-1&&lengths[i]<distance)i++;
    return points[i-1].clone().lerp(points[i],(distance-lengths[i-1])/(lengths[i]-lengths[i-1]));
  }
  return {length,at};
}

export function wrapImportedGuide(THREE,surface,guide,options){
  const {pitch,radius,gap,from,to,range,sections,direction=1,extraSampleBudget=Infinity}=options;
  const axis=guideSampler(THREE,guide);
  const start=from*axis.length,end=to*axis.length;
  const span=end-start;
  const intervals=Math.max(1,Math.ceil(span/pitch*96)),sampleStep=span/intervals;
  const maxRadius=Math.max(guide.start_radius,guide.end_radius)*3.5+radius*4;
  const sampleFrame=createGuideFrame(THREE,axis,guide);
  const tracks=[];
  let current=[],dropped=0,breaks=0,shortBridges=0,insertedSamples=0,minimumClearance=Infinity;
  const maximumBridge=pitch*.10;
  const attachmentLimit=radius+gap*5+.008;
  const rejected={missingBark:0,surfaceJump:0,obstacle:0};
  const reset=()=>{if(current.length>1)tracks.push(current);current=[];};
  const outside=(hit,radial)=>hit&&hit.face.normal.dot(radial)>.10;
  const certified=(a,b,depth=0)=>{
    const half=a.distanceTo(b)*.5;
    const middle=a.clone().lerp(b,.5);
    // A lower bound for a whole segment, since distance to any surface
    // can decrease by at most the travelled distance.
    const distance=surface.distance(middle,radius+half+gap);
    if(distance-half>=radius+1e-7)return true;
    if(distance<radius||depth===6)return false;
    return certified(a,middle,depth+1)&&certified(middle,b,depth+1);
  };
  function barkSample(origin,radial,station,median){
    const hit=surface.ray(origin,radial,maxRadius);
    if(median===null||!outside(hit,radial))return {reason:'missingBark'};
    if(hit.distance>median*1.8+radius||hit.distance<median*.34||median<radius*2.7)
      return {reason:'surfaceJump'};
    for(let step=0;step<=7;step++){
      const offset=radius+gap*(1+step*.5);
      const point=hit.position.clone().addScaledVector(radial,offset);
      if(surface.ray(hit.position.clone().addScaledVector(radial,1e-6),radial,offset))break;
      const distance=surface.distance(point,radius+gap*8);
      if(distance>=radius+gap-0.00002)return {point,origin,radial,station,median,hitDistance:hit.distance,
        clearance:distance-radius,face:hit.face.face,primitive:hit.face.primitive};
    }
    return {reason:'obstacle'};
  }
  function connect(a,b,depth=0){
    if(certified(a.point,b.point))return [];
    if(depth===3||insertedSamples>=extraSampleBudget)return null;
    const station=(a.station+b.station)*.5;
    const radial=a.radial.clone().add(b.radial).normalize();
    const origin=a.origin.clone().lerp(b.origin,.5);
    const median=(a.median+b.median)*.5;
    const middle=barkSample(origin,radial,station,median);
    if(middle.point){
      const allowance=Math.max(radius*4,a.point.distanceTo(b.point)*.85);
      if(middle.point.distanceTo(a.point)<=allowance&&middle.point.distanceTo(b.point)<=allowance){
        const left=connect(a,middle,depth+1);
        const right=left&&connect(middle,b,depth+1);
        if(right)return [...left,middle,...right];
      }
    }
    // Short bark creases may interrupt ray hits. Lift the local chord only as
    // far as the bark can still supply the light strip's skin weights.
    const chord=a.point.clone().lerp(b.point,.5);
    function safeSupport(point){
      const distance=surface.distance(point,attachmentLimit);
      if(distance>=radius+gap-0.00002&&distance<attachmentLimit&&
        certified(a.point,point)&&certified(point,b.point)){
        return [{point,origin,radial,station,median,clearance:distance-radius}];
      }
      return null;
    }
    for(const lift of [gap,radius+gap,radius+3*gap]){
      const support=safeSupport(chord.clone().addScaledVector(radial,lift));
      if(support)return support;
    }
    const bark=surface.closest(chord,radius+gap*2);
    if(bark&&bark.face.normal.dot(radial)>.1){
      for(const lift of [radius+gap,radius+3*gap]){
        const support=safeSupport(bark.position.clone().addScaledVector(bark.face.normal,lift));
        if(support)return support;
      }
    }
    return null;
  }
  for(let i=0;i<=intervals;i++){
    const station=start+span*i/intervals,{origin,radialAt}=sampleFrame(station);
    if(range&&(origin.z+maxRadius+gap*4<range[0]||origin.z-maxRadius-gap*4>range[1])){
      reset();
      continue;
    }
    let median=sections?.[i];
    if(median===undefined){
      const profile=[];
      for(let side=0;side<8;side++){
        const radial=radialAt(side*TAU/8),hit=surface.ray(origin,radial,maxRadius);
        if(outside(hit,radial))profile.push(hit.distance);
      }
      profile.sort((a,b)=>a-b);
      median=profile.length>=5?profile[profile.length>>1]:null;
      if(sections)sections[i]=median;
    }
    const radial=radialAt((options.phase||0)+direction*(station-start)*TAU/pitch);
    const sample=barkSample(origin,radial,station,median),{reason}=sample;
    if(reason){
      dropped++;rejected[reason]++;
      if(current.length&&station-current.at(-1).station>maximumBridge)reset();
      continue;
    }
    if(current.length){
      const previous=current.at(-1);
      const gapSpan=station-previous.station;
      const expectedArc=(sample.hitDistance+radius+gap)*TAU*gapSpan/pitch;
      const bridge=gapSpan<=maximumBridge&&previous.point.distanceTo(sample.point)<=Math.max(.006,radius*4,expectedArc*2.7)
        ?connect(previous,sample):null;
      if(!bridge||insertedSamples+bridge.length>extraSampleBudget){
        breaks++;
        reset();
      }else{
        current.push(...bridge);
        insertedSamples+=bridge.length;
        if(bridge.length||gapSpan>sampleStep*1.5)shortBridges++;
      }
    }
    current.push(sample);
  }
  reset();
  let contourBridges=0,joined=tracks;
  if(tracks.length>1&&insertedSamples<extraSampleBudget){
    const constraints={radius,gap,attachmentLimit,certified};
    const detours=[createRouteDetour(surface,constraints),createRouteLattice(THREE,surface,constraints)];
    let clearance=null;
    function findBridge(a,b){
      if(b.station-a.station>pitch*.12||a.point.distanceToSquared(b.point)>.7**2)return null;
      for(const detour of detours){
        const bridge=detour(a,b);
        if(!bridge||insertedSamples+bridge.length>extraSampleBudget)continue;
        clearance??=createRouteClearance(THREE,tracks,radius);
        if(clearance.tryConnect([a,...bridge,b]))return bridge;
      }
      return null;
    }
    joined=[tracks[0]];
    for(const track of tracks.slice(1)){
      const previous=joined.at(-1),a=previous.at(-1),b=track[0];
      const bridge=findBridge(a,b);
      if(bridge){
        for(const sample of bridge)previous.push(sample);
        for(const sample of track)previous.push(sample);
        insertedSamples+=bridge.length;
        contourBridges++;
      }else{
        joined.push(track);
      }
    }
  }
  const clipped=range?joined.flatMap(track=>clipTrackHeight(track,range)):joined;
  const kept=clipped.filter(track=>{
    const distance=track.reduce((sum,sample,i)=>sum+(i?sample.point.distanceTo(track[i-1].point):0),0);
    return distance>=Math.max(.008,radius*2);
  });
  for(const track of kept)for(const p of track)minimumClearance=Math.min(minimumClearance,p.clearance);
  return {tracks:kept,report:{guide:guide.id,axisLength:axis.length,sampled:intervals+1,dropped,rejected,breaks,shortBridges,contourBridges,insertedSamples,
    shortRunsOmitted:clipped.length-kept.length,minimumSampleClearance:Number.isFinite(minimumClearance)?minimumClearance:null}};
}

function clipTrackHeight(track,[bottom,top]){
  const result=[];
  let run=[];
  function flush(){if(run.length>1)result.push(run);run=[];}
  function interpolate(a,b,t){
    if(t===0)return a;
    if(t===1)return b;
    return {...a,point:a.point.clone().lerp(b.point,t),radial:a.radial.clone().lerp(b.radial,t).normalize(),
      station:a.station+(b.station-a.station)*t};
  }
  for(let i=1;i<track.length;i++){
    const a=track[i-1],b=track[i],z=b.point.z-a.point.z;
    let from=0,to=1;
    if(z===0){
      if(a.point.z<bottom||a.point.z>top){flush();continue;}
    }else{
      const lo=(bottom-a.point.z)/z,hi=(top-a.point.z)/z;
      from=Math.max(0,Math.min(lo,hi));
      to=Math.min(1,Math.max(lo,hi));
    }
    if(to<=from){flush();continue;}
    if(from>0)flush();
    if(!run.length)run.push(interpolate(a,b,from));
    run.push(interpolate(a,b,to));
    if(to<1)flush();
  }
  flush();
  return result;
}

export function cordArrays(THREE,track,{radius,textureRepeat,routeOffset=0,routeLength}){
  const sides=6,stride=sides+1,distance=[0];
  for(let i=1;i<track.length;i++)distance.push(distance.at(-1)+track[i-1].point.distanceTo(track[i].point));
  const length=distance.at(-1),position=[],normal=[],uv0=[],uv1=[],indices=[];
  for(let i=0;i<track.length;i++){
    const {point,radial}=track[i];
    const tangent=track[Math.min(i+1,track.length-1)].point.clone().sub(track[Math.max(0,i-1)].point).normalize();
    const x=radial.clone().addScaledVector(tangent,-radial.dot(tangent)).normalize();
    const y=new THREE.Vector3().crossVectors(tangent,x);
    for(let side=0;side<=sides;side++){
      const v=side/sides,angle=v*TAU;
      const outward=x.clone().multiplyScalar(Math.cos(angle)).addScaledVector(y,Math.sin(angle));
      position.push(...point.clone().addScaledVector(outward,radius).toArray());
      normal.push(...outward.toArray());
      const along=routeOffset+distance[i];
      uv0.push(along/textureRepeat,v);
      uv1.push(along/(routeLength||length),v);
      if(i<track.length-1&&side<sides){
        const a=i*stride+side,b=a+1,c=b+stride,d=a+stride;
        indices.push(a,b,c,a,c,d);
      }
    }
  }
  return {position,normal,uv0,uv1,indices,length,stride};
}
