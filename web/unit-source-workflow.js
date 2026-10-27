export const UNIT_SOURCE_APPLY_BACK_MESSAGE = '旧工作台草稿不能直接回填整树。请将草稿保存为完整单元枝素材，再从素材库明确装配。';

export function createUnitSourceWorkflow(api) {
  const selected = () => {
    const instance=api.getMode()==='TREE'?api.selectionOwners()[0]:null;
    return instance&&!instance.legacyPlacement?instance:null;
  };
  async function open() {
    const instance = selected();
    if (!instance) {
      api.toast('请先切换到「单元枝」并选中完整实例，再编辑源模型；承重骨架直接使用整树中的枝干工具编辑。', true);
      return false;
    }
    await api.editSource(instance);
    return true;
  }
  function applyBack() { throw new Error(UNIT_SOURCE_APPLY_BACK_MESSAGE); }
  function refresh(openButton, backButton) {
    openButton.disabled = !selected();
    openButton.querySelector('span').textContent = '编辑源单元枝';
    openButton.title = '选中完整单元枝，在枝条工作台编辑其源模型';
    backButton.hidden = true;
    backButton.disabled = true;
    backButton.title = UNIT_SOURCE_APPLY_BACK_MESSAGE;
  }
  return { open, applyBack, refresh };
}
