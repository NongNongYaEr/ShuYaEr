# Local Three.js patches

`three.module.min.js`, `Xn` (WebGLBindingStates): retain a reverse index from
object binding key to geometry IDs. `releaseStatesOfObject` visits only those
geometries. The original nested binding tables, per-program/wireframe VAOs,
shared non-instanced key `0`, and actual VAO deletion rules remain unchanged.
Geometry disposal and global disposal remove reverse-index entries. Program
disposal keeps the existing empty object tables indexed until their owner or
geometry is released.

This avoids scanning every retained source geometry for each retired complete
unit batch. Source geometries can remain alive while the next viewport asset
borrows them; disposing a shared geometry merely to accelerate binding cleanup
would break that ownership contract.

Regression: `tests/webgl-binding-states.test.mjs` executes the shipped function
with a counted GL context. Actual editor preview, materialization, repeated
rebuilds and GPU validation also exercise the renderer. Reapply/review this
patch when replacing Three.js; keep the upstream license.
