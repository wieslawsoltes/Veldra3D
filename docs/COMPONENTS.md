# Weave component catalogue

57 implemented components. Inputs marked `list` or `tree` are consumed as a collection; ordinary item inputs participate in documented lacing.

## Params

| Component | Inputs | Outputs |
|---|---|---|
| Number slider (`number`) | Parameters in inspector | Value: number |
| Panel (`panel`) | Data: any / list | Data: any |
| Geometry reference (`reference`) | Parameters in inspector | Geometry: geometry |

## Vector

| Component | Inputs | Outputs |
|---|---|---|
| Construct point (`point`) | X: number; Y: number; Z: number | Point: point |
| Vector XYZ (`vector`) | X: number; Y: number; Z: number | Vector: vector |
| Unit Z (`unitz`) | Factor: number | Vector: vector |
| Distance (`distance`) | A: point; B: point | Distance: number |

## Math

| Component | Inputs | Outputs |
|---|---|---|
| Addition (`add`) | A: number; B: number | Result: number |
| Subtraction (`subtract`) | A: number; B: number | Result: number |
| Multiply (`multiply`) | A: number; B: number | Result: number |
| Division (`divide`) | A: number; B: number | Result: number |
| Power (`power`) | A: number; B: number | Result: number |
| Sine (`sin`) | Value: number | Result: number |
| Cosine (`cos`) | Value: number | Result: number |
| Absolute (`abs`) | Value: number | Result: number |
| Square root (`sqrt`) | Value: number | Result: number |
| Remap numbers (`remap`) | Value: number; Source min: number; Source max: number; Target min: number; Target max: number | Value: number |

## Sets

| Component | Inputs | Outputs |
|---|---|---|
| Series (`series`) | Start: number; Step: number; Count: number | Values: list |
| Range (`range`) | Start: number; End: number; Steps: number | Values: list |
| List item (`item`) | List: any / list; Index: number | Item: any |
| Reverse list (`reverse`) | List: any / list | List: list |
| Merge (`merge`) | A: any / list; B: any / list | List: list |
| Partition list (`partition`) | List: any / list; Size: number | Tree: tree |
| Flatten tree (`flatten`) | Data: any / tree | Tree: tree |
| Graft tree (`graft`) | Data: any / tree | Tree: tree |
| Simplify tree (`simplify`) | Data: any / tree | Tree: tree |

## Curve

| Component | Inputs | Outputs |
|---|---|---|
| Circle (`circle`) | Center: point; Radius: number | Curve: curve |
| Rectangle (`rectangle`) | Width: number; Depth: number | Curve: curve |
| Line (`line`) | Start: point; End: point | Curve: curve |
| Interpolate curve (`interpolate`) | Points: any / list; Degree: number | Curve: curve |
| Control-point curve (`controlcurve`) | Points: any / list; Degree: number | Curve: curve |
| Divide curve (`dividecurve`) | Curve: curve; Count: number | Points: list; Tangents: list |
| Curve length (`curvelength`) | Curve: curve | Length: number |
| Evaluate curve (`evaluatecurve`) | Curve: curve; Parameter: number | Point: point; Tangent: vector; Curvature: number |

## Surface

| Component | Inputs | Outputs |
|---|---|---|
| Loft (`loft`) | Curves: any / list | Surface: surface |
| Extrude (`extrude`) | Curve: curve; Vector: vector | Geometry: geometry |
| Revolve (`revolve`) | Profile: curve; Angle °: number | Surface: surface |
| Sweep one rail (`sweep`) | Profile: curve; Rail: curve | Surface: surface |
| Pipe (`pipe`) | Rail: curve; Radius: number | Geometry: geometry |
| Evaluate surface (`evaluatesurface`) | Surface: surface; U: number; V: number | Point: point; Normal: vector |
| Surface isocurve (`isocurve`) | Surface: surface; U: number | Curve: curve |
| Canopy surface (`canopy`) | Span: number; Rise: number; Twist: number; Depth: number | Surface: surface |
| Surface ribs (`ribs`) | Surface: surface; Count: number; Radius: number | Mesh: mesh |

## Solid

| Component | Inputs | Outputs |
|---|---|---|
| Box (`box`) | Width: number; Depth: number; Height: number | Geometry: geometry |
| Sphere (`sphere`) | Center: point; Radius: number | Geometry: geometry |
| Cylinder (`cylinder`) | Radius: number; Height: number | Geometry: geometry |
| Torus (`torus`) | Major radius: number; Minor radius: number | Geometry: geometry |
| Mesh union (`union`) | A: geometry; B: geometry | Mesh: mesh |
| Mesh difference (`difference`) | A: geometry; B: geometry | Mesh: mesh |
| Mesh intersection (`intersection`) | A: geometry; B: geometry | Mesh: mesh |

## Transform

| Component | Inputs | Outputs |
|---|---|---|
| Move (`move`) | Geometry: geometry; Motion: vector | Geometry: geometry |
| Rotate Z (`rotate`) | Geometry: geometry; Angle °: number | Geometry: geometry |
| Scale (`scale`) | Geometry: geometry; Factor: number | Geometry: geometry |

## Mesh

| Component | Inputs | Outputs |
|---|---|---|
| Mesh geometry (`mesh`) | Geometry: geometry; Quality: number | Mesh: mesh |
| Loop subdivision (`subdivide`) | Mesh: mesh; Iterations: number | Mesh: mesh |

## Analysis

| Component | Inputs | Outputs |
|---|---|---|
| Area / volume (`area`) | Geometry: geometry | Area: number; Volume: number |
| Section (`section`) | Geometry: geometry; Height: number | Geometry: geometry |
