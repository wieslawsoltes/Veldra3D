import {safeId,finitePoint} from './validation.js';
import {uid} from './math.js';
/** Explicit branch-path tree. This is Veldra's own data model, not a .gh serializer. */
export class DataTree{
  constructor(branches=[]){this.kind='tree';this.branches=branches.map(b=>({path:[...b.path],items:[...b.items]}));for(let b of this.branches)if(b.path.some(i=>!Number.isInteger(i)||i<0))throw Error('Tree paths must contain nonnegative integers');this.branches.sort((a,b)=>{for(let i=0;i<Math.min(a.path.length,b.path.length);i++)if(a.path[i]!==b.path[i])return a.path[i]-b.path[i];return a.path.length-b.path.length;});}
  static from(value){return value instanceof DataTree?value:value?.kind==='tree'?new DataTree(value.branches):new DataTree([{path:[0],items:Array.isArray(value)?value:[value]}]);}
  flatten(){return new DataTree([{path:[0],items:this.branches.flatMap(b=>b.items)}]);}
  graft(){return new DataTree(this.branches.flatMap(b=>b.items.map((item,i)=>({path:[...b.path,i],items:[item]}))));}
  simplify(){if(!this.branches.length)return new DataTree();let common=0;while(this.branches.every(b=>b.path.length>common+1&&b.path[common]===this.branches[0].path[common]))common++;return new DataTree(this.branches.map(b=>({path:b.path.slice(common),items:b.items})));}
  map(fn){return new DataTree(this.branches.map(b=>({path:b.path,items:b.items.map(fn)})));}
  get count(){return this.branches.reduce((s,b)=>s+b.items.length,0);}
}
function listFor(value,port){return Array.isArray(value)&&!(['point','vector'].includes(port.type)&&value.length===3&&value.every(v=>typeof v==='number'));}
function checkType(v,type){
  if(v===undefined||v===null)return false;if(type==='any'||type==='tree')return true;if(type==='number')return typeof v==='number'&&Number.isFinite(v);if(type==='point'||type==='vector')return Array.isArray(v)&&v.length===3&&v.every(Number.isFinite);if(type==='geometry')return !!v.kind&&v.kind!=='tree';if(type==='curve')return v.kind==='curve';if(type==='surface')return v.kind==='surface';if(type==='mesh')return v.kind==='mesh';if(type==='boolean')return typeof v==='boolean';if(type==='list')return Array.isArray(v);return true;
}
export class Graph{
  constructor(registry){this.registry=registry;this.nodes=[];this.wires=[];this.listeners=new Set();this.cache=new Map();this.version=0;this.solveTime=0;this.enabled=true;this.errorCount=0;this.lastEvaluated=0;}
  onChange(fn){this.listeners.add(fn);return()=>this.listeners.delete(fn);}
  changed(reason='change'){this.version++;for(let fn of this.listeners)fn(reason);}
  add(type,x=40,y=40,params={}){let d=this.registry[type];if(!d)throw Error('Unknown component '+type);let n={id:uid('n'),type,x,y,params:{...structuredClone(d.defaults??{}),...params},preview:d.preview??false,revision:0,label:d.name};this.nodes.push(n);this.changed('add');return n;}
  remove(id){this.nodes=this.nodes.filter(n=>n.id!==id);this.wires=this.wires.filter(w=>w.from!==id&&w.to!==id);this.cache.delete(id);this.changed('remove');}
  set(id,key,value){let n=this.nodes.find(n=>n.id===id);if(!n)throw Error('Missing component');n.params[key]=value;n.revision++;this.changed('parameter');}
  connect(from,output,to,input){
    if(from===to)throw Error('A component cannot connect to itself');let a=this.nodes.find(n=>n.id===from),b=this.nodes.find(n=>n.id===to);if(!a||!b)throw Error('Missing component');let out=this.registry[a.type].outputs[output],inp=this.registry[b.type].inputs[input];if(!out||!inp)throw Error('Missing port');
    let compatible=inp.type==='any'||inp.type==='list'||inp.type==='tree'||out.type==='any'||out.type==='list'||out.type==='tree'||inp.type===out.type||(inp.type==='geometry'&&['curve','surface','mesh','geometry'].includes(out.type))||(['point','vector'].includes(inp.type)&&['point','vector'].includes(out.type));if(!compatible)throw Error(`${out.type} cannot connect to ${inp.type}`);
    // Cycle rejection happens before modifying the existing connection.
    let reachable=new Set(),visit=id=>{if(reachable.has(id))return;reachable.add(id);for(let w of this.wires)if(w.from===id)visit(w.to);};visit(to);if(reachable.has(from))throw Error('Connection would create a cycle');
    this.wires=this.wires.filter(w=>!(w.to===to&&w.input===input));let wire={id:uid('w'),from,output,to,input};this.wires.push(wire);b.revision++;this.changed('connect');return wire;
  }
  disconnect(id){let w=this.wires.find(w=>w.id===id);if(w){let n=this.nodes.find(n=>n.id===w.to);if(n)n.revision++;}this.wires=this.wires.filter(w=>w.id!==id);this.changed('disconnect');}
  order(){let order=[],state=new Map(),visit=n=>{if(state.get(n.id)===1)throw Error('Graph contains a cycle');if(state.get(n.id)===2)return;state.set(n.id,1);for(let w of this.wires.filter(w=>w.to===n.id)){let p=this.nodes.find(n=>n.id===w.from);if(!p)throw Error('Dangling connection');visit(p);}state.set(n.id,2);order.push(n);};for(let n of this.nodes)visit(n);return order;}
  evaluate(context={}){
    if(!this.enabled)return this.cache;let start=performance.now(),errors=0,evaluated=0;
    for(let n of this.order()){
      let def=this.registry[n.type],incoming=this.wires.filter(w=>w.to===n.id),signature=`${n.revision}|${n.type==='reference'?(context.version??0):0}|`+incoming.map(w=>`${w.id}:${this.cache.get(w.from)?.stamp??'-'}`).join(','),cached=this.cache.get(n.id);
      if(cached?.signature===signature){errors+=+!!cached.error;continue;}let timestamp=performance.now();
      try{
        let inputs=def.inputs.map((port,i)=>{let wire=incoming.find(w=>w.input===i);if(wire){let source=this.cache.get(wire.from);if(source?.error)throw Error('Upstream: '+source.error);return source?.values[wire.output];}return n.params[port.key]??port.default;});
        let values;
        const run=items=>{let required=def.inputs.findIndex((p,i)=>items[i]===undefined&&!p.optional);if(required>=0)throw Error('Connect '+def.inputs[required].name);for(let i=0;i<items.length;i++)if(items[i]!==undefined&&(def.inputs[i].access??'item')==='item'&&!checkType(items[i],def.inputs[i].type))throw Error('Invalid '+def.inputs[i].name+' ('+def.inputs[i].type+')');let result=def.run(items,n.params,context);if(!Array.isArray(result)||result.length!==def.outputs.length)throw Error('Invalid component output');return result;};
        if(def.treeAware){values=run(inputs);}else{
          let treeIndex=inputs.findIndex((v,i)=>v?.kind==='tree'&&(def.inputs[i].access??'item')==='item');
          const lace=vals=>{let lengths=vals.map((v,i)=>(def.inputs[i].access??'item')==='item'&&listFor(v,def.inputs[i])?v.length:1),count=Math.max(...lengths,1);if(count>20000)throw Error('Component item budget exceeded');if(lengths.some(n=>n===0))return def.outputs.map(()=>[]);if(!vals.some((v,i)=>(def.inputs[i].access??'item')==='item'&&listFor(v,def.inputs[i])))return run(vals);let out=def.outputs.map(()=>[]);for(let j=0;j<count;j++){let item=vals.map((v,i)=>(def.inputs[i].access??'item')==='item'&&listFor(v,def.inputs[i])?v[Math.min(j,v.length-1)]:v),r=run(item);r.forEach((v,i)=>out[i].push(v));}return out;};
          if(treeIndex>=0){let template=DataTree.from(inputs[treeIndex]),output=def.outputs.map(()=>[]);for(let branch of template.branches){let values=inputs.map(v=>v?.kind==='tree'?(DataTree.from(v).branches.find(b=>b.path.join(';')===branch.path.join(';'))??DataTree.from(v).branches.at(-1))?.items??[]:v),r=lace(values);r.forEach((v,i)=>output[i].push({path:branch.path,items:Array.isArray(v)?v:[v]}));}values=output.map(b=>new DataTree(b));}else values=lace(inputs);
        }
        this.cache.set(n.id,{signature,values,stamp:(cached?.stamp??0)+1,time:performance.now()-timestamp,error:null});
      }catch(e){errors++;this.cache.set(n.id,{signature,values:[],stamp:(cached?.stamp??0)+1,time:performance.now()-timestamp,error:e.message});}evaluated++;
    }
    this.errorCount=errors;this.solveTime=performance.now()-start;this.lastEvaluated=evaluated;return this.cache;
  }
  previewGeometry(){let out=[];const collect=(value,node)=>{if(value?.kind==='tree')for(let b of value.branches)b.items.forEach(v=>collect(v,node));else if(Array.isArray(value))value.forEach(v=>collect(v,node));else if(value?.kind&&value.kind!=='tree')out.push({geometry:value,node});};for(let n of this.nodes)if(n.preview){let c=this.cache.get(n.id);if(c&&!c.error)for(let v of c.values)collect(v,n);}return out;}
  serialize(){return {format:'weave',version:1,nodes:structuredClone(this.nodes),wires:structuredClone(this.wires),enabled:this.enabled};}
  restore(data){if(data?.format!=='weave'||data.version!==1||!Array.isArray(data.nodes)||!Array.isArray(data.wires))throw Error('Not a Weave definition');if(data.nodes.length>5000||data.wires.length>20000)throw Error('Graph budget exceeded');for(let n of data.nodes){if(!this.registry[n.type])throw Error('Unknown component '+n.type);if(!safeId(n.id)||![n.x,n.y].every(Number.isFinite)||!n.params||typeof n.params!=='object'||!Number.isInteger(n.revision)||n.revision<0)throw Error('Invalid component metadata');for(let port of this.registry[n.type].inputs){let value=n.params[port.key];if(value!==undefined&&((port.type==='number'&&!Number.isFinite(value))||(['point','vector'].includes(port.type)&&!finitePoint(value))))throw Error('Invalid stored input '+port.name);}if(n.type==='number'&&(!['value','min','max','step'].every(k=>Number.isFinite(n.params[k]))||n.params.min>n.params.max||n.params.step<=0))throw Error('Invalid slider range');}for(let w of data.wires)if(!safeId(w.id)||!Number.isInteger(w.input)||!Number.isInteger(w.output))throw Error('Invalid wire metadata');if(new Set(data.wires.map(w=>w.id)).size!==data.wires.length||new Set(data.wires.map(w=>w.to+':'+w.input)).size!==data.wires.length)throw Error('Duplicate graph connection');let old={nodes:this.nodes,wires:this.wires};this.nodes=structuredClone(data.nodes);this.wires=structuredClone(data.wires);try{if(new Set(this.nodes.map(n=>n.id)).size!==this.nodes.length)throw Error('Duplicate component IDs');for(let w of this.wires){let a=this.nodes.find(n=>n.id===w.from),b=this.nodes.find(n=>n.id===w.to);if(!a||!b||!this.registry[a.type].outputs[w.output]||!this.registry[b.type].inputs[w.input])throw Error('Invalid connection');}this.order();}catch(e){Object.assign(this,old);throw e;}this.enabled=data.enabled!==false;this.cache.clear();this.changed('restore');}
}
