import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import * as THREE from 'three';
import { deserializeGeometry } from './web/branch-kernel.js';
import { plantAttachmentBase } from './web/plant-attachment.js';
import { exportGlb } from './web/glb-export.js';

if (!globalThis.FileReader) globalThis.FileReader = class {
  async readAsArrayBuffer(blob) { this.result = await blob.arrayBuffer(); this.onloadend?.(); }
  async readAsDataURL(blob) {
    this.result = `data:${blob.type || 'application/octet-stream'};base64,${Buffer.from(await blob.arrayBuffer()).toString('base64')}`;
    this.onloadend?.();
  }
};

const args = process.argv.slice(2);
const option = (name) => { const index = args.indexOf(name); return index < 0 ? '' : args[index + 1] || ''; };
const projectPath = option('--project');
const outputDir = option('--output-dir');
if (!projectPath || !outputDir) throw new Error('用法：pve-leaf-sources-cli.mjs --project 工程.branch.json --output-dir 目录');
const document = JSON.parse(await readFile(projectPath, 'utf8'));
const leafSources = document.leaf_meshes || [];
if (!leafSources.length) throw new Error('工程没有自定义叶片源；内置叶片请另用通用网格');
await mkdir(outputDir, { recursive: true });
const manifest = { format: 'BranchForgePVELeafSources', version: 1, project: path.resolve(projectPath), sources: [] };
for (let index = 0; index < leafSources.length; index++) {
  const source = leafSources[index];
  const geometry = deserializeGeometry(source.geometry);
  if (!geometry) throw new Error(`叶片源 ${index} 没有有效几何`);
  const base = plantAttachmentBase(geometry);
  geometry.translate(-base.x, -base.y, -base.z);
  const calibration = source.calibration || {};
  if (calibration.flip) geometry.scale(-1, 1, 1);
  geometry.rotateY(Number(calibration.rotation || 0) * Math.PI / 180);
  const scale = Number(calibration.scale || 1);
  geometry.scale(scale * Number(document.settings?.leaf_aspect || 1), scale, scale);
  geometry.computeVertexNormals();
  const material = new THREE.MeshStandardMaterial({ name: 'M_Leaf', color: 0x4b8041, roughness: 0.8, side: THREE.DoubleSide });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = `LeafSource_${String(index).padStart(2, '0')}`;
  const root = new THREE.Group();
  root.name = mesh.name;
  root.add(mesh);
  // Source +Y becomes UE +Z; source +Z becomes UE +Y, matching FFoliageFacade's frame.
  const bytes = await exportGlb(root, { connector: { position: [0, 0, 0], direction: [0, 1, 0] }, singleMesh: true });
  const file = path.join(outputDir, `${mesh.name}.glb`);
  await writeFile(file, Buffer.from(bytes));
  manifest.sources.push({ index, id: source.id || `LEAF_${index + 1}`, name: source.name || mesh.name,
    glb: file, sha256: createHash('sha256').update(Buffer.from(bytes)).digest('hex') });
  geometry.dispose();
  material.dispose();
}
const manifestPath = path.join(outputDir, 'leaf_sources.manifest.json');
await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
process.stdout.write(`${JSON.stringify({ manifest: manifestPath, count: manifest.sources.length }, null, 2)}\n`);
