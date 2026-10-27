import {computeTrunkGeometry} from './trunk-geometry-compute.js';
import {geometryTransferBuffers} from './geometry-transfer.js';
import {instantiateNativeGeometryKernel} from './native-geometry-kernel.js';
import {installGeometryAccelerator,geometryAcceleratorState} from './geometry-accelerator.js';
let initializationError=null;
// Register the inbox synchronously: a module-worker message can arrive while
// the optional accelerator is still being fetched and instantiated.
const ready=(async()=>{try{const response=await fetch(new URL('./native/geometry-kernel-v1.wasm',import.meta.url),{cache:'no-store'});if(!response.ok)throw Error('C++ geometry module unavailable');installGeometryAccelerator(await instantiateNativeGeometryKernel(await response.arrayBuffer()));}catch(error){initializationError=error.message;}})();
self.addEventListener('message',async event=>{const {id,job}=event.data;try{await ready;const started=performance.now(),geometry=computeTrunkGeometry(job);self.postMessage({id,geometry,compute_ms:performance.now()-started,backend:geometryAcceleratorState(),initializationError},geometryTransferBuffers(geometry));}catch(error){self.postMessage({id,error:error.stack||error.message});}});
