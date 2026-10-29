// Only explicitly sealed, validated JSON resources may be shared by history.
// Editable authoring containers remain independent. This registry cannot be
// forged by an imported JSON field such as `immutable: true`.
const sealed = new WeakSet();
export const isImmutableJson = value => !!value && typeof value === 'object' && sealed.has(value);
export function sealImmutableJson(value, active = new WeakSet()) {
  if (!value || typeof value !== 'object' || sealed.has(value)) return value;
  if (active.has(value)) throw new TypeError('Immutable resources must be acyclic JSON');
  if (!Array.isArray(value) && ![Object.prototype, null].includes(Object.getPrototypeOf(value))) throw new TypeError('Immutable resources must be plain JSON');
  active.add(value);
  for (const item of Object.values(value)) sealImmutableJson(item, active);
  active.delete(value);
  Object.freeze(value); sealed.add(value); return value;
}
