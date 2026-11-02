'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const root=path.join(__dirname,'..');
const context={window:{}};
vm.runInNewContext(fs.readFileSync(path.join(root,'draft-data.js'),'utf8'),context);
const data=JSON.parse(JSON.stringify(context.window.BASEBALL_DRAFT_DATA));
const page=require('../draft-page.js');
const stats=page.summarize(data);
const aliases={'경기상고':'경기상업고','동원과기대':'동원과학기술대','울산 웨일즈':'울산웨일즈'};
const get=(year,overall)=>data.picks.find(p=>p.year===year&&p.overall===overall);

test('250 rows match the independently transcribed official reference, field by field',()=>{
  const lines=fs.readFileSync(path.join(__dirname,'fixtures/draft-official.tsv'),'utf8').trim().split('\n');
  const fields=lines.shift().split('\t');
  assert.equal(lines.length,250);assert.equal(data.picks.length,250);
  for(const line of lines){const vals=line.split('\t');const row=Object.fromEntries(fields.map((k,i)=>[k,vals[i]]));const p=get(+row.year,+row.overall);assert.ok(p);
    for(const k of fields)assert.equal(String(p[k]),k==='school'?(aliases[row[k]]||row[k]):row[k],`${row.year}-${row.overall} ${k}`);
  }
});
test('every year has exactly fifty unique consecutive picks and ten picks per round',()=>{
  for(const draft of data.drafts){const rows=data.picks.filter(p=>p.year===draft.year);assert.equal(rows.length,50);assert.equal(new Set(rows.map(p=>p.overall)).size,50);
    assert.deepEqual(rows.map(p=>p.overall),Array.from({length:50},(_,i)=>i+1));
    for(const p of rows){assert.equal(p.round,Math.ceil(p.overall/10));assert.equal(p.originalTeam,draft.order[(p.overall-1)%10]);}
    for(let round=1;round<=5;round++)assert.equal(rows.filter(p=>p.round===round).length,10);
  }
});
test('draft years are distinct from event years and ordering seasons',()=>{
  assert.deepEqual(data.drafts.map(d=>d.eventDate),['2022-09-15','2023-09-14','2024-09-11','2025-09-17','2026-09-21']);
  for(const d of data.drafts){assert.equal(+d.eventDate.slice(0,4),d.year-1);assert.equal(d.rankingSeason,d.year-2);}
});
test('all fifteen traded selections are counted once under the actual drafting club',()=>{
  assert.equal(stats.trades.length,15);
  assert.deepEqual(stats.trades.map(p=>`${p.year}-${p.overall}:${p.originalTeam}>${p.team}`),[
    '2023-12:KIA>키움','2023-23:롯데>삼성','2023-50:KT>LG',
    '2024-8:LG>키움','2024-16:KIA>키움','2024-24:삼성>키움',
    '2025-7:NC>키움','2025-27:NC>키움','2025-28:SSG>키움','2025-44:롯데>LG',
    '2026-10:KIA>키움','2026-23:한화>NC','2026-35:SSG>NC','2026-40:KIA>키움','2027-27:삼성>NC'
  ]);
});
test('known club and position mistakes cannot recur',()=>{
  assert.equal(get(2023,50).team,'LG');assert.equal(get(2025,44).team,'LG');assert.equal(get(2026,35).team,'NC');
  assert.equal(get(2026,12).position,'포수');assert.equal(get(2026,15).position,'내야수');assert.equal(get(2026,17).position,'투수');
  assert.equal(get(2023,6).position,'포수');assert.equal(get(2024,3).position,'투수');
});
test('positions and club aggregates reconcile to the same complete data',()=>{
  assert.deepEqual(stats.positions,{'투수':147,'내야수':60,'포수':16,'외야수':27});
  assert.deepEqual(Object.fromEntries(stats.byTeam.map(t=>[t.team,t.total])),{한화:24,키움:34,롯데:23,삼성:24,NC:26,KIA:21,두산:25,SSG:23,KT:24,LG:26});
  assert.equal(stats.byTeam.reduce((n,t)=>n+t.total,0),250);
  assert.deepEqual(stats.byYear.map(y=>y.pitchers),[28,33,28,29,29]);
  assert.equal(stats.byRound.reduce((n,r)=>n+r.total,0),250);
});
test('school classification does not turn foreign and independent affiliations into high schools',()=>{
  assert.equal(page.affiliationType('울산웨일즈'),'기타');assert.equal(page.affiliationType('전 탬파베이'),'기타');assert.equal(page.affiliationType('센트럴플로리다대'),'기타');
  assert.equal(page.affiliationType('파주 챌린저스'),'기타');assert.equal(page.affiliationType('광남고BC'),'고교');assert.equal(page.affiliationType('동원과학기술대'),'대학');
  assert.ok(data.picks.every(p=>p.affiliationType===page.affiliationType(p.school)));
  assert.deepEqual(stats.affiliations,{'고교':214,'대학':31,'기타':5});
  assert.ok(!stats.schools.some(([s])=>s==='광남고'||s==='광남고BC'||s==='울산웨일즈'));
  assert.ok(!data.picks.some(p=>p.school==='동원과기대'||p.school==='경기상고'));
});
test('source identifiers resolve to attributed HTTPS pages and all picks have primary evidence',()=>{
  assert.equal(new Set(data.sources.map(s=>s.id)).size,data.sources.length);
  for(const s of data.sources)assert.match(s.url,/^https:\/\//);
  for(const p of data.picks){assert.ok(p.sourceIds.length);for(const id of p.sourceIds)assert.ok(data.sources.find(s=>s.id===id));
    assert.ok(p.sourceIds.some(id=>/koreabaseball\.com|naverncp\.com/.test(data.sources.find(s=>s.id===id).url)));
  }
});
test('pathway rows match first-round identities, preserve nulls and never publish unverified leads',()=>{
  assert.equal(data.pathways.length,50);assert.equal(new Set(data.pathways.map(r=>r.key)).size,50);
  for(const r of data.pathways){const [year,overall]=r.key.split('-').map(Number);const p=get(year,overall);assert.equal(p.round,1);assert.equal(p.name,r.name);assert.equal('unverifiedLeads' in r,false);}
  assert.equal(data.pathways.find(r=>r.key==='2025-1').highschool,undefined);
  assert.doesNotMatch(JSON.stringify(data.pathways),/덕수고 \(우신고에서 전학\)/);
  assert.equal(data.pathways.filter(r=>r.middle).length,49);
  assert.equal(data.pathways.filter(r=>r.elementary||r.little).length,48);
  assert.equal(data.pathways.find(r=>r.key==='2027-5').elementary,null);
  assert.equal(data.pathways.find(r=>r.key==='2027-8').elementary,null);
  assert.equal(data.pathways.find(r=>r.key==='2027-9').middle,null);
  for(const r of data.pathways)for(const id of r.sourceIds)assert.ok(data.sources.find(s=>s.id===id));
});
test('slot and club board views keep the correct number of actual players for every round range',()=>{
  for(const rounds of [1,3,5])for(const view of ['slot','team']){
    const h=page.boardHTML(data,view,rounds);assert.equal((h.match(/data-school=/g)||[]).length,rounds*50);
    assert.doesNotMatch(h,/NaN|undefined|확인 중/);
  }
  const h=page.boardHTML(data,'slot',5);assert.ok(h.indexOf('전체 10')<h.indexOf('전체 11'));
});
test('generated analysis uses audited counts and states the source and inference limits',()=>{
  const h=page.renderPage(data);assert.match(h,/147/);assert.match(h,/15건/);assert.match(h,/31/);
  assert.match(h,/포지션별 지원자 수/);assert.match(h,/확인 못 함/);assert.match(h,/2026-11-02/);
  assert.doesNotMatch(h,/투수 왕국|부산고 오타니|중학교로 몰리는 경향이 사실상 없다|2026 드래프트부터 모든 신청자|NaN|undefined/);
});
test('data text is HTML-escaped, not executable markup',()=>{
  const d=JSON.parse(JSON.stringify(data));d.picks[0].name='<img src=x onerror=alert(1)>';d.picks[0].school='A" data-unsafe="yes';
  const h=page.boardHTML(d,'slot',1);assert.match(h,/&lt;img/);assert.doesNotMatch(h,/<img src=x/);assert.match(h,/A&quot; data-unsafe=&quot;yes/);
});
test('legacy route forwards to one source of truth and main journal script still parses',()=>{
  const legacy=fs.readFileSync(path.join(root,'draft-2023-2026.html'),'utf8');assert.match(legacy,/url=\.\/#draft/);assert.doesNotMatch(legacy,/const D\s*=/);
  const index=fs.readFileSync(path.join(root,'index.html'),'utf8');for(const m of index.matchAll(/<script>([\s\S]*?)<\/script>/g))assert.doesNotThrow(()=>new vm.Script(m[1]));
  assert.match(index,/draft-data\.js\?v=20261102/);assert.match(index,/draft-page\.js\?v=20261102/);
});
