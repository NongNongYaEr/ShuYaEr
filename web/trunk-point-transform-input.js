/** Keyboard text for an already active point gesture; no authoring or DOM. */
export function trunkPointTransformInputKey(event,{action,text='',axis=null}={}){
  if(event.defaultPrevented||event.isComposing||event.ctrlKey||event.metaKey||event.altKey)return null;
  const key=event.key||'';
  if(action==='MOVE'&&!event.shiftKey&&['x','y'].includes(key.toLowerCase()))return {text,axis:!text&&axis===key.toUpperCase()?null:key.toUpperCase(),axisChanged:true};
  if(key==='Backspace')return {text:text.slice(0,-1),axis};
  if(key==='Delete')return {text:'',axis};
  if(/^[0-9.,-]$/.test(key)&&text.length<24)return {text:text+(key===','?'.':key),axis:action==='MOVE'?(axis||'X'):axis};
  return null;
}
export function parseTrunkPointTransformInput(text,action){
  if(!text)return {valid:true,value:null};
  if(!/^-?(?:\d+(?:\.\d*)?|\.\d+)$/.test(text))return {valid:false,value:null};
  const value=Number(text),valid=Number.isFinite(value)&&(action==='SCALE'?value>0&&value<=1000:action==='ROTATE'?Math.abs(value)<=360:Math.abs(value)<=100000);
  return {valid,value:valid?value:null};
}
