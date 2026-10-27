import { DISTRIBUTION } from './distribution-config.js';
import { activeProject, editableProjectCopy } from './project-library-data.js';
import { attachSaveContext, templateContext } from './project-save-data.js';

// Defaults are editable copies of the actual shipped samples, never a write to the library.
export async function loadDefaultTreeDocument() {
  const item = DISTRIBUTION.defaultTree;
  if (!item) return null;
  const response = await fetch('/api/project-document?id=' + encodeURIComponent(item.id), { cache: 'no-store' });
  if (!response.ok) throw new Error('默认香樟样板读取失败，请检查内置样板文件');
  const document = editableProjectCopy(await response.json(), 'TREE', { consume: true });
  // A sample's old auxiliary drafts must not become the user's initial branch/vine.
  if (document.workspaces) {
    const tree = activeProject(document);
    document.workspaces = { active: 'TREE', tree: tree === document ? null : tree, branch: null, vine: null };
  }
  return attachSaveContext(document, templateContext({ ...item, userSaved: false }));
}
