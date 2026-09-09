# Capability and compatibility matrix

This matrix distinguishes native definitions, numerical approximations and absent systems. A menu entry invokes an implemented operation; it does not imply every production edge case of a similarly named CAD command is supported. Final rendering was added in 0.2; see [Final rendering](FINAL-RENDERING.md) and the [observed CPU/WebGPU verification record](RENDER-VERIFICATION.md).

| System | Implementation | Boundary |
|---|---|---|
| NURBS curve | Positive-weight rational curve, arbitrary valid knots; double precision | Imported degree limited to 15; no general degree reduction/elevation, periodic reconstruction or conic recognition |
| Circle / arc | Rational quadratic representation | Local XY plane transformed for construction planes; sweeps at most one revolution |
| Curve differential analysis | Analytic first derivative; finite-difference second derivative | Curvature and closest-point refinement are numerical |
| Curve insertion/split/reverse | Shape-preserving homogeneous operations | Interior split/insertion only; positive-weight domain |
| Curve rebuild | Chord-length interpolation through sampled points | Approximate; not shape-preserving degree elevation |
| Curve join | Greedy sampled endpoint chaining | Polyline, not a joined analytic polycurve; endpoint threshold 10× document tolerance |
| Curve offset | Sampled XY-planar mitered polyline | No general 3D offset or robust global self-intersection cleanup |
| Surface | Untrimmed rational tensor-product NURBS | No trim loops, analytic face adjacency, B-rep shell or surface intersection solver |
| Loft | Exact interpolation of compatible rational profiles | Incompatible profiles are first resampled into compatible approximations |
| Revolve | Rational tensor-product angular construction | World Z axis; no automatic cap/topological solid representation |
| Sweep | Sampled transported frames and loft | Approximation; no full two-rail/guide continuity constraints |
| Extrude / pipe | Editable source recipe and polygonal mesh | Caps need suitable simple planar closed profiles; no holes/automatic Boolean cleanup |
| Primitive solids | Closed meshes and retained parameters | Not analytic B-rep solids |
| Mesh booleans | BSP clipping, weld, T-junction repair and topology validation | Tessellation/tolerance dependent; no arbitrary self-intersecting-input guarantee; 60,000-triangle combined input budget |
| Subdivision | Loop rules on triangle meshes | Not a persistent CAD SubD kernel; maximum three iterations |
| Mesh analysis | Triangle area/volume/centroid and edge topology | Not exact NURBS integration or general self-intersection detection |
| Sections | Triangle/plane segments | Not joined exact curves; command uses horizontal world-Z plane |
| Selection | BVH mesh hits, projected curves, center-based selection box | No subface/edge topology editing or precise crossing-window mode |
| Gumball | Interactive world-axis translation | Rotation/scaling via commands/dialogs rather than three-axis rings |
| Control editing | Control-net pointer editing with undo | No surface knot insertion, degree editing, cage deformation or viewport weight handles |
| Materials | Color, GGX opaque roughness/metallic, ideal dielectric transmission/IOR, emission, bitmap base color and checker patterns | Box-projected textures; no node graph, rough/frosted glass, volumetric absorption, normal/displacement or complete UV/PBR map workflows |
| Rendered viewport | WebGPU raster shaders, MSAA and shadow maps | Interactive raster display; final light transport is a separate Render studio job |
| Final-render engine | Progressive CPU/WebGPU BVH path tracing; multibounce illumination; MIS; soft direct shadows; reflection and ideal refraction | Tessellated geometry, median BVH; no volumes, subsurface scattering, hair, motion blur, adaptive sampling or distributed rendering |
| Final-render lighting | Importance-sampled HDR/LDR environment; sky, sun, point, spot, rectangular and emissive-geometry lights | Working environment capped at 1024 × 512; no light linking, dedicated caustic solver or spectral transport |
| Final-render camera/jobs | Perspective/orthographic, physical aperture and focus, ground, transparency, pause/resume/stop/restart and image comparison | Fixed scene/camera snapshot; no animation queue or render-region jobs |
| Final image development | Exposure, ACES-fitted/Reinhard curves, sRGB, feature-guided spatial denoising and AOV previews | Not full ACES/OCIO management or an AI denoiser; raw exports remain unfiltered |
| Final image export | PNG/JPEG, actual Radiance RGBE and float32 scanline EXR with beauty/alpha/albedo/normal/depth/sample channels | Uncompressed single-part EXR only; no EXR import, cryptomatte or anti-aliased feature AOVs |
| GPU compute | NURBS evaluator/readback plus final-render path-trace compute | Modeling display and final NURBS tessellation remain CPU; GPU tracing consumes triangles |
| Fallbacks | WebGL2/software viewport rasterization; real final-render CPU workers | Viewport fallback has reduced shading fidelity; final CPU worker transport is real but not a GPU performance substitute |
| Weave | 57 components, trees, lacing, caching, previews and baking | Own semantics/formats, not native runtime/plugin ecosystem compatibility |
| Native persistence | `.veldra` model/graph/render settings/lights/materials; `.weave` graph | Version 1 document format; embedded images can exceed browser autosave quotas; no native Rhino/Grasshopper files |
| OBJ | Vertices, triangle/polygon faces, line segments | One imported mesh; no retained hierarchy, materials, textures, UVs, normal import or NURBS entities |
| STL | Binary and ASCII triangles | No units, colors, curves, materials or parametric reconstruction |
| DXF | LINE, 3DFACE, straight LWPOLYLINE import; LINE/3DFACE export | No blocks, dimensions, splines, bulges, hatches, text, general semantics or layer-preserving import |
| glTF | 2.0 export, embedded buffers, normals, Z-up→Y-up | Export-only meshes; no material/texture export, curves, animation, skinning or extensions |
| Input validation | IDs, transforms, finite geometry, topology indices, graph structure; normalized final-render settings and light attributes | Not an independent security audit or a process-isolation sandbox |
| Large-model performance | Revision caches, BVHs, batching, incremental graph solve; off-main-thread final tracing | Main-thread geometry/graph/tessellation/BVH preparation; no out-of-core streaming or LOD; final cap 500,000 triangles and 8,388,608 pixels subject to adapter limits |
| Mobile | Responsive modeling chrome, pointer/touch navigation and responsive render window | Desktop-oriented CAD interaction; not a comprehensive mobile usability certification |

## Explicit major omissions

General trimmed B-rep modeling; robust analytic intersections/booleans; production surface/edge fillets, blends and chamfers; full continuity/constraint modeling; dimensions, annotations and layouts; native .3dm/.gh/.ghx; STEP/IGES; arbitrary plugins/scripts; full material-node/UV/PBR authoring; volumes, subsurface scattering, hair and motion blur; fabrication/manufacturing; collaboration; production CAD certification.

Final rendering, bitmap base-color textures, smooth glass, global illumination, denoising, EXR and AOV output are no longer listed as wholly absent. Their actual implementations and limits are described above rather than implying complete production-renderer parity.

## Verification boundary

Core tests check representative invariants and regressions; browser tests exercise real workflows and the actual initialized backend. Neither establishes universal correctness over arbitrary CAD inputs. The original 0.1 local browser did not expose native graphics. The 0.2 CI run successfully executed both viewport and final WebGPU pipelines on Chromium's SwiftShader adapter, with 19 final-render WebGPU checks and no recorded JavaScript/console errors. This is software-adapter API/shader verification, not discrete-GPU throughput measurement or validation across all drivers. Refer to current CI artifacts and the dated [verification record](RENDER-VERIFICATION.md).
