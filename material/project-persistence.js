const validId=value=>typeof value==='string'&&/^[a-f0-9-]{36}$/.test(value);
export class SnapshotSequence{
  constructor(){this.serial=0;this.latest=new Map();this.disposed=false;}
  capture(document){if(this.disposed)throw Error('工程保存会话已卸载。');const snapshot={document:structuredClone(document),sequence:++this.serial};this.latest.set(document.id,snapshot.sequence);return snapshot;}
  isCurrent(snapshot,id){return !this.disposed&&snapshot.document.id===id&&this.latest.get(id)===snapshot.sequence;}
  dispose(){this.disposed=true;this.latest.clear();}
}
export class ProjectWriteOrder{
  constructor(){this.sessions=new Map();}
  validate(owner,id,sequence){if(sequence==null)return;if(!validId(owner)||!validId(id)||!Number.isSafeInteger(sequence)||sequence<1)throw Error('工程保存顺序或会话无效。');}
  isStale(owner,id,sequence){this.validate(owner,id,sequence);return sequence!=null&&(this.sessions.get(owner)?.get(id)||0)>=sequence;}
  remember(owner,id,sequence){this.validate(owner,id,sequence);if(sequence==null)return;let projects=this.sessions.get(owner);if(!projects)this.sessions.set(owner,projects=new Map());projects.set(id,sequence);}
  close(owner){this.sessions.delete(owner);}
}
