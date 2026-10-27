// Display ownership only; no fields are added to authoring or source meshes.
const revisions=new WeakMap();
const rootOf=owner=>owner?.group||owner;
export function nativeModelRevision(owner){return revisions.get(rootOf(owner))||0;}
export function markNativeModelChanged(owner){const root=rootOf(owner);if(!root||typeof root!=='object')return 0;const revision=(revisions.get(root)||0)+1;revisions.set(root,revision);return revision;}
