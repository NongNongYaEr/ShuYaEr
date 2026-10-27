import { DISTRIBUTION } from './distribution-config.js';
import { importGrowthSurface } from './surface-growth-import.js';

export async function loadSurfaceExample() {
  const example = DISTRIBUTION.surfaceExample;
  if (!example) return null;
  const response = await fetch(new URL(example.url, import.meta.url));
  if (!response.ok) throw new Error('桥墩示例读取失败，请检查软件示例模型文件');
  const file = new File([await response.blob()], example.name, { type: 'model/gltf-binary' });
  return importGrowthSurface(file, { scale: example.scale, objUp: 'Z' });
}
