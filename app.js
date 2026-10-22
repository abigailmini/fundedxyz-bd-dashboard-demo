'use strict';
const $ = s => document.querySelector(s);
const el = (t,c,h)=>{const e=document.createElement(t);if(c)e.className=c;if(h!=null)e.innerHTML=h;return e;};
const fmt = n => '$' + (Number(n)||0).toLocaleString(undefined,{maximumFractionDigits:0});
const fmt2 = n => '$' + (Number(n)||0).toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2});

// ---------- local mutable state (admin edits work on this) ----------
const D = JSON.parse(JSON.stringify(window.DEMO_DATA));
const PW = D.password || 'demo123';
// "now" = latest sale date so Today/7D/MTD have data in the demo
const NOW = D.sales.reduce((m,s)=> s.created_at>m ? s.created_at : m, '0000-00-00');
let ME=null, RANGE='all', VIEW='overview', chart=null;

// ---------- date helpers ----------
function dstr(d){return d.toISOString().slice(0,10);}
function inRange(iso, range){
  if(range==='all') return true;
  if(range==='today') return iso===NOW;
  const now=new Date(NOW+'T00:00:00Z');
  if(range==='7d'){ const lo=new Date(now.getTime()-6*86400000); return iso>=dstr(lo) && iso<=NOW; }
  if(range==='mtd'){ return iso.slice(0,7)===NOW.slice(0,7); }
  return true;
}
// ---------- scope ----------
function allowedAffIds(u){
  if(u.role==='admin') return {all:true};
  if(u.role==='bd') return {ids: D.affiliates.filter(a=>a.bd_id===u.bd_id).map(a=>a.id)};
  if(u.role==='affiliate') return {ids: u.affiliate_id?[u.affiliate_id]:[]};
  return {ids:[]};
}
function affOf(id){return D.affiliates.find(a=>a.id===id);}
function bdOf(id){return D.bds.find(b=>b.id===id);}
function scoped(list,u){ const sc=allowedAffIds(u); if(sc.all) return list; const set=new Set(sc.ids); return list.filter(x=>set.has(x.affiliate_id)); }

// ---------- query layer (mirrors server queries.js) ----------
function qSummary(u,range){
  const paid=scoped(D.sales,u).filter(s=>s.status==='paid'&&inRange(s.created_at,range));
  const revenue=paid.reduce((t,s)=>t+s.amount,0);
  const orders=paid.length;
  const signups=scoped(D.signups,u).filter(g=>inRange(g.created_at,range)).length;
  let affComm=0; paid.forEach(s=>{const a=affOf(s.affiliate_id); if(a) affComm+=s.amount*(a.commission_pct||0)/100;});
  let bdComm=null;
  if(u.role==='bd'&&u.bd_id){ const b=bdOf(u.bd_id); if(b) bdComm=+(revenue*(b.commission_pct||0)/100).toFixed(2); }
  return {revenue:+revenue.toFixed(2),orders,signups,affiliate_commission:+affComm.toFixed(2),bd_commission:bdComm};
}
function qTimeseries(u,range){
  const paid=scoped(D.sales,u).filter(s=>s.status==='paid'&&inRange(s.created_at,range));
  const m=new Map();
  paid.forEach(s=>{const o=m.get(s.created_at)||{day:s.created_at,revenue:0,orders:0};o.revenue+=s.amount;o.orders++;m.set(s.created_at,o);});
  return [...m.values()].map(r=>({day:r.day,revenue:+r.revenue.toFixed(2),orders:r.orders})).sort((a,b)=>a.day<b.day?-1:1);
}
function qAffiliateTable(u,range){
  const sc=allowedAffIds(u); const set=sc.all?null:new Set(sc.ids);
  const affs=D.affiliates.filter(a=>sc.all||set.has(a.id));
  const rows=affs.map(a=>{
    const paid=D.sales.filter(s=>s.affiliate_id===a.id&&s.status==='paid'&&inRange(s.created_at,range));
    const revenue=paid.reduce((t,s)=>t+s.amount,0);
    const signups=D.signups.filter(g=>g.affiliate_id===a.id).length;
    const last=paid.reduce((m,s)=> s.created_at>m?s.created_at:m, '')||null;
    const b=a.bd_id?bdOf(a.bd_id):null;
    return {id:a.id,code:a.code,referral_id:a.referral_id,name:a.name,bd_name:b?b.name:null,
      commission_pct:a.commission_pct,signups,sales_count:paid.length,revenue:+revenue.toFixed(2),
      commission:+((revenue*(a.commission_pct||0))/100).toFixed(2),last_sale:last};
  });
  return rows.sort((x,y)=>y.revenue-x.revenue);
}
function qLeaderboardBD(u,range){
  if(u.role!=='admin') return [];
  return D.bds.map(b=>{
    const affs=D.affiliates.filter(a=>a.bd_id===b.id);
    const ids=new Set(affs.map(a=>a.id));
    const paid=D.sales.filter(s=>ids.has(s.affiliate_id)&&s.status==='paid'&&inRange(s.created_at,range));
    const revenue=paid.reduce((t,s)=>t+s.amount,0);
    return {id:b.id,name:b.name,affiliates:affs.length,revenue:+revenue.toFixed(2),commission:+((revenue*(b.commission_pct||0))/100).toFixed(2)};
  }).sort((x,y)=>y.revenue-x.revenue);
}
function qProducts(u,range){
  const paid=scoped(D.sales,u).filter(s=>s.status==='paid'&&inRange(s.created_at,range));
  const m=new Map();
  paid.forEach(s=>{const p=s.product||'(unknown)';const o=m.get(p)||{product:p,orders:0,revenue:0};o.orders++;o.revenue+=s.amount;m.set(p,o);});
  return [...m.values()].map(r=>({product:r.product,orders:r.orders,revenue:+r.revenue.toFixed(2)})).sort((a,b)=>b.revenue-a.revenue);
}
function qExportRows(u,range){
  const rows=scoped(D.sales,u).filter(s=>inRange(s.created_at,range)).slice().sort((a,b)=>a.created_at<b.created_at?1:-1);
  return rows.map(s=>{const a=affOf(s.affiliate_id);const b=a&&a.bd_id?bdOf(a.bd_id):null;
    return {created_at:s.created_at,affiliate_code:a?a.code:'',affiliate_name:a?a.name:'',bd_name:b?b.name:'',product:s.product,amount:s.amount,status:s.status,customer_email:s.customer_email};});
}
function toCsv(rows){ if(!rows.length) return ''; const cols=Object.keys(rows[0]);
  const esc=v=>{v=v==null?'':String(v);return /[",\n]/.test(v)?'"'+v.replace(/"/g,'""')+'"':v;};
  return cols.join(',')+'\n'+rows.map(r=>cols.map(c=>esc(r[c])).join(',')).join('\n'); }

// ---------- auth (demo) ----------
(function populateUsers(){
  const sel=$('#userSel');
  D.users.forEach(u=>{const o=el('option',null,u.name+'  ('+u.role+')  -  '+u.email);o.value=u.id;sel.appendChild(o);});
})();
$('#loginForm').addEventListener('submit', e=>{
  e.preventDefault(); $('#loginErr').textContent='';
  const u=D.users.find(x=>String(x.id)===$('#userSel').value);
  if(!u){$('#loginErr').textContent='pick a user';return;}
  if($('#password').value!==PW){$('#loginErr').textContent='invalid password (use '+PW+')';return;}
  ME={email:u.email,name:u.name,role:u.role,bd_id:u.bd_id,affiliate_id:u.affiliate_id};
  boot();
});
['#logout','#logout2'].forEach(s=>$(s).addEventListener('click',e=>{e.preventDefault();ME=null;location.reload();}));

// ---------- shell ----------
function boot(){
  $('#login').classList.add('hidden');$('#app').classList.remove('hidden');
  $('#whoName').textContent=ME.name; $('#whoRole').textContent=ME.email;
  $('#roleChip').textContent=ME.role;
  $('#navAdmin').classList.toggle('hidden', ME.role!=='admin');
  if(ME.role==='affiliate'){$('#navAffiliates').textContent='My Sales';}else{$('#navAffiliates').textContent='Affiliates';}
  document.querySelectorAll('.nav-item').forEach(n=>n.onclick=e=>{e.preventDefault();go(n.dataset.view);});
  document.querySelectorAll('#ranges button').forEach(b=>b.onclick=()=>{
    RANGE=b.dataset.r;document.querySelectorAll('#ranges button').forEach(x=>x.classList.toggle('active',x===b));render();
  });
  $('#exportBtn').onclick=()=>{
    const csv=toCsv(qExportRows(ME,RANGE));
    const blob=new Blob([csv],{type:'text/csv'}); const a=document.createElement('a');
    a.href=URL.createObjectURL(blob); a.download='fundedxyz-sales-'+RANGE+'.csv'; a.click(); URL.revokeObjectURL(a.href);
  };
  go('overview');
}
function go(v){ if(v==='admin'&&ME.role!=='admin') v='overview';
  VIEW=v;document.querySelectorAll('.nav-item').forEach(n=>n.classList.toggle('active',n.dataset.view===v));
  $('#viewTitle').textContent={overview:'Overview',affiliates:ME.role==='affiliate'?'My Sales':'Affiliates',leaderboard:'Leaderboard',products:'Products',admin:'Admin'}[v];
  render();}

function render(){
  const c=$('#content'); c.innerHTML='';
  try{
    if(VIEW==='overview')return renderOverview(c);
    if(VIEW==='affiliates')return renderAffiliates(c);
    if(VIEW==='leaderboard')return renderLeaderboard(c);
    if(VIEW==='products')return renderProducts(c);
    if(VIEW==='admin')return renderAdmin(c);
  }catch(e){c.innerHTML='<div class="notice">'+e.message+'</div>';}
}

// ---------- overview ----------
function renderOverview(c){
  const s=qSummary(ME,RANGE), ts=qTimeseries(ME,RANGE);
  const kp=el('div','kpis');
  const cards=[['Revenue',fmt(s.revenue),'cy',s.orders+' paid orders'],
    ['Orders',s.orders,'',''],
    ['Sign-ups',s.signups,'',''],
    [ME.role==='bd'?'Team commission':'Commission',fmt2(ME.role==='bd'&&s.bd_commission!=null?s.bd_commission:s.affiliate_commission),'lm',ME.role==='bd'?'your BD %':(ME.role==='affiliate'?'your affiliate %':'affiliate payout')]];
  cards.forEach(([l,v,cl,sub])=>{const k=el('div','card kpi');k.innerHTML='<div class="lbl">'+l+'</div><div class="val '+cl+'">'+v+'</div><div class="sub">'+(sub||'')+'</div>';kp.appendChild(k);});
  c.appendChild(kp);
  const chartCard=el('div','card');chartCard.innerHTML='<div class="section-head"><h2>Sales over time</h2><span class="hint">'+RANGE.toUpperCase()+'</span></div><canvas id="tsChart" height="90"></canvas>';
  c.appendChild(chartCard);
  drawChart(ts);
}
function drawChart(ts){
  if(chart){chart.destroy();chart=null;}
  const ctx=document.getElementById('tsChart');if(!ctx)return;
  const g=ctx.getContext('2d').createLinearGradient(0,0,0,220);g.addColorStop(0,'#22d3ee66');g.addColorStop(1,'#22d3ee00');
  chart=new Chart(ctx,{type:'line',data:{labels:ts.map(r=>r.day),datasets:[{label:'Revenue',data:ts.map(r=>r.revenue),borderColor:'#22d3ee',backgroundColor:g,fill:true,tension:.33,pointRadius:0,borderWidth:2}]},
    options:{plugins:{legend:{display:false}},scales:{x:{grid:{display:false},ticks:{color:'#5f768a',maxTicksLimit:8}},y:{grid:{color:'#1b2836'},ticks:{color:'#5f768a',callback:v=>'$'+v}}}}});
}

// ---------- affiliates / my sales ----------
function renderAffiliates(c){
  const rows=qAffiliateTable(ME,RANGE);
  const card=el('div','card');
  const max=Math.max(1,...rows.map(r=>r.revenue));
  let body=rows.map(r=>'<tr><td><span class="code">'+r.code+'</span></td><td>'+r.name+'</td>'+
    (ME.role==='admin'?'<td class="muted">'+(r.bd_name||'-')+'</td>':'')+
    '<td>'+r.signups+'</td><td>'+r.sales_count+'</td>'+
    '<td><div style="display:flex;align-items:center;gap:8px"><span>'+fmt(r.revenue)+'</span><div class="bar" style="width:70px"><i style="width:'+Math.round(r.revenue/max*100)+'%"></i></div></div></td>'+
    '<td class="pos">'+fmt2(r.commission)+'</td><td class="muted">'+(r.commission_pct||0)+'%</td><td class="muted">'+(r.last_sale||'-')+'</td></tr>').join('');
  if(!rows.length)body='<tr><td colspan="9" class="muted">No data for this range.</td></tr>';
  card.innerHTML='<div class="table-wrap"><table><thead><tr><th>Code</th><th>Name</th>'+(ME.role==='admin'?'<th>BD</th>':'')+'<th>Sign-ups</th><th>Sales</th><th>Revenue</th><th>Commission</th><th>Rate</th><th>Last sale</th></tr></thead><tbody>'+body+'</tbody></table></div>';
  c.appendChild(card);
}

// ---------- leaderboard ----------
function renderLeaderboard(c){
  if(ME.role==='admin'){
    const bd=qLeaderboardBD(ME,RANGE);
    const card=el('div','card');const max=Math.max(1,...bd.map(r=>r.revenue));
    card.innerHTML='<div class="section-head"><h2>BD Leaderboard</h2></div><div class="table-wrap"><table><thead><tr><th>#</th><th>BD</th><th>Affiliates</th><th>Revenue</th><th>Commission</th><th></th></tr></thead><tbody>'+
      bd.map((r,i)=>'<tr><td>'+(i+1)+'</td><td>'+r.name+'</td><td>'+r.affiliates+'</td><td>'+fmt(r.revenue)+'</td><td class="pos">'+fmt2(r.commission)+'</td><td style="width:120px"><div class="bar"><i style="width:'+Math.round(r.revenue/max*100)+'%"></i></div></td></tr>').join('')+
      '</tbody></table></div>';
    c.appendChild(card);
  }
  const aff=qAffiliateTable(ME,RANGE).slice(0,25);
  const card2=el('div','card');const max2=Math.max(1,...aff.map(r=>r.revenue));
  card2.innerHTML='<div class="section-head"><h2>Affiliate Leaderboard</h2></div><div class="table-wrap"><table><thead><tr><th>#</th><th>Affiliate</th><th>Code</th><th>Sales</th><th>Revenue</th><th></th></tr></thead><tbody>'+
    (aff.length?aff.map((r,i)=>'<tr><td>'+(i+1)+'</td><td>'+r.name+'</td><td><span class="code">'+r.code+'</span></td><td>'+r.sales_count+'</td><td>'+fmt(r.revenue)+'</td><td style="width:120px"><div class="bar"><i style="width:'+Math.round(r.revenue/max2*100)+'%"></i></div></td></tr>').join(''):'<tr><td colspan="6" class="muted">No data.</td></tr>')+
    '</tbody></table></div>';
  c.appendChild(card2);
}

// ---------- products ----------
function renderProducts(c){
  const rows=qProducts(ME,RANGE);
  const card=el('div','card');const max=Math.max(1,...rows.map(r=>r.revenue));
  card.innerHTML='<div class="section-head"><h2>Product breakdown</h2></div><div class="table-wrap"><table><thead><tr><th>Product</th><th>Orders</th><th>Revenue</th><th></th></tr></thead><tbody>'+
    (rows.length?rows.map(r=>'<tr><td>'+r.product+'</td><td>'+r.orders+'</td><td>'+fmt(r.revenue)+'</td><td style="width:160px"><div class="bar"><i style="width:'+Math.round(r.revenue/max*100)+'%"></i></div></td></tr>').join(''):'<tr><td colspan="4" class="muted">No data.</td></tr>')+
    '</tbody></table></div>';
  c.appendChild(card);
}

// ---------- admin (local-state management) ----------
function adminOverview(){
  return {
    bds:D.bds.slice(),
    affiliates:D.affiliates.map(a=>Object.assign({},a,{bd_name:a.bd_id?(bdOf(a.bd_id)||{}).name:null})),
    users:D.users.slice(),
    adapter:'demo (local state)'
  };
}
function renderAdmin(c){
  if(ME.role!=='admin'){c.innerHTML='<div class="notice">Admins only.</div>';return;}
  const o=adminOverview();
  c.appendChild(el('div','notice','Demo mode: data source is a local in-browser sample set. Changes you make here (create BD / affiliate / user, assign, set commission) update the live demo state immediately and feed every view and the CSV export. Nothing is saved to a server.'));
  const grid=el('div','admin-grid');
  grid.appendChild(formCard('Create user',[
    ['email','Email','email'],['name','Name','text'],
    ['role','Role','select',['admin','bd','affiliate']],
    ['bd_id','BD (for bd user)','select-bd'],
    ['affiliate_id','Affiliate (for affiliate user)','select-aff']
  ],v=>{ if(!v.email||!v.name) throw new Error('email and name required');
    const id=Math.max(0,...D.users.map(u=>u.id))+1;
    D.users.push({id,email:String(v.email).toLowerCase(),name:v.name,role:v.role||'affiliate',bd_id:v.bd_id?+v.bd_id:null,affiliate_id:v.affiliate_id?+v.affiliate_id:null});
    refreshLogins(); return 'Created. Demo password: '+PW; },o));
  grid.appendChild(formCard('Create BD',[['name','BD name','text'],['commission_pct','Commission %','number']],
    v=>{ if(!v.name) throw new Error('name required'); const id=Math.max(0,...D.bds.map(b=>b.id))+1;
      D.bds.push({id,name:v.name,commission_pct:+v.commission_pct||0}); return 'BD created.'; },o));
  grid.appendChild(formCard('Create affiliate',[['code','Promo/referral code','text'],['name','Name','text'],['referral_id','Platform referral id','text'],['bd_id','Assign to BD','select-bd'],['commission_pct','Commission %','number']],
    v=>{ if(!v.code||!v.name) throw new Error('code and name required'); const id=Math.max(0,...D.affiliates.map(a=>a.id))+1;
      D.affiliates.push({id,code:v.code,referral_id:v.referral_id||null,name:v.name,bd_id:v.bd_id?+v.bd_id:null,commission_pct:+v.commission_pct||0}); return 'Affiliate created.'; },o));
  grid.appendChild(formCard('Assign affiliate to BD',[['affiliate_id','Affiliate','select-aff'],['bd_id','BD','select-bd']],
    v=>{ const a=affOf(+v.affiliate_id); if(!a) throw new Error('pick an affiliate'); a.bd_id=v.bd_id?+v.bd_id:null; return 'Assigned.'; },o));
  grid.appendChild(formCard('Set affiliate commission %',[['id','Affiliate','select-aff'],['commission_pct','Commission %','number']],
    v=>{ const a=affOf(+v.id); if(!a) throw new Error('pick an affiliate'); a.commission_pct=+v.commission_pct||0; return 'Updated.'; },o));
  grid.appendChild(formCard('Set BD commission %',[['id','BD','select-bd'],['commission_pct','Commission %','number']],
    v=>{ const b=bdOf(+v.id); if(!b) throw new Error('pick a BD'); b.commission_pct=+v.commission_pct||0; return 'Updated.'; },o));
  c.appendChild(grid);

  const ut=el('div','card');
  ut.innerHTML='<div class="section-head"><h2>Users</h2></div><div class="table-wrap"><table><thead><tr><th>Email</th><th>Name</th><th>Role</th><th>Scope</th></tr></thead><tbody>'+
    o.users.map(u=>'<tr><td>'+u.email+'</td><td>'+u.name+'</td><td><span class="chip role">'+u.role+'</span></td><td class="muted">'+(u.bd_id?('bd#'+u.bd_id):'')+(u.affiliate_id?(' aff#'+u.affiliate_id):'')+(u.role==='admin'?'all':'')+'</td></tr>').join('')+
    '</tbody></table></div>';
  c.appendChild(ut);
}
function refreshLogins(){ const sel=$('#userSel'); if(!sel) return; }
function formCard(title,fields,onSubmit,o){
  const card=el('div','card');card.innerHTML='<div class="section-head"><h2>'+title+'</h2></div>';
  const form=el('form');const inputs={};
  fields.forEach(([key,label,type,opts])=>{
    const l=el('label',null,label);form.appendChild(l);let inp;
    if(type==='select'){inp=el('select');opts.forEach(op=>inp.appendChild(el('option',null,op)));}
    else if(type==='select-bd'){inp=el('select');inp.appendChild(el('option',null,'-'));(o.bds||[]).forEach(b=>{const op=el('option',null,b.name);op.value=b.id;inp.appendChild(op);});}
    else if(type==='select-aff'){inp=el('select');inp.appendChild(el('option',null,'-'));(o.affiliates||[]).forEach(a=>{const op=el('option',null,a.code+' - '+a.name);op.value=a.id;inp.appendChild(op);});}
    else{inp=el('input');inp.type=type;}
    inputs[key]=inp;form.appendChild(inp);
  });
  const msg=el('div','err');const btn=el('button','btn sm','Save');btn.style.marginTop='14px';btn.type='submit';
  form.appendChild(btn);form.appendChild(msg);
  form.addEventListener('submit',e=>{e.preventDefault();msg.style.color='';msg.textContent='';
    const v={};Object.keys(inputs).forEach(k=>{const val=inputs[k].value;v[k]=(val==='-'||val==='')?null:val;});
    try{const r=onSubmit(v);msg.style.color='var(--lime)';msg.textContent=r||'Done.';setTimeout(()=>{if(VIEW==='admin')renderAdmin($('#content'));},900);}catch(err){msg.textContent=err.message;}});
  card.appendChild(form);return card;
}
