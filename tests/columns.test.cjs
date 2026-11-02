'use strict';
// Offline presentation-only regression tests. Synthetic posts only; no data.json reads.
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const crypto=require('node:crypto');
const root=path.join(__dirname,'..');
const stylesheet=fs.readFileSync(path.join(root,'design-refresh.css'),'utf8');
const html=fs.readFileSync(path.join(root,'index.html'),'utf8');
const marker='/* Column reading:';
const offset=stylesheet.indexOf(marker);
assert.ok(offset>=0,'Column reading override section must be identifiable');
const css=stylesheet.slice(offset).replace(/\/\*[\s\S]*?\*\//g,'');
function rules(source, media=''){
  const found=[];let at=0;
  while(at<source.length){
    while(/\s/.test(source[at]||'') && at<source.length)at++;
    if(at===source.length)break;
    const begin=source.indexOf('{',at);assert.ok(begin>=0,'Unclosed CSS rule');
    const selector=source.slice(at,begin).trim();let end=begin+1,depth=1,quote='';
    for(;end<source.length&&depth;end++){
      const c=source[end];
      if(quote){if(c==='\\'){end++;continue;}if(c===quote)quote='';continue;}
      if(c==='"'||c==="'"){quote=c;continue;}
      if(c==='{')depth++;if(c==='}')depth--;
    }
    assert.equal(depth,0,'Unclosed CSS block');
    const body=source.slice(begin+1,end-1);
    if(selector.startsWith('@')){assert.match(selector,/^@media\b/,'No global at-rules in column overrides');found.push(...rules(body,selector));}
    else found.push({selector,body,media});
    at=end;
  }
  return found;
}
function selectors(list){
  const result=[];let depth=0,from=0;
  for(let i=0;i<list.length;i++){
    if(list[i]==='('||list[i]==='[')depth++;
    if(list[i]===')'||list[i]===']')depth--;
    if(list[i]===','&&depth===0){result.push(list.slice(from,i).trim());from=i+1;}
  }
  result.push(list.slice(from).trim());return result;
}
const styleRules=rules(css);
function section(start,end){const a=html.indexOf(start),b=html.indexOf(end,a);assert.ok(a>=0&&b>a);return html.slice(a,b);}
const renderSource=section('function renderPosts(){','function wirePosts(){');
const safetySource=section('function safeContentUrl(value, image){','function stripTags(html){');
const hash=value=>crypto.createHash('sha256').update(value).digest('hex');

test('all new column selectors are confined to the posts panel, including media queries',()=>{
  assert.ok(styleRules.length>0);
  for(const rule of styleRules)for(const selector of selectors(rule.selector))assert.match(selector,/^#p-posts(?:\s|[>+~])/,'Unscoped selector: '+selector);
  assert.doesNotMatch(css,/@import|url\s*\(|:root|@font-face/i);
});
test('column restyling does not hide article text or override diagram semantic colors and geometry',()=>{
  for(const rule of styleRules){
    assert.doesNotMatch(rule.body,/(?:^|;)\s*(?:fill|stroke(?:-[\w-]+)?|d|transform|content)\s*:/i,rule.selector);
    if(/(?:display\s*:\s*none|visibility\s*:\s*hidden|opacity\s*:\s*0(?:[;\s]|$))/i.test(rule.body))
      assert.equal(rule.selector,'#p-posts .postbody .jp-hero:after','Only the decorative hero ring may be hidden');
  }
});
test('mobile prose and wide content have scoped wrapping and horizontal scroll containment',()=>{
  assert.ok(styleRules.some(r=>r.media.includes('640px')&&r.selector==='#p-posts .postbody'&&/font-size\s*:\s*16px/.test(r.body)));
  assert.ok(styleRules.some(r=>r.selector.includes('.term')&&/white-space\s*:\s*normal/.test(r.body)&&/overflow-wrap\s*:\s*anywhere/.test(r.body)));
  assert.ok(styleRules.some(r=>r.selector==='#p-posts .postbody table'&&/max-width\s*:\s*100%/.test(r.body)&&/overflow-x\s*:\s*auto/.test(r.body)));
  assert.ok(styleRules.some(r=>r.selector.includes('.exercise-title')&&/flex-wrap\s*:\s*wrap/.test(r.body)));
  assert.ok(styleRules.some(r=>r.selector.includes('img,svg')&&/max-width\s*:\s*100%/.test(r.body)&&/height\s*:\s*auto/.test(r.body)));
});
test('presentation-only update leaves the existing article renderer and sanitizer unchanged',()=>{
  // Baseline captured immediately before the CSS-only column refresh; no stored post content included.
  assert.equal(hash(renderSource),'172a4fd932493e81e8b4fc75f2d9dd7103c710440b011554ce64b6e52d8f3b57');
  assert.equal(hash(safetySource),'7d25eabfc15ac7573bfe860c107b4a6dd4df0b5758b9a06506186c8b5acc6297');
});
test('reading three synthetic HTML columns retains text, diagram attributes and original objects',()=>{
  const posts=[1,2,3].map(i=>({id:'synthetic-'+i,date:'2026-01-01',title:'Synthetic title '+i,lead:'Unchanged lead '+i,fmt:'html',draft:false,body:`<section class="synthetic"><p>Unchanged body ${i}</p><svg viewBox="0 0 100 100" role="img" aria-label="Synthetic diagram"><path d="M0 0L100 100" stroke="#b22020" fill="none"/><text x="3" y="12">Diagram ${i}</text></svg></section>`}));
  const before=JSON.stringify(posts);const nodes=new Map();
  const context={DB:{posts},ADMIN:false,PO_OPEN:null,PO_PAGE:0,PO_PER:7,visiblePosts:()=>posts,
    $:key=>{if(!nodes.has(key))nodes.set(key,{style:{},innerHTML:''});return nodes.get(key);},
    esc:value=>String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])),
    renderBody:p=>p.body,postExcerpt:p=>p.lead};
  vm.createContext(context);vm.runInContext(renderSource,context);
  for(const post of posts){context.PO_OPEN=post.id;context.renderPosts();const output=nodes.get('#postlist').innerHTML;
    assert.ok(output.includes(post.body));assert.ok(output.includes(post.title));assert.ok(output.includes(post.lead));assert.match(output,/data-back="1"/);assert.match(output,/data-top="1"/);
  }
  assert.equal(JSON.stringify(posts),before);
});
