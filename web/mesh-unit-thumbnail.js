import {renderPlantThumbnail} from './project-thumbnail.js';
import {resourceIcon} from './resource-ui.js';

const maximumCached = 256;
const unitIcon = resourceIcon('resource-units');
const branchIcon = resourceIcon('resource-branch');

// Draw only visible card sources. The workspace already owns textured models,
// so a thumbnail never decodes another atlas or creates another mesh buffer.
export function createMeshUnitThumbnailView({renderer,getModel,getThumbnail=()=>''}) {
  const sources = new WeakMap();
  const cache = new Map(), waiting = new Map(), ready = new Set();
  let frame = 0;

  function show(node,thumbnail) {
    if (!thumbnail) return;
    const image = document.createElement('img');
    image.src = thumbnail;
    image.alt = '';
    image.decoding = 'async';
    image.draggable = false;
    node.replaceChildren(image);
  }

  function enqueue(id) {
    ready.add(id);
    if (!frame) frame = requestAnimationFrame(renderNext);
  }

  function renderNext() {
    frame = 0;
    for (const id of ready) {
      ready.delete(id);
      const job = waiting.get(id);
      if (!job) continue;
      const nodes = [...job.nodes].filter(node=>node.isConnected);
      if (!nodes.length) { waiting.delete(id); continue; }
      const model = getModel(job.source), existing = getThumbnail(id);
      if (!model && !existing) continue;
      waiting.delete(id);
      let thumbnail = existing;
      if (!thumbnail) {
        try { thumbnail = renderPlantThumbnail(model.clone(true),renderer,96,72); }
        catch { continue; }
      }
      cache.set(id,thumbnail);
      if (cache.size > maximumCached) cache.delete(cache.keys().next().value);
      for (const node of nodes) show(node,thumbnail);
      break;
    }
    if (ready.size) frame = requestAnimationFrame(renderNext);
  }

  function request(node) {
    const source = sources.get(node);
    const {id} = source;
    if (cache.has(id)) { show(node,cache.get(id)); return; }
    const thumbnail = getThumbnail(id);
    if (thumbnail) { show(node,thumbnail); return; }
    let job = waiting.get(id);
    if (!job) { job = {source,nodes:new Set()}; waiting.set(id,job); }
    job.nodes.add(node);
    if (getModel(source)) enqueue(id);
  }

  const observer = typeof IntersectionObserver === 'function' ? new IntersectionObserver(entries=>{
    for (const entry of entries) if (entry.isIntersecting) {
      observer.unobserve(entry.target);
      request(entry.target);
    }
  },{rootMargin:'40px'}) : null;

  return {
    mount(source) {
      const node = document.createElement('span');
      node.className = 'mesh-unit-placed-thumbnail';
      node.setAttribute('aria-hidden','true');
      node.innerHTML = source.role === 'GLB' ? branchIcon : unitIcon;
      const thumbnail = getThumbnail(source.id) || cache.get(source.id);
      if (thumbnail) show(node,thumbnail);
      else if (renderer && !cache.has(source.id)) {
        sources.set(node,source);
        if (observer) observer.observe(node); else request(node);
      }
      return node;
    },
    modelReady(source) { if (waiting.has(source.id)) enqueue(source.id); },
    reset() {
      observer?.disconnect();
      waiting.clear(); ready.clear();
      if (frame) cancelAnimationFrame(frame);
      frame = 0;
    },
  };
}
