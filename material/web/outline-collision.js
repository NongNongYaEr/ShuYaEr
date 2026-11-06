// Reject a candidate only when a guaranteed occupied mask pixel collides.
// Survivors retain the original full test and y/x/rotation search order.
export function outlineCollision(occupied,mask,x,y,grid,stride){
 if(x<0||y<0||x+mask.w>grid||y+mask.h>grid)return true;
 const base=y*stride+(x>>5),shift=x&31,e=mask.entries;
 for(let i=0;i<e.length;i+=2){const at=base+e[i],bits=e[i+1];if(occupied[at]&(bits<<shift))return true;if(shift&&occupied[at+1]&(bits>>>(32-shift)))return true;}return false;
}
export function findOutlinePlacement(occupied,masks,grid,stride,step,{maxRow=grid}={}){
 const witnesses=masks.map(mask=>{const e=mask.entries,points=[],n=e.length/2;for(let k=0;k<Math.min(4,n);k++){const at=Math.floor(k*(n-1)/Math.max(1,Math.min(4,n)-1))*2,offset=e[at],bits=e[at+1],bit=31-Math.clz32(bits&-bits);points.push({row:Math.floor(offset/stride),word:offset%stride,shift:bit});}return points;}),maxX=Math.max(...masks.map(m=>grid-m.w)),maxY=Math.max(...masks.map(m=>grid-m.h)),blocked=new Uint32Array(masks.length),stepMask=step===2?0x55555555:0xffffffff;
 for(let y=0;y<=Math.min(maxY,maxRow);y+=step)for(let word=0;word<=(maxX>>5);word++){
  let all=0xffffffff;
  for(let r=0;r<masks.length;r++){
   let bits=0;if(y+masks[r].h>grid)bits=0xffffffff;
   else for(const p of witnesses[r]){const at=(y+p.row)*stride+word+p.word;bits|=occupied[at]>>>p.shift;if(p.shift)bits|=occupied[at+1]<<(32-p.shift);}
   blocked[r]=bits;all&=bits;
  }
  let available=(~all&stepMask)>>>0;
  while(available){const bit=available&-available,x=word*32+31-Math.clz32(bit);if(x>maxX)break;for(let r=0;r<masks.length;r++)if(!(blocked[r]&bit)&&!outlineCollision(occupied,masks[r],x,y,grid,stride))return{x,y,rotated:!!r,rotation:r,mask:masks[r]};available=(available&(available-1))>>>0;}
 }
 return null;
}
