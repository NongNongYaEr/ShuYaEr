// Retain the already displayed preview while its replacement is built. Release
// borrowed geometry just before disposing/reusing the owner, never for a frame
// between accepting an edit and displaying its replacement.
export function createPreviewHandoff() {
  let pending = null;
  function release(owner) {
    if (!pending || (owner && pending.owner !== owner)) return;
    const previous = pending; pending = null;
    previous.preview.restore();
  }
  return {
    get active() { return Boolean(pending); },
    release,
    commit(owner, preview, mutate) {
      if (!preview) return mutate();
      release();
      try {
        const accepted = mutate();
        if (accepted === false) { preview.restore(); return false; }
        pending = { owner, preview }; return accepted;
      } catch (error) { preview.restore(); throw error; }
    },
  };
}
