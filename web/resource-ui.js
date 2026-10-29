// Shared presentation vocabulary for the resource browser and its dialogs.
export const resourceTypes={plant:'整株样板',trunk:'树干素材',prefab:'预制枝干',branch:'单元枝',units:'叶花果',material:'材质与形体配方'};
export const resourceIcons={plant:'resource-plant',trunk:'resource-trunk',prefab:'resource-prefab',branch:'resource-branch',units:'resource-units',material:'resource-material'};
export const resourceEscape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
// Botanical silhouettes share Lucide's 24-unit grid and inherit theme colors.
// The complete model remains one unit branch; its icon includes both wood and leaves.
const drawings={
  'resource-trunk':'<path d="M7 21h11l-3-5-1-7 4-5-2-1-4 4-2-5H7l2 8-1 6-3 4Z"/><path d="m11 12 1 6m0-10 1 2"/>',
  'resource-plant':'<path d="M9 21h6M12 21v-8m0 4-3-3m3 1 3-3"/><path d="M7 16a4 4 0 0 1-2-7 4 4 0 0 1 5-5 3 3 0 0 1 5 0 4 4 0 0 1 4 5 4 4 0 0 1-2 7"/>',
  'resource-prefab':'<path d="M7 3H3v4m14-4h4v4M3 17v4h4m10 0h4v-4M7 18l3-6 4-3 3-3M10 12l-3-3m7 0 3 3"/><circle cx="7" cy="9" r="1.5"/><circle cx="17" cy="6" r="1.5"/><circle cx="17" cy="12" r="1.5"/>',
  'resource-branch':'<path d="M5 21c2-7 8-10 13-17M9 13l-3-3M13 9c-3 0-6-2-6-6 4 0 6 2 6 6Zm1 3c4 1 7-1 7-5-4-1-7 1-7 5Z"/>',
  'resource-units':'<path d="M9 20V10m0 5c-5 0-6-4-6-8 5 0 7 3 6 8Z"/><path d="M17 4c1-2 3-1 3 1 2 0 2 3 0 3 0 2-3 2-3 0-2 0-2-3 0-3Z"/><circle cx="18.5" cy="16.5" r="3.5"/><path d="M18.5 13v-2m0 2 2-2"/>',
  'resource-material':'<rect x="3" y="3" width="18" height="18" rx="3"/><path d="M3 12h18M12 3v18M6 8l3-2m6 11 3-2M6 18l3-3m6-7h3"/>',
  'resource-import':'<path d="M4 10v9a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-9M4 10l3-3h2m6 0h2l3 3M4 10h4m8 0h4M12 2v12m-3-3 3 3 3-3"/>',
  'resource-export':'<path d="M4 10v9a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-9M4 10l3-3h2m6 0h2l3 3M4 10h4m8 0h4M12 14V2M9 5l3-3 3 3"/>'
};
export const resourceIcon=name=>drawings[name]?'<svg class="resource-icon" data-resource-icon="'+name+'" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">'+drawings[name]+'</svg>':'<i data-lucide="'+resourceEscape(name)+'" aria-hidden="true"></i>';
const illustrations={search:'resource-search-v1.png',organize:'resource-organize-v1.png'};
export const resourceIllustration=(kind,extraClass='')=>'<img class="resource-illustration '+resourceEscape(extraClass)+'" src="/brand/'+(illustrations[kind]||illustrations.organize)+'" width="176" height="176" alt="" aria-hidden="true" draggable="false" decoding="async">';
export function resourceActionIcon(label){const match=[[/^检视|^查看/,'scan-eye'],[/导出/,'resource-export'],[/^导入/,'resource-import'],[/去视口放置/,'mouse-pointer-2'],[/加入项目|加入单元枝/,'plus'],[/保存到本机库/,'library-big'],[/以此新建/,'resource-plant'],[/对应工具/,'sliders-horizontal'],[/工作台|编辑/,'square-pen'],[/收藏/,'star'],[/分类|标签/,'tags'],[/重命名|名称|显示名/,'pencil'],[/^恢复/,'archive-restore'],[/归档|移出项目/,'archive'],[/移除包/,'trash-2'],[/副本/,'copy-plus'],[/新版本/,'git-branch'],[/文件夹/,'folder-open']].find(([pattern])=>pattern.test(label));return match?resourceIcon(match[1]):'';}
export function resourceTags(value){return [...new Set([value||[]].flat(Infinity).flatMap(v=>String(v).split(/[,，、;；\n]+/)).map(v=>v.trim()).filter(Boolean))];}
export function resourceFormHeader(id,title,description,icon='folder'){
  return `<header class="resource-form-heading"><div class="resource-form-mark">${resourceIcon(icon)}</div><div><small>资源中心</small><h2 id="${resourceEscape(id)}">${resourceEscape(title)}</h2></div><button type="button" data-form-close aria-label="关闭${resourceEscape(title)}">${resourceIcon('x')}</button></header><p class="resource-form-description">${resourceEscape(description)}</p>`;
}
export function syncResourceOverlay(){document.body.classList.toggle('trunk-preparation-active',Boolean(document.querySelector('#trunkPreparationDialog[open]')));document.body.classList.toggle('resource-center-active',Boolean(document.querySelector('#resourceCenterDialog[open],#plantPackWizard[open],#plantPackManager[open],#plantUnitInspector[open],#plantUnitDialog[open],#branchAssetInspector[open],#unitPreparationDialog[open],#trunkPreparationDialog[open]')));}
export function trapResourceDialogFocus(dialog){dialog.addEventListener('keydown',event=>{if(event.key!=='Tab'||event.target.closest('dialog')!==dialog)return;const items=[...dialog.querySelectorAll('button:not(:disabled),input:not(:disabled),select:not(:disabled),textarea:not(:disabled),a[href],[tabindex]:not([tabindex="-1"])')].filter(node=>node.getClientRects().length&&!node.closest('[hidden]'));if(document.activeElement===items[event.shiftKey?0:items.length-1]){event.preventDefault();items[event.shiftKey?items.length-1:0]?.focus();}},true);}
