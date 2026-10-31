'use strict';

// Synthetic fixtures only. Read the relevant source sections, never production data.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');

function section(start, end) {
  const first = html.indexOf(start);
  const last = html.indexOf(end, first + start.length);
  assert.ok(first >= 0 && last > first, `Source section exists: ${start}`);
  return html.slice(first, last);
}

const source = [
  section('const PITCH = [', '/* ================= 저장소'),
  section('const num = ', 'function toast('),
  section('function seqStats(', '/* ================= 탭'),
  section('function optList(', 'function reindex('),
  section('function liveSummary(', 'function wirePad('),
  section('let EDIT_ID = null;', '/* ================= 작성 중 임시저장'),
  section('function hasContent(', 'function saveDraft('),
  section('function battingAgg(', '/* ================= 타구 방향'),
  'globalThis.subject = {paBlock, isBlankPA, battingEntryError, readForm, fillForm, liveSummary, hasContent, battingAgg, pitchAgg, fieldAgg, advPitch, seqStats, autoResult};'
].join('\n');

function setup() {
  const elements = new Map();
  const lists = new Map();
  const state = {persisted: 0, messages: []};
  const $ = selector => {
    if (!elements.has(selector)) elements.set(selector, {
      value: '', innerHTML: '', textContent: '', handlers: {},
      addEventListener(event, callback) { this.handlers[event] = callback; }
    });
    return elements.get(selector);
  };
  const context = {
    $, $$: selector => lists.get(selector) || [], DB: {games: []},
    reindex() {}, pitchWarnHTML() { return ''; },
    toast(message) { state.messages.push(message); },
    persist() { state.persisted++; }, confirm() { return true; },
    clearDraft() {}, refreshDatalists() {}, renderLog() {}, goTab() {}
  };
  vm.runInNewContext(source, context, {timeout: 1000});
  return {api: context.subject, context, $, lists, state};
}

function paBlockMock(values = {}) {
  const fields = {res: '', run: 'none', rbi: '', scored: '', dir: '', qual: '', ...values};
  return {
    dataset: {seq: values.seq || ''},
    querySelector(selector) { return {value: String(fields[selector.slice(4)] ?? '')}; }
  };
}
function plain(value) { return JSON.parse(JSON.stringify(value)); }
function bf(seq, res) { return {seq, res, r: 0, er: 0}; }

test('a new batting block explicitly selects no result, not a single', () => {
  const {api} = setup();
  assert.match(api.paBlock(), /<option value="" selected>결과 선택<\/option>/);
  assert.doesNotMatch(api.paBlock(), /<option value="1B" selected>/);
  assert.match(api.paBlock({res: '1B'}), /<option value="1B" selected>/);
});

test('readForm omits truly empty placeholders and retains intentional result-only records', () => {
  const {api, lists} = setup();
  lists.set('#pa-rows .blk', [paBlockMock()]);
  assert.equal(api.readForm().pas.length, 0);
  lists.set('#pa-rows .blk', [paBlockMock(), paBlockMock({res: 'GO'})]);
  assert.equal(api.readForm().pas.length, 1);
  assert.equal(api.readForm().pas[0].res, 'GO');
});

test('partly entered batting blocks require an explicit result', () => {
  const {api} = setup();
  assert.equal(api.battingEntryError([{}]), '');
  assert.equal(api.battingEntryError([{res: '1B'}]), '');
  for (const pa of [{seq: 'X'}, {rbi: 1}, {scored: 1}, {run: 'risp'}, {dir: 'L'}, {qual: 'GB'}, {res: 'unknown'}]) {
    assert.equal(api.isBlankPA(pa), false);
    assert.match(api.battingEntryError([pa]), /최종 결과/);
  }
});

test('save blocks partial batting input before mutation or persistence', () => {
  const {$, lists, state, context} = setup();
  $('#e-opp').value = 'Fixture opponent';
  lists.set('#pa-rows .blk', [paBlockMock({seq: 'X'})]);
  $('#save-game').handlers.click();
  assert.equal(context.DB.games.length, 0);
  assert.equal(state.persisted, 0);
  assert.match(state.messages[0], /최종 결과/);
});

test('opponent-only save creates no fabricated plate appearance or hit', () => {
  const {api, $, lists, state, context} = setup();
  $('#e-opp').value = 'Fixture opponent';
  lists.set('#pa-rows .blk', [paBlockMock()]);
  $('#save-game').handlers.click();
  assert.equal(state.persisted, 1);
  assert.equal(context.DB.games.length, 1);
  assert.equal(context.DB.games[0].pas.length, 0);
  const stats = api.battingAgg(context.DB.games);
  assert.equal(stats.PA, 0);
  assert.equal(stats.AB, 0);
  assert.equal(stats.H, 0);
});

test('editing a no-batting game preserves empty batting records and its ID', () => {
  const {api, $, state, context} = setup();
  const game = {id: 'fixture-no-batting', opp: 'Fixture opponent', pas: [], bfs: [], fds: []};
  context.DB.games.push(game);
  api.fillForm(game);
  assert.equal($('#pa-rows').innerHTML, '');
  $('#save-game').handlers.click();
  assert.equal(state.persisted, 1);
  assert.equal(context.DB.games.length, 1);
  assert.equal(context.DB.games[0].id, 'fixture-no-batting');
  assert.equal(context.DB.games[0].pas.length, 0);
});

test('new forms still offer a blank row; old games without pas do not invent one', () => {
  const {api, $} = setup();
  api.fillForm(null);
  assert.match($('#pa-rows').innerHTML, /class="blk pa"/);
  assert.match($('#pa-rows').innerHTML, /value="" selected>결과 선택/);
  api.fillForm({id: 'fixture-legacy', opp: 'Fixture opponent'});
  assert.equal($('#pa-rows').innerHTML, '');
});

test('live summary ignores blank result rows', () => {
  const {api, $, lists} = setup();
  lists.set('#pa-rows .blk', [paBlockMock()]);
  api.liveSummary();
  assert.equal($('#pa-sum').innerHTML, '');
  lists.set('#pa-rows .blk', [paBlockMock(), paBlockMock({res: '1B', seq: 'X'})]);
  api.liveSummary();
  assert.match($('#pa-sum').innerHTML, /<b>1<\/b>타수 <b>1<\/b>안타/);
});

test('draft content detection retains intentional result-only or partial batting input', () => {
  const {api} = setup();
  assert.equal(api.hasContent({pas: [{}]}), false);
  assert.equal(api.hasContent({pas: [{res: 'GO'}]}), true);
  assert.equal(api.hasContent({pas: [{dir: 'L'}]}), true);
});

test('readForm preserves explicit batting record fields', () => {
  const {api, lists} = setup();
  const pa = {seq: 'BX', res: '2B', run: 'risp', rbi: 2, scored: 1, dir: 'LC', qual: 'LD'};
  lists.set('#pa-rows .blk', [paBlockMock(pa)]);
  assert.deepEqual(plain(api.readForm().pas), [pa]);
});

test('batting aggregates retain standard AVG, OBP, SLG and separate BB/HBP', () => {
  const {api} = setup();
  const a = api.battingAgg([{pas: ['1B', '2B', 'GO', 'BB', 'HBP', 'SF', 'SH'].map(res => ({res, seq: ''}))}]);
  assert.equal(a.AB, 3);
  assert.equal(a.H, 2);
  assert.equal(a.BB, 1);
  assert.equal(a.HBP, 1);
  assert.equal(a.AVG, 2 / 3);
  assert.equal(a.OBP, 4 / 6);
  assert.equal(a.SLG, 1);
});

test('pitching WHIP, BB/9, K/BB and BB% exclude HBP, separate 사사구 rate includes it', () => {
  const {api} = setup();
  const a = api.pitchAgg([{bfs: [bf('SSS', 'SO_L'), bf('SWW', 'SO_S'), bf('WWW', 'SO_S'), bf('X', '1B'), bf('BBBB', 'BB'), bf('H', 'HBP')]}]);
  assert.equal(a.IP, 1);
  assert.equal(a.H, 1);
  assert.equal(a.BB, 1);
  assert.equal(a.HBP, 1);
  assert.equal(a.WHIP, 2);
  assert.equal(a.BB9, 9);
  assert.equal(a.KBB, 3);
  assert.equal(a.BBRT, 1 / 6);
  assert.equal(a.BBRTHBP, 2 / 6);
  assert.ok(Math.abs((a.KRT - a.BBRT) - 2 / 6) < 1e-12);
});

test('zero walks with HBP preserves infinite K/BB and zero standard walk rates', () => {
  const {api} = setup();
  const a = api.pitchAgg([{bfs: [bf('SSS', 'SO_L'), bf('H', 'HBP')]}]);
  assert.equal(a.KBB, Infinity);
  assert.equal(a.WHIP, 0);
  assert.equal(a.BB9, 0);
  assert.equal(a.BBRT, 0);
  assert.equal(a.BBRTHBP, 0.5);
  const empty = api.pitchAgg([]);
  assert.equal(empty.WHIP, null);
  assert.equal(empty.KBB, null);
  assert.equal(empty.BBRT, null);
  assert.equal(empty.BBRTHBP, null);
});

test('returning to a position counts once per game without dropping fielding totals', () => {
  const {api} = setup();
  const a = api.fieldAgg([
    {fds: [{pos: '유격수', inn: 2, po: 1, a: 2, e: 0}, {pos: '포수', inn: 1, po: 3, a: 0, e: 0}, {pos: '유격수', inn: 2, po: 2, a: 1, e: 1}]},
    {fds: [{pos: '유격수', inn: 1, po: 1, a: 1, e: 0}]}
  ]);
  assert.equal(a.byPos['유격수'].G, 2);
  assert.equal(a.byPos['포수'].G, 1);
  assert.equal(a.byPos['유격수'].INN, 5);
  assert.equal(a.byPos['유격수'].PO, 4);
  assert.equal(a.byPos['유격수'].A, 4);
  assert.equal(a.byPos['유격수'].E, 1);
  assert.equal(a.INN, 6);
});

test('consecutive balls continue across batters but never across games', () => {
  const {api} = setup();
  assert.equal(api.advPitch([{bfs: [bf('BBBB', 'BB'), bf('BBBSFW', 'SO_S')]}]).maxBallRun, 7);
  assert.equal(api.advPitch([{bfs: [bf('BBBB', 'BB')]}, {bfs: [bf('BBBSFW', 'SO_S')]}]).maxBallRun, 4);
  assert.equal(api.advPitch([{bfs: [bf('BBBB', 'BB'), bf('SBBBX', 'GO')]}]).maxBallRun, 4);
});

test('existing sequence behavior handles two-strike fouls and automatic outcomes', () => {
  const {api} = setup();
  assert.equal(api.seqStats('SSFFF').s, 2);
  assert.equal(api.seqStats('SSFFF').pitches, 5);
  assert.equal(api.autoResult('SSFFW'), 'SO_S');
  assert.equal(api.autoResult('SSFFS'), 'SO_L');
  assert.equal(api.autoResult('BBBB'), 'BB');
  assert.equal(api.autoResult('H'), 'HBP');
});
