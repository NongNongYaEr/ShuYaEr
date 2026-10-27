export const BINDING_LABELS = { new: '已接入本轮单元枝', legacy: '仍用旧单元枝', none: '尚未装配单元枝', mixed: '新旧单元枝混用' };
export const KIND_LABELS = { TREE: '整树 / 整株', BRANCH: '枝条', VINE: '藤蔓', UNKNOWN: '待分类' };

export function activeProject(doc) {
  const key = String(doc.workspaces?.active || '').toLowerCase();
  return doc.workspaces?.[key] || doc;
}

export function projectBinding(doc) {
  const a = activeProject(doc).authoring || {};
  const refs = [...(a.branch_instances || []).map(i => i.asset_id),
    ...Object.values(a.workbench?.assembly_slots || {}).flat().map(i => typeof i === 'string' ? i : i?.asset_id)].filter(Boolean);
  if (!refs.length) return 'none';
  const count = refs.filter(id => id.startsWith('FINISHED_')).length;
  return count === refs.length ? 'new' : count ? 'mixed' : 'legacy';
}

// Copies retain the seed, all geometry, textures, attachment IDs and workspace data.
export function editableProjectCopy(source, kind, { consume = false } = {}) {
  const doc = consume ? source : structuredClone(source);
  // Older whole shrubs were authored in the branch workspace. Treat an indexed
  // whole-plant template as a whole tree without regenerating its saved shape.
  if (kind === 'TREE' && doc.workspaces?.active === 'BRANCH') {
    const tree = structuredClone(activeProject(doc));
    delete tree.workspaces;
    doc.workspaces = { ...doc.workspaces, active: 'TREE', tree };
  }
  const rename = item => {
    if (!item) return;
    if (item.settings) item.settings.object_name = `${item.settings.object_name || '植物工程'}_副本`;
    delete item.history; delete item.future;
  };
  rename(doc);
  for (const key of ['tree', 'branch', 'vine']) rename(doc.workspaces?.[key]);
  return doc;
}
