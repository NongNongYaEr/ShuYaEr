// Temporary workspace presentation. Original controls and preference state stay intact.
export function createTrunkWorkspaceLayout(panel) {
  const body=document.body,sidebar=document.querySelector('.parameter-panel');
  const rail=document.createElement('div');rail.className='trunk-library-rail';
  rail.innerHTML='<button type="button" aria-expanded="false" title="展开左侧素材与参数"><span>素材与参数</span><b aria-hidden="true">›</b></button>';
  sidebar.prepend(rail);
  const toggle=rail.querySelector('button');
  const advanced=document.createElement('details');advanced.id='trunkInspectorAdvanced';advanced.open=true;
  advanced.innerHTML='<summary>高级属性</summary>';
  const summary=document.createElement('div');summary.id='trunkWorkspaceSummary';summary.hidden=true;
  summary.innerHTML='<strong data-trunk-summary-stage></strong><p data-trunk-summary-count></p><small>点编辑在视口工作台；整圈参数按 H 展开。</small><button type="button" data-trunk-workspace-focus>回到工作台</button>';
  panel.querySelector('#trunkFormBody').before(summary,advanced);
  advanced.append(panel.querySelector('#trunkFormBody'));
  let active=false,saved=null;
  toggle.onclick=()=>{const open=body.classList.toggle('trunk-library-open');toggle.setAttribute('aria-expanded',String(open));toggle.title=open?'收起左侧素材与参数':'展开左侧素材与参数';toggle.querySelector('b').textContent=open?'‹':'›';};
  summary.querySelector('button').onclick=()=>{
    const dock=[...document.querySelectorAll('#trunkSectionDock,#trunkDetailDock')].find(n=>!n.hidden);
    const graph=dock?.querySelector(dock.classList.contains('root-region')?'#sectionRootSvg':'#sectionFrontSvg'),input=graph&&graph.getClientRects().length?graph:document.getElementById('viewport');
    if(input){dock.scrollTop=0;input.focus({preventScroll:true});}
  };
  function prepare(){if(saved)return;saved={advanced:advanced.open,panel:panel.open,folds:[...panel.querySelectorAll('details')].map(n=>[n,n.open]),asset:document.getElementById('assetTab').classList.contains('active'),left:document.querySelector('.parameter-scroll').scrollTop,right:document.querySelector('.inspector-scroll').scrollTop};}
  function revealAdvanced(){advanced.open=true;panel.open=true;advanced.scrollIntoView({block:'nearest'});}
  return {prepare,revealAdvanced,update(state){
    if(state.enabled!==active){
      active=state.enabled;
      if(active){
        prepare();
        advanced.open=false;body.classList.remove('trunk-library-open');toggle.setAttribute('aria-expanded','false');toggle.title='展开左侧素材与参数';toggle.querySelector('b').textContent='›';
        document.getElementById('contextTab').click();document.querySelector('.inspector-scroll').scrollTop=0;
      }else if(saved){
        for(const [node,open]of saved.folds)node.open=open;advanced.open=saved.advanced;panel.open=saved.panel;body.classList.remove('trunk-library-open');
        document.getElementById(saved.asset?'assetTab':'contextTab').click();
        const previous=saved;requestAnimationFrame(()=>{if(!active){document.querySelector('.parameter-scroll').scrollTop=previous.left;document.querySelector('.inspector-scroll').scrollTop=previous.right;}});saved=null;
      }
    }
    body.classList.toggle('trunk-adjusting',active);summary.hidden=!active;
    summary.querySelector('[data-trunk-summary-stage]').textContent=state.stage;
    summary.querySelector('[data-trunk-summary-count]').textContent=state.target?state.region==='ROOT'?`${state.roots} 条板根 · 已选 ${state.rootSelected} 条`:`${state.sections} 圈截面 · ${state.details} 项表面细节`:'先选择承重枝干';
    summary.querySelector('small').textContent=state.region==='ROOT'?'辅助生成参数；局部造型返回根盘，沿用圈点编辑。':'点编辑在视口工作台；整圈参数按 H 展开。';
  }};
}
