// View-only controller. It never creates or changes a material/project document.
export const WORKSPACE_STAGES=['model','material','export'];
export const STAGE_LABELS={model:'模型与 UV',assets:'树皮素材',material:'材质与图层',export:'检查与导出'};
export function visibleInWorkspace(element,state){
  const stages=element.dataset.workspaceStage?.split(' ');
  return (!stages||stages.some(stage=>(stage==='assets'?'material':stage)===state.stage))&&!(state.mode==='quick'&&element.hasAttribute('data-professional'));
}
export function toolAvailable(tool,state){return tool==='orbit'||state.mode==='professional'&&(tool==='uvSeam'?state.stage==='model':['mask','flow','part'].includes(tool)&&state.stage==='material');}
export class WorkspaceView{
  constructor({root,finishInteraction=()=>{},exitTool=()=>{},getTool=()=> 'orbit',changed=()=>{}}){this.root=root;this.finishInteraction=finishInteraction;this.exitTool=exitTool;this.getTool=getTool;this.changed=changed;this.state={mode:'quick',stage:'model'};}
  set(next){
    const requestedBase=next.stage==='assets',state={...this.state,...next,...(requestedBase?{stage:'material'}:{})};if(!['quick','professional'].includes(state.mode)||!WORKSPACE_STAGES.includes(state.stage))throw Error('工作区模式无效。');
    this.finishInteraction();if(!toolAvailable(this.getTool(),state))this.exitTool();this.state=state;
    this.root.dataset.workspaceMode=state.mode;this.root.dataset.workspaceStage=state.stage;
    for(const e of this.root.querySelectorAll('[data-workspace-stage],[data-professional]'))e.hidden=!visibleInWorkspace(e,state);
    for(const e of this.root.querySelectorAll('[data-stage-button]')){const selected=e.dataset.stageButton===state.stage;e.classList.toggle('active',selected);e.setAttribute('aria-current',selected?'step':'false');}
    const selector=this.root.querySelector('#workspaceMode');if(selector)selector.value=state.mode;
    this.changed({...state,...(requestedBase?{catalog:'base'}:{})});return{...state};
  }
}
