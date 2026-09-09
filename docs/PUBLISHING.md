# Publishing Veldra 3D

Live application: https://wieslawsoltes.github.io/Veldra3D/

Repository: https://github.com/wieslawsoltes/Veldra3D

## Static hosting

The application needs no server-side API, runtime package installation, external CDN, or cloud account. GitHub Pages serves the module-based application from the project root. The standalone version is published at `Veldra3D.html`; native-GPU diagnostics are at `tests/gpu.html`.

Runtime CSS and module references are relative. The Pages build stages an allowlist of public files rather than uploading Git metadata, CI configuration, test automation, or local caches.

## Reproduce

```sh
npm test
npm run build:pages
python3 -m http.server 8080 --directory _site
```

Node.js 20 or newer is required by the included scripts; they have no package dependencies. `_site/` is generated and excluded from Git.

## Continuous deployment

`.github/workflows/pages.yml` runs on pushes to `main` and supports manual dispatch. It tests the numerical and graph engines, builds the standalone HTML, runs the real-browser editing checks, verifies the module-based application under the `/Veldra3D/` project prefix, and deploys the staged site using the `github-pages` environment.

Core-test, build, or browser-test failures block publication. Browser reports and screenshots are retained as a separate Actions artifact even when a later step fails. The checks record the rendering backend actually used; they are not a substitute for hardware WebGPU driver and performance validation.

For the initial repository publication, the workflow generates and commits the example documents, standalone build, screenshots, and test/benchmark reports as ordinary repository files. Application source was committed directly, and every runtime file was compared to the delivered source using Git blob hashes. There is no archive loader or runtime source-transfer dependency.

The generated files checked into `dist/`, `examples/`, and the initial reports are a delivery snapshot. Every Pages deployment rebuilds its own current standalone HTML and reruns the tests; the live standalone version therefore tracks the deployed source. Use `npm run build` to refresh a local standalone snapshot after editing source.

`CHECKSUMS.sha256` records the initial published repository contents. It is a snapshot, not a dynamic guarantee for later revisions.

## Verify a deployment

Check the workflow conclusion, the live root, a JavaScript module, the standalone HTML, and `build-info.json`. The build-info file records the source commit of the staged site. Open the application in a WebGPU-capable browser to confirm the backend actually selected on that machine. Unsupported native-GPU diagnostics report skipped rather than passed.
