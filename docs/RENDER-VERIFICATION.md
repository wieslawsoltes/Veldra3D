# Final-render verification — 2026-09-09

The first final-render implementation was committed as `31a6268475e6896cbf4efa5891dd1c9e240a4709`. [GitHub Actions run 34350240741](https://github.com/wieslawsoltes/Veldra3D/actions/runs/34350240741) completed both its build and Pages deployment successfully. Generated assets and results were committed as `ebb2ccb60dd24a0297235e544490f0a7e377b058`.

## Observed results

| Check | Result |
|---|---|
| Core geometry, graph, interchange and rendering tests | 94 passed in that first CI run |
| Existing modeling/browser workflow | 22 checks passed for both standalone and project-prefixed module builds |
| Final rendering in standalone HTML | 19 checks passed using real CPU workers; 640 × 426, 48-sample final PNG and workspace screenshot generated |
| Final rendering in project-prefixed module build | 19 checks passed using real CPU workers |
| Forced native WebGPU final rendering | 19 checks passed; no shader/API mocks and no fallback accepted |
| Pages build and deployment | Successful |

The WebGPU run used Chromium 143 on a secure localhost origin and an adapter with vendor `google` and architecture `swiftshader`. Both the modeling viewport and final renderer initialized WebGPU. The final test rendered a 96 × 64 image at four samples per pixel, read back real radiance/AOV buffers, observed 6,099 surface pixels and positive finite radiance, exported a binary EXR, and exercised pause/resume, cancellation, restart and display controls. There were no recorded JavaScript or console errors.

**SwiftShader is a software GPU adapter.** This verifies actual WGSL compilation, WebGPU pipeline creation, compute dispatch, rendering and readback through the browser API. It is not a discrete-GPU performance benchmark or validation across all drivers. The locally permitted browser origin did not expose WebGPU; local CPU tests and CI WebGPU tests are reported separately.

## Retained evidence

- [WebGPU report](../tests/final-render-webgpu-results.json)
- [Module CPU report](../tests/final-render-module-results.json)
- [Standalone CPU report](../tests/final-render-standalone-results.json)
- [Core TAP output](../tests/node-test-results.tap)
- [Render window screenshot](final-render-workspace.png)
- [Actual final PNG](final-render-canopy.png)

The accompanying input-validation follow-up adds two regression tests: imported light data is normalized before use in UI attributes or GPU buffers, and valid three-digit document colors retain their meaning in final rendering. The local core suite then passes **96 tests**. Every subsequent successful CI run refreshes the reports and standalone distribution; consult the current workflow for the result of later revisions rather than treating this dated record as a future guarantee.

See [Final rendering](FINAL-RENDERING.md) for algorithms, file formats, resource limits and deliberately unimplemented systems.
