import {V,bounds,rayTriangle,rayBox} from './math.js';
/** Triangle bounding-volume hierarchy. Built once per display mesh revision. */
export class MeshBVH{
  constructor(mesh){this.mesh=mesh;let tris=Array.from({length:mesh.indices.length/3},(_,i)=>i);this.root=this.build(tris,0);}
  build(triangles,depth){let points=[];for(let t of triangles)for(let i=0;i<3;i++)points.push(this.mesh.positions[this.mesh.indices[t*3+i]]);let box=bounds(points);if(triangles.length<=12||depth>=28)return {box,triangles};let axis=box.size.indexOf(Math.max(...box.size)),center=t=>[0,1,2].reduce((s,k)=>s+this.mesh.positions[this.mesh.indices[t*3+k]][axis],0)/3;triangles.sort((a,b)=>center(a)-center(b));let mid=triangles.length>>1;return {box,left:this.build(triangles.slice(0,mid),depth+1),right:this.build(triangles.slice(mid),depth+1)};}
  intersect(origin,direction){let best=null;const walk=n=>{if(!n||!rayBox(origin,direction,n.box))return;if(n.triangles){for(let t of n.triangles){let pts=[0,1,2].map(k=>this.mesh.positions[this.mesh.indices[t*3+k]]),hit=rayTriangle(origin,direction,...pts);if(hit&&(!best||hit.t<best.t))best={...hit,triangle:t};}}else{walk(n.left);walk(n.right);}};walk(this.root);return best;}
}
