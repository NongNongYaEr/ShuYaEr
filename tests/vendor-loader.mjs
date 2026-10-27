export async function resolve(specifier, context, nextResolve) {
  if (specifier === 'three') {
    return { url: new URL('../web/vendor/three.module.min.js', import.meta.url).href, shortCircuit: true };
  }
  if (specifier === 'fflate') {
    return { url: new URL('../web/vendor/fflate-browser.js', import.meta.url).href, shortCircuit: true };
  }
  return nextResolve(specifier, context);
}
