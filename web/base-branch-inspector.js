export function createBaseBranchInspector() {
  const panel = document.createElement('section');
  panel.id = 'baseBranchInspector';
  panel.className = 'companion-transform';
  panel.hidden = true;
  panel.setAttribute('aria-labelledby', 'baseBranchInspectorTitle');
  panel.innerHTML = `
    <h3 id="baseBranchInspectorTitle">基础枝 · 叶花果编辑</h3>
    <p class="vine-note" id="baseBranchSelectionCount" aria-live="polite"></p>
    <p class="vine-note">点选单元，Shift 框选加选，Ctrl 框选减选。</p>
    <div class="field-grid">
      <label>选择类型<select id="baseBranchSelectionFilter">
        <option value="ALL">全部</option><option value="LEAF">叶片</option><option value="FLOWER">花</option>
        <option value="BUD">花苞</option><option value="FRUIT">果实</option>
      </select></label>
      <label>变换中心<select id="baseBranchPivot">
        <option value="EACH">各自柄根</option><option value="CENTER">共同中心</option>
      </select></label>
    </div>
    <label>视口手柄<select id="baseBranchGizmo">
      <option value="MOVE">移动</option><option value="ROTATE">旋转</option>
      <option value="SCALE">等比缩放</option><option value="OFF">隐藏</option>
    </select></label>
    <div class="wb-row">
      <button type="button" id="baseBranchInspectorMove">移动 G</button>
      <button type="button" id="baseBranchInspectorRotate">旋转 R</button>
      <button type="button" id="baseBranchInspectorScale">缩放 S</button>
    </div>
    <div class="wb-row">
      <button type="button" id="baseBranchInspectorCopy">复制 Shift+D</button>
      <button type="button" id="baseBranchInspectorDelete">删除 Delete</button>
    </div>
    <label>替换素材<select id="baseBranchReplaceSource"></select></label>
    <button type="button" id="baseBranchReplaceApply">替换所选单元</button>
    <details id="baseBranchExact" class="companion-advanced">
      <summary>精确位置与姿态</summary>
      <div class="field-grid">
        <label>沿枝位置（%）<input id="baseBranchPositionPct" type="number" min="0" max="100" step="any"></label>
        <label>尺寸倍率<input id="baseBranchExactScale" type="number" min=".05" max="8" step="any"></label>
        <label>局部旋转 X（°）<input id="baseBranchRotationX" type="number" step="any"></label>
        <label>局部旋转 Y（°）<input id="baseBranchRotationY" type="number" step="any"></label>
        <label>局部旋转 Z（°）<input id="baseBranchRotationZ" type="number" step="any"></label>
      </div>
      <button type="button" id="baseBranchExactApply">应用精确参数</button>
    </details>
    <details id="baseBranchBatchEdit" class="companion-advanced">
      <summary>批量调整</summary>
      <div class="field-grid">
        <label>沿枝移动（cm）<input id="baseBranchBatchOffsetCm" type="number" value="0" step="any"></label>
        <label>尺寸乘数<input id="baseBranchBatchScaleFactor" type="number" min=".01" value="1" step="any"></label>
        <label>局部旋转 X（°）<input id="baseBranchBatchRotationX" type="number" value="0" step="any"></label>
        <label>局部旋转 Y（°）<input id="baseBranchBatchRotationY" type="number" value="0" step="any"></label>
        <label>局部旋转 Z（°）<input id="baseBranchBatchRotationZ" type="number" value="0" step="any"></label>
      </div>
      <button type="button" id="baseBranchBatchEditApply">调整所选单元</button>
    </details>
    <button type="button" id="baseBranchCheck">检查挂接与近似重叠</button>
    <p class="vine-note" id="baseBranchCheckStatus" role="status"></p>
    <div id="baseBranchIssues"></div>`;
  const context = document.getElementById('contextProperties');
  if (context) context.prepend(panel);
  else {
    document.body.append(panel);
    // The workbench is constructed before the parameter workspace creates the inspector host.
    queueMicrotask(() => document.getElementById('contextProperties')?.prepend(panel));
  }
  return panel;
}
