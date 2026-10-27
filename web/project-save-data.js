import { activeProject } from './project-library-data.js';

export function saveContext(authoring) { return authoring?.workbench?.project_save || {}; }
export function templateContext(item) {
  return { templateId:item.id, familyId:item.familyId || item.id, version:item.version || 1,
    userSaved:item.userSaved === true, sourceName:item.name, sourcePath:item.path,
    species:item.species || '', notes:item.notes || '',saveToken:item.saveToken || (item.mtimeMs?`legacy-${item.mtimeMs}`:'') };
}
export function attachSaveContext(doc, context) {
  for (const part of new Set([doc, activeProject(doc)])) {
    part.authoring ||= {}; part.authoring.workbench ||= {};
    part.authoring.workbench.project_save = {...context};
  }
  return doc;
}
export function defaultSaveMode(kind, context) {
  return !['TREE','VINE'].includes(kind)||context.lastMode==='FILE' ? 'FILE' : context.userSaved && context.templateId ? 'CURRENT' : context.templateId ? 'NEW' : 'FILE';
}
// The caller owns this captured document. Do not duplicate its geometry/atlases.
export function prepareSaveDocument(doc, {name, notes, species, mode, id, context}) {
  name=String(name || '').trim(); if (!name || name.length>120) throw Error('请填写 1–120 字的名称');
  notes=String(notes || '').trim();if(notes.length>2000)throw Error('备注最多 2000 字');
  if(!['FILE','NEW','VERSION','CURRENT'].includes(mode))throw Error('保存方式无效');
  if(['VERSION','CURRENT'].includes(mode)&&(!context.userSaved||!context.templateId))throw Error('请先另存为自己的新样板');
  if(mode==='CURRENT'&&(!context.saveToken||id!==context.templateId))throw Error('请从样板库重新打开当前版本后保存，或另存新样板');
  const next={...context,notes,species,lastMode:mode};
  if(mode!=='FILE')Object.assign(next,{templateId:id,familyId:mode==='NEW'?id:(context.familyId||context.templateId),
    version:mode==='CURRENT'?(context.version||1):mode==='VERSION'?(context.version||1)+1:1,userSaved:true,sourceName:name,sourcePath:`assets/tree-template-library/${id}.branch.json`,saveToken:crypto.randomUUID()});
  for(const part of new Set([doc,activeProject(doc)])){part.settings={...part.settings,object_name:name};delete part.history;delete part.future;}
  attachSaveContext(doc,next);
  return {document:doc,context:next,name,notes};
}
