import * as THREE from '../vendor/three.module.min.js';
import {trunkSurfaceIndex} from './surface.js';
import {guideSampler,wrapImportedGuide} from './wrap.js';

const maxSamples=150000;
let state;
self.onmessage=({data})=>{
  const {type,epoch,id}=data;
  try{
    if(type==='init'){
      const {mesh,guides,ground,height}=data;
      state={surface:trunkSurfaceIndex(THREE,mesh),guides,ground,height,epoch};
      self.postMessage({type:'ready',epoch});
      return;
    }
    if(type!=='generate'||state?.epoch!==epoch)return;
    const {surface,guides,ground,height}=state;
    const {pitch,radius,gap,scope,bottom,top,direction,selectedGuide}=data;
    const routes=guides.map(guide=>({guide,length:guideSampler(THREE,guide).length}));
    const [main,...branches]=routes;
    const major=branches.filter(({guide,length})=>length>height*.18&&guide.start_radius>height*.009)
      .sort((a,b)=>b.length*b.guide.start_radius-a.length*a.guide.start_radius).slice(0,4);
    const selected={main:[main],major:[main,...major],all:routes,selected:routes.filter(row=>row.guide.id===selectedGuide)}[scope];
    if(!selected.length)throw Error('请在树上选中一根可编辑的枝干。');
    const range=[ground+bottom+radius,ground+top-radius];
    const tracks=[],transfer=[];
    if(range[1]>range[0]){
      const active=selected.filter(({guide})=>{
        const margin=Math.max(guide.start_radius,guide.end_radius)*3.5+radius*4+gap*4;
        const heights=guide.points.map(p=>p[2]);
        return Math.min(...heights)-margin<=range[1]&&Math.max(...heights)+margin>=range[0];
      });
      const estimated=active.reduce((n,r)=>n+r.length/pitch*96,0);
      const overBudget='这次布线范围较大，请减少绕线枝干或增大圈距。';
      if(estimated>maxSamples)throw Error(overBudget);
      // Reserve space for the regular samples and height-clipping edges.
      let extraSampleBudget=Math.max(0,maxSamples-Math.ceil(estimated)-active.length*4),sampleCount=0;
      for(const [i,{guide,length}] of active.entries()){
        const from=guide.parent?Math.min(.36,guide.start_radius*.7/length):0;
        const options={pitch,radius,gap,from,to:1,range,direction,textureRepeat:.25,sections:[],extraSampleBudget};
        const score=tracks=>tracks.reduce((n,t)=>n+t.at(-1).station-t[0].station,0)-Math.max(0,tracks.length-1)*pitch*.025;
        let best=[],insertedSamples=0;
        for(let phase=0;phase<3;phase++){
          const {tracks,report}=wrapImportedGuide(THREE,surface,guide,{...options,phase:i*1.39+phase*Math.PI*2/3});
          if(tracks.length&&(!best.length||score(tracks)>score(best))){best=tracks;insertedSamples=report.insertedSamples;}
        }
        extraSampleBudget-=insertedSamples;
        for(const track of best){
          sampleCount+=track.length;
          if(sampleCount>maxSamples)throw Error(overBudget);
          const points=new Float32Array(track.length*6);
          for(const [j,sample] of track.entries()){
            sample.point.toArray(points,j*6);
            sample.radial.toArray(points,j*6+3);
          }
          tracks.push({guide:guide.id,points,turns:(track.at(-1).station-track[0].station)/pitch});
          transfer.push(points.buffer);
        }
        self.postMessage({type:'progress',id,epoch,current:i+1,total:active.length});
      }
    }
    self.postMessage({type:'result',id,epoch,tracks},transfer);
  }catch(error){self.postMessage({type:'error',id,epoch,message:error.message});}
};
