/* Audited draft content. No access to journal records or storage. */
(function (scope) {
  'use strict';
  const TEAMS = ['한화','키움','롯데','삼성','NC','KIA','두산','SSG','KT','LG'];
  const POSITIONS = ['투수','포수','내야수','외야수'];
  const COLORS = ['#1D4E89','#2F6B57','#5FA183','#A8CCB9'];
  const esc = value => String(value == null ? '' : value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const percent = (n, total) => total ? (n * 100 / total).toFixed(1) : '0.0';
  const countBy = (rows, field) => rows.reduce((out, row) => {const k = typeof field === 'function' ? field(row) : row[field]; out[k] = (out[k] || 0) + 1; return out;}, {});
  const sortedCounts = counts => Object.entries(counts).sort((a,b) => b[1]-a[1] || a[0].localeCompare(b[0], 'ko'));
  const isPitcher = p => p.position === '투수';
  const keyOf = p => p.year + '-' + p.overall;
  function affiliationType(school) {
    if (/고(?:등학교)?(?:BC)?$/.test(school) || school === '용인시야구단') return '고교';
    if (school === '센트럴플로리다대') return '기타';
    if (/대(?:학교)?$/.test(school)) return '대학';
    return '기타';
  }
  function summarize(data) {
    const picks = data.picks;
    const years = data.drafts.map(d => d.year);
    const high = picks.filter(p => p.affiliationType === '고교' && /고$/.test(p.school));
    const schoolCounts = countBy(high, 'school');
    return {
      total: picks.length, years, positions: countBy(picks, 'position'),
      affiliations: countBy(picks, 'affiliationType'),
      byYear: years.map(year => ({year, total:picks.filter(p=>p.year===year).length, pitchers:picks.filter(p=>p.year===year&&isPitcher(p)).length})),
      byRound: [1,2,3,4,5].map(round => {const rows=picks.filter(p=>p.round===round); return {round,total:rows.length,positions:countBy(rows,'position'),affiliations:countBy(rows,'affiliationType')};}),
      byTeam: TEAMS.map(team => {const rows=picks.filter(p=>p.team===team); return {team,total:rows.length,pitchers:rows.filter(isPitcher).length,first:rows.filter(p=>p.round===1),acquired:rows.filter(p=>p.originalTeam!==team).length};}),
      trades: picks.filter(p=>p.team!==p.originalTeam),
      schools: sortedCounts(schoolCounts),
      schoolYears: sortedCounts(schoolCounts).map(([school,total])=>({school,total,counts:years.map(year=>high.filter(p=>p.school===school&&p.year===year).length),first:high.filter(p=>p.school===school&&p.round===1).length})),
      firstRound: picks.filter(p=>p.round===1),
      firstThree: picks.filter(p=>p.round<=3),
      lastTwo: picks.filter(p=>p.round>=4)
    };
  }
  function sourceUrl(data, id) {const s=data.sources.find(s=>s.id===id); return s&&/^https:\/\//.test(s.url)?s.url:'';}
  function sourceLink(data, id, label) {const url=sourceUrl(data,id), source=data.sources.find(s=>s.id===id); return url?`<a href="${esc(url)}" target="_blank" rel="noopener noreferrer" aria-label="${esc(source.title)} · 새 창">${esc(label||'원문')}</a>`:'';}
  function section(number, title, content) {return `<section><span class="chap">${number}장</span><h2>${title}</h2>${content}</section>`;}
  function table(headers, rows, className='ord') {return `<div class="scroll"><table class="${className}"><thead><tr>${headers.map(h=>`<th scope="col">${h}</th>`).join('')}</tr></thead><tbody>${rows.map(row=>'<tr>'+row.map(v=>`<td>${v}</td>`).join('')+'</tr>').join('')}</tbody></table></div>`;}
  function bars(rows, suffix='명') {
    const max=Math.max(1,...rows.map(r=>r[1]));
    return `<div class="stack">${rows.map(([name,n])=>`<div class="srow"><span class="sname">${esc(name)}</span><span class="sbar" style="width:${n/max*100}%"></span><span class="snum">${n}${suffix}</span></div>`).join('')}</div>`;
  }
  function roundChart(stats) {
    const W=650,H=310;
    let out=`<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="라운드별 포지션 구성. 상세 인원은 바로 아래 표에 표시됩니다.">`;
    stats.byRound.forEach((r,i)=>{
      const y=16+i*52;let x=80;
      out+=`<text x="68" y="${y+21}" text-anchor="end" font-size="13" fill="#172c43">${r.round}라운드</text>`;
      POSITIONS.forEach((pos,j)=>{const n=r.positions[pos]||0,w=n/r.total*460;out+=`<rect x="${x}" y="${y}" width="${w}" height="31" fill="${COLORS[j]}"/>`;if(w>32)out+=`<text x="${x+w/2}" y="${y+21}" text-anchor="middle" fill="${j===3?'#172c43':'#fff'}" font-size="12">${n}</text>`;x+=w;});
      out+=`<text x="552" y="${y+21}" font-size="12" fill="#506478">${percent(r.positions['투수']||0,r.total)}%</text>`;
    });
    return out+`<text x="80" y="293" font-size="11" fill="#506478">각 라운드 ${stats.total/5}명 · 오른쪽은 투수 비율</text></svg><div class="legend">${POSITIONS.map((p,i)=>`<span><i style="background:${COLORS[i]}"></i>${p}</span>`).join('')}</div>`;
  }
  function pickHTML(p, data) {
    const traded=p.team!==p.originalTeam;
    const src=p.sourceIds&&p.sourceIds[0];
    return `<div class="pick ${isPitcher(p)?'p':'f'}" data-school="${esc(p.school)}" data-position="${isPitcher(p)?'p':'f'}"><span class="rd">${p.round}R<small>전체 ${p.overall}</small></span><span><span class="tm2${traded?' tr':''}">${esc(p.team)}</span> <span class="nm">${esc(p.name)}</span>${traded?`<span class="tag" title="${esc(p.originalTeam)} 지명권을 받아 행사">★</span>`:''}<span class="sc">${esc(p.position)} · ${esc(p.school)} ${sourceLink(data,src,'↗')}</span></span></div>`;
  }
  function boardHTML(data, view, rounds) {
    const years=data.drafts.map(d=>d.year), picks=data.picks.filter(p=>p.round<=rounds);
    const headers=['구단',...years];let rows=[];
    if(view==='team') {
      rows=TEAMS.map(team=>[esc(team),...years.map(year=>{
        const owned=picks.filter(p=>p.year===year&&p.team===team).sort((a,b)=>a.overall-b.overall);
        const given=picks.filter(p=>p.year===year&&p.originalTeam===team&&p.team!==team);
        return owned.map(p=>pickHTML(p,data)).join('')+given.map(p=>`<div class="pick x"><span class="rd">${p.round}R</span><span>전체 ${p.overall} · ${esc(p.team)}에 양도</span></div>`).join('');
      })]);
    } else {
      headers[0]='전체 순번';
      for(let overall=1;overall<=rounds*10;overall++) rows.push([`${overall}<small>${Math.ceil(overall/10)}라운드</small>`,...years.map(year=>{const p=picks.find(p=>p.year===year&&p.overall===overall);return p?pickHTML(p,data):'확인 중';})]);
    }
    return `<thead><tr>${headers.map(h=>`<th scope="col">${h}</th>`).join('')}</tr></thead><tbody>${rows.map(r=>`<tr>${r.map((v,i)=>i?`<td>${v}</td>`:`<th scope="row" class="team slot">${v}</th>`).join('')}</tr>`).join('')}</tbody>`;
  }
  function renderPage(data) {
    const stats=summarize(data), n=stats.total;
    const colleges=stats.affiliations['대학']||0, other=stats.affiliations['기타']||0;
    const top=stats.schools.slice(0,10), continuous=stats.schoolYears.filter(s=>s.counts.every(c=>c>0));
    const pitcherTotal=stats.positions['투수']||0;
    const firstPitch=stats.firstRound.filter(isPitcher).length;
    const routeByKey=new Map(data.pathways.map(r=>[r.key,r]));
    const middleKnown=data.pathways.filter(r=>r.middle).length;
    const elementaryKnown=data.pathways.filter(r=>r.elementary||r.little).length;
    let html=`<div class="wrap"><header class="intro"><h1>KBO 신인 드래프트,<br>5년치 지명 ${n}명을 다시 읽다</h1><p class="lede"><span class="kw">2023~2027 드래프트의 1~5라운드</span>를 KBO 공식 결과와 대조했습니다. 지명된 선수와 지명권 이동은 사실대로, 학교와 진로에 관한 해석은 그 자료가 말해주는 범위까지만 담았습니다.</p><p class="meta">재검토 ${esc(data.checkedAt)} · 지명 연도 기준 · ${n}명 / 5개 연도</p><div class="note"><b>연도와 범위를 먼저 확인해 주세요</b>‘2027 드래프트’는 2026년에 열린 행사입니다. 아래 연도는 KBO의 드래프트 명칭이며, 지명과 실제 입단·프로 성공은 같은 뜻이 아닙니다. 6~11라운드는 이 페이지의 집계에 포함하지 않았습니다.</div><p class="draft-jump"><a href="#draft-board">지명 보드</a> · <a href="#draft-schools">학교·소속</a> · <a href="#draft-routes">1라운드 경로</a> · <a href="#draft-sources">출처·검토 기준</a></p></header>`;
    html+=section(0,'표를 읽는 네 가지 기준',`<div class="rules"><div class="rule"><div class="rn">01</div><div class="rb"><b>2023부터 전면 드래프트</b><p>1차 지명이 폐지되면서 1~11라운드의 전면 드래프트로 통합됐습니다. ${sourceLink(data,'rules-2023','KBO 2023 개최 공지')}</p></div></div><div class="rule"><div class="rn">02</div><div class="rb"><b>기준은 개최 직전 시즌의 순위</b><p>드래프트 명칭의 전년 순위가 아닙니다. 예를 들어 2027 드래프트는 2026년에 열려 2025시즌 구단 순위의 역순을 사용합니다. 양도된 지명권은 받은 구단이 행사합니다. ${sourceLink(data,'rules-2027','KBO 2027 개최 공지')}</p></div></div><div class="rule"><div class="rn">03</div><div class="rb"><b>대학 출신 ≠ 모두 대학 졸업</b><p>2023 드래프트부터 3·4년제 대학 2학년도 참가할 수 있는 얼리 드래프트가 시행됐습니다. 이 페이지는 ‘대졸’ 대신 지명 당시 소속인 ‘대학’으로 분류합니다. ${sourceLink(data,'early-rule','KBO 도입 공지')}</p></div></div><div class="rule"><div class="rn">04</div><div class="rb"><b>지명 당시의 기록을 사용</b><p>구단은 현재 소속이 아니라 지명 구단, 포지션과 학교·소속도 공식 결과표 기준입니다. 대학·해외·독립구단 선수를 이전 고교로 되돌려 합산하지 않습니다.</p></div></div></div>${table(['드래프트','실제 개최일','결과 원문'],data.drafts.map(d=>[d.year,esc(d.eventDate),sourceLink(data,d.resultSourceId,'공식 결과')]))}<p class="meta">참가 서류 제출을 ‘2026부터 시작’으로 설명했던 문구도 바로잡았습니다. 학교폭력 관련 서약서와 고교 생활기록부 제출은 이미 2023 드래프트 신청 공지에 나옵니다. ${sourceLink(data,'application-2023','KBO 접수 공지')}</p>`);
    html+=section(1,'드래프트 보드',`<div id="draft-board"></div><div class="prose"><p>한 열이 한 해입니다. <b>순위별 보기에서는 전체 1번부터 50번까지 실제 지명 순서</b>로 읽습니다. ★는 다른 구단의 지명권을 받은 경우입니다. 선수 옆 ↗에서 그해 공식 결과를 확인할 수 있습니다.</p></div><div class="controls"><div class="seg" role="group" aria-label="보기 방식"><button type="button" data-view="slot" aria-pressed="true">순위별</button><button type="button" data-view="team" aria-pressed="false">구단별</button></div><div class="seg" role="group" aria-label="라운드 범위"><button type="button" data-rounds="1" aria-pressed="false">1R</button><button type="button" data-rounds="3" aria-pressed="false">1~3R</button><button type="button" data-rounds="5" aria-pressed="true">1~5R</button></div><div class="seg" role="group" aria-label="포지션 강조"><button type="button" data-position-filter="all" aria-pressed="true">전체</button><button type="button" data-position-filter="p" aria-pressed="false">투수</button><button type="button" data-position-filter="f" aria-pressed="false">야수</button></div><label>학교·소속 강조 <select id="draft-school" aria-label="학교·소속 강조"><option value="">전체 학교·소속</option>${sortedCounts(countBy(data.picks,'school')).map(([s,c])=>`<option value="${esc(s)}">${esc(s)} (${c}명)</option>`).join('')}</select></label></div><p class="meta" id="draft-board-status" aria-live="polite"></p><p class="draft-scroll-hint">← 표가 화면보다 넓으면 좌우로 밀어서 다른 연도를 볼 수 있습니다 →</p><div class="scroll"><table class="board audited-board" id="draft-board-table"></table></div><p class="meta">투수·야수와 학교 선택은 해당 선수를 강조합니다. 아래 분석 통계는 보드 선택과 관계없이 250명 전체 기준입니다.</p>`);
    html+=section(2,'투수와 야수, 어느 쪽을 더 지명했나',`<div class="draft-facts"><div><strong>${pitcherTotal}<small>명</small></strong><span>투수 · ${percent(pitcherTotal,n)}%</span></div><div><strong>${n-pitcherTotal}<small>명</small></strong><span>야수 · ${percent(n-pitcherTotal,n)}%</span></div><div><strong>${firstPitch}<small>/ ${stats.firstRound.length}</small></strong><span>1라운드 투수</span></div></div>${table(['드래프트','투수','야수','투수 비율'],stats.byYear.map(y=>[y.year,y.pitchers,y.total-y.pitchers,percent(y.pitchers,y.total)+'%']))}<div class="note"><b>지명 비중이지, 포지션별 지명 확률은 아닙니다</b>투수 지명자가 많다는 사실만으로 투수가 더 유리하거나 경쟁이 더 치열하다고 결론낼 수 없습니다. 그 판단에는 포지션별 지원자 수 등 별도의 분모가 필요합니다.</div>`);
    html+=section(3,'라운드별 구성',`<figure class="wide">${roundChart(stats)}</figure>${table(['라운드',...POSITIONS,'합계'],stats.byRound.map(r=>[r.round+'R',...POSITIONS.map(p=>r.positions[p]||0),r.total]))}<div class="prose"><p>동일한 5년·동일한 1~5라운드 안에서의 분포입니다. 포지션별 육성 난도, 선수의 잠재력, 프로에서의 성과를 이 표만으로 설명하지 않습니다.</p></div>`);
    html+=section(4,'지명권 이동을 반영한 실제 구단',`<div class="prose"><p>상위 5라운드의 지명권 이동은 <b>${stats.trades.length}건</b>입니다. 원 구단이 아니라 <span class="kw">실제로 지명한 구단</span>에 선수를 집계했습니다. 한 팀의 기본 지명권은 5년 × 5라운드 = 25장이지만, 양도·양수에 따라 인원이 달라집니다.</p></div><figure class="wide">${bars(stats.byTeam.map(t=>[t.team,t.total]).sort((a,b)=>b[1]-a[1]))}</figure>${table(['연도','라운드','전체 순번','원 구단 → 지명 구단','선수'],stats.trades.map(p=>[p.year,p.round+'R',p.overall,esc(p.originalTeam)+' → <b>'+esc(p.team)+'</b>',esc(p.name)]))}<p class="meta">거래가 있었던 상위 5라운드만 표시합니다. 지명권 개수는 선택 기회의 수이며, 트레이드의 성공 여부나 선수 가치를 평가한 수치는 아닙니다.</p>`);
    html+=section(5,'구단별 지명 기록',`<div class="prose"><p>특정 구단의 의도나 내부 전략을 추정하기보다, 확인 가능한 <b>지명 인원·포지션·1라운드 선택</b>을 나란히 보여줍니다.</p></div><ul class="teams">${stats.byTeam.map(t=>`<li><div class="tn">${t.team}</div><div><div class="split" aria-hidden="true"><span style="width:${t.pitchers/t.total*100}%;background:#1D4E89"></span><span style="width:${(t.total-t.pitchers)/t.total*100}%;background:#2F6B57"></span></div><div class="splitlbl">투수 ${t.pitchers} · 야수 ${t.total-t.pitchers} · 총 ${t.total}명</div></div><p>${t.first.map(p=>`${p.year} ${esc(p.name)}(${esc(p.position)})`).join(' · ')}<br><span class="meta">양수한 상위 5라운드 지명권 ${t.acquired}장 · 투수 비율 ${percent(t.pitchers,t.total)}%</span></p></li>`).join('')}</ul>`);
    html+=section(6,'학교와 소속을 같은 기준으로',`<div id="draft-schools"></div><div class="draft-facts"><div><strong>${stats.affiliations['고교']||0}<small>명</small></strong><span>고교 단계 · 고교팀 포함</span></div><div><strong>${colleges}<small>명</small></strong><span>국내 대학 · 얼리 포함</span></div><div><strong>${other}<small>명</small></strong><span>기타 소속</span></div></div><p class="meta">고교 단계에는 광남고BC·야로고BC 등 고교 연령 팀을 포함합니다. ‘기타’에는 해외 대학·해외 프로 경력·독립구단 소속을 구분해 담았습니다. 이 페이지의 명시적 소속 분류이며, 학교·팀의 명칭은 그대로 보존합니다. 예: 최지만의 2027 지명 당시 소속은 울산웨일즈입니다.</p><h3 class="sub">고교 소속 지명 인원 상위 10곳</h3><figure class="wide">${bars(top)}</figure><p class="meta">고교명으로 확인되는 소속만 집계하며, BC·클럽을 이름이 비슷한 고등학교와 합치지 않습니다. 공동 인원은 학교명 순이며, 10곳 표시는 화면 분량을 위한 기준입니다.</p><h3 class="sub">해마다 어떻게 달랐나</h3>${table(['학교',...stats.years,'합계','1R'],stats.schoolYears.slice(0,15).map(s=>[esc(s.school),...s.counts,s.total,s.first]))}<p class="meta">합계 상위 15개교 · 5개 연도 모두 지명자가 있었던 고교는 ${continuous.length}곳${continuous.length?'('+continuous.map(s=>esc(s.school)).join('·')+')':''}입니다. ‘프로 배출률’이 아니라 해당 범위의 지명 인원입니다.</p><h3 class="sub">앞 라운드와 뒤 라운드의 소속 차이</h3>${table(['범위','고교 단계','국내 대학','기타','합계'],[['1~3R',stats.firstThree],['4~5R',stats.lastTwo]].map(([label,rows])=>{const c=countBy(rows,'affiliationType');return [label,c['고교']||0,c['대학']||0,c['기타']||0,rows.length];}))}<div class="note"><b>학교의 육성 효과나 진학 유불리는 알 수 없습니다</b>학교별 전체 선수 수, 입학 전 기량, 전학, 출전 기회 등을 통제하지 않은 지명자 수입니다. 기존의 지역별 비율은 학교·대학·해외 소속의 기준과 누락 범위가 불명확해 이번 집계에서 제외했습니다. 어느 지역이 유리하다는 결론으로 대신하지 않습니다.</div>`);
    html+=section(7,'1라운드 선수의 공개 경로',`<div id="draft-routes"></div><div class="prose"><p>지명 당시 고교·구단·포지션은 공식 결과와 맞췄습니다. 초·중 단계의 이력은 <b>공개 프로필이나 확인 가능한 자료에 명시된 항목만</b> 표시하며, 빈칸을 추정해서 채우지 않습니다.</p><p class="meta">${stats.firstRound.length}명 중 중학 단계 이력 ${middleKnown}명, 초등학교 또는 리틀 이력 ${elementaryKnown}명을 확인했습니다. 나머지는 아래의 확인 범위·출처를 참고해 주세요. ‘확인 못 함’은 해당 경력이 없다는 뜻이 아닙니다.</p></div>${table(['연도·전체','지명 구단','선수','지명 당시 고교','중학교·중학팀','초등학교·리틀','확인 범위·출처'],stats.firstRound.map(p=>{const r=routeByKey.get(keyOf(p))||{};const elementary=[r.elementary,r.little].filter(Boolean).map(esc).join(' · ');return [keyOf(p),esc(p.team),`<b>${esc(p.name)}</b><small>${esc(p.position)}</small>`,esc(p.school),esc(r.middle||'확인 못 함'),elementary||'확인 못 함',`${esc(r.status==='verified'?'공개 이력 확인':r.status==='partial'?'일부만 확인':'추가 확인 필요')}${(r.sourceIds||[]).map((id,i)=>' '+sourceLink(data,id,'['+(i+1)+']')).join('')}${r.note?'<small>'+esc(r.note)+'</small>':''}`];}),'route')}<div class="note"><b>학교명·클럽명이 다르면 다른 육성 경로일까요?</b>표기 변경과 팀 운영 형태를 확인하지 않은 상태에서는 학교와 SBC·클럽을 별개의 경로로 단정할 수 없습니다. 리틀 경력 역시 ‘리틀에서 처음 시작했다’는 뜻은 아닙니다. 불완전한 이력으로 중학교 순위나 리틀 출신 비율을 계산하지 않습니다.</div>`);
    html+=section(8,'아이의 진로와 연결해서 읽는다면',`<div class="reads"><div class="read"><div class="rq">투수 지명이 많으니 투수를 해야 할까?</div><p>이 자료는 선택받은 선수들의 분포입니다. 아이에게 맞는 포지션이나 지명 확률을 계산한 표가 아닙니다. 아이가 즐기는 역할과 실제 경험을 이야기하는 배경 자료 정도로 활용해 주세요.</p></div><div class="read"><div class="rq">지명자가 많은 학교가 더 좋은 학교일까?</div><p>학교별 선수 수와 입학 전 조건을 모르면 비교하기 어렵습니다. 지도 방식, 학교생활, 이동 부담, 출전 기회처럼 실제 선택에 필요한 질문은 따로 확인해야 합니다.</p></div><div class="read"><div class="rq">상위 5라운드에 없으면 의미가 없을까?</div><p>아닙니다. 드래프트는 11라운드까지 이어집니다. 이 페이지의 범위는 자료를 비교하기 위한 선택일 뿐, 선수의 가능성이나 야구를 계속할 가치를 나누는 선이 아닙니다.</p></div><div class="read"><div class="rq">이 표에서 확실히 알 수 있는 것은?</div><p>언제, 어떤 구단이, 어느 순번에, 어떤 소속·포지션의 선수를 지명했는지입니다. ‘이 학교에 가면 된다’보다 ‘생각보다 여러 경로가 있구나’라는 질문으로 읽는 편이 자료의 범위에 맞습니다.</p></div></div>`);
    html+=`<footer id="draft-sources"><h2>출처와 검토 기준</h2><p class="meta">확인일 ${esc(data.checkedAt)}. 핵심 ${n}행은 KBO 공식 결과표·연감과 대조했고, 지명권 이동은 개최 공지로 확인했습니다. 아래 표와 차트는 같은 지명 데이터에서 계산합니다. 보드의 선택은 강조·표시 범위만 바꾸며 본문 집계 범위를 바꾸지 않습니다.</p><ol class="draft-sources">${data.sources.filter(s=>s.category==='main').map(s=>`<li>${sourceLink(data,s.id,s.title)}${s.note?' <span>'+esc(s.note)+'</span>':''}</li>`).join('')}</ol><details class="draft-method"><summary>분류·한계 자세히 보기</summary><ul><li>1인 1행, 각 연도 1~5라운드 50명, 전체 순번 1~50을 검증했습니다.</li><li>포지션은 공식 지명 결과의 구분입니다. 이후 포지션 변경·겸업을 소급 반영하지 않습니다.</li><li>소속 분류: 고교 및 고교 연령 팀 / 국내 대학(얼리 포함) / 기타(해외 대학·해외 프로 경력·독립구단). 학교명은 같은 기관의 약칭만 정규화합니다. 대학 소속 선수의 출신 고교와 지명 당시 대학을 합쳐 세지 않습니다.</li><li>초·중 이력은 공개 출처에 표시된 범위만 수록합니다. 확인되지 않은 전학·시작 시기·클럽 이력을 단정하지 않습니다.</li><li>지명만을 관찰한 선택 표본입니다. 육성 효과, 진학 성공률, 구단의 내부 의도, 미래 프로 성과와 인과관계를 주장하지 않습니다.</li></ul></details><p class="meta">기존 별도 드래프트 파일도 이 자료로 연결해 서로 다른 표가 남지 않도록 했습니다.</p></footer></div>`;
    return html;
  }
  function mount(root, data) {
    root.innerHTML=renderPage(data);
    let view='slot',rounds=5,position='all',school='';
    const board=root.querySelector('#draft-board-table');
    function highlight() {
      let matched=0;
      board.querySelectorAll('.pick[data-school]').forEach(el=>{const hit=(position==='all'||el.dataset.position===position)&&(!school||el.dataset.school===school);el.classList.toggle('dim',!hit);el.classList.toggle('hit',hit&&!!school);if(hit)matched++;});
      root.querySelector('#draft-board-status').textContent=`${rounds===1?'1':'1~'+rounds}라운드 ${rounds*50}명 표시 · 조건에 맞는 선수 ${matched}명`;
    }
    function draw(){board.innerHTML=boardHTML(data,view,rounds);board.classList.toggle('slotview',view==='slot');highlight();}
    function bind(attribute,update){root.querySelectorAll('button['+attribute+']').forEach(b=>b.addEventListener('click',()=>{root.querySelectorAll('button['+attribute+']').forEach(x=>x.setAttribute('aria-pressed',String(x===b)));update(b.getAttribute(attribute));}));}
    bind('data-view',v=>{view=v;draw();});
    bind('data-rounds',v=>{rounds=Number(v);draw();});
    bind('data-position-filter',v=>{position=v;highlight();});
    root.querySelector('#draft-school').addEventListener('change',event=>{school=event.target.value;highlight();});
    draw();
  }
  const api={affiliationType,summarize,boardHTML,renderPage,mount,keyOf};
  if(typeof module==='object'&&module.exports) module.exports=api;
  else scope.BaseballDraft=api;
})(typeof window==='undefined'?globalThis:window);
