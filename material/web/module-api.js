// Stable boundary for an isolated workbench document/iframe in V040.
export function createModuleApi(controller){
  let disposed=false;const alive=()=>{if(disposed)throw Error('树材质模块已卸载。');};
  return Object.freeze({version:1,capabilities:Object.freeze(['layer-tree-groups','effect-library','portable-effect-presets','orientation-distribution','vertical-streak-distribution','effect-instances','composable-distribution-rules','named-surface-areas','geometry-curvature-estimate','shared-masks','static-glb','unique-uv0','mikk-tangents','normal-gl-dx','orm','project-bundle','surface-masks','pixel-masks','smooth-masks','part-bark-materials','source-face-parts','source-part-suggestions','height-band-scopes','workspace-quick-professional','project-history','layer-channels','uv-seams','uv-protection','tree-strip-uv','uv-clearance','height-map','height16-map','normal-map','roughness-map','cancellable-jobs','close-checkpoint','branch-flow','direction-corrections','shared-physical-microdetail','export-png-inspection','prepare-model','final-glb']),
    getSnapshot(){alive();return structuredClone(controller.snapshot());},
    getView(){alive();return controller.getView?.()||null;},
    setView(value){alive();return controller.setView?.(structuredClone(value));},
    async restoreBundle(bytes){alive();if(!controller.restoreBundle)throw Error('宿主未配置材质恢复');return controller.restoreBundle(bytes);},
    async restoreProject(id){alive();if(!controller.restoreProject)throw Error('宿主未配置材质草稿恢复');return controller.restoreProject(id);},
    setStage(stage){alive();if(!controller.setStage)throw Error('宿主未配置页面');return controller.setStage(stage);},
    async checkpoint(result){alive();if(!controller.checkpoint)throw Error('宿主未配置材质检查点');return controller.checkpoint(result);},
    async flushDraft(){alive();return controller.flushDraft?.();},
    async loadModel(bytes,name='Tree.glb'){alive();const data=bytes instanceof ArrayBuffer?bytes:bytes instanceof Uint8Array?bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength):null;if(!data||data.byteLength>150000000||typeof name!=='string'||name.length>180)throw Error('宿主模型输入无效。');const result=await controller.loadModel(data,name);alive();if(!result)throw Error('模型尚未完成载入，可能忙碌、取消或输入不受支持。');return structuredClone(result);},
    async prepareModel(bytes,name='Tree.glb',options={}){alive();const data=bytes instanceof ArrayBuffer?bytes:bytes instanceof Uint8Array?bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength):null;if(!data||data.byteLength>150000000||typeof name!=='string'||name.length>180)throw Error('宿主模型输入无效。');if(!controller.prepareModel)throw Error('宿主未配置模型准备');const result=await controller.prepareModel(data,name,structuredClone(options));alive();if(!result?.report)throw Error('模型准备未完成；当前工程已保留。');return structuredClone(result.report);},
    async exportFinalGLB(){alive();if(!controller.exportFinalGLB)throw Error('宿主未配置最终GLB');const result=await controller.exportFinalGLB();alive();if(!result?.model||!result?.manifest)throw Error('最终GLB尚未生成，请检查UV与当前任务。');return structuredClone(result);},
    applyPreset(settings){alive();controller.applyPreset(structuredClone(settings));return this.getSnapshot();},
    async setMicrodetail(options){alive();if(!controller.setMicrodetail)throw Error('宿主未配置共享近景细节。');const result=await controller.setMicrodetail(structuredClone(options));alive();return structuredClone(result);},
    async exportTextures(){alive();const result=await controller.exportTextures();alive();if(!result?.manifest)throw Error('贴图尚未导出，请检查任务和UV状态。');return structuredClone(result);},
    async inspectExport(){alive();const result=await controller.inspectExport?.();alive();if(!result?.active)throw Error('导出检查尚未完成，请检查当前材质与导出状态。');return structuredClone(result);},
    showLive(){alive();controller.showLive?.();},
    async prepareClose(){alive();if(!controller.prepareClose)throw Error('宿主未配置关闭保存。');const result=await controller.prepareClose();alive();return structuredClone(result);},
    cancelClose(){alive();controller.cancelClose?.();},
    cancel(){if(!disposed)controller.cancel();},
    dispose(){if(disposed)return;disposed=true;controller.dispose();}
  });
}
