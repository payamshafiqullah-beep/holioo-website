import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const read=p=>fs.readFileSync(new URL(p,import.meta.url),'utf8');
function setup(fail=false){
 const session={id:'s',photoIds:['a','b']},state={courses:[{sections:[{sessions:[session]}]}],inbox:[{photoIds:['a']},{photoIds:['c']}],files:[{id:'pdf'}],captureDraft:{photoIds:['a','b']}};
 const ctx={state,currentBatch:{photoIds:['a','b'],selected:new Set(['a']),splitQueue:[]},DB:{del:async()=>{if(fail)throw Error('disk')}},saveState(){},queueSync(){}};
 vm.createContext(ctx);vm.runInContext(read('../features/media-viewer.js'),ctx);return{ctx,state,session};
}
test('local photo deletion clears every reference but keeps existing PDFs',async()=>{const{ctx,state,session}=setup();await ctx.removeLocalPhoto('a');assert.deepEqual(session.photoIds,['b']);assert.equal(state.inbox.length,1);assert.deepEqual(state.captureDraft.photoIds,['b']);assert.equal(ctx.currentBatch.selected.has('a'),false);assert.equal(state.files.length,1)});
test('storage failure keeps photo and PDF references intact',async()=>{const{ctx,state,session}=setup(true);await assert.rejects(ctx.removeLocalPhoto('a'));assert.deepEqual(session.photoIds,['a','b']);await assert.rejects(ctx.removeLocalPdf('pdf'));assert.equal(state.files.length,1)});
test('deleting a PDF leaves its original photos untouched',async()=>{const{ctx,state,session}=setup();await ctx.removeLocalPdf('pdf');assert.equal(state.files.length,0);assert.deepEqual(session.photoIds,['a','b'])});
function publicSetup({owner='me',storageError=false,allowed=true}={}){
 const calls=[],session={visibility:'public'},state={favorites:[{id:'pub'}]};
 const sb={from:()=>{let operation='read';const q={select(){return q},eq(k,v){calls.push(['filter',k,v]);return q},maybeSingle:async()=>({data:allowed?{id:'pub',owner_id:owner,session_local_id:'s',storage_paths:[`${owner}/s/1.jpg`]}:null}),update(v){operation='hide';calls.push(['hide',v]);return q},delete(){operation='delete';calls.push(['delete']);return q},then(resolve,reject){return Promise.resolve({data:[{id:'pub'}]}).then(resolve,reject)}};return q},storage:{from:()=>({remove:async paths=>{calls.push(['storage',paths]);return{error:storageError?Error('offline'):null}}})}};
 const ctx={state,sb,currentUser:{id:'me'},navigator:{onLine:true},findSessionContext:()=>({session}),saveState(){}};vm.createContext(ctx);vm.runInContext(read('../features/community-actions.js'),ctx);return{ctx,calls,state,session};
}
test('owned publication is hidden, storage removed, then record deleted',async()=>{const{ctx,calls,state,session}=publicSetup();await ctx.removePublicMaterial('pub');assert.deepEqual(calls.filter(c=>c[0]!=='filter').map(c=>c[0]),['hide','storage','delete']);assert.equal(calls.filter(c=>c[0]==='filter'&&c[1]==='owner_id'&&c[2]==='me').length,3);assert.equal(state.favorites.length,0);assert.equal(session.visibility,'private')});
test('another owner and denied rows cannot cause file deletion',async()=>{for(const options of [{owner:'other'},{allowed:false}]){const{ctx,calls}=publicSetup(options);await assert.rejects(ctx.removePublicMaterial('pub'));assert.equal(calls.some(c=>c[0]==='storage'||c[0]==='delete'),false)}});
test('failed public storage deletion retains record for retry',async()=>{const{ctx,calls,state}=publicSetup({storageError:true});await assert.rejects(ctx.removePublicMaterial('pub'));assert.equal(calls.some(c=>c[0]==='delete'),false);assert.equal(state.favorites.length,1)});
