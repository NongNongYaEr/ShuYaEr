// Lucide leaves its marker on generated SVGs. Repeated panel refreshes used to
// replace thousands of already rendered outliner icons across the document.
export function installIconReuse(lucide) {
  if (!lucide?.createIcons) return;
  const create = lucide.createIcons;
  lucide.createIcons = (options = {}) => {
    // An explicit appearance request must still update existing icons.
    if (options.attrs || options.nameAttr || options.icons) return create(options);
    const root = options.root || document;
    return create({ ...options, root: {
      querySelectorAll: selector => root.querySelectorAll(
        selector === '[data-lucide]' || selector === '[icon-name]' ? `${selector}:not(svg)` : selector),
    } });
  };
}
