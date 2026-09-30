import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const source=fs.readFileSync(new URL('../ui/reorder.js',import.meta.url),'utf8');
function setup(){
 const handlers=new Map(),timers=new Map(),frames=new Map();let serial=0,order,scrolls=0;
 const classes=()=>({add(){},remove(){}});
 const eventTarget=key=>({addEventListener:(n,fn)=>handlers.set(key+n,fn),removeEventListener:n=>handlers.delete(key+n)});
 function element(tag='div'){
  const el={tag,children:[],dataset:{},style:{},classList:classes(),hidden:false,isConnected:true,attrs:{},...eventTarget(''),
   setAttribute(k,v){this.attrs[k]=v},removeAttribute(k){delete this.attrs[k]},after(){},focus(){},
   appendChild(c){if(c.parentElement)c.parentElement.children=c.parentElement.children.filter(x=>x!==c);this.children.push(c);c.parentElement=this},
   remove(){if(this.parentElement)this.parentElement.children=this.parentElement.children.filter(x=>x!==this)},
   matches(s){return s==='[data-course]'?!!this.dataset.course:s==='[data-reorder-handle]'?'reorderHandle' in this.dataset:s==='button'?this.tag==='button':s==='.reorder-handle'?this.className==='reorder-handle':false},
   closest(s){return this.matches(s)?this:this.parentElement?.closest(s)||null},
   querySelector(s){return this.children.find(c=>c.matches(s))||null},querySelectorAll(s){return this.children.flatMap(c=>[...(c.matches(s)?[c]:[]),...c.querySelectorAll(s)])},
   getBoundingClientRect(){const index=this.parentElement?.children.filter(c=>!c.hidden).indexOf(this)||0;return{left:0,top:100+index*100,width:300,height:100}},
   cloneNode(){return element(this.tag)}};return el;
 }
 const body=element(),host=element();Object.assign(host,eventTarget('host:'));
 for(const id of ['a','hidden','b']){const c=element();c.dataset.course=id;c.hidden=id==='hidden';host.appendChild(c)}
 const ctx={document:{...eventTarget('doc:'),createElement:element,body},window:{...eventTarget('win:'),scrollY:0,scrollX:0,innerHeight:900,scrollBy(){scrolls++}},navigator:{},Date,
 setTimeout:fn=>{timers.set(++serial,fn);return serial},clearTimeout:id=>timers.delete(id),requestAnimationFrame:fn=>{frames.set(++serial,fn);return serial},cancelAnimationFrame:id=>frames.delete(id)};
 vm.createContext(ctx);vm.runInContext(source,ctx);ctx.makeReorderable(host,{itemSelector:'[data-course]',idAttribute:'course',onChange:ids=>order=Array.from(ids)});
 const dispatch=(key,e={})=>handlers.get(key)?.({cancelable:true,preventDefault(){},stopPropagation(){},stopImmediatePropagation(){},...e});
 const touch=(type,y,target=host.children[0])=>dispatch(type==='touchstart'?'host:touchstart':`doc:${type}`,{target,touches:type==='touchend'?[]:[{identifier:1,clientX:100,clientY:y}],changedTouches:[{identifier:1,clientX:100,clientY:y}]});
 return{host,ctx,handlers,touch,dispatch,order:()=>order,scrolls:()=>scrolls,timer(){for(const [id,fn] of [...timers]){timers.delete(id);fn()}},frame(){for(const [id,fn] of [...frames]){frames.delete(id);fn()}}};
}
test('touch sorting is stable, preserves hidden slots and suppresses the release click',()=>{
 const s=setup();s.touch('touchstart',150);s.timer();s.touch('touchmove',250);s.frame();s.frame();s.touch('touchend',250);
 assert.deepEqual(s.order(),['b','hidden','a']);let blocked=false;s.dispatch('host:click',{target:s.host.children[2],stopImmediatePropagation(){blocked=true}});assert.equal(blocked,true);
});
test('normal scrolling cancels pending long press without changing order',()=>{const s=setup();s.touch('touchstart',150);s.touch('touchmove',175);s.timer();s.frame();assert.equal(s.order(),undefined);assert.equal(s.handlers.has('doc:touchmove'),false)});
test('canceled touch restores original positions and never saves a partial move',()=>{const s=setup();s.touch('touchstart',150);s.timer();s.touch('touchmove',250);s.frame();s.dispatch('doc:touchcancel');assert.equal(s.order(),undefined);assert.deepEqual(s.host.children.map(c=>c.dataset.course),['a','hidden','b'])});
test('edge scrolling continues with a stationary finger and stops when detached',()=>{const s=setup();s.touch('touchstart',150);s.timer();s.touch('touchmove',850);s.frame();s.frame();assert.equal(s.scrolls(),2);s.host.isConnected=false;s.frame();assert.equal(s.handlers.has('doc:touchmove'),false)});
test('handle moves immediately and keyboard reordering saves',()=>{const s=setup(),handle=s.host.children[0].querySelector('.reorder-handle');s.dispatch('host:keydown',{target:handle,key:'ArrowDown'});assert.deepEqual(s.order(),['b','hidden','a']);s.ctx.destroyReorderables();assert.equal(s.host._reorder,undefined)});
