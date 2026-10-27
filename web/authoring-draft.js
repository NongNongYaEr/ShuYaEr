// Synchronous edits of normalized JSON data. Getters preserve normal Array and
// structuredClone behavior while copying only paths the mutation changes.
// A separate, independent history snapshot is still taken before installation.
const readers=new WeakMap();

// A calculation can read the current plain value without expanding untouched
// draft descendants or finalizing the transaction. Unchanged data stays shared.
export function readAuthoringDraft(value){return readers.has(value)?readers.get(value)():value;}

export function createAuthoringDraft(source) {
  const states = new WeakMap(), accessors = new Map();
  const plain = value => value && typeof value === 'object'
    && (Array.isArray(value) || Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null);
  function wrap(original) {
    const value = Array.isArray(original) ? new Array(original.length) : {};
    const state = { original, value, children: new Map(), assigned: new Map(), getters: new Map(), done: false };
    states.set(value, state);
    readers.set(value,()=>currentNode(state));
    for (const key of Object.keys(original)) {
      if (!accessors.has(key)) accessors.set(key, {
        get() {
          const current = states.get(this);
          if (current.assigned.has(key)) return current.assigned.get(key);
          const item = current.original[key];
          if (!plain(item)) return item;
          if (!current.children.has(key)) current.children.set(key, wrap(item));
          return current.children.get(key);
        },
        set(item) { const current = states.get(this); current.assigned.set(key, item); current.children.delete(key); },
      });
      const property = accessors.get(key);
      state.getters.set(key, property.get);
      Object.defineProperty(value, key, { enumerable: true, configurable: true, ...property });
    }
    return value;
  }
  function assigned(value, seen = new WeakMap(), active = new WeakSet(), resolveNode = finishNode) {
    if (!plain(value)) return value;
    if (states.has(value)) return resolveNode(states.get(value));
    if (active.has(value)) throw new TypeError('Authoring edits must remain acyclic JSON');
    if (seen.has(value)) return seen.get(value);
    active.add(value);
    let result = value;
    for (const key of Object.keys(value)) {
      const next = assigned(value[key], seen, active, resolveNode);
      if (next === value[key]) continue;
      if (result === value) {
        result = Array.isArray(value) ? value.slice() : { ...value };
        seen.set(value, result);
      }
      Object.defineProperty(result, key, { value: next, enumerable: true, writable: true, configurable: true });
    }
    active.delete(value);
    seen.set(value, result);
    return result;
  }
  function currentNode(state,seen=new WeakMap(),active=new WeakSet()){
    if(active.has(state.value))throw new TypeError('Authoring edits must remain acyclic JSON');
    if(seen.has(state.value))return seen.get(state.value);
    active.add(state.value);
    const keys=Object.keys(state.value),values=new Array(keys.length);
    let changed=keys.length!==Object.keys(state.original).length||Array.isArray(state.value)&&state.value.length!==state.original.length;
    const resolve=value=>assigned(value,seen,active,child=>currentNode(child,seen,active));
    for(let i=0;i<keys.length;i++){
      const key=keys[i],descriptor=Object.getOwnPropertyDescriptor(state.value,key);
      const value=descriptor.get&&descriptor.get===state.getters.get(key)
        ?state.assigned.has(key)?resolve(state.assigned.get(key)):state.children.has(key)?currentNode(states.get(state.children.get(key)),seen,active):state.original[key]
        :resolve(state.value[key]);
      values[i]=value;if(!Object.hasOwn(state.original,key)||value!==state.original[key])changed=true;
    }
    let result=state.original;
    if(changed){result=Array.isArray(state.value)?new Array(state.value.length):{};for(let i=0;i<keys.length;i++)Object.defineProperty(result,keys[i],{value:values[i],enumerable:true,writable:true,configurable:true});}
    active.delete(state.value);seen.set(state.value,result);return result;
  }
  function finishNode(state) {
    if (state.done) return state.result;
    if (state.finishing) throw new TypeError('Authoring edits must remain acyclic JSON');
    state.finishing = true;
    const keys = Object.keys(state.value), originalKeys = Object.keys(state.original);
    let changed = keys.length !== originalKeys.length || Array.isArray(state.value) && state.value.length !== state.original.length;
    const values = new Array(keys.length);
    for (let i = 0; i < keys.length; i++) {
      const key = keys[i];
      const descriptor = Object.getOwnPropertyDescriptor(state.value, key);
      let value;
      if (descriptor.get === state.getters.get(key) && descriptor.get) {
        value = state.assigned.has(key) ? assigned(state.assigned.get(key))
          : state.children.has(key) ? finishNode(states.get(state.children.get(key))) : state.original[key];
      } else value = assigned(state.value[key]);
      if (!Object.hasOwn(state.original, key) || value !== state.original[key]) changed = true;
      values[i] = value;
    }
    state.result = state.original;
    if (changed) {
      state.result = Array.isArray(state.value) ? new Array(state.value.length) : {};
      for (let i = 0; i < keys.length; i++) Object.defineProperty(state.result, keys[i], { value: values[i], enumerable: true, writable: true, configurable: true });
    }
    state.done = true;
    state.finishing = false;
    return state.result;
  }
  const value = wrap(source);
  return { value, finish() { return finishNode(states.get(value)); } };
}
