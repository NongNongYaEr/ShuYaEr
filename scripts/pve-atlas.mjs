import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

// Some shipped packs have JPEG bytes in a legacy data:image/png envelope.
// Browsers decode them, but the complete-package contract requires a real PNG.
export function writePveAtlas(uri, destination) {
  const match = /^data:image\/(?:png|jpeg);base64,([A-Za-z0-9+/=]+)$/.exec(uri || '');
  if (!match) throw Error('完整包缺少内嵌叶片图集，请重新选择植物单元的模型与贴图');
  const bytes = Buffer.from(match[1], 'base64');
  if (bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) {
    fs.writeFileSync(destination, bytes); return;
  }
  if (bytes[0] !== 0xff || bytes[1] !== 0xd8) throw Error('图集内容不是有效的 PNG/JPEG，请重新选择贴图');
  execFileSync('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File',
    fileURLToPath(new URL('./pve-atlas.ps1', import.meta.url)), '-Destination', destination],
  { input: match[1], windowsHide: true, timeout: 60000, stdio: ['pipe', 'pipe', 'pipe'] });
}
