import {createStructuralSweepJobs} from './branch-kernel.js';
import {computeTrunkGeometry} from './trunk-geometry-compute.js';
import {geometryTransferBuffers} from './geometry-transfer.js';
import {instantiateNativeGeometryKernel} from './native-geometry-kernel.js';
import {installGeometryAccelerator,geometryAcceleratorState} from './geometry-accelerator.js';
const ready=(async()=>{try{const r=await fetch(new URL('./native/geometry-kernel-v1.wasm',import.meta.url));if(r.ok)installGeometryAccelerator(await instantiateNativeGeometryKernel(await r.arrayBuffer()));}catch{}})();
self.addEventListener('message',async e=>{const {id,job}=e.data;try{await ready;const start=performance.now(),branches=createStructuralSweepJobs(job.settings,job.authoring,job.lodIndex,job.options).map(input=>({id:input.id,geometry:computeTrunkGeometry(input)}));self.postMessage({id,geometry:{version:2,branches},backend:geometryAcceleratorState(),compute_ms:performance.now()-start},branches.flatMap(b=>geometryTransferBuffers(b.geometry)));}catch(error){self.postMessage({id,error:error.stack||error.message});}});
