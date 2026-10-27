import fs from 'node:fs';
import path from 'node:path';

// Build inputs may themselves live in .runtime; exclude generated descendants,
// never an ancestor of an explicitly selected, verified build input.
export function copyReleaseInput(from,destinationRoot,relative){
 if(fs.lstatSync(from).isSymbolicLink())throw Error('Symlink input');
 const root=path.resolve(destinationRoot),target=path.resolve(root,relative);
 if(!target.startsWith(root+path.sep))throw Error('Escaping release path');
 fs.mkdirSync(path.dirname(target),{recursive:true});
 fs.cpSync(from,target,{recursive:true,errorOnExist:true,force:false,preserveTimestamps:true,filter:file=>{
  if(fs.lstatSync(file).isSymbolicLink())throw Error('Symlink input');
  // Node's Windows copier reports extended (\\?\) source paths to filters.
  const child=path.relative(path.toNamespacedPath(from),path.toNamespacedPath(file));
  return !child.split(path.sep).some(p=>['.git','__pycache__','.runtime'].includes(p));
 }});
}
