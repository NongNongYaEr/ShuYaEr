import {parseGLB} from '../model.js';
import {parseSourcePbrGLB} from '../source-pbr.js';
import {restoreWorkingMesh} from '../working-mesh.js';
import {decodeUvResult} from '../mesh-codec.js';
import {validateSourcePbrBase, validateSourcePbrSlots} from '../source-pbr-base.js';

export async function loadExportMesh(meta, store) {
  const materialBase = validateSourcePbrBase(meta.materialBase);
  if (!meta.resources?.source || !meta.resources?.working) {
    if (materialBase) throw Error('导出叠加效果需要原材质 GLB 和对应的工作网格。');
    return {mesh:null, source:null};
  }
  const data = store.get(meta.resources.source);
  const bytes = data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength);
  const source = await (materialBase ? parseSourcePbrGLB : parseGLB)(bytes, meta.modelName);
  if (materialBase) validateSourcePbrSlots(materialBase, source);
  const mesh = await restoreWorkingMesh(source, decodeUvResult(store.get(meta.resources.working)), {
    mode:meta.uvMode, revision:meta.uvRevision
  });
  if (mesh.sourceSHA256 !== meta.sourceSHA256 || mesh.uvSHA256 !== meta.uvSHA256) {
    throw Error('烘焙版本与工程模型不一致，请重新烘焙。');
  }
  return {mesh, source:materialBase ? source : null};
}
