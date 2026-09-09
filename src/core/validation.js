import {M} from './math.js';
import {NurbsCurve,NurbsSurface} from './nurbs.js';
export const safeId=value=>typeof value==='string'&&/^[A-Za-z0-9_.:-]{1,128}$/.test(value);
export const safeColor=value=>typeof value==='string'&&/^#[\da-f]{3}(?:[\da-f]{3})?$/i.test(value);
export const finitePoint=p=>Array.isArray(p)&&p.length===3&&p.every(v=>Number.isFinite(v)&&Math.abs(v)<=1e12);
export function validateMatrix(m){if(!Array.isArray(m)||m.length!==16||m.some(v=>!Number.isFinite(v))||m[3]!==0||m[7]!==0||m[11]!==0||m[15]!==1)throw Error('Invalid affine transformation');M.inverse(m);}
export function validateGeometry(g,budget={points:0},depth=0){
  if(!g||typeof g!=='object'||depth>24)throw Error('Invalid or excessively nested geometry');
  const points=P=>{if(!Array.isArray(P)||P.some(p=>!finitePoint(p)))throw Error('Invalid geometric coordinates');budget.points+=P.length;if(budget.points>2000000)throw Error('Geometry exceeds the two-million-point import budget');};
  const positive=(v,name)=>{if(!Number.isFinite(v)||v<=0||v>1e9)throw Error('Invalid '+name);};
  switch(g.kind){
    case 'point':points([g.point]);break;
    case 'curve':points(g.points);if(g.points.length>4096||g.degree>15)throw Error('Curve definition exceeds supported import limits');NurbsCurve.from(g);break;
    case 'surface':if(!Array.isArray(g.points)||g.points.length>128||g.points.some(r=>!Array.isArray(r)||r.length>128)||g.degreeU>15||g.degreeV>15)throw Error('Invalid surface control net');points(g.points.flat());NurbsSurface.from(g);break;
    case 'box':for(let k of ['width','depth','height'])positive(g[k],k);break;
    case 'sphere':positive(g.radius,'radius');break;
    case 'cylinder':positive(g.radius,'radius');positive(g.height,'height');if(g.topRadius!==undefined&&(!Number.isFinite(g.topRadius)||g.topRadius<0))throw Error('Invalid top radius');break;
    case 'torus':positive(g.major,'major radius');positive(g.minor,'minor radius');if(g.major<=g.minor)throw Error('Major radius must exceed minor radius');break;
    case 'mesh':points(g.positions);if(!Array.isArray(g.indices)||g.indices.length%3||g.indices.length>6000000||g.indices.some(i=>!Number.isInteger(i)||i<0||i>=g.positions.length))throw Error('Invalid triangle indices');if(g.normals!=null){points(g.normals);if(g.normals.length!==g.positions.length)throw Error('Invalid mesh normals');}if(g.edges!=null){if(!Array.isArray(g.edges)||g.edges.some(e=>!Array.isArray(e)||e.length!==2))throw Error('Invalid mesh edges');points(g.edges.flat());}break;
    case 'lines':if(!Array.isArray(g.segments)||g.segments.some(e=>!Array.isArray(e)||e.length!==2))throw Error('Invalid line segments');points(g.segments.flat());break;
    case 'extrusion':validateGeometry(g.profile,budget,depth+1);if(g.profile.kind!=='curve'||!finitePoint(g.vector)||Math.hypot(...g.vector)<1e-12)throw Error('Invalid extrusion');break;
    case 'pipe':validateGeometry(g.rail,budget,depth+1);if(g.rail.kind!=='curve')throw Error('Invalid pipe rail');positive(g.radius,'pipe radius');break;
    case 'instance':validateMatrix(g.matrix);validateGeometry(g.geometry,budget,depth+1);break;
    case 'group':if(!Array.isArray(g.children)||g.children.length>20000)throw Error('Invalid geometry group');g.children.forEach(c=>validateGeometry(c,budget,depth+1));break;
    default:throw Error('Unsupported geometry type: '+String(g.kind));
  }
}
