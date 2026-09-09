# Final rendering

Veldra's final renderer is separate from the interactive viewport. The viewport's **Rendered** display mode remains a raster display mode; **Render → Render final image** and **F9** start a progressive light-transport render in the new Render studio window.

## Workflow

Open **Render** at the top right to configure a job without starting it. Choose the active or a named modeling camera, set output dimensions, samples and path depth, then click **Render**. Draft, Standard and Production presets provide starting points, not quality guarantees. The image progressively converges; increasing samples reduces Monte Carlo noise.

The job includes visible document objects and, by default, live Weave geometry without baking. Hidden objects and hidden layers are omitted. Curves and points are construction geometry rather than infinitely thin renderable objects: create a surface or use Pipe for thickness. Grids, control points, selection outlines and other editing overlays never enter the final scene.

**Pause**, **Resume** and **Stop** operate on the actual job. Stopping retains the partial image and its per-pixel sample counts. Starting again clears the previous accumulation and captures a fresh scene and camera. Closing the render window stops the active job. **Store A** saves the developed image; **Compare A** toggles that reference over the current result. **Fit / 1:1** switches image inspection scale.

Exposure, tone mapping, display pass and denoising are post-processing controls and do not require retracing. Changes to geometry, optics, lights, resolution or the camera require a new render. The job uses a frozen snapshot: a running result does not silently mix samples from different scenes.

## Engines and light transport

**Automatic** first attempts WebGPU and falls back to the CPU worker renderer with the actual reason shown in the backend tooltip and diagnostics. **WebGPU only** fails explicitly when the adapter or pipeline is unavailable; it does not report CPU work as GPU rendering. **CPU workers** selects the independent reference path deliberately.

Both engines implement triangle-ray intersections, a balanced binary bounding-volume hierarchy, progressive anti-aliasing, multiple light bounces, diffuse indirect illumination, reflection, ideal dielectric refraction, total internal reflection, Russian roulette, explicit light sampling and power-heuristic multiple importance sampling for environment and emissive geometry. Point and spot lights have inverse-square attenuation. Sun lights have an angular spread for soft direct shadows. Rectangular lights are actual emissive geometry, so they are visible to camera and reflected rays. Mesh objects with positive emission are also sampled as light sources.

The BVH uses longest-axis median partitioning with leaves of up to six triangles and a bounded depth of 40; it is not a surface-area-heuristic builder. Meshes are transformed into world space before construction. The geometry kernel's NURBS tessellator supplies final-render triangles at the selected quality. Render accuracy therefore includes the existing tessellation approximation; this is not direct analytic NURBS ray intersection.

The WGSL compute shader uses 8 × 8 workgroups, a bounded 64-entry traversal stack, and eight storage-buffer bindings. Work is submitted in 64 × 64-pixel tiles with progress and cancellation points between submissions. It stores scene-linear floating-point accumulated radiance, sample counts, primary surface normals/depth and albedo/coverage. A separate fullscreen pipeline develops the image and displays AOVs.

The CPU implementation runs in one to four real Web Workers. A self-contained kernel is serialized into a Blob worker so both the module distribution and single-file HTML work without a worker URL dependency. Workers trace 32 × 32-pixel tiles and transfer typed pixel buffers to the window. Scene capture, image preparation, tessellation and BVH construction currently remain on the main thread. No benchmark claim is made for large scene preparation or discrete-GPU performance.

## Materials

The material panel edits actual document objects and participates in document undo/redo. It includes matte, ceramic, aluminum, gold, glass, water and emissive starting presets; base color, metallic, roughness, transmission, index of refraction, emission color and strength; embedded bitmap base-color textures; and a procedural checker pattern.

Opaque scattering combines an isotropic GGX microfacet specular lobe, Smith masking, Schlick Fresnel and a diffuse term. Transmission is a mixture with an **ideal smooth dielectric interface**, using Fresnel reflection/refraction probabilities and total internal reflection. Roughness affects the opaque lobe; it does **not** produce rough or frosted glass. There is no participating interior medium or colored volume absorption. Base color tints transmitted throughput at each interface, which is not a Beer–Lambert absorption model.

Bitmap and checker textures use world-space box projection, repeat size and rotation. They are not authored UV unwraps. LDR color images are decoded to linear RGB; transparent bitmap alpha does not cut out geometry. Normal, bump, displacement, roughness-map and metalness-map slots are not implemented. Use **Apply to viewport selection** to copy the current object's material to selected objects. Bake parametric previews to assign independent document materials.

## Lighting and camera

Lighting controls include the procedural studio sky, a black environment option, environment intensity and rotation, embedded image environments, a two-softbox studio rig, and editable sun, point, spot and rectangular lights. Light positions, directions, colors and intensities are saved with the document. Rectangles have editable width and height; spots have a cone angle; suns have an angular spread.

Radiance RGBE `.hdr` and browser-decodable LDR image environments are accepted. HDR decoding supports conventional scanline RLE and flat RGBE data with Y-then-X orientation; legacy repeat encoding is rejected with an actionable error. Environment pixels are sampled with a luminance-and-solid-angle-weighted cumulative distribution. Image sampling and the associated PDF use the same piecewise-constant environment representation. HDR resizing uses area averaging so small bright emitters are not simply discarded.

Only embedded image data is read by the render image loader. Arbitrary remote image URLs are not fetched. Input images are limited to 32 MiB; decoded HDR maps to 16 megapixels and LDR images to 32 megapixels. Working environment maps are resized to at most 1024 × 512; other working textures to at most 1024 × 1024. These are deliberate memory limits, not lossless original-resolution texture processing.

Perspective and orthographic modeling cameras are supported. Aperture is a lens diameter in scene units, with a focus distance in scene units. Zero aperture is a pinhole camera. **Focus on camera target** transfers the modeling camera's target distance. The optional finite ground plane has an editable elevation and color, with a command to place it beneath the model. Transparent background affects camera visibility while preserving environment lighting in reflected/refracted paths.

## Image development and output

The window exposes Beauty, Albedo, World normals, Camera depth and Sample count views. Exposure is in stops. Tone mapping choices are an ACES-fitted curve, Reinhard and linear clipping, followed by sRGB encoding. The ACES-fitted curve is not a complete ACES/OCIO color-management pipeline.

Optional denoising is a 5 × 5 spatial filter guided by primary normals, depth and albedo. It is not an AI denoiser and does not create additional lighting samples. HDR and EXR remain unfiltered. Optional firefly/radiance clamping can suppress extreme samples but introduces bias; the default is off.

| Format | Stored data |
|---|---|
| PNG | Selected developed display pass at the actual output resolution; 8-bit RGBA, with optional transparent beauty background |
| JPEG | Selected developed display pass, 8-bit RGB; transparent areas composited over white |
| Radiance HDR | Scene-linear, unfiltered beauty in RGBE, with scanline RLE and no exposure/tone mapping baked in |
| OpenEXR | Uncompressed scanline OpenEXR v2, float32 channels: R, G, B, A, Z, albedo.R/G/B, normal.X/Y/Z, samples |

EXR beauty is scene-linear Rec.709/D65 with premultiplied camera coverage when transparency is enabled. Z is primary camera-ray distance; normals are world-space; albedo and feature passes are center-of-pixel first-sample features. They do not include anti-aliased/depth-of-field-filtered surface attributes. Sample counts are per pixel and support partially completed jobs. The header records chromaticities and render/camera metadata. EXR files contain real binary scanline chunks and offset tables, not renamed JSON or PNG files.

Render settings and lights are stored in `document.extra.finalRender`; material attributes and embedded texture data live on document objects. Native `.veldra` saving, restore and undo preserve them. Browser local storage has a separate browser-defined quota; large embedded images should be retained using native file downloads rather than relying on autosave.

## Resource limits and remaining boundaries

Output is limited to 8,388,608 pixels with each dimension from 16 to 8192, supporting 3840 × 2160 UHD. Path depth is 1–32, samples 1–65,536, user lights at most 64 and final triangles at most 500,000. GPU buffer allocations are checked against adapter limits; a particular device can impose a lower practical resolution. HDR/AOV readback and image encoding require additional memory beyond the render buffers.

Not implemented in this release: volumetric media, subsurface scattering, hair/fur, spectral transport, motion blur or animation rendering, light linking, rendering across machines, adaptive sampling, an SAH/instancing acceleration structure, dedicated caustic solvers, a node-based material graph, native renderer plugin compatibility, full UV/PBR map workflows, render-region jobs, cryptomatte and compressed/multipart EXR. Nested dielectric medium stacks and production topology validation are also absent. Thin or badly tessellated geometry may reveal ray-offset/tessellation limitations. These are development boundaries, not features hidden behind nonfunctional controls.

## Tests and reproduction

Run `npm test` and `npm run build`. The local implementation run passed **94 Node tests** (74 existing plus 20 final-render tests), **22 existing modeling browser checks**, and **19 final-render browser checks using real CPU workers**. The local browser did not expose WebGPU in its permitted execution origin, so those passes do not certify GPU execution. The CI workflow includes a separate forced-WebGPU run and preserves its adapter information and errors; only its actual result should be treated as GPU verification. A software WebGPU adapter validates shader/API execution, not discrete hardware throughput.

```sh
python3 tests/final-render-browser.py --chromium /path/to/chromium
python3 tests/final-render-browser.py --chromium /path/to/chromium --screenshot
python3 tests/final-render-browser.py --chromium /path/to/chromium --url http://localhost:8080/ --require-webgpu
```

The first command uses the built standalone HTML in an opaque document and forces CPU workers. The third requires a real WebGPU adapter on a secure local origin and fails rather than skipping when it cannot initialize. No GPU API mocks are used. Tests cover real radiance and AOV buffers, material/light persistence, binary EXR downloads, UI responsiveness, pause/resume, cancellation, restart, mobile layout and errors. Node tests independently validate BVH hits against brute force, HDR PDFs, no-light/no-radiance behavior, emission, closed-interface glass, RGBE round trips and EXR channel/offset/value layout.

Primary algorithm/format references: [PBRT 4, A Better Path Tracer](https://pbr-book.org/4ed/Light_Transport_I_Surface_Reflection/A_Better_Path_Tracer), [WGSL specification](https://www.w3.org/TR/WGSL/), and [OpenEXR file layout](https://openexr.com/en/latest/OpenEXRFileLayout.html). Implementation is original JavaScript/WGSL and adds no runtime dependency.
