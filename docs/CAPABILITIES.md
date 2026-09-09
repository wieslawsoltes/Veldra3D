# Capability and compatibility matrix

This matrix distinguishes native definitions, numerical approximations, and absent systems. A menu entry only invokes an implemented operation; it does not imply every production edge case of a similarly named CAD command is supported.

| System | Implementation | Boundary |
|---|---|---|
| NURBS curve | Positive-weight rational curve, arbitrary valid knots; double precision | Imported degree limited to 15; no general degree reduction/elevation, periodic reconstruction, or conic recognition |
| Circle / arc | Rational quadratic representation | Local XY plane, transformed for viewport construction planes; sweeps at most one revolution |
| Curve differential analysis | Analytic first derivative; finite-difference second derivative | Curvature and closest-point refinement are numerical |
| Curve insertion/split/reverse | Shape-preserving homogeneous operations | Interior split/insertion only; positive-weight domain |
| Curve rebuild | Chord-length interpolation through sampled points | Approximate; not shape-preserving degree elevation |
| Curve join | Greedy sampled endpoint chaining | Result is a polyline, not a joined analytic polycurve; endpoint threshold is 10× document tolerance |
| Curve offset | Sampled XY-planar mitered polyline offset | No general 3D offset or robust global self-intersection cleanup |
| Surface | Untrimmed rational tensor-product NURBS | No trim loops, analytic face adjacency, B-rep shell, or surface intersection solver |
| Loft | Exact interpolation of compatible rational profiles | Incompatible profiles first resampled into compatible approximations |
| Revolve | Rational tensor-product angular construction | World Z axis; no automatic cap/topological solid representation |
| Sweep | Sampled transported frames and loft | Approximation; no full two-rail/guide continuity constraints |
| Extrude / pipe | Editable source recipe, polygonal display mesh | Caps require suitable simple planar closed profiles; no holes/automatic Boolean cleanup |
| Primitive solids | Closed display meshes and retained parameters | Not analytic B-rep solids |
| Mesh booleans | BSP clipping, weld, T-junction repair, topology validation | Tessellation-dependent; tolerance-sensitive; no arbitrary self-intersecting-input guarantee; 60,000-triangle combined input budget |
| Subdivision | Loop rules on triangle meshes | Not a full persistent CAD SubD kernel; maximum 3 iterations |
| Mesh analysis | Triangle area/volume/centroid and edge topology | Not exact NURBS integration; no general self-intersection detection |
| Sections | Triangle/plane line segments | Not joined exact section curves; command uses horizontal world-Z plane |
| Selection | BVH mesh hits; projected curves; center-based selection box | No subface/edge topology editing or precise crossing-window mode |
| Gumball | Interactive world-axis translation | Rotation/scaling via exact commands/dialogs, not three-axis gumball rings |
| Control editing | Direct control-net pointer editing with undo | No surface knot insertion, degree editing, cage deformation, or weight handles in viewport |
| Materials | Color, roughness, metallic scalar properties | No textures, node-based material graph, transparent refraction, or physically validated material library |
| Rendered viewport | WebGPU raster shaders, MSAA and shadow maps | No path tracer, offline renderer, denoiser, EXR, AOVs, or global illumination |
| GPU compute | Generic NURBS position evaluator and readback | Opt-in command/test; ordinary display tessellation still CPU |
| Fallbacks | Actual WebGL2 and CPU rendering | Reduced shading/fidelity; software path is slow; native GPU paths not exercised in this runner |
| Weave | 57 components, graph solving, trees, lacing, caching, preview, bake | Own documented semantics and formats; not GH runtime/plugin or ecosystem compatibility |
| Native persistence | `.veldra` model+graph, `.weave` graph | Version 1 only; no Rhino/Grasshopper native-file compatibility |
| OBJ | Vertices, triangle/polygon faces, line segments | One imported mesh rather than retained object/group hierarchy; no materials, textures, UVs, normal import, NURBS entities |
| STL | Binary and ASCII triangles | No units, colors, curves, materials, or parametric reconstruction |
| DXF | LINE, 3DFACE, straight LWPOLYLINE import; LINE/3DFACE export | No blocks, dimensions, splines, bulges, hatches, text, general CAD semantics, or layer-preserving import |
| glTF | 2.0 export, embedded buffers, normals, Z-up→Y-up conversion | Export only; meshes only; no scene materials/textures, curves, animation, skinning, or extensions |
| Native file validation | IDs, transforms, finite points, indices, weights, sizes, graph structure | Not an independent security audit or resource-isolation sandbox |
| Large-model performance | Revision caches, BVH, batching, incremental graph solve | Main-thread heavy geometry; no worker cancellation, out-of-core streaming, LOD system, or GPU benchmark claim |
| Mobile | Responsive chrome and pointer/touch navigation | Desktop-oriented CAD interaction; not a comprehensive mobile usability certification |

## Explicit major omissions

General trimmed B-rep modeling; robust analytic intersections and booleans; surface/edge filleting, blending and chamfering; full continuity/constraint modeling; dimensions, annotations and layouts; drafting/documentation tools; native .3dm/.gh/.ghx; STEP/IGES; arbitrary plugins/scripts; bitmap textures and comprehensive materials; offline photorealistic rendering; fabrication/manufacturing; collaboration; production CAD certification.

## Verification boundary

The automated core tests check representative invariants and regressions. The browser integration checks run real editing workflows using the actual initialized backend. Neither set establishes universal correctness over arbitrary CAD inputs. Native graphics validation has a separate executable test page. In the original delivered build, native WebGPU and WebGL2 remained unexercised because the managed browser did not expose them. Subsequent CI artifacts identify their own actual backend and do not imply validation on every graphics driver.
