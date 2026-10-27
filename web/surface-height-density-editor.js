import { CLIMB_DENSITY, UNIFORM_DENSITY } from './surface-height-density.js';

export function createHeightDensityEditor({host,state,transact}) {
  const box=document.createElement('div');box.id='growthHeightDensity';
  box.innerHTML=`<strong>高度—疏密曲线</strong><svg viewBox="0 0 280 130" style="width:100%;touch-action:none;display:block" aria-label="高度疏密曲线，可拖动五个控制点"></svg><div style="display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:4px">${[0,25,50,75,100].map((h,i)=>`<label style="font-size:11px"><span>${h}%</span><input id="growthDensity${i}" aria-label="高度${h}%的疏密" type="number" value="${CLIMB_DENSITY[i]}" min="0" max="1" step=".05" style="width:100%;box-sizing:border-box;padding:6px 3px;text-align:center"></label>`).join('')}</div><div class="wb-row"><button id="growthDensityClimb">下密上疏</button><button id="growthDensityUniform">全高均匀</button></div><p class="vine-note">横轴：起长高度 → 生长顶端。纵轴：0 无自动叶层，1 茂密。越往上数值越小，叶簇逐渐收窄、减少；叶片大小不变。拖动松手后更新，Esc 取消。</p>`;
  host.append(box);
  const svg=box.querySelector('svg'),inputs=[...box.querySelectorAll('input')];let drag=null;
  function render(values) {
    const p=values.map((v,i)=>[22+i*59,106-v*92]);
    const curve=p.slice(0,-1).map((a,i)=>`C ${a[0]+20} ${a[1]} ${p[i+1][0]-20} ${p[i+1][1]} ${p[i+1].join(' ')}`).join(' ');
    svg.innerHTML=`${[0,.5,1].map(v=>`<path d="M22 ${106-v*92}H258" stroke="#435347"/><text x="2" y="${110-v*92}" fill="#b9cbbc" font-size="10">${v}</text>`).join('')}<path d="M${p[0].join(' ')} ${curve}" stroke="#efd46c" fill="none" stroke-width="2"/>${p.map(([x,y])=>`<circle cx="${x}" cy="${y}" r="5" fill="#efd46c"/>`).join('')}<text x="22" y="125" fill="#b9cbbc" font-size="10">起长 0%</text><text x="208" y="125" fill="#b9cbbc" font-size="10">顶端 100%</text>`;
    inputs.forEach((input,i)=>{if(document.activeElement!==input)input.value=values[i];});
  }
  const current=()=>state()?.growth_ruler?.height_density||UNIFORM_DENSITY;
  const commit=values=>transact('调整高度疏密曲线',s=>{s.growth_ruler={...s.growth_ruler,height_density:[...values]};});
  inputs.forEach((input,i)=>input.onchange=()=>{if(input.value===''||!input.checkValidity())return refresh();const next=[...current()];next[i]=+input.value;commit(next);});
  box.querySelector('#growthDensityClimb').onclick=()=>commit(CLIMB_DENSITY);
  box.querySelector('#growthDensityUniform').onclick=()=>commit(UNIFORM_DENSITY);
  function coordinates(e){const r=svg.getBoundingClientRect();return {x:(e.clientX-r.left)/r.width*280,y:(e.clientY-r.top)/r.height*130};}
  svg.addEventListener('pointerdown',e=>{
    if(e.button!==0||!state()?.growth_ruler)return;const {x,y}=coordinates(e),index=Math.max(0,Math.min(4,Math.round((x-22)/59)));
    if(Math.abs(x-22-index*59)>15||Math.abs(y-(106-current()[index]*92))>15)return;
    e.preventDefault();drag={pointer:e.pointerId,index,initial:[...current()],values:[...current()]};svg.setPointerCapture(e.pointerId);
  });
  svg.addEventListener('pointermove',e=>{if(!drag||e.pointerId!==drag.pointer)return;e.preventDefault();drag.values[drag.index]=Math.round(Math.max(0,Math.min(1,(106-coordinates(e).y)/92))*100)/100;render(drag.values);});
  function finish(cancel){if(!drag)return;const done=drag;drag=null;if(svg.hasPointerCapture(done.pointer))svg.releasePointerCapture(done.pointer);if(!cancel&&done.values.some((v,i)=>v!==done.initial[i]))commit(done.values);refresh();}
  svg.addEventListener('pointerup',()=>finish(false));
  for(const type of ['pointercancel','lostpointercapture'])svg.addEventListener(type,()=>finish(true));
  window.addEventListener('blur',()=>finish(true));
  window.addEventListener('keydown',e=>{if(drag&&e.key==='Escape'){e.preventDefault();e.stopImmediatePropagation();finish(true);}},true);
  function refresh(){if(!drag)render(current());}
  refresh();return {refresh,cancel:()=>finish(true)};
}
