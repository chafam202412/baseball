'use strict';

// Tests only the app's configured arithmetic, not eligibility or health advice.
// All fixtures are synthetic; production data is neither read nor copied.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
function section(start, end) {
  const a = html.indexOf(start), b = html.indexOf(end, a + start.length);
  assert.ok(a >= 0 && b > a, `Source section exists: ${start}`);
  return html.slice(a, b);
}
const source = [
  section('const PITCH = [', '/* ================= 저장소'),
  section('const num = ', 'function toast('),
  section('function seqStats(', '/* ================= 탭'),
  section('function pitchAgg(', 'function fieldAgg('),
  section("const REST_KEY='baseball_rest';", '/* ================= 01 경기 일지'),
  'today = () => fixtureToday;',
  'globalThis.subject = {restCfg, restDaysFor, addDays, daysBetween, lastOuting, restStatus, pitchWarnHTML};'
].join('\n');
function setup(games = [], date = '2026-10-31', config = null) {
  const context = {
    DB: {games}, fixtureToday: date,
    localStorage: {getItem() { return config; }}
  };
  vm.runInNewContext(source, context, {timeout: 1000});
  return {api: context.subject, context};
}
function outing(date, pitches, id = 'fixture') {
  // Legacy aggregate pitching records support precise synthetic pitch totals.
  return {id, date, ips: [{p: pitches, o: 3, s: 0, h: 0, bb: 0, k: 0, er: 0}]};
}

test('no outing returns null and missing dates/non-pitching games are ignored', () => {
  const {api} = setup([{date: '2026-10-31', pas: [{res: '1B'}]}, outing('', 30)]);
  assert.equal(api.lastOuting(), null);
  assert.equal(api.restStatus(), null);
});

test('latest outing combines all games on its date without mutating input order', () => {
  const games = [outing('2026-10-29', 70, 'older'), outing('2026-10-30', 15, 'first'), outing('2026-10-30', 18, 'second')];
  const before = JSON.stringify(games);
  const {api} = setup(games);
  const latest = api.lastOuting();
  assert.equal(latest.date, '2026-10-30');
  assert.equal(latest.pitches, 33);
  assert.equal(latest.games, 2);
  assert.equal(api.restStatus().need, 1);
  assert.equal(JSON.stringify(games), before);
});

test('same-day aggregation handles both sequence and legacy pitching sources', () => {
  const {api} = setup([
    {date: '2026-10-30', bfs: [{seq: 'SSS', res: 'SO_L'}, {seq: 'BBBB', res: 'BB'}]},
    outing('2026-10-30', 14),
    {date: '2026-10-31', pas: [{res: 'GO'}], bfs: []}
  ]);
  assert.equal(api.lastOuting().pitches, 21);
  assert.equal(api.lastOuting().games, 2);
  assert.equal(api.restStatus().need, 1);
});

test('default tier boundaries use inclusive upper limits', () => {
  const {api} = setup();
  for (const [pitches, days] of [[0, 0], [20, 0], [21, 1], [35, 1], [36, 2], [50, 2], [51, 3], [65, 3], [66, 4], [1000, 4]]) {
    assert.equal(api.restDaysFor(pitches), days, `${pitches} pitches`);
  }
});

test('stored custom criteria determine the result, not an implicit other rule', () => {
  const config = JSON.stringify({limit: 60, tiers: [[10, 0], [30, 2], [999, 5]]});
  const {api} = setup([outing('2026-10-30', 20)], '2026-10-31', config);
  const result = api.restStatus();
  assert.equal(result.need, 2);
  assert.equal(result.ready, '2026-11-02');
  assert.equal(result.left, 2);
  assert.equal(result.ok, false);
  assert.equal(Object.hasOwn(result, 'kbsa'), false);
  assert.equal(Object.hasOwn(result, 'kbsaOk'), false);
});

test('zero configured rest days complete on the following calendar day', () => {
  const {api, context} = setup([outing('2026-10-30', 20)], '2026-10-30');
  assert.equal(api.restStatus().ready, '2026-10-31');
  assert.equal(api.restStatus().ok, false);
  context.fixtureToday = '2026-10-31';
  assert.equal(api.restStatus().left, 0);
  assert.equal(api.restStatus().ok, true);
});

test('configured rest spans year-end with correct first, last and completion dates', () => {
  const {api, context} = setup([outing('2026-12-30', 50)], '2027-01-01');
  const result = api.restStatus();
  assert.equal(result.need, 2);
  assert.equal(result.restFrom, '2026-12-31');
  assert.equal(result.restTo, '2027-01-01');
  assert.equal(result.ready, '2027-01-02');
  assert.equal(result.gap, 2);
  assert.equal(result.left, 1);
  assert.equal(result.ok, false);
  context.fixtureToday = '2027-01-02';
  assert.equal(api.restStatus().ok, true);
  context.fixtureToday = '2027-01-05';
  assert.equal(api.restStatus().left, -3);
  assert.equal(api.restStatus().ok, true);
});

test('calendar arithmetic correctly crosses leap and non-leap February', () => {
  const {api} = setup([outing('2028-02-28', 35)], '2028-02-29');
  assert.equal(api.restStatus().restFrom, '2028-02-29');
  assert.equal(api.restStatus().restTo, '2028-02-29');
  assert.equal(api.restStatus().ready, '2028-03-01');
  assert.equal(api.addDays('2027-02-28', 1), '2027-03-01');
  assert.equal(api.addDays('2028-03-01', -1), '2028-02-29');
});

test('calendar differences survive DST transitions in a DST timezone', () => {
  const {api} = setup();
  assert.equal(api.daysBetween('2026-03-07', '2026-03-09'), 2);
  assert.equal(api.daysBetween('2026-10-31', '2026-11-02'), 2);
  assert.equal(api.daysBetween('2026-03-09', '2026-03-07'), -2);
});

test('malformed JSON falls back to default criteria', () => {
  const {api} = setup([], '2026-10-31', '{broken');
  assert.equal(api.restCfg().limit, 75);
  assert.equal(api.restDaysFor(36), 2);
});

test('warning distinguishes exactly reaching the configured cap from exceeding it', () => {
  const {api} = setup();
  assert.equal(api.pitchWarnHTML(0), '');
  assert.match(api.pitchWarnHTML(75), /도달했습니다/);
  assert.doesNotMatch(api.pitchWarnHTML(75), /넘었습니다/);
  assert.match(api.pitchWarnHTML(76), /넘었습니다/);
  assert.match(api.pitchWarnHTML(75), /설정 기준/);
  assert.match(api.pitchWarnHTML(75), /대회 규정 우선/);
});
