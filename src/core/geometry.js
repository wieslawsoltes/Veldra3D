import {V,M,clamp} from './math.js';
import {NurbsCurve,NurbsSurface,interpolateCurve,circleCurve,loftSurface,extrudeSurface} from './nurbs.js';
import {mesh,boxMesh,sphereMesh,cylinderMesh,torusMesh,surfaceMesh,extrudeMesh,pipeMesh,mergeMeshes,transformMesh} from './mesh.js';
export {NurbsCurve,NurbsSurface,interpolateCurve,circleCurve,loftSurface,extrudeSurface};
export function polyline(points,closed=false){let p=points.map(v=>[...v]);if(closed&&!V.equal(p[0],p.at(-1)))p.push([...p[0]]);return new NurbsCurve(p,1).toJSON();}
export function rectangle(w=10,h=6){return polyline([[-w/2,-h/2,0],[w/2,-h/2,0],[w/2,h/2,0],[-w/2,h/2,0]],true);}
export function transformGeometry(g,m){let o=structuredClone(g);if(g.kind==='curve')o.points=o.points.map(p=>M.point(m,p));else if(g.kind==='surface')o.points=o.points.map(r=>r.map(p=>M.point(m,p)));else if(g.kind==='mesh')return transformMesh(mesh(g.positions,g.indices,g.normals,g.edges),m);else if(g.kind==='point')o.point=M.point(m,o.point);else return {kind:'instance',geometry:o,matrix:m};return o;}
export function revolveSurface(curve,angle=Math.PI*2){
  let c=NurbsCurve.from(curve),arc=circleCurve([0,0,0],1,0,angle),rows=arc.points.map(p=>c.points.map(q=>{let r=Math.hypot(q[0],q[1]),phase=Math.atan2(q[1],q[0]);return [r*(p[0]*Math.cos(phase)-p[1]*Math.sin(phase)),r*(p[0]*Math.sin(phase)+p[1]*Math.cos(phase)),q[2]];})),weights=arc.weights.map(w=>c.weights.map(v=>v*w));return new NurbsSurface(rows,c.degree,arc.degree,c.knots,arc.knots,weights);
}
export function geometryMesh(g,quality=1){
  switch(g.kind){
    case 'box':return boxMesh(g.width,g.depth,g.height);
    case 'sphere':return sphereMesh(g.radius,Math.max(16,Math.round(48*quality)),Math.max(8,Math.round(24*quality)));
    case 'cylinder':return cylinderMesh(g.radius,g.height,Math.max(12,Math.round(48*quality)),g.topRadius??g.radius);
    case 'torus':return torusMesh(g.major,g.minor,Math.max(16,Math.round(64*quality)),Math.max(8,Math.round(20*quality)));
    case 'surface':return surfaceMesh(NurbsSurface.from(g),Math.round(48*quality),Math.round(32*quality));
    case 'extrusion':return extrudeMesh(NurbsCurve.from(g.profile).tessellate(.025/quality),g.vector,g.cap!==false);
    case 'pipe':return pipeMesh(NurbsCurve.from(g.rail).sample(Math.round(64*quality)),g.radius,Math.max(6,Math.round(12*quality)));
    case 'mesh':return mesh(g.positions,g.indices,g.normals,g.edges);
    case 'instance':{let m=geometryMesh(g.geometry,quality);if(!m)return null;return transformMesh(m,g.matrix);}
    case 'group':return mergeMeshes(g.children.map(c=>geometryMesh(c,quality)).filter(Boolean));
    default:return null;
  }
}
export function geometryLines(g){if(g.kind==='instance')return geometryLines(g.geometry).map(e=>e.map(p=>M.point(g.matrix,p)));if(g.kind==='group')return g.children.flatMap(geometryLines);if(g.kind==='curve'){let p=NurbsCurve.from(g).tessellate(.015);return p.slice(1).map((v,i)=>[p[i],v]);}if(g.kind==='lines')return g.segments;if(g.kind==='point'){let p=g.point,r=.15;return [[V.add(p,[-r,0,0]),V.add(p,[r,0,0])],[V.add(p,[0,-r,0]),V.add(p,[0,r,0])],[V.add(p,[0,0,-r]),V.add(p,[0,0,r])]];}return [];}
/** Demo canopy: exact tensor-product NURBS definition, adjustable via graph inputs. */
export function canopySurface(span=28,rise=10,twist=3,depth=12){
  let rows=[];for(let j=0;j<4;j++){let v=j/3,row=[];for(let i=0;i<7;i++){let u=i/6,x=(u-.5)*span,y=(v-.5)*depth,arch=Math.sin(Math.PI*u)*rise,z=.45+arch+(v-.5)*twist*Math.sin(Math.PI*(u*1.6+.15));row.push([x,y,z]);}rows.push(row);}return new NurbsSurface(rows,3,3).toJSON();
}
export function canopyRibs(surface,count=28,radius=.075){let s=NurbsSurface.from(surface),children=[];count=clamp(Math.round(count),2,120);for(let i=0;i<count;i++){let u=i/(count-1),points=Array.from({length:21},(_,j)=>s.at(u,j/20));children.push(pipeMesh(points,radius,6,true));}return mergeMeshes(children);}
export function sweepSurface(profile,rail,sections=12){
  let c=NurbsCurve.from(profile),r=NurbsCurve.from(rail),start=r.at(0),curves=[],previous=null;for(let i=0;i<=sections;i++){let t=i/sections,p=r.at(t),tangent=V.unit(r.derivative(t)),normal=previous?V.unit(V.sub(previous,V.mul(tangent,V.dot(previous,tangent)))):V.unit(V.cross(Math.abs(tangent[2])>.9?[0,1,0]:[0,0,1],tangent));if(V.length(normal)<.1)normal=V.unit(V.cross([1,0,0],tangent));previous=normal;let binormal=V.cross(tangent,normal);curves.push(new NurbsCurve(c.points.map(q=>V.add(p,V.add(V.mul(normal,q[0]),V.add(V.mul(binormal,q[1]),V.mul(tangent,q[2]))))),c.degree,c.knots,c.weights));}return loftSurface(curves);
}
export function offsetPlanarCurve(curve,distance){
  let c=NurbsCurve.from(curve),P=c.tessellate(.01),closed=V.equal(P[0],P.at(-1),1e-6);if(P.some(p=>Math.abs(p[2]-P[0][2])>1e-6))throw Error('Offset currently supports XY-planar curves');if(closed)P.pop();let out=P.map((p,i)=>{let a=P[closed?(i+P.length-1)%P.length:Math.max(0,i-1)],b=P[closed?(i+1)%P.length:Math.min(P.length-1,i+1)],ta=V.unit(V.sub(p,a)),tb=V.unit(V.sub(b,p));if(!V.length(ta))ta=tb;if(!V.length(tb))tb=ta;let na=[-ta[1],ta[0],0],nb=[-tb[1],tb[0],0],avg=V.unit(V.add(na,nb)),den=V.dot(avg,nb);if(Math.abs(den)<.05)throw Error('Offset has a cusp: reduce the distance or split the curve');return V.add(p,V.mul(avg,distance/den));});return polyline(out,closed);
}
