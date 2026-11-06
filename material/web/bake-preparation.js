// Tangent generation may replace the renderer/model and enqueue a new preview mask.
// Final-resolution masks must be the last surface update before baking.
export async function prepareBakeSurface({isCancelled,waitSurface,ensureWorking,refineMasks}){
  const checkpoint=()=>{if(isCancelled())throw Object.assign(Error('任务已取消。'),{name:'AbortError'});};
  checkpoint();await waitSurface();checkpoint();await ensureWorking();checkpoint();await waitSurface();checkpoint();await refineMasks();checkpoint();
}
