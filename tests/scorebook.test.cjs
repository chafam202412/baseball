'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
function section(start,end){ const a=html.indexOf(start),b=html.indexOf(end,a+start.length); assert.ok(a>=0&&b>a);return html.slice(a,b); }
const source=[
 section('const PITCH = [','/* ================= 저장소'),
 section('const num = ','function toast('),
 section('function seqStats(','/* ================= 탭'),
 section('function optList(','function reindex('),
 section('function liveSummary(','function wirePad('),
 section('let EDIT_ID = null;','/* ================= 작성 중 임시저장'),
 section('function battingAgg(','/* ================= 타구 방향'),
 section('const SCORE_SYMBOLS=','/* ================= 차트'),
 section('function renderLogOverview(','function renderLog(){'),
 'globalThis.api={runnerState,isRISP,runnerInput,readRunnerFields,updateRunnerInput,scorebookHTML,scoreDiamond,battingAgg,pitchAgg,fillForm,readForm,fdBlock,renderLogOverview};'
].join('\n');
function setup(){
 const els=new Map(),lists=new Map();
 const $=s=>{if(!els.has(s))els.set(s,{value:'',innerHTML:'',textContent:'',addEventListener(){}});return els.get(s);};
 const ctx={$, $$:s=>lists.get(s)||[],DB:{games:[]}, reindex(){},pitchWarnHTML(){return '';},clearDraft(){},toast(){},persist(){},refreshDatalists(){},renderLog(){},goTab(){}};
 vm.runInNewContext(source,ctx);return {api:ctx.api,$,lists};
}
const plain=x=>JSON.parse(JSON.stringify(x));

test('all eight exact base combinations yield the correct automatic RISP group',()=>{
 const {api}=setup();
 for(let n=0;n<8;n++){
  const bases=[1,2,3].filter(b=>n&(1<<(b-1)));
  const group=(n&6)?'risp':(n?'first':'none');
  assert.deepEqual(plain(api.runnerState({bases,run:'risp'}).bases),bases);
  assert.equal(api.runnerState({bases,run:'risp'}).group,group);
  assert.equal(api.isRISP({bases}),!!(n&6));
 }
});
test('legacy scoring position is retained without inventing base occupancy',()=>{
 const {api}=setup();
 assert.equal(api.runnerState({run:'risp'}).bases,null);
 assert.equal(api.runnerState({}).bases,null);
 assert.deepEqual(plain(api.runnerState({run:'first'}).bases),[1]);
 assert.deepEqual(plain(api.runnerState({run:'none'}).bases),[]);
 assert.match(api.runnerInput({run:'risp'}),/data-exact="0"/);
 assert.doesNotMatch(api.runnerInput({run:'risp'}),/ checked/);
 assert.match(api.runnerInput({run:'risp'}),/기존 득점권 기록을 유지/);
});
test('RISP batting average mixes legacy and exact runners and excludes walks and sacrifice flies from at-bats',()=>{
 const {api}=setup();
 const pas=[{res:'1B',run:'risp',rbi:2},{res:'GO',bases:[1,2]},{res:'2B',bases:[3],run:'none'},{res:'BB',bases:[2]},{res:'SF',bases:[1,3],rbi:1},{res:'1B',bases:[1]},{res:'1B',bases:[],run:'risp'}];
 const before=JSON.stringify(pas),a=api.battingAgg([{pas}]);
 assert.equal(a.rispAB,3);assert.equal(a.rispH,2);assert.equal(a.RISP,2/3);assert.equal(a.rispRBI,3);
 assert.equal(api.battingAgg([{pas}],api.isRISP).PA,5);
 assert.equal(JSON.stringify(pas),before);
});
test('unknown runner situations are not silently classified as empty bases',()=>{
 const {api}=setup();const a=api.battingAgg([{pas:[{res:'1B'}]}]);
 assert.equal(a.emptyAB,0);assert.equal(a.rispAB,0);
});
test('scorebook shows only stored results, runner positions, contact and badges, without advancement lines',()=>{
 const {api}=setup();
 const g={pas:[{res:'2B',run:'risp',rbi:2,scored:1,seq:'BX',dir:'RC',qual:'LD'},{res:'SO_L',bases:[1]}]};
 const before=JSON.stringify(g),out=api.scorebookHTML(g);
 assert.match(out,/1타석/);assert.match(out,/2타석/);assert.match(out,/2타점/);assert.match(out,/득점/);assert.match(out,/라인드라이브/);assert.match(out,/정확한 루 미기록/);
 assert.equal((out.match(/score-base occupied/g)||[]).length,1);
 assert.doesNotMatch(out,/<line |6-3|F8|E6|[0-9]회 [초말]/);
 assert.equal(JSON.stringify(g),before);
 assert.equal(api.scorebookHTML({pas:[]}), '');
 assert.equal(api.scorebookHTML({pas:[{res:'',seq:'',run:'none'}]}), '');
});
test('scorebook and stored form source escape untrusted strings',()=>{
 const {api}=setup();
 assert.doesNotMatch(api.scorebookHTML({pas:[{res:'<img onerror="x">',dir:'<script>x</script>',rbi:'<svg onload=x>'}]}),/<img|<script|<svg onload/);
});
test('editing preserves removed role and decision, legacy pitching, scores and unknown metadata',()=>{
 const {api}=setup();
 const game={id:'legacy',role:'선발',dec:'승',ips:[{o:4,er:1,p:20}],ts:3,os:1,custom:{note:'keep'},pas:[],bfs:[],fds:[]};
 const original=JSON.stringify(game); api.fillForm(game);const saved=api.readForm();
 for(const key of ['role','dec','ips','ts','os','custom'])assert.deepEqual(plain(saved[key]),game[key]);
 assert.equal(JSON.stringify(game),original);
 api.fillForm(null);const fresh=api.readForm();
 assert.equal(fresh.role,undefined);assert.equal(fresh.dec,undefined);assert.equal(fresh.ips,undefined);
});
test('initial ERA uses pitchAgg and handles one-third innings and zero outs consistently',()=>{
 const {api,$}=setup();
 const games=[{date:'2026-11-11',bfs:[{res:'GO',er:1}]}];
 assert.equal(api.pitchAgg(games).ERA,27);
 api.renderLogOverview(games);assert.match($('#log-overview').innerHTML,/방어율 · ERA/);assert.match($('#log-overview').innerHTML,/27\.00/);
 api.renderLogOverview([{bfs:[{res:'BB',er:1}]}]);assert.match($('#log-overview').innerHTML,/방어율 · ERA<\/span><span class="v">–/);
});
test('requested menu and fields are removed while training backup/export and storage remain',()=>{
 assert.doesNotMatch(html,/<button data-tab="train"|id="e-role"|id="e-dec"/);
 assert.match(html,/id="csv-train"/);assert.match(html,/trainings:\[\]/);
 assert.match(setup().api.fdBlock(),/유격수는 보살 A \+1/);
});
