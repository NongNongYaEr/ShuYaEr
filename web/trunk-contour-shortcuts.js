// Only the focused contour graph/tool rows claim these commands. The caller
// consumes recognized repeats and busy commands without letting them fall
// through to whole-tree selection or browser shortcuts.
export function trunkContourShortcut(event={}, {enabled=false,focused=false,typing=false,dialogOpen=false}={}){
  if(!enabled||!focused||typing||dialogOpen||event.defaultPrevented||event.isComposing||event.metaKey||event.altKey)return null;
  const key=(event.key||{KeyA:'a',KeyD:'d',KeyI:'i',KeyE:'e',KeyF:'f',KeyH:'h',KeyO:'o',KeyW:'w',Digit1:'1',Digit2:'2',Equal:'=',Minus:'-',NumpadAdd:'+',NumpadSubtract:'-',Digit0:'0'}[event.code]||'').toLowerCase();
  if(event.ctrlKey)return !event.shiftKey?({a:'ALL',d:'CLEAR',i:'INVERT'})[key]||null:null;
  if(key==='+'||key==='='&&!event.shiftKey)return 'ZOOM_IN';
  if(event.shiftKey)return null;
  return ({'-':'ZOOM_OUT','0':'FIT',e:'EXPAND',f:'FOCUS_POINTS',h:'HEIGHT',o:'OFFSET',w:'WORLD_POINTS','1':'SOFT','2':'POINT'})[key]||null;
}
