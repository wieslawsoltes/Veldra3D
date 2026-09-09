/** Double-precision geometric math. Matrices are column-major; world coordinates are Z-up. */
export const EPS = 1e-9;
export const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
export const lerp = (a,b,t) => a+(b-a)*t;
export const V = {
  add:(a,b)=>a.map((v,i)=>v+b[i]), sub:(a,b)=>a.map((v,i)=>v-b[i]),
  mul:(a,s)=>a.map(v=>v*s), dot:(a,b)=>a.reduce((s,v,i)=>s+v*b[i],0),
  cross:(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]],
  length:a=>Math.hypot(...a), distance:(a,b)=>Math.hypot(...a.map((v,i)=>v-b[i])),
  unit(a){let n=Math.hypot(...a);return n>1e-15?a.map(v=>v/n):a.map(()=>0);},
  mix:(a,b,t)=>a.map((v,i)=>lerp(v,b[i],t)), equal:(a,b,e=EPS)=>V.distance(a,b)<=e
};
export const M = {
  identity:()=>[1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1],
  mul(a,b){let c=new Array(16).fill(0);for(let j=0;j<4;j++)for(let i=0;i<4;i++)for(let k=0;k<4;k++)c[j*4+i]+=a[k*4+i]*b[j*4+k];return c;},
  translation(v){let m=M.identity();m[12]=v[0];m[13]=v[1];m[14]=v[2];return m;},
  scaling(v){if(typeof v==='number')v=[v,v,v];let m=M.identity();m[0]=v[0];m[5]=v[1];m[10]=v[2];return m;},
  rotation(axis,angle){let [x,y,z]=V.unit(axis),c=Math.cos(angle),s=Math.sin(angle),t=1-c;return [t*x*x+c,t*x*y+s*z,t*x*z-s*y,0,t*x*y-s*z,t*y*y+c,t*y*z+s*x,0,t*x*z+s*y,t*y*z-s*x,t*z*z+c,0,0,0,0,1];},
  point(m,p){let x=p[0],y=p[1],z=p[2],w=m[3]*x+m[7]*y+m[11]*z+m[15];return [(m[0]*x+m[4]*y+m[8]*z+m[12])/w,(m[1]*x+m[5]*y+m[9]*z+m[13])/w,(m[2]*x+m[6]*y+m[10]*z+m[14])/w];},
  vector:(m,p)=>[m[0]*p[0]+m[4]*p[1]+m[8]*p[2],m[1]*p[0]+m[5]*p[1]+m[9]*p[2],m[2]*p[0]+m[6]*p[1]+m[10]*p[2]],
  transpose:m=>m.map((_,i)=>m[(i%4)*4+Math.floor(i/4)]),
  inverse(m){let a=Array.from({length:4},(_,i)=>[...Array.from({length:4},(_,j)=>m[j*4+i]),...Array.from({length:4},(_,j)=>+(i===j))]);for(let k=0;k<4;k++){let pivot=k;for(let i=k+1;i<4;i++)if(Math.abs(a[i][k])>Math.abs(a[pivot][k]))pivot=i;if(Math.abs(a[pivot][k])<1e-15)throw Error('Singular transformation');[a[k],a[pivot]]=[a[pivot],a[k]];let f=a[k][k];a[k]=a[k].map(v=>v/f);for(let i=0;i<4;i++)if(i!==k){let q=a[i][k];a[i]=a[i].map((v,j)=>v-q*a[k][j]);}}return Array.from({length:16},(_,i)=>a[i%4][4+Math.floor(i/4)]);},
  lookAt(eye,target,up=[0,0,1]){let z=V.unit(V.sub(eye,target)),x=V.unit(V.cross(up,z)),y=V.cross(z,x);return [x[0],y[0],z[0],0,x[1],y[1],z[1],0,x[2],y[2],z[2],0,-V.dot(x,eye),-V.dot(y,eye),-V.dot(z,eye),1];},
  perspective(fovy,aspect,near,far){let f=1/Math.tan(fovy/2);return [f/aspect,0,0,0,0,f,0,0,0,0,far/(near-far),-1,0,0,far*near/(near-far),0];},
  ortho(l,r,b,t,n,f){return [2/(r-l),0,0,0,0,2/(t-b),0,0,0,0,1/(n-f),0,-(r+l)/(r-l),-(t+b)/(t-b),n/(n-f),1];}
};
export function solveLinear(A,B){
  const n=A.length;if(!n||A.some(r=>r.length!==n)||B.length!==n)throw Error('Invalid linear system');
  const scalar=typeof B[0]==='number', rhs=scalar?B.map(v=>[v]):B, m=rhs[0].length;
  let a=A.map((r,i)=>[...r,...rhs[i]]);
  for(let k=0;k<n;k++){let p=k;for(let i=k+1;i<n;i++)if(Math.abs(a[i][k])>Math.abs(a[p][k]))p=i;if(Math.abs(a[p][k])<1e-13)throw Error('Singular interpolation system');[a[p],a[k]]=[a[k],a[p]];for(let i=k+1;i<n;i++){let f=a[i][k]/a[k][k];for(let j=k+1;j<n+m;j++)a[i][j]-=f*a[k][j];a[i][k]=0;}}
  let x=Array.from({length:n},()=>Array(m).fill(0));for(let i=n-1;i>=0;i--)for(let d=0;d<m;d++){let v=a[i][n+d];for(let j=i+1;j<n;j++)v-=a[i][j]*x[j][d];x[i][d]=v/a[i][i];}
  return scalar?x.map(r=>r[0]):x;
}
export function bounds(points){let min=[Infinity,Infinity,Infinity],max=[-Infinity,-Infinity,-Infinity];for(let p of points)for(let i=0;i<3;i++){min[i]=Math.min(min[i],p[i]);max[i]=Math.max(max[i],p[i]);}return {min,max,center:V.mul(V.add(min,max),.5),size:V.sub(max,min)};}
export function rayTriangle(o,d,a,b,c){let e1=V.sub(b,a),e2=V.sub(c,a),h=V.cross(d,e2),det=V.dot(e1,h);if(Math.abs(det)<1e-12)return null;let s=V.sub(o,a),u=V.dot(s,h)/det;if(u<0||u>1)return null;let q=V.cross(s,e1),v=V.dot(d,q)/det;if(v<0||u+v>1)return null;let t=V.dot(e2,q)/det;return t>1e-7?{t,u,v,point:V.add(o,V.mul(d,t))}:null;}
export function rayBox(o,d,b){let lo=0,hi=Infinity;for(let i=0;i<3;i++){if(Math.abs(d[i])<1e-15){if(o[i]<b.min[i]||o[i]>b.max[i])return false;continue;}let a=(b.min[i]-o[i])/d[i],c=(b.max[i]-o[i])/d[i];if(a>c)[a,c]=[c,a];lo=Math.max(lo,a);hi=Math.min(hi,c);if(lo>hi)return false;}return true;}
export function hexRGB(hex){let h=hex.replace('#','');if(h.length===3)h=[...h].map(s=>s+s).join('');return [0,2,4].map(i=>parseInt(h.slice(i,i+2),16)/255);}
export function uid(prefix='o'){return prefix+'_'+(globalThis.crypto?.randomUUID?.()??(Date.now().toString(36)+Math.random().toString(36).slice(2))).slice(0,16);}
export function finiteNumber(v,name='Value'){let x=Number(v);if(!Number.isFinite(x))throw Error(`${name} must be finite`);return x;}
