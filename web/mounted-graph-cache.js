import {compiledInputState,compiledInputUnchanged} from './compiled-sample-cache.js';
import {applySculptLayers} from './generator-geometry.js';

// Only an appended, full-strength rigid mount can extend this exact evaluated
// prefix. Keep the entire graph, including old copies, pins and unit history.
// These records own pure curve data, never a displayed asset or its callbacks.
const input=(settings,a)=>({settings,authoring:{...a,active_sculpt_layer:'',branch_library:a.branch_library.map(({sample,thumbnail,...item})=>item)}});
const allowed=a=>!a.vine&&!a.symmetry_groups.some(g=>g.enabled)&&!Object.keys(a.workbench?.procedural_growth?.regions||{}).length;
export function mountedGraphRecord(settings,a,branches,before=null){return branches&&allowed(a)?{state:compiledInputState(input(settings,a)),layers:a.sculpt_layers.length,branches,before:before?{...before,before:null}:null}:null;}
export function extendMountedGraph(record,settings,a){
  if(!record||!allowed(a))return null;
  const prefix=a.sculpt_layers.length===record.layers+1?record:a.sculpt_layers.length===record.layers?record.before:null;
  if(!prefix)return null;
  const layer=a.sculpt_layers.at(-1),op=layer.operation;
  if(!layer.enabled||layer.strength!==1||op?.type!=='MOUNT'||Object.keys(layer.branches).length)return null;
  const root=prefix.branches.find(b=>b.stableId===op.root),parent=prefix.branches.find(b=>b.id===root?.parentId),carrier=op.target_parent?prefix.branches.find(b=>b.stableId===op.target_parent):parent;
  if(!root||!parent||!carrier||root.instanceId||root.unitOwner||parent.stableId!==op.parent||carrier.order!==parent.order)return null;
  if(!compiledInputUnchanged(input(settings,{...a,sculpt_layers:a.sculpt_layers.slice(0,-1)}),prefix.state))return null;
  // MOUNT replaces arrays; it never edits shared prefix vectors in place.
  // Copy branch objects/child lists so updating the new graph cannot alter the
  // immutable prefix used by an existing preview or a later undo.
  const branches=prefix.branches.map(b=>({...b,children:b.children.slice()}));
  applySculptLayers(branches,[layer],a.overrides,a.topology.suppressed);return {branches,prefix};
}
