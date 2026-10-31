'use strict';
// Synthetic, offline regression tests. Never reads data.json or calls a live API.
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const root=path.resolve(__dirname,'..');
const html=fs.readFileSync(path.join(root,'index.html'),'utf8');
function section(start,end,text=html){
  const a=text.indexOf(start), b=text.indexOf(end,a+start.length);
  assert(a>=0 && b>a,`Cannot locate source section ${start}`);
  return text.slice(a,b);
}
const normalizeSource=section('function normalize(d){','\nlet DB =');
const mergeSource=section('function mergeArchive(current,incoming){','\nfunction download(');
const urlSource=section('function safeContentUrl(value, image){','\nfunction sanitizeHTML(');
const sanitizerSource=section('function sanitizeHTML(html){','\nfunction renderBody(');
const trainingSource=section('/* ================= 05 훈련 ================= */','/* 성장 기록:');
const fresh=()=>({version:2,player:{name:'',team:'',pos:''},games:[],trainings:[],growth:[],posts:[],deleted:[]});
const record=(id,extra={})=>({id,date:'2026-01-01',...extra});
function plain(value){ return JSON.parse(JSON.stringify(value)); }
function harness(){
  const elements=new Map();
  const get=s=>{
    if(!elements.has(s)) elements.set(s,{value:'',hidden:true,textContent:'',handlers:{},addEventListener(k,fn){this.handlers[k]=fn;}});
    return elements.get(s);
  };
  let saves=0,sequence=0,confirms=0;
  const context=vm.createContext({URL,ADMIN:true,DB:fresh(),$:get,
    uid:()=>`new-${++sequence}`,today:()=> '2026-01-01',num:x=>parseFloat(x)||0,iv:x=>parseInt(x,10)||0,
    persist:()=>saves++,toast:()=>{},alert:msg=>{throw new Error(msg);},confirm:()=>{confirms++;return false;},
    window:{scrollTo(){}},applyPlayer(){},refreshDatalists(){},renderLog(){},renderData(){},renderPosts(){},renderSidebar(){}
  });
  vm.runInContext(normalizeSource+'\n'+mergeSource+'\n'+urlSource,context);
  return {context,get,saves:()=>saves,confirms:()=>confirms};
}
test('main inline JavaScript parses',()=>{
  const source=html.slice(html.lastIndexOf('<script>')+8,html.lastIndexOf('</script>'));
  assert.doesNotThrow(()=>new vm.Script(source));
});
test('GitHub synchronization architecture remains byte-for-byte unchanged',()=>{
  const start='/* ================= GitHub 동기화 ================= */',end='/* ================= 유틸 ================= */';
  const digest=require('node:crypto').createHash('sha256').update(section(start,end)).digest('hex');
  // Baseline fcdc36d: this release intentionally leaves synchronization untouched.
  assert.equal(digest,'975583293a2ab15f936a736d795fbc7068c61a65f2705e766e9dad22f2412820');
});
test('merge includes all four collections, keeps local edits, deduplicates, and preserves drafts',()=>{
  const {context}=harness();
  const local=fresh(), incoming=fresh();
  local.games=[record('same',{memo:'local',pas:[],bfs:[],fds:[]})];
  incoming.games=[record('same',{memo:'incoming'}),record('new-game'),record('new-game')];
  incoming.trainings=[record('new-training')]; incoming.growth=[record('new-growth')];
  incoming.posts=[record('new-post',{draft:true,body:'Synthetic draft'})];
  const before=JSON.stringify(local);
  const result=context.mergeArchive(local,incoming);
  assert.equal(result.games.length,2); assert.equal(result.games[0].memo,'local');
  assert.equal(result.trainings.length,1); assert.equal(result.growth.length,1);
  assert.equal(result.posts[0].draft,true); assert.equal(JSON.stringify(local),before);
});
test('union tombstones win on both sides and a repeated merge cannot resurrect records',()=>{
  const {context}=harness(), local=fresh(), incoming=fresh();
  local.posts=[record('remote-deleted'),record('keep')]; local.deleted=['local-deleted'];
  incoming.posts=[record('local-deleted'),record('new')]; incoming.deleted=['remote-deleted','local-deleted'];
  const result=context.mergeArchive(local,incoming);
  assert.deepEqual(plain(result.posts.map(x=>x.id)),['keep','new']);
  assert.deepEqual(plain(result.deleted),['local-deleted','remote-deleted']);
  assert.deepEqual(plain(context.mergeArchive(result,incoming)),plain(result));
});
test('invalid incoming records fail without partly modifying current records',()=>{
  const {context}=harness(), local=fresh(), incoming=fresh();
  local.posts=[record('keep')]; incoming.games=[record('new')]; incoming.posts=[null];
  const before=JSON.stringify(local);
  assert.throws(()=>context.mergeArchive(local,incoming),/ID/);
  assert.equal(JSON.stringify(local),before);
});
function trainingHarness(){
  const h=harness();
  h.context.DB.trainings=[record('training-1',{type:'팀훈련',hours:1,pitch:10,memo:'Original'})];
  vm.runInContext(trainingSource+'\nrenderTrain=function(){};',h.context);
  h.edit=()=>h.get('#trainbody').handlers.click({preventDefault(){},target:{closest:s=>s==='[data-edit-t]'?{dataset:{editT:'training-1'}}:null}});
  return h;
}
test('opening/canceling a training edit never mutates or persists the original',()=>{
  const h=trainingHarness(), before=JSON.stringify(h.context.DB);
  h.edit(); assert.equal(h.saves(),0); assert.equal(JSON.stringify(h.context.DB),before);
  h.get('#t-memo').value='Uncommitted';
  h.get('#cancel-train').handlers.click();
  assert.equal(h.saves(),0); assert.equal(JSON.stringify(h.context.DB),before);
  assert.equal(h.get('#cancel-train').hidden,true);
});
test('saving a training edit updates one record with the same ID',()=>{
  const h=trainingHarness(); h.edit(); h.get('#t-memo').value='Updated';
  h.get('#save-train').handlers.click();
  assert.equal(h.saves(),1); assert.equal(h.context.DB.trainings.length,1);
  assert.equal(h.context.DB.trainings[0].id,'training-1');
  assert.equal(h.context.DB.trainings[0].memo,'Updated');
  assert.equal(h.get('#cancel-train').hidden,true);
});
test('a deleted-while-editing training is not silently recreated',()=>{
  const h=trainingHarness(); h.edit(); h.context.DB.trainings=[];
  let alerts=0; h.context.alert=()=>alerts++;
  h.get('#save-train').handlers.click();
  assert.equal(alerts,1); assert.equal(h.saves(),0); assert.equal(h.context.DB.trainings.length,0);
});
test('posts-only JSON import asks before replacement and merge retains both posts',()=>{
  const h=harness(); h.context.DB.posts=[record('local-post')];
  const incoming=fresh(); incoming.posts=[record('incoming-post')];
  h.context.FileReader=class{readAsText(){this.result=JSON.stringify(incoming);this.onload();}};
  vm.runInContext(section("  $('#file-json').addEventListener('change'","  $('#csv-game').addEventListener"),h.context);
  h.get('#file-json').handlers.change({target:{files:[{}],value:'fixture.json'}});
  assert.equal(h.confirms(),1); assert.equal(h.saves(),1);
  assert.deepEqual(plain(h.context.DB.posts.map(x=>x.id)),['local-post','incoming-post']);
});
test('explicit published-file merge uses the same deletion-aware full-archive helper',()=>{
  const handler=section("  $('#pull-pub').addEventListener('click'","  $('#exp-json').addEventListener");
  assert.match(handler,/DB=mergeArchive\(DB,d\)/);
});
test('published-file merge handler imports posts and applies remote deletions offline',async()=>{
  const h=harness(), incoming=fresh();
  h.context.DB.posts=[record('old-post'),record('kept-post')];
  incoming.posts=[record('imported-post')]; incoming.deleted=['old-post'];
  h.context.PUB_DATA=null; h.context.PUB_LOADED=false; h.context.confirm=()=>true;
  h.context.fetch=async()=>({ok:true,json:async()=>incoming});
  vm.runInContext(section("  $('#pull-pub').addEventListener('click'","  $('#exp-json').addEventListener"),h.context);
  h.get('#pull-pub').handlers.click();
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(h.saves(),1); assert.equal(h.context.PUB_LOADED,true);
  assert.deepEqual(plain(h.context.DB.posts.map(x=>x.id)),['kept-post','imported-post']);
  assert.deepEqual(plain(h.context.DB.deleted),['old-post']);
  assert.equal(h.get('#pull-pub').disabled,false);
});
test('non-admin training handlers cannot modify records',()=>{
  const h=trainingHarness(), before=JSON.stringify(h.context.DB);h.context.ADMIN=false;
  h.edit();h.get('#save-train').handlers.click();
  assert.equal(h.saves(),0);assert.equal(JSON.stringify(h.context.DB),before);
});
test('content URLs reject active schemes including embedded control characters',()=>{
  const {context}=harness();
  for(const value of ['javascript:alert(1)','java\nscript:alert(1)','java\tscript:alert(1)','data:text/html,test','vbscript:test']){
    assert.equal(context.safeContentUrl(value,false),false,value);
  }
  for(const value of ['https://example.test/article','#part','/photos/example.png','mailto:reader@example.test']) assert.equal(context.safeContentUrl(value,false),true,value);
  assert.equal(context.safeContentUrl('data:image/png;base64,AAAA',true),true);
  assert.equal(context.safeContentUrl('data:image/svg+xml,test',true),false);
});
test('iframe URL allowlist requires exact HTTPS YouTube embed destinations',()=>{
  const {context}=harness();
  for(const value of ['https://www.youtube.com/embed/abcdef12345','https://www.youtube-nocookie.com/embed/abcdef12345?rel=0']) assert.equal(context.youtubeEmbedUrl(value),value);
  for(const value of ['https://youtube.com.evil.test/embed/abcdef12345','https://youtube.com@evil.test/embed/abcdef12345','https://www.youtube.com/watch?v=abcdef12345','http://www.youtube.com/embed/abcdef12345','//www.youtube.com/embed/abcdef12345','https://www.youtube.com:444/embed/abcdef12345']) assert.equal(context.youtubeEmbedUrl(value),'',value);
});

// Generate a managed-browser fixture from the actual implementation, not a copied sanitizer.
// Every candidate and sanitized result stays in an inert <template>; no candidate is attached.
const domCases=[
  {name:'srcdoc and event attributes removed; YouTube embed sandboxed',input:'<iframe src="https://www.youtube.com/embed/abcdef12345" srcdoc="&lt;script&gt;window.fixtureOnly=true&lt;/script&gt;" onload="window.fixtureOnly=true" name="unsafe"></iframe>',kind:'iframe'},
  {name:'non-YouTube iframe removed',input:'<iframe src="https://example.test/embed/abcdef12345"></iframe>',kind:'none'},
  {name:'YouTube look-alike hostname removed',input:'<iframe src="https://youtube.com.evil.test/embed/abcdef12345"></iframe>',kind:'none'},
  {name:'non-embed YouTube iframe removed',input:'<iframe src="https://www.youtube.com/watch?v=abcdef12345"></iframe>',kind:'none'},
  {name:'scripts, forms, SVG animation, and foreignObject removed',input:'<script>window.fixtureOnly=true</script><form>form</form><svg><animate attributeName="href"></animate><foreignObject><p>embedded</p></foreignObject><circle cx="10" cy="10" r="5"></circle></svg>',kind:'svg'},
  {name:'encoded and whitespace-obfuscated JavaScript href removed',input:'<a href="java&#10;script:alert(1)" onclick="alert(1)">link</a>',kind:'link'},
  {name:'existing article styles, table structure, and SVG chart preserved',input:'<style>.fixture{color:navy}</style><section class="fixture"><h3>Example</h3><table><tbody><tr><td>1</td></tr></tbody></table><svg viewBox="0 0 20 20"><polyline points="0,10 10,5 20,0"></polyline><text x="0" y="10">Chart</text></svg></section>',kind:'article'}
];
const literal=JSON.stringify(domCases).replace(/</g,'\\u003c');
const fixture=`<!doctype html><meta charset="utf-8"><title>Security regression fixture — synthetic offline data</title>
<style>body{font:16px/1.6 system-ui;max-width:900px;margin:32px auto;padding:0 20px} .pass{color:#176237}.fail{color:#b32020}li{margin:12px 0}</style>
<h1>HTML sanitizer regression checks</h1><p>Synthetic fixtures only. Candidate HTML remains inert; no external resources or GitHub calls.</p><h2 id="summary">Running…</h2><ol id="results"></ol>
<script>${urlSource}\n${sanitizerSource}\n
const cases=${literal};let passed=0;
for(const item of cases){
  let error='';try{
    const t=document.createElement('template');t.innerHTML=sanitizeHTML(item.input);const q=s=>t.content.querySelector(s);
    if(q('script,form,foreignObject,animate,[srcdoc],[onload],[onclick]'))throw Error('Dangerous content remains');
    if(item.kind==='iframe'){const f=q('iframe');if(!f||f.hasAttribute('name')||f.getAttribute('sandbox')!=='allow-scripts allow-same-origin allow-presentation')throw Error('Embed attributes not constrained');}
    if(item.kind==='none'&&q('iframe'))throw Error('Unexpected iframe survived');
    if(item.kind==='link'&&q('a').hasAttribute('href'))throw Error('Active URL survived');
    if(item.kind==='svg'&&!q('svg circle'))throw Error('Safe SVG geometry removed');
    if(item.kind==='article'&&(!q('style')||!q('table td')||!q('svg polyline')||!q('svg text')))throw Error('Article/chart content changed');
    passed++;
  }catch(e){error=e.message;}
  const li=document.createElement('li');li.className=error?'fail':'pass';li.textContent=(error?'FAIL: ':'PASS: ')+item.name+(error?' — '+error:'');document.querySelector('#results').appendChild(li);
}
document.querySelector('#summary').textContent=passed+' / '+cases.length+' checks passed';document.body.dataset.tests=passed===cases.length?'passed':'failed';
</script>`;
fs.mkdirSync(path.join(root,'qa-preview'),{recursive:true});
fs.writeFileSync(path.join(root,'qa-preview','security-fixture.html'),fixture);
