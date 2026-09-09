import {safeId,safeColor,validateMatrix,validateGeometry} from './validation.js';
import {uid,M,V,hexRGB,bounds} from './math.js';
import {geometryMesh,geometryLines} from './geometry.js';
import {transformMesh,meshEdges} from './mesh.js';
import {MeshBVH} from './spatial.js';
export function makeObject(geometry,name,layer='model',color='#619992'){
  return {id:uid(),name:name??geometry.kind,geometry,layer,color,visible:true,locked:false,matrix:M.identity(),material:{metallic:.12,roughness:.4},revision:0};
}
export class Document{
  constructor(){this.name='Untitled';this.units='mm';this.tolerance=.001;this.objects=[];this.layers=[{id:'model',name:'Default',color:'#619992',visible:true,locked:false},{id:'structure',name:'Structure',color:'#334e55',visible:true,locked:false},{id:'reference',name:'Reference',color:'#b8b5ae',visible:true,locked:false}];this.currentLayer='model';this.selection=new Set();this.undoStack=[];this.redoStack=[];this.cache=new Map();this.listeners=new Set();this.version=0;this.transactionDepth=0;this.extra={};}
  onChange(fn){this.listeners.add(fn);return()=>this.listeners.delete(fn);}
  notify(reason='change'){this.version++;for(let fn of this.listeners)fn(reason);}
  serialize(){return {format:'veldra',version:1,name:this.name,units:this.units,tolerance:this.tolerance,objects:structuredClone(this.objects),layers:structuredClone(this.layers),currentLayer:this.currentLayer,extra:structuredClone(this.extra)};}
  restore(data,reason='restore'){
    validateDocument(data);this.name=data.name??'Untitled';this.units=data.units??'mm';this.tolerance=data.tolerance??.001;this.objects=structuredClone(data.objects);this.layers=structuredClone(data.layers);this.currentLayer=data.currentLayer??this.layers[0].id;this.extra=structuredClone(data.extra??{});this.cache.clear();this.selection.clear();this.notify(reason);
  }
  transaction(label,fn){if(this.transactionDepth){return fn();}let before=this.serialize(),selection=[...this.selection];this.transactionDepth++;try{let result=fn();this.undoStack.push({label,data:before,selection});if(this.undoStack.length>80)this.undoStack.shift();this.redoStack=[];this.notify(label);return result;}catch(error){this.restore(before,'rollback');this.selection=new Set(selection);throw error;}finally{this.transactionDepth--;}}
  undo(){let h=this.undoStack.pop();if(!h)return false;this.redoStack.push({...h,data:this.serialize(),selection:[...this.selection]});this.restore(h.data,'undo');if(h.graphBefore)this.restoreRelated?.(h.graphBefore);this.selection=new Set(h.selection);this.notify('selection');return h.label;}
  redo(){let h=this.redoStack.pop();if(!h)return false;this.undoStack.push({...h,data:this.serialize(),selection:[...this.selection]});this.restore(h.data,'redo');if(h.graphAfter)this.restoreRelated?.(h.graphAfter);this.selection=new Set(h.selection);this.notify('selection');return h.label;}
  add(geometry,name,options={}){let o=Object.assign(makeObject(geometry,name,this.currentLayer),options);this.objects.push(o);return o;}
  get(id){return this.objects.find(o=>o.id===id);}
  selected(){return this.objects.filter(o=>this.selection.has(o.id));}
  select(ids,additive=false){if(!additive)this.selection.clear();for(let id of ids){let o=this.get(id);if(o&&!o.locked&&!this.layers.find(l=>l.id===o.layer)?.locked)this.selection.add(id);}this.notify('selection');}
  visibleObjects(){return this.objects.filter(o=>o.visible&&this.layers.find(l=>l.id===o.layer)?.visible!==false);}
  touch(o){o.revision=(o.revision??0)+1;this.cache.delete(o.id);}
  removeSelected(){this.objects=this.objects.filter(o=>!this.selection.has(o.id));for(let id of this.selection)this.cache.delete(id);this.selection.clear();}
  display(o,quality=1){let key=(o.revision??0)+':'+quality,cached=this.cache.get(o.id);if(cached?.key===key)return cached;let m=geometryMesh(o.geometry,quality);if(m)m=transformMesh(m,o.matrix);let lines=geometryLines(o.geometry).map(e=>e.map(p=>M.point(o.matrix,p)));let edges=m?(m.edges??meshEdges(m,true)):[];let pts=m?.positions??lines.flat();cached={key,mesh:m,lines,edges,bounds:bounds(pts),bvh:null};this.cache.set(o.id,cached);return cached;}
  bounds(selected=false){let P=[];for(let o of selected?this.selected():this.visibleObjects()){let b=this.display(o).bounds;if(b.min.every(Number.isFinite))P.push(b.min,b.max);}return P.length?bounds(P):bounds([[-10,-10,0],[10,10,10]]);}
  pickRay(origin,direction){let best=null;for(let o of this.visibleObjects()){if(o.locked||this.layers.find(l=>l.id===o.layer)?.locked)continue;let d=this.display(o);if(!d.mesh?.indices.length)continue;d.bvh??=new MeshBVH(d.mesh);let hit=d.bvh.intersect(origin,direction);if(hit&&(!best||hit.t<best.t))best={...hit,object:o};}return best;}
}
export function validateDocument(data){
  if(data?.format!=='veldra'||data.version!==1||!Array.isArray(data.objects)||!Array.isArray(data.layers)||data.layers.length===0)throw Error('Not a supported Veldra document');
  if(data.objects.length>20000||data.layers.length>2000)throw Error('Document object/layer budget exceeded');
  if(data.units!==undefined&&!['mm','cm','m','in','ft'].includes(data.units))throw Error('Unsupported document units');
  let layers=new Set();for(let l of data.layers){if(!safeId(l.id)||layers.has(l.id)||!safeColor(l.color)||typeof l.name!=='string')throw Error('Invalid document layer');layers.add(l.id);}
  if(data.currentLayer!==undefined&&!layers.has(data.currentLayer))throw Error('Missing current layer');
  let ids=new Set(),budget={points:0};for(let o of data.objects){if(!safeId(o.id)||ids.has(o.id)||!layers.has(o.layer)||!safeColor(o.color)||typeof o.name!=='string')throw Error('Invalid object attributes');validateMatrix(o.matrix);validateGeometry(o.geometry,budget);if(o.material&&(!Number.isFinite(o.material.metallic)||!Number.isFinite(o.material.roughness)||o.material.metallic<0||o.material.metallic>1||o.material.roughness<0||o.material.roughness>1))throw Error('Invalid material parameters');ids.add(o.id);}
  if(data.tolerance!==undefined&&(!Number.isFinite(data.tolerance)||data.tolerance<=0))throw Error('Invalid document tolerance');
}
