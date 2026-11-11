'use strict';
// Optional full-DOM integration check: npm install --no-save jsdom@26.1.0
// All games are synthetic. No network requests or production data are used.
const {JSDOM,VirtualConsole}=require('jsdom');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const html=fs.readFileSync(path.join(__dirname,'..','index.html'),'utf8');
const blank={version:2,player:{name:'테스트',team:'',pos:''},games:[],trainings:[{id:'keep-training',date:'2026-01-01'}],growth:[],posts:[],deleted:[]};
const copy=x=>JSON.parse(JSON.stringify(x));
const errors=[];
function boot(storage={}){
 const vc=new VirtualConsole();vc.on('jsdomError',e=>errors.push(e.message));
 return new JSDOM(html,{url:'https://scorebook-test.invalid/?admin=1',runScripts:'dangerously',pretendToBeVisual:true,virtualConsole:vc,beforeParse(w){
  w.scrollTo=()=>{};w.alert=()=>{};w.confirm=()=>true;
  w.fetch=async(url,options)=>{assert.ok(!options||!options.method||options.method==='GET','No external mutation');return {ok:true,json:async()=>copy(blank)};};
  for(const [k,v] of Object.entries(storage))w.localStorage.setItem(k,v);
 }});
}
async function ready(){await new Promise(r=>setImmediate(r));}
(async()=>{
 const dom=boot();const w=dom.window;const d=w.document;await ready();
 const $=s=>d.querySelector(s);const all=s=>Array.from(d.querySelectorAll(s));
 for(let mask=0;mask<8;mask++){
  w.fillForm(null);$('.pa-res').value='1B';
  for(const box of all('.pa-base'))if(mask&(1<<(Number(box.value)-1)))box.click();
  const pa=w.readForm().pas[0];
  assert.deepEqual(copy(pa.bases),[1,2,3].filter(b=>mask&(1<<(b-1))));
  assert.equal(pa.run,mask&6?'risp':mask?'first':'none');
  assert.equal(w.battingAgg([{pas:[pa]}]).RISP,mask&6?1:null);
 }
 console.log('PASS all eight runner selections, actual checkbox events and automatic RISP');
 w.clearDraft();
 const old={id:'legacy-game',date:'2026-01-01',opp:'Synthetic',role:'선발',dec:'승',ips:[{o:4,er:1}],ts:3,os:1,extra:{keep:true},pas:[{res:'2B',seq:'BX',run:'risp',rbi:2,scored:1,customPA:'keep'}],bfs:[{res:'GO',seq:'X',inn:1,customBF:'keep'}],fds:[{pos:'유격수',po:1,a:2,e:0,customFD:'keep'}]};
 const original=JSON.stringify(old);w.fillForm(old);
 assert.equal(all('.pa-base:checked').length,0);assert.equal($('.runner-input').dataset.exact,'0');
 let read=w.readForm();assert.equal(read.pas[0].run,'risp');assert.equal(read.pas[0].bases,undefined);
 assert.equal(read.pas[0].customPA,'keep');assert.equal(read.bfs[0].customBF,'keep');assert.equal(read.fds[0].customFD,'keep');
 for(const k of ['role','dec','ips','ts','os','extra'])assert.deepEqual(copy(read[k]),old[k]);
 w.saveDraft();assert.equal(JSON.stringify(old),original);
 const storedDraft=w.localStorage.getItem('baseball_entry_draft:legacy-game');
 const resumed=boot({'baseball_entry_draft':storedDraft});await ready();
 resumed.window.document.querySelector('[data-draft="resume"]').click();
 read=resumed.window.readForm();assert.equal(read.id,'legacy-game');assert.equal(read.pas[0].bases,undefined);assert.equal(read.dec,'승');assert.deepEqual(copy(read.ips),old.ips);
 resumed.window.close();
 console.log('PASS untouched legacy RISP, unknown row/game metadata, removed fields and draft resume preserved');
 $('.pa-base[value="3"]').click();assert.deepEqual(copy(w.readForm().pas[0].bases),[3]);
 $('.pa-base[value="1"]').click();assert.deepEqual(copy(w.readForm().pas[0].bases),[1,3]);
 $('.base-none').click();$('.base-none').click();assert.deepEqual(copy(w.readForm().pas[0].bases),[]);assert.equal(w.readForm().pas[0].run,'none');
 console.log('PASS explicit replacement of legacy coarse runners and repeated clear');
 w.fillForm(old);$('#save-game').click();
 const saved=JSON.parse(w.localStorage.getItem('baseball_archive_v1'));
 assert.equal(saved.games.length,1);assert.equal(saved.games[0].id,'legacy-game');assert.equal(saved.games[0].dec,'승');assert.deepEqual(saved.trainings,blank.trainings);
 assert.equal(saved.games[0].pas[0].bases,undefined);assert.equal(saved.games[0].pas[0].customPA,'keep');
 assert.match($('#log-overview').textContent,/방어율 · ERA/);assert.match($('#log-overview').textContent,/누적 투구수/);
 assert.equal(all('.score-pa').length,1);assert.match($('.score-pa').textContent,/2타점/);
 console.log('PASS save round-trip, scorebook render, ERA and training retention');
 $('#nav button[data-tab="entry"]').click();$('#add-pa').click();assert.equal(all('#pa-rows .blk').length,2);
 all('#pa-rows [data-del]')[1].click();assert.equal(all('#pa-rows .blk').length,1);
 $('#e-opp').value='Blank opponent';$('#save-game').click();
 const after=JSON.parse(w.localStorage.getItem('baseball_archive_v1'));assert.equal(after.games.find(g=>g.opp==='Blank opponent').pas.length,0);
 console.log('PASS add/remove/reset and opponent-only save do not invent a batting record');
 assert.equal($('#e-role'),null);assert.equal($('#e-dec'),null);assert.equal($('#nav [data-tab="train"]'),null);
 // A completed sequence locks the pitch pad. Undo restores the pre-pitch choice.
 w.fillForm(null);
 const pitch=(code)=>$('.pa [data-p="'+code+'"]').click();
 $('.pa-res').value='FO';
 for(let i=0;i<4;i++) pitch('B');
 assert.equal($('.pa-res').value,'BB'); assert.equal($('.pa [data-p="B"]').disabled,true);
 pitch('B'); assert.equal(w.readForm().pas[0].seq,'BBBB');
 $('.pa [data-undo]').click(); assert.equal($('.pa-res').value,'FO');
 assert.equal(w.readForm().pas[0].seq,'BBB'); pitch('X');
 $('.pa [data-quick="1B"]').click(); assert.equal(w.readForm().pas[0].res,'1B');
 $('.pa [data-del]').click(); assert.equal(w.readForm().pas.length,0);
 $('.deleted-row button').click(); assert.equal(w.readForm().pas[0].seq,'BBBX');
 assert.equal(JSON.parse(w.localStorage.baseball_entry_draft).g.pas[0].res,'1B');
 console.log('PASS terminal pitch lock, undo, quick result and deleted row restoration');

 w.fillForm(null); $('#add-bf').click();
 assert.equal(w.readForm().bfs.length,0); assert.equal($('#bf-sum').textContent,'');
 $('.bf [data-p="B"]').click(); $('#save-game').click();
 assert.match($('#toast').textContent,/상대 타자의 최종 결과/);
 $('.bf-res').value='1B'; $('.bf-res').dispatchEvent(new w.Event('change',{bubbles:true}));
 assert.equal(JSON.parse(w.localStorage.baseball_entry_draft).g.bfs[0].res,'1B');
 w.fillForm(old); $('.pa-base[value="2"]').click(); $('.pa-base[value="2"]').click();
 assert.equal(w.readForm().pas[0].run,'risp'); assert.equal(w.readForm().pas[0].bases,undefined);
 $('.base-none').click(); w.saveDraft();
 const both=boot(Object.fromEntries(Object.entries(w.localStorage)));
 await ready();
 const b=both.window, bd=b.document;
 assert.equal(b.readForm().bfs[0].res,'1B');
 bd.querySelector('[data-draft="resume"]').click(); bd.querySelector('.base-restore').click();
 assert.equal(b.readForm().pas[0].run,'risp'); assert.equal(b.readForm().pas[0].bases,undefined);
 bd.querySelector('#save-game').click();
 assert.equal(b.readForm().bfs[0].res,'1B'); assert.ok(b.localStorage.baseball_entry_draft);
 both.window.close();
 console.log('PASS empty opponents, partial-save validation, independent drafts and legacy runner restore after reload');
 assert.deepEqual(errors,[]);console.log('PASS full application initialization without JavaScript errors');
 w.close();
})().catch(e=>{console.error(e);process.exitCode=1;});
