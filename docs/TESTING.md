# Verification record — Veldra 3D 0.1.0

This document preserves the original delivery's verification record. GitHub Actions reruns the checks during publication and records its own current environment, reports, and regenerated screenshots in workflow artifacts. The checked-in generated reports are a snapshot from the initial repository publication; their timings may differ from the historical benchmark below.

## Recorded outcomes

| Check | Result | Scope |
|---|---|---|
| Node core suite | **74 passed, 0 failed, 0 skipped** | Geometry, topology, history, graph solving, validation, and interchange |
| Browser integration | **22 passed** | Real DOM/pointer/keyboard interaction and model-state assertions |
| JavaScript syntax | **Passed** | All source and tool JavaScript modules |
| Native WebGPU | **Not exercised** | The available browser did not expose WebGPU |
| Native WebGL2 | **Not exercised** | The available browser did not provide a WebGL2 context |
| CPU compatibility renderer | **Exercised** | Actual triangle rasterization and depth buffering; original screenshots were from this path |

No graphics or storage APIs were mocked. The original browser run used Chromium 144 on Linux with the standalone build loaded into an opaque document. Consequently secure-context GPU access and local storage were unavailable. The app displayed its real backend and reported autosave unavailability. There were **no uncaught JavaScript errors and no console errors**; expected warnings reported graphics/storage unavailability.

Passing these tests is not a claim of complete CAD correctness, GPU conformance, or production certification.

## Core coverage

The suite checks affine transforms and normals; partition of unity; rational circles and arcs; analytic derivatives; shape-preserving knot insertion and splitting; interpolation; rational surface partial derivatives, extrusion, loft and revolution; mesh orientation, closedness and analytic volumes; concave cap triangulation and rejection of self-crossing caps; mesh subdivision, sectioning and welds; BSP Boolean union/difference/intersection with manifold-output checks; BVH ray picking; document transactions and rollback; data-tree matching and graph invalidation; cycles and upstream errors; invalid-file atomicity; OBJ/STL/DXF/glTF conversion; and regressions for concave OBJ polygons and inside-out Boolean inputs.

## Browser workflows

- Passed: initial scene has real geometry and valid graph.
- Passed: live slider edits regenerate surface geometry.
- Passed: numeric modeling command creates editable box.
- Passed: exact transform updates model.
- Passed: document undo restores transform.
- Passed: document redo reapplies transform.
- Passed: baking creates editable surface and hides live outputs.
- Passed: bake undo restores both graph previews and document.
- Passed: bake redo restores both graph previews and document.
- Passed: NURBS control net exposes editable handles.
- Passed: pointer drag modifies actual NURBS control point.
- Passed: control-point editing is undoable.
- Passed: four cameras render in separate viewports.
- Passed: native file import restores graph and exact model.
- Passed: component library creates an implemented node.
- Passed: dragging graph ports makes a live typed connection.
- Passed: connected component executes its algorithm.
- Passed: dark theme toggles workspace.
- Passed: invalid native import is atomic.
- Passed: mobile layout stays within viewport width.
- Passed: no uncaught JavaScript errors.
- Passed: no renderer-reported errors.

The rendered starting scene contains **12,192 triangles**, **57 component definitions**, and **104 command handlers**. The screenshot is an actual render, not an image embedded in the model canvas. The integration test modifies a NURBS control point using pointer events and checks the changed control point and undo result; it also wires graph ports by dragging them in the UI.

## Reproduce

From the project root, with Node.js 20 or newer:

```sh
npm test
npm run build
node tools/benchmark.mjs
npm start
```

No package installation is needed for the application, core suite, build, or benchmark. The browser suite uses Playwright as a separate development tool:

```sh
python -m pip install playwright
python tests/browser_smoke.py --chromium /path/to/chromium --url http://localhost:8080
```

Without `--url`, the browser script loads the standalone HTML into an opaque document. This default helps in restricted test environments but cannot establish secure-origin WebGPU support.

For native graphics verification, serve the project and open `http://localhost:8080/tests/gpu.html`. The page uses the real renderer, submits its raster pipelines, runs the NURBS compute shader, and compares computed points with the CPU implementation. An unsupported environment is labeled **skipped**, never passed. A passing run on one adapter still does not establish universal driver compatibility or a performance guarantee.

## CPU benchmark record

Warm CPU timings on Intel(R) Xeon(R) Platinum 8370C CPU @ 2.80GHz using Node.js v22.16.0 (linux). Recorded at 2026-09-08T23:28:33.425Z. These are neither GPU frame timings nor promises for other hardware. The unchanged-graph measurement is a cache-hit measurement, not a full geometry recomputation.

| Workload | Warm median | Iterations |
|---|---:|---:|
| CPU NURBS surface tessellation: 96 × 64 cells (12,288 triangles) | 20.901 ms | 15 |
| Exact rational circle: 1,001 point evaluations | 1.007 ms | 15 |
| Incremental graph solve: no changed input | 0.018 ms | 50 |
| Graph update: canopy + 36 ribs + mesh area | 55.617 ms | 10 |
| Closed overlapping-box mesh Boolean union | 3.702 ms | 10 |

Heavy geometry evaluation currently runs on the browser's main thread. The compatibility renderer and large recomputations can therefore reduce responsiveness; this limitation is not hidden behind a fabricated frame-rate claim.

## Evidence files

`tests/node-test-results.tap`, `tests/browser-results.json`, `tests/browser-console.txt`, and `tests/benchmark-results.json` contain recorded results. `docs/workspace.png`, `docs/four-views.png`, `docs/weave-dark.png`, and `docs/mobile.png` are actual browser screenshots, regenerated when publishing the initial repository assets. `docs/CAPABILITIES.md` records the implementation boundaries. Inspect the browser report's `environment.backend` when interpreting any screenshot or result.
