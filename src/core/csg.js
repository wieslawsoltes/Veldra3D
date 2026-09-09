import {V} from './math.js';
import {mesh,weldMesh,analyzeMesh} from './mesh.js';
/** Polygon BSP boolean operations on oriented closed triangle meshes.
 * This is a polygonal solid engine, not an exact analytic B-rep boolean kernel.
 * Coplanar fragments use a scale-aware distance tolerance.
 */
class Face{
  constructor(points){this.points=points;this.normal=V.unit(V.cross(V.sub(points[1],points[0]),V.sub(points[2],points[0])));this.w=V.dot(this.normal,points[0]);}
  flip(){this.points.reverse();this.normal=V.mul(this.normal,-1);this.w=-this.w;}
  clone(){return new Face(this.points.map(p=>[...p]));}
}
class BSP{
  constructor(faces=[],epsilon=1e-6,depth=0){this.epsilon=epsilon;this.normal=null;this.w=0;this.faces=[];this.front=null;this.back=null;if(faces.length)this.build(faces,depth);}
  split(face,coplanarFront,coplanarBack,front,back){
    const distances=face.points.map(p=>V.dot(this.normal,p)-this.w),types=distances.map(d=>d>this.epsilon?1:d<-this.epsilon?2:0),type=types.reduce((a,b)=>a|b,0);
    if(type===0){(V.dot(this.normal,face.normal)>=0?coplanarFront:coplanarBack).push(face);return;}
    if(type===1){front.push(face);return;}if(type===2){back.push(face);return;}
    let F=[],B=[];for(let i=0;i<face.points.length;i++){let j=(i+1)%face.points.length,a=face.points[i],b=face.points[j],ta=types[i],tb=types[j];if(ta!==2)F.push(a);if(ta!==1)B.push(a);if((ta|tb)===3){let t=distances[i]/(distances[i]-distances[j]),q=V.mix(a,b,t);F.push(q);B.push(q);}}
    const clean=P=>P.filter((p,i)=>V.distance(p,P[(i+P.length-1)%P.length])>this.epsilon*.1);
    for(let [P,dest] of [[clean(F),front],[clean(B),back]])if(P.length>=3){let f=new Face(P);if(V.length(f.normal)>.5)dest.push(f);}
  }
  build(faces,depth=0){if(depth>600)throw Error('Boolean BSP depth budget exceeded');if(!faces.length)return;if(!this.normal){
      // Pick a reasonably balanced splitting plane from a small deterministic sample.
      let best=faces[0],score=Infinity;for(let k=0;k<Math.min(8,faces.length);k++){let candidate=faces[Math.floor(k*faces.length/Math.min(8,faces.length))],f=0,b=0,s=0;for(let j=0;j<faces.length;j+=Math.max(1,Math.floor(faces.length/40))){let ds=faces[j].points.map(p=>V.dot(candidate.normal,p)-candidate.w),a=ds.some(d=>d>this.epsilon),c=ds.some(d=>d<-this.epsilon);f+=+a;b+=+c;s+=+(a&&c);}let q=Math.abs(f-b)+s*3;if(q<score){score=q;best=candidate;}}
      this.normal=[...best.normal];this.w=best.w;
    }let F=[],B=[];for(let face of faces)this.split(face,this.faces,this.faces,F,B);if(F.length){this.front??=new BSP([],this.epsilon);this.front.build(F,depth+1);}if(B.length){this.back??=new BSP([],this.epsilon);this.back.build(B,depth+1);}}
  clipFaces(faces){if(!this.normal)return faces;let F=[],B=[];for(let face of faces)this.split(face,F,B,F,B);if(this.front)F=this.front.clipFaces(F);B=this.back?this.back.clipFaces(B):[];return [...F,...B];}
  clipTo(other){this.faces=other.clipFaces(this.faces);this.front?.clipTo(other);this.back?.clipTo(other);}
  invert(){for(let f of this.faces)f.flip();if(this.normal)this.normal=V.mul(this.normal,-1);this.w=-this.w;this.front?.invert();this.back?.invert();[this.front,this.back]=[this.back,this.front];}
  all(){return [...this.faces,...(this.front?.all()??[]),...(this.back?.all()??[])];}
}
function toFaces(m){let f=[];for(let i=0;i<m.indices.length;i+=3){let p=m.indices.slice(i,i+3).map(j=>m.positions[j]);if(V.length(V.cross(V.sub(p[1],p[0]),V.sub(p[2],p[0])))>1e-12)f.push(new Face(p));}return f;}
export function booleanMesh(a,b,operation='union',tolerance=1e-6){
  if(!['union','difference','intersection'].includes(operation))throw Error('Unknown Boolean operation');
  if(a.indices.length+b.indices.length>180000)throw Error('Boolean input exceeds 60,000 triangles; lower tessellation first');
  for(let m of [a,b]){let stats=analyzeMesh(m,tolerance);if(!m.indices.length||!stats.closed||stats.signedVolume<=0)throw Error('Boolean requires nonempty, closed, outward-oriented manifold input meshes');}
  let A=new BSP(toFaces(a),tolerance),B=new BSP(toFaces(b),tolerance);
  if(operation==='union'){A.clipTo(B);B.clipTo(A);B.invert();B.clipTo(A);B.invert();A.build(B.all());}
  else if(operation==='difference'){A.invert();A.clipTo(B);B.clipTo(A);B.invert();B.clipTo(A);B.invert();A.build(B.all());A.invert();}
  else{A.invert();B.clipTo(A);B.invert();A.clipTo(B);B.clipTo(A);A.build(B.all());A.invert();}
  let P=[],I=[];for(let f of A.all()){let base=P.length;P.push(...f.points);for(let i=1;i<f.points.length-1;i++)I.push(base,base+i,base+i+1);}let result=conformEdges(weldMesh(mesh(P,I),tolerance),tolerance);if(result.indices.length&&!analyzeMesh(result,tolerance).closed)throw Error('Boolean produced unresolved topology at this tolerance; revise the inputs or tolerance');return result;
}
/** Split triangle edges at every coincident mesh vertex, eliminating BSP
 * T-junctions. A vertex kd-tree avoids testing every vertex against every edge.
 * Center fans preserve all collinear boundary vertices without zero-area ears.
 */
function conformEdges(m,tolerance){
  const P=m.positions.map(p=>[...p]),ids=P.map((_,i)=>i),make=(items,depth=0)=>{if(!items.length)return null;let axis=depth%3;items.sort((a,b)=>P[a][axis]-P[b][axis]);let mid=items.length>>1;return {id:items[mid],axis,left:make(items.slice(0,mid),depth+1),right:make(items.slice(mid+1),depth+1)};},tree=make(ids);
  const query=(node,min,max,out)=>{if(!node)return;let p=P[node.id],a=node.axis;if(p.every((v,i)=>v>=min[i]&&v<=max[i]))out.push(node.id);if(min[a]<=p[a])query(node.left,min,max,out);if(max[a]>=p[a])query(node.right,min,max,out);};
  const edges=new Map();
  function edge(a,b){let key=a<b?a+':'+b:b+':'+a;if(edges.has(key)){let e=edges.get(key);return a<b?e:[...e].reverse();}let lo=Math.min(a,b),hi=Math.max(a,b),A=P[lo],B=P[hi],v=V.sub(B,A),den=V.dot(v,v),min=A.map((x,i)=>Math.min(x,B[i])-tolerance),max=A.map((x,i)=>Math.max(x,B[i])+tolerance),candidates=[];query(tree,min,max,candidates);let interior=[];for(let id of candidates){if(id===lo||id===hi)continue;let t=V.dot(V.sub(P[id],A),v)/den;if(t>1e-10&&t<1-1e-10&&V.distance(P[id],V.add(A,V.mul(v,t)))<=tolerance)interior.push({id,t});}interior.sort((a,b)=>a.t-b.t);let e=[lo,...interior.map(p=>p.id),hi];edges.set(key,e);return a<b?e:[...e].reverse();}
  let I=[];for(let i=0;i<m.indices.length;i+=3){let t=m.indices.slice(i,i+3),ring=[];for(let j=0;j<3;j++)ring.push(...edge(t[j],t[(j+1)%3]).slice(0,-1));if(ring.length===3){I.push(...ring);continue;}let center=V.mul(ring.reduce((a,id)=>V.add(a,P[id]),[0,0,0]),1/ring.length),c=P.length;P.push(center);for(let j=0;j<ring.length;j++)I.push(c,ring[j],ring[(j+1)%ring.length]);}
  return weldMesh(mesh(P,I),tolerance);
}
