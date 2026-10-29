import * as THREE from './vendor/three.module.min.js';
import {createSectionSegmentOverlay} from './trunk-section-overlay.js';

// Preserve every selected polyline segment in one draw. No joins are introduced
// between branches; source geometry, unit identity and picking stay independent.
export function createBranchOutlineBatch(material){
  const object=new THREE.LineSegments(new THREE.BufferGeometry(),material);object.renderOrder=95;object.frustumCulled=false;object.raycast=()=>{};
  const strip=createSectionSegmentOverlay(material,{renderOrder:94,width:1,haloWidth:2.5});object.add(strip.object);
  object.userData.category='branch_selection_outline';let records=[],capacity=0;
  const sameMatrix=(a,b)=>a?Boolean(b&&a.equals(b)):!b;
  return {object,
    update(entries){
      const total=entries.reduce((sum,e)=>sum+Math.max(0,e.points.length-1)*2,0);let replaced=false;
      if(total>capacity){capacity=2**Math.ceil(Math.log2(Math.max(16,total)));object.geometry.dispose();object.geometry=new THREE.BufferGeometry();object.geometry.setAttribute('position',new THREE.BufferAttribute(new Float32Array(capacity*3),3));replaced=true;}
      object.geometry.setDrawRange(0,total);object.visible=total>0;
      const position=object.geometry.getAttribute('position'),next=[];let offset=0,changed=false;
      if(position)position.clearUpdateRanges();
      for(let n=0;n<entries.length;n++){
        const e=entries[n],count=Math.max(0,e.points.length-1)*2,old=records[n];
        if(replaced||!old||old.id!==e.id||old.points!==e.points||old.offset!==offset||old.count!==count||!sameMatrix(old.matrix,e.matrix)){
          let at=offset;for(let p=1;p<e.points.length;p++)for(const source of [e.points[p-1],e.points[p]]){const v=e.matrix?source.clone().applyMatrix4(e.matrix):source;position.setXYZ(at++,v.x,v.y,v.z);}
          if(count)position.addUpdateRange(offset*3,count*3);changed||=count>0;
        }
        next.push({id:e.id,points:e.points,offset,count,matrix:e.matrix?.clone()||null});offset+=count;
      }
      records=next;object.userData.branch_ranges=records.map(({id,offset,count})=>({id,offset,count}));if(changed)position.needsUpdate=true;
      strip.update(position,total);
      return changed;
    },
    dispose(){strip.dispose();object.geometry.dispose();records=[];capacity=0;},
  };
}
