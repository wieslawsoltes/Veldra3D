import test from 'node:test';
import assert from 'node:assert/strict';
import {renderSettings,linearColor} from '../src/render/final-scene.js';

test('imported light attributes are normalized before HTML or GPU use',()=>{
 const s=renderSettings({lights:[null,42,{type:'spot',power:'\" onfocus=bad',position:['<svg>',NaN,Infinity],direction:[0,0,-1],width:-5,cone:900,color:'bad'}]});
 assert.equal(s.lights.length,1);
 const l=s.lights[0];assert.equal(l.power,1);assert.deepEqual(l.position,[0,0,20]);assert.equal(l.width,.001);assert.equal(l.cone,179);assert.equal(l.color,'#ffffff');
 for(const key of ['power','width','height','angle','cone'])assert.ok(Number.isFinite(l[key]));
});
test('valid shorthand document colors retain their meaning in final renders',()=>{
 assert.deepEqual(linearColor('#f80'),linearColor('#ff8800'));
 assert.deepEqual(linearColor('#ABC'),linearColor('#aabbcc'));
});
