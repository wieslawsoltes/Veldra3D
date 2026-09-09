import fs from 'node:fs';
import os from 'node:os';
import {performance} from 'node:perf_hooks';
import {NurbsSurface,circleCurve} from '../src/core/nurbs.js';
import {canopySurface} from '../src/core/geometry.js';
import {surfaceMesh,boxMesh,transformMesh} from '../src/core/mesh.js';
import {M} from '../src/core/math.js';
import {booleanMesh} from '../src/core/csg.js';
import {Graph} from '../src/core/graph.js';
import {COMPONENTS,createDemoGraph} from '../src/core/components.js';
const median=a=>[...a].sort((a,b)=>a-b)[Math.floor(a.length/2)];
function measure(name,fn,iterations=15){for(let i=0;i<3;i++)fn();let samples=[];for(let i=0;i<iterations;i++){let start=performance.now();fn();samples.push(performance.now()-start);}return {name,iterations,medianMs:median(samples),minMs:Math.min(...samples),maxMs:Math.max(...samples)};}
let surface=NurbsSurface.from(canopySurface()),circle=circleCurve(),g=new Graph(COMPONENTS),nodes=createDemoGraph(g);g.evaluate();let flip=false;
let results=[measure('CPU NURBS surface tessellation: 96 × 64 cells (12,288 triangles)',()=>surfaceMesh(surface,96,64)),measure('Exact rational circle: 1,001 point evaluations',()=>circle.sample(1000)),measure('Incremental graph solve: no changed input',()=>g.evaluate(),50),measure('Graph update: canopy + 36 ribs + mesh area',()=>{g.set(nodes.span.id,'value',(flip=!flip)?28:30);g.evaluate();},10),measure('Closed overlapping-box mesh Boolean union',()=>booleanMesh(boxMesh(2,2,2),transformMesh(boxMesh(2,2,2),M.translation([1,0,0]))),10)];
let report={timestampUTC:new Date().toISOString(),runtime:process.version,platform:os.platform(),cpu:os.cpus()[0]?.model,notes:'Warm CPU timings in this container. Not GPU timings, not frame rates, and not a guarantee on other hardware. Browser graph time additionally includes browser/JIT overhead. No external runtime dependencies.',results};fs.writeFileSync(new URL('../tests/benchmark-results.json',import.meta.url),JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
