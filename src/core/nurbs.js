import {V,clamp,solveLinear} from './math.js';
/** Rational B-splines. Geometry is stored in JS doubles; display sampling is independent. */
export function clampedKnots(count,degree){if(degree<1||count<=degree)throw Error('Degree must be smaller than control point count');return Array.from({length:count+degree+1},(_,i)=>i<=degree?0:i>=count?1:(i-degree)/(count-degree));}
export function findSpan(n,p,u,U){if(u>=U[n+1])return n;if(u<=U[p])return p;let lo=p,hi=n+1,mid=(lo+hi)>>1;while(u<U[mid]||u>=U[mid+1]){if(u<U[mid])hi=mid;else lo=mid;mid=(lo+hi)>>1;}return mid;}
export function basis(span,u,p,U){let N=[1],L=[],R=[];for(let j=1;j<=p;j++){L[j]=u-U[span+1-j];R[j]=U[span+j]-u;let saved=0;for(let r=0;r<j;r++){let den=R[r+1]+L[j-r],temp=den===0?0:N[r]/den;N[r]=saved+R[r+1]*temp;saved=L[j-r]*temp;}N[j]=saved;}return N;}
function evaluateH(P,p,U,u){let k=findSpan(P.length-1,p,u,U),N=basis(k,u,p,U),out=Array(P[0].length).fill(0);for(let j=0;j<=p;j++)for(let d=0;d<out.length;d++)out[d]+=N[j]*P[k-p+j][d];return out;}
function derivativeH(P,p,U,u){if(!p)return Array(P[0].length).fill(0);let Q=P.slice(0,-1).map((a,i)=>{let den=U[i+p+1]-U[i+1];return den===0?a.map(()=>0):V.mul(V.sub(P[i+1],a),p/den);});return evaluateH(Q,p-1,U.slice(1,-1),u);}
const homogenize=(p,w)=>[p[0]*w,p[1]*w,p[2]*w,w];
const dehomogenize=h=>{if(Math.abs(h[3])<1e-15)throw Error('Degenerate rational weight');return h.slice(0,3).map(x=>x/h[3]);};
function validateKnots(U,n,p){if(U.length!==n+p+1||U.some((u,i)=>!Number.isFinite(u)||(i&&u<U[i-1]))||U[p]>=U[n])throw Error('Invalid knot vector');}
export class NurbsCurve{
  constructor(points,degree=3,knots=null,weights=null){
    this.kind='curve';this.points=points.map(p=>p.slice(0,3));this.degree=degree;this.knots=knots?[...knots]:clampedKnots(points.length,degree);this.weights=weights?[...weights]:points.map(()=>1);
    if(!Number.isInteger(degree)||degree<1||points.length<=degree||this.weights.length!==points.length||this.weights.some(w=>!Number.isFinite(w)||w<=0)||this.points.some(p=>p.length!==3||p.some(v=>!Number.isFinite(v))))throw Error('Invalid NURBS curve');validateKnots(this.knots,points.length,degree);
  }
  static from(o){return new NurbsCurve(o.points,o.degree,o.knots,o.weights);}
  get domain(){return [this.knots[this.degree],this.knots[this.points.length]];}
  get homogeneous(){return this.points.map((p,i)=>homogenize(p,this.weights[i]));}
  parameter(t){let [a,b]=this.domain;return a+clamp(t,0,1)*(b-a);}
  at(t){return dehomogenize(evaluateH(this.homogeneous,this.degree,this.knots,this.parameter(t)));}
  derivative(t){let u=this.parameter(t),P=this.homogeneous,H=evaluateH(P,this.degree,this.knots,u),D=derivativeH(P,this.degree,this.knots,u),[a,b]=this.domain;return H.slice(0,3).map((h,i)=>(D[i]*H[3]-h*D[3])/(H[3]*H[3])*(b-a));}
  secondDerivative(t){let h=1e-5,a=Math.max(0,t-h),b=Math.min(1,t+h);return V.mul(V.sub(this.derivative(b),this.derivative(a)),1/(b-a));}
  curvature(t){let d=this.derivative(t),dd=this.secondDerivative(t),n=V.length(d);return n<1e-12?0:V.length(V.cross(d,dd))/(n*n*n);}
  sample(n=64){n=Math.max(1,Math.floor(n));return Array.from({length:n+1},(_,i)=>this.at(i/n));}
  tessellate(tolerance=.01,maxDepth=14){
    if(!(tolerance>0))throw Error('Tolerance must be positive');let out=[this.at(0)];
    const walk=(a,b,A,B,depth)=>{let m=(a+b)/2,M=this.at(m),q1=this.at((3*a+b)/4),q3=this.at((a+3*b)/4),e=Math.max(V.distance(M,V.mix(A,B,.5)),V.distance(q1,V.mix(A,B,.25)),V.distance(q3,V.mix(A,B,.75)));if(e>tolerance&&depth<maxDepth){walk(a,m,A,M,depth+1);walk(m,b,M,B,depth+1);}else out.push(B);};
    // Knot spans are split explicitly, so repeated-knot corners are never skipped.
    let [start,end]=this.domain,breaks=[...new Set(this.knots.filter(k=>k>=start&&k<=end))];for(let i=1;i<breaks.length;i++){let a=(breaks[i-1]-start)/(end-start),b=(breaks[i]-start)/(end-start);walk(a,b,this.at(a),this.at(b),0);}return out;
  }
  length(tolerance=1e-5){let p=this.tessellate(tolerance);return p.slice(1).reduce((s,v,i)=>s+V.distance(v,p[i]),0);}
  closest(point){let t=0,best=Infinity;for(let i=0;i<=100;i++){let d=V.distance(point,this.at(i/100));if(d<best){best=d;t=i/100;}}for(let i=0;i<15;i++){let c=this.at(t),d=this.derivative(t),dd=this.secondDerivative(t),r=V.sub(c,point),den=V.dot(d,d)+V.dot(r,dd);if(Math.abs(den)<1e-14)break;let next=clamp(t-V.dot(r,d)/den,0,1);if(Math.abs(next-t)<1e-12)break;t=next;}return {t,point:this.at(t),distance:V.distance(point,this.at(t))};}
  insertKnot(t,times=1){
    let P=this.homogeneous,U=[...this.knots],p=this.degree,u=this.parameter(t),[a,b]=this.domain;if(u<=a||u>=b)throw Error('Insert a knot inside the curve domain');
    for(let r=0;r<times;r++){let n=P.length-1,k=findSpan(n,p,u,U),s=U.filter(v=>Math.abs(v-u)<1e-12).length;if(s>=p)break;let Q=Array(n+2);for(let i=0;i<=k-p;i++)Q[i]=P[i];for(let i=k-s;i<=n;i++)Q[i+1]=P[i];for(let i=k-p+1;i<=k-s;i++){let alpha=(u-U[i])/(U[i+p]-U[i]);Q[i]=V.mix(P[i-1],P[i],alpha);}U.splice(k+1,0,u);P=Q;}
    return new NurbsCurve(P.map(dehomogenize),p,U,P.map(h=>h[3]));
  }
  split(t){if(t<=0||t>=1)throw Error('Split parameter must be between 0 and 1');let c=this.insertKnot(t,this.degree),u=c.parameter(t),k=findSpan(c.points.length-1,c.degree,u,c.knots),shared=k-c.degree;let leftP=c.points.slice(0,shared+1),rightP=c.points.slice(shared),leftW=c.weights.slice(0,shared+1),rightW=c.weights.slice(shared);let leftU=[...c.knots.slice(0,k+1),u],rightU=[u,...c.knots.slice(k-c.degree+1)];return [new NurbsCurve(leftP,c.degree,leftU,leftW),new NurbsCurve(rightP,c.degree,rightU,rightW)];}
  reverse(){let [a,b]=this.domain;return new NurbsCurve([...this.points].reverse(),this.degree,[...this.knots].reverse().map(u=>a+b-u),[...this.weights].reverse());}
  toJSON(){return {kind:'curve',points:this.points,degree:this.degree,knots:this.knots,weights:this.weights};}
}
export function interpolateCurve(points,degree=3){
  if(points.length<2)throw Error('At least two interpolation points required');degree=Math.min(degree,points.length-1);let n=points.length-1,params=[0],total=0;
  for(let i=1;i<=n;i++){total+=V.distance(points[i],points[i-1]);params.push(total);}if(total<1e-12)throw Error('Coincident interpolation points');params=params.map(v=>v/total);
  let U=Array(degree+1).fill(0);for(let j=1;j<=n-degree;j++){let s=0;for(let i=j;i<j+degree;i++)s+=params[i];U.push(s/degree);}U.push(...Array(degree+1).fill(1));
  let A=params.map(t=>{let s=findSpan(n,degree,t,U),N=basis(s,t,degree,U),r=Array(n+1).fill(0);for(let j=0;j<=degree;j++)r[s-degree+j]=N[j];return r;});return new NurbsCurve(solveLinear(A,points),degree,U);
}
export function circleCurve(center=[0,0,0],radius=5,start=0,sweep=Math.PI*2){
  if(!(radius>0)||Math.abs(sweep)<1e-12||Math.abs(sweep)>2*Math.PI+1e-9)throw Error('Invalid circle / arc');let segments=Math.ceil(Math.abs(sweep)/(Math.PI/2)),delta=sweep/segments,P=[],W=[],U=[0,0,0];
  for(let i=0;i<segments;i++){let a=start+i*delta,b=a+delta,m=(a+b)/2,w=Math.cos(delta/2);if(i===0){P.push(V.add(center,[radius*Math.cos(a),radius*Math.sin(a),0]));W.push(1);}P.push(V.add(center,[radius*Math.cos(m)/w,radius*Math.sin(m)/w,0]),V.add(center,[radius*Math.cos(b),radius*Math.sin(b),0]));W.push(w,1);if(i<segments-1)U.push((i+1)/segments,(i+1)/segments);}U.push(1,1,1);return new NurbsCurve(P,2,U,W);
}
export class NurbsSurface{
  constructor(points,degreeU=3,degreeV=3,knotsU=null,knotsV=null,weights=null){
    if(!Array.isArray(points)||!points.length||!points[0]?.length||![degreeU,degreeV].every(p=>Number.isInteger(p)&&p>=1))throw Error('Invalid surface degree or control net');
    this.kind='surface';this.points=points.map(r=>r.map(p=>[...p]));this.degreeU=degreeU;this.degreeV=degreeV;this.knotsU=knotsU??clampedKnots(points[0].length,degreeU);this.knotsV=knotsV??clampedKnots(points.length,degreeV);this.weights=weights??points.map(r=>r.map(()=>1));
    if(points.length<=degreeV||points[0].length<=degreeU||points.some(r=>r.length!==points[0].length)||points.flat().some(p=>p.length!==3||p.some(v=>!Number.isFinite(v)))||this.weights.length!==points.length||this.weights.some((r,i)=>r.length!==points[i].length||r.some(w=>!Number.isFinite(w)||w<=0)))throw Error('Invalid NURBS surface');validateKnots(this.knotsU,points[0].length,degreeU);validateKnots(this.knotsV,points.length,degreeV);
  }
  static from(o){return new NurbsSurface(o.points,o.degreeU,o.degreeV,o.knotsU,o.knotsV,o.weights);}
  get domainU(){return [this.knotsU[this.degreeU],this.knotsU[this.points[0].length]];}
  get domainV(){return [this.knotsV[this.degreeV],this.knotsV[this.points.length]];}
  at(u,v){return this.evaluate(u,v).point;}
  evaluate(u,v){
    let [a,b]=this.domainU,[c,d]=this.domainV;u=a+clamp(u,0,1)*(b-a);v=c+clamp(v,0,1)*(d-c);
    const local=(n,p,U,t)=>{let k=findSpan(n-1,p,t,U),N=basis(k,t,p,U),L=basis(k,t,p-1,U),D=[];for(let j=0;j<=p;j++){let i=k-p+j,left=U[i+p]-U[i],right=U[i+p+1]-U[i+1];D[j]=(j>0&&left?p*L[j-1]/left:0)-(j<p&&right?p*L[j]/right:0);}return {k,N,D};};
    let U=local(this.points[0].length,this.degreeU,this.knotsU,u),W=local(this.points.length,this.degreeV,this.knotsV,v),H=[0,0,0,0],Hu=[0,0,0,0],Hv=[0,0,0,0];
    for(let j=0;j<=this.degreeV;j++)for(let i=0;i<=this.degreeU;i++){let row=W.k-this.degreeV+j,col=U.k-this.degreeU+i,p=this.points[row][col],weight=this.weights[row][col],n=U.N[i]*W.N[j]*weight,nu=U.D[i]*W.N[j]*weight,nv=U.N[i]*W.D[j]*weight;for(let k=0;k<3;k++){H[k]+=n*p[k];Hu[k]+=nu*p[k];Hv[k]+=nv*p[k];}H[3]+=n;Hu[3]+=nu;Hv[3]+=nv;}
    let point=dehomogenize(H),du=point.map((x,i)=>(Hu[i]-x*Hu[3])/H[3]*(b-a)),dv=point.map((x,i)=>(Hv[i]-x*Hv[3])/H[3]*(d-c));return {point,du,dv,normal:V.unit(V.cross(du,dv))};
  }
  toJSON(){return {kind:'surface',points:this.points,degreeU:this.degreeU,degreeV:this.degreeV,knotsU:this.knotsU,knotsV:this.knotsV,weights:this.weights};}
}
export function extrudeSurface(curve,vector){let c=curve instanceof NurbsCurve?curve:NurbsCurve.from(curve);return new NurbsSurface([c.points,c.points.map(p=>V.add(p,vector))],c.degree,1,c.knots,[0,0,1,1],[c.weights,c.weights]);}
export function loftSurface(curves){
  if(curves.length<2)throw Error('Loft needs at least two curves');let C=curves.map(c=>c instanceof NurbsCurve?c:NurbsCurve.from(c)),c=C[0];
  const compatible=C.every(q=>q.degree===c.degree&&JSON.stringify(q.knots)===JSON.stringify(c.knots)&&q.points.length===c.points.length&&q.weights.every((w,i)=>Math.abs(w-c.weights[i])<1e-10));
  if(!compatible){C=C.map(q=>interpolateCurve(q.sample(24),3));c=C[0];}
  // Uniform parameter interpolation in the section direction, preserving rational profile weights.
  let nv=C.length,pv=Math.min(3,nv-1),kv=clampedKnots(nv,pv),A=Array.from({length:nv},(_,j)=>{let t=j/(nv-1),s=findSpan(nv-1,pv,t,kv),N=basis(s,t,pv,kv),r=Array(nv).fill(0);for(let i=0;i<=pv;i++)r[s-pv+i]=N[i];return r;}),rows=Array.from({length:nv},()=>[]);
  for(let i=0;i<c.points.length;i++){let P=solveLinear(A,C.map(q=>q.points[i]));for(let j=0;j<nv;j++)rows[j].push(P[j]);}return new NurbsSurface(rows,c.degree,pv,c.knots,kv,rows.map(()=>[...c.weights]));
}
