# Architecture and numerical design

## Separation of responsibilities

Veldra stores the editable geometric definition independently of its tessellation. A circle is a rational quadratic curve, not its viewport polyline. A surface is a tensor-product control net with degrees, knots, and weights. Primitive solids retain parameters until an operation deliberately converts them to polygonal geometry. This distinction lets a viewport edit regenerate display geometry without degrading the original control representation.

`core` does not depend on the DOM or the renderer. It can be imported into Node for tests or into other applications. `render` consumes cached display meshes and lines, and does not own the model. `ui` implements command dispatch and graph interaction. `app.js` coordinates the document, graph previews, cameras, inspectors, pointer editing, and persistence.

No external numerical, graphics, or node-editor library is loaded. The implementation is ordinary JavaScript modules; the standalone bundler embeds those modules and CSS in dependency order.

## Math and coordinates

World space is right-handed, Z-up. Geometric arithmetic uses JavaScript Number values, i.e. IEEE-754 double precision. Matrix storage is column-major. An object transform is an affine 4×4 matrix, applied after local geometry evaluation. Positions use the full transform; normals use its inverse transpose. Mirroring swaps triangle winding when the transform determinant is negative, preserving outward orientation.

Camera projections use depth in [0,1] for WebGPU. The WebGL vertex shader explicitly remaps that depth to the WebGL clip convention. GPU buffers use Float32 for positions, normals, and shading attributes; GPU compute is a display evaluator, not a replacement for the double-precision geometric definition.

The `M` and `V` namespaces provide vectors, affine composition and inversion, view/projection matrices, ray tests, and bounds. Matrix inversion and the interpolation linear solver use pivoting and reject singular systems rather than silently regularizing them. The linear solver is dense; it is not suitable for enormous global interpolation problems.

## Rational curve evaluation

For degree p, knots U, control points P_i, and positive weights w_i, the curve is:

```text
C(u) = Σ N_i,p(u) w_i P_i / Σ N_i,p(u) w_i
```

The basis uses a local Cox–de Boor recurrence. The public curve parameter t is normalized to [0,1] and mapped into the active knot domain. Positive finite weights and a valid nondecreasing knot vector are required.

The first derivative is computed analytically in homogeneous coordinates. With homogeneous position H=(A,W) and derivative H'=(A',W'):

```text
C'(u) = (A' W − A W') / W²
```

The implementation scales this derivative to the normalized public parameter domain. The second derivative is a finite difference of the analytic first derivative, not a symbolic second-order evaluator. Curvature is consequently numerical:

```text
κ = |C' × C''| / |C'|³
```

Circle and arc segments use rational quadratics. Each segment spans at most 90 degrees; its middle control point uses the reciprocal cosine construction and weight cos(half the sweep). This is an exact conic representation within floating-point arithmetic.

Knot insertion operates on homogeneous controls and preserves the curve. Splitting first raises the interior knot multiplicity to the degree, then constructs the two compatible control/knot sequences. Reversal reverses controls and weights and reflects knots across the active domain. Tests compare sampled points before and after these operations.

Adaptive curve display tessellation explicitly visits each nonempty knot span and checks midpoint and quarter-point chord deviations. It has a recursion budget. Its tolerance is a practical sampling criterion, **not a certified Hausdorff error bound** for arbitrary pathological curves. Length sums the resulting chord lengths. Closest-point search starts from 101 samples and refines with a clamped Newton iteration; it is not a proof of the global closest point for every self-overlapping curve.

Interpolation uses chord-length parameters and a pivoted linear solve. Sampled rebuilding is explicitly an approximation and is not advertised as exact degree elevation.

## Rational surfaces

A surface is a rectangular array of controls. Rows correspond to V; columns correspond to U:

```text
S(u,v) = Σ_j Σ_i N_i,p(u) M_j,q(v) w_ji P_ji
         / Σ_j Σ_i N_i,p(u) M_j,q(v) w_ji
```

Only the nonzero local basis support is accumulated. Analytic U and V derivatives are formed from lower-degree basis values and quotient-rule normalization. The normal is the normalized cross product of those partial derivatives. The sparse evaluator avoids reconstructing the entire homogeneous net for every display sample.

Extruding a curve along a vector creates a degree-one second parameter direction. Revolving constructs a rational angular tensor-product net about world Z. Lofting compatible profiles interpolates homogeneous section controls with a shared rational profile weighting. Incompatible profiles are resampled and interpolated first: the resulting loft approximates the originals. Sweep uses transported frames sampled along its rail, followed by lofting; it is an approximation, not a general exact swept-surface solver.

There is no trim-loop, face, shell, or general B-rep object model in this release. A visually closed display mesh does not turn an untrimmed surface into an analytic B-rep solid.

## Display mesh and polygonal solid operations

Display meshes contain positions, triangle indices, vertex normals, and optional feature/isocurve line segments. Surfaces are sampled into regular grids. Primitive meshes use explicit caps/poles/seams and are verified after tolerance-based welding for closed manifold connectivity and consistent orientation.

Mesh analysis accumulates triangle area and signed tetrahedral volume:

```text
A_triangle = |(b − a) × (c − a)| / 2
V_triangle = a · (b × c) / 6
C_volume   = Σ [V_triangle (a + b + c) / 4] / Σ V_triangle
```

Reported surface areas and volumes are mesh estimates. Volume is meaningful only for an appropriately oriented closed solid. Edge analysis detects boundary, nonmanifold, and inconsistently oriented edges. It does not prove the absence of geometric self-intersection.

Polygon caps use planar ear clipping. Nonplanarity and degenerate configurations are rejected. This is not a polygon-with-holes triangulator. Extrusion normalizes profile orientation relative to the extrusion vector before creating caps and side walls; both reversed input winding and negative extrusion directions have regression tests.

Pipes use sampled rails and parallel-transport-style frames. Loop subdivision supports welded triangle meshes and boundary rules. It is **mesh subdivision**, not a persistent CAD subdivision-surface representation.

Mesh booleans use a polygon BSP: classify vertices against planes; split crossing faces; clip, invert, and combine the two solid trees. The output is welded. A vertex kd-tree locates collinear split vertices on triangle edges, and conforming center fans eliminate T-junctions. The result is checked for closed manifold connectivity; unresolved topology raises an error instead of returning an apparently valid solid. Booleans are tolerance-sensitive and tessellation-dependent. Complex near-tangent or self-intersecting inputs remain outside a robust general-purpose guarantee.

Picking uses a triangle BVH, built per cached display revision, with median splitting along the largest bounding-box dimension. Curve picking additionally measures projected polyline-segment distance in screen space. Box selection currently tests object bounding-box centers, not precise window/crossing containment of every primitive.

## Document, edits, and history

A document stores objects, layers, selection, units, tolerance, and extra data. An object includes a stable ID, geometric recipe, affine transform, display color, material parameters, layer, visibility, lock state, and revision.

Display data is cached by object ID, geometry revision, and display quality. Editing invalidates the affected object. Document transactions capture complete model snapshots, support nested operations, and roll back on failure. Undo/redo is bounded to 80 committed transactions. Snapshot history favors simplicity and correctness over memory efficiency; it is not yet a structural-sharing history store.

Control-point editing intersects the pointer ray with a plane through the selected control point, computes the new world point, and applies the inverse object matrix to update the local control net. Gumball translation projects pointer displacement onto the selected screen-space axis, then changes the world transform. Pointer drags commit a single undo entry on release.

Baking clones a graph geometry output into a document object and hides the corresponding preview. That document history entry carries graph-preview states so its undo/redo restores both sides. Other graph edits retain their own graph history.

Native loading validates both the model and its embedded graph before replacing the current workspace. JSON does not execute scripts. Identifier, color, matrix, finite-coordinate, index, degree, and size checks reject malformed documents. This is defensive validation, not a third-party security audit.

## Weave graph and data trees

A component definition declares inputs, outputs, defaults, access modes, category, and an algorithm. Node instances store only identity, layout, parameters, preview state, and revision. A wire connects an output index to one input index. Each input accepts one wire; use a merge component to combine data.

Connections are checked for declared type compatibility. A reachability test rejects cycles **before** replacing an existing input wire. Evaluation follows a topological order. A cache signature combines the node revision and incoming source stamps. Document reference nodes additionally depend on document version; unrelated arithmetic nodes do not re-evaluate merely because a model object was selected.

Errors are retained at the failing component and propagate to dependents. Changing the invalid input can recover the chain. A paused solver retains its last cache. It is not a partially evaluated live solve.

A DataTree is a sorted collection of explicit nonnegative integer paths and item arrays. Flatten combines branches; graft extends each branch path by the item index; simplify removes the common leading path prefix while retaining a path element. Ordinary item-access inputs use longest-list matching, repeating the final item of shorter nonempty lists. Three-number points/vectors are atomic values, not automatically three-item numeric lists. For tree inputs, branch processing follows the first item-access tree; unmatched companion paths use that tree's last branch. These are Veldra's explicitly defined semantics, not a claim of universal Grasshopper behavioral parity.

There is no arbitrary JavaScript/Python script component, expression interpreter, plugin loader, asynchronous scheduler, or automatic constraint solver. The graph and heavy geometry operations currently execute synchronously. Worker scheduling, cancellation, incremental spatial updates, and large-model streaming are future architectural work, not hidden existing features.

## Rendering backends

The primary renderer uses WebGPU. It batches positions/normals/colors/material parameters and indexed triangles; curves/edges occupy separate line buffers. A shared canvas uses per-camera viewport and scissor rectangles. Scene signatures avoid identical buffer uploads, and camera/display signatures avoid repeated full scene draws when only an overlay or cursor changes.

The raster shaders provide directional GGX-style lighting, hemisphere fill, material roughness/metallicity, tone mapping, a 2048² shadow map with comparison sampling, a derivative-based construction grid, and zebra/normal analysis modes. Shadows use a separate uniform-only bind layout to avoid sampling a depth resource while writing it. The implementation is rasterization, not path tracing. Clipping is visual and does not change topology or construct a capped section solid.

The WGSL compute path evaluates a generic homogeneous NURBS surface into a storage buffer and reads positions back. Its explicit limits are degree 7, 64 controls per direction, and sampling resolution up to 2048 per direction. The command `GPUEvaluate` exercises this path for a selected surface. **The routine viewport surface tessellation remains on the CPU in this release.**

WebGL2 provides depth-buffered smooth shading and lines but not the complete WebGPU shadow/material pipeline. The last-resort CPU reference renderer projects triangles, interpolates vertex lighting, and performs a real per-pixel depth test; it also clips line segments and depth-tests them. It omits GPU-specific fidelity and can be slow. Each backend is named visibly in the status bar.

The status bar reports CPU time spent in the most recent submitted render, not measured GPU execution time or an invented frame rate. No claim of native GPU verification is made for this build environment.

## Interchange and extension points

Native `.veldra` and `.weave` are JSON schemas with explicit format/version markers. Native geometry retains control points, weights, knots, transforms, object properties, and graph definitions. OBJ/STL/DXF/glTF paths are geometry interchange subsets; see the capability matrix for losses and restrictions. External surface formats, materials, textures, and plugins are not silently approximated by claiming native compatibility.

To add a component, define its typed ports and algorithm in `components.js` and add a core test. To add a modeling command, register a handler in `commands.js` and use a document transaction. To add a geometric kind, extend validation, tessellation, line extraction, interchange where appropriate, and invariants. A future analytic B-rep layer should remain independent of the display-mesh types and have explicit topology/tolerance contracts.

## Primary technical references

These public specifications/docs informed API use and workflow understanding; no proprietary implementation source was used.

- W3C WebGPU: https://www.w3.org/TR/webgpu/
- W3C WGSL: https://www.w3.org/TR/WGSL/
- MDN WebGPU: https://developer.mozilla.org/en-US/docs/Web/API/WebGPU_API
- McNeel UI reference: https://docs.mcneel.com/rhino/8/help/en-us/user_interface/rhino_window.htm
- McNeel data-tree guide: https://developer.rhino3d.com/guides/rhinopython/grasshopper-datatrees-and-python/

The equations and implementation details above describe the delivered code and its tests, not a reverse-engineered specification of another product.
