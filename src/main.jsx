import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { createClient } from '@supabase/supabase-js';
import * as XLSX from 'xlsx';
import './styles.css';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
const supabase = SUPABASE_URL && SUPABASE_KEY ? createClient(SUPABASE_URL, SUPABASE_KEY) : null;

const VENDORS = [
  '건화','고가','따로','따로 희귀','명인','백제','복산','지오영','지오팜',
  '하은','하이스트','한미','호림','JC','인천','복시'
];

// 2026 주문서 표준 거래처명과 과거 약칭을 함께 지원합니다.
// 한 셀에 거래처가 둘 이상 적힌 경우 첫 번째 거래처를 우선합니다.
const CODE_MAP = {
  '건화':'건화', '건':'건화', 'A':'건화',
  '고가':'고가',
  '따로':'따로', '따로 희귀':'따로 희귀',
  '명인':'명인', 'M':'명인',
  '백제':'백제', '백':'백제', 'B':'백제',
  '복산':'복산', '복':'복산',
  '지오영':'지오영', '영':'지오영',
  '지오팜':'지오팜', '팜':'지오팜',
  '하은':'하은', '하':'하은',
  '하이':'하이스트', '하이스트':'하이스트',
  '한미':'한미', '한미H':'한미', '한미h':'한미',
  '호림':'호림', '호':'호림',
  'JC':'JC', 'jc':'JC',
  '인천':'인천', '인':'인천',
  '복시':'복시'
};

function cleanName(name){ return String(name ?? '').replace(/\s*\([^)]*\)\s*$/g,'').replace(/\s+/g,' ').trim(); }
function firstVendorToken(value){
  return String(value ?? '')
    .trim()
    .split(/\s*[,/·|]\s*|\r?\n/)
    .map(x=>x.trim())
    .find(Boolean) || '';
}
function vendorFor(code){
  const raw=firstVendorToken(code);
  if(!raw) return '복시';
  if(CODE_MAP[raw]) return CODE_MAP[raw];
  const upper=raw.toUpperCase();
  return CODE_MAP[upper] || '복시';
}
function validQty(q){ const s=String(q??'').trim(); return !!s && (/^\*?\d+(?:\.\d+)?$/.test(s) || /^\d+(?:\.\d+)?\*\d+(?:\.\d+)?$/.test(s)); }
function todayText(){ const d=new Date(); return `${d.getMonth()+1}/${d.getDate()}`; }
function isoDate(){ return new Date().toISOString().slice(0,10); }
function normalizeKey(s){ return cleanName(s).toLowerCase().replace(/\s/g,''); }
function formatDateTime(value){ return value ? new Date(value).toLocaleString('ko-KR') : ''; }

function downloadWorkbook(filename, sheets){
  const wb=XLSX.utils.book_new();
  Object.entries(sheets).forEach(([name,rows])=>{
    const ws=XLSX.utils.json_to_sheet(rows);
    XLSX.utils.book_append_sheet(wb,ws,name.slice(0,31));
  });
  XLSX.writeFile(wb,filename);
}

function parseWorkbook(arrayBuffer){
  const wb=XLSX.read(arrayBuffer,{type:'array'});
  const orders=[]; const issues=[]; const peel=[];
  const separate=wb.SheetNames.find(n=>n.includes('별도주문'));
  if(separate){
    const rows=XLSX.utils.sheet_to_json(wb.Sheets[separate],{header:1,defval:''});
    rows.forEach((r,i)=>{
      const category=String(r[0]??'').trim();
      const vendorCode=String(r[1]??'').trim();
      const rawName=r[2]; const qty=r[3];
      if(!String(qty??'').trim() || !String(rawName??'').trim()) return;
      const item={vendor:vendorFor(vendorCode),name:cleanName(rawName),qty:String(qty).trim(),category,source:'별도주문',row:i+1};
      orders.push(item);
      if(category.includes('까는약')) peel.push({약품명:item.name,수량:item.qty});
      if(!validQty(qty)) issues.push({유형:'수량 확인',약품명:item.name,수량:item.qty,위치:`별도주문 ${i+1}행`});
    });
  }
  const boksi=wb.SheetNames.find(n=>n.includes('복시'));
  if(boksi){
    const rows=XLSX.utils.sheet_to_json(wb.Sheets[boksi],{header:1,defval:''});
    rows.forEach((r,i)=>{
      const vendorCode=String(r[2]??'').trim(); const rawName=r[3]; const qty=r[4];
      if(!String(qty??'').trim() || !String(rawName??'').trim()) return;
      const item={vendor:vendorFor(vendorCode),name:cleanName(rawName),qty:String(qty).trim(),category:'복시',source:'복시',row:i+1};
      orders.push(item);
      if(!validQty(qty)) issues.push({유형:'수량 확인',약품명:item.name,수량:item.qty,위치:`복시 ${i+1}행`});
    });
  }
  const dupMap={};
  orders.forEach(o=>{ const k=normalizeKey(o.name); (dupMap[k]??=[]).push(o); });
  Object.values(dupMap).filter(v=>v.length>1).forEach(v=>issues.push({
    유형:'중복 주문', 약품명:v[0].name, 수량:v.map(x=>x.qty).join(', '), 위치:v.map(x=>`${x.source} ${x.row}행`).join(' / ')
  }));
  if(!orders.length) throw new Error('주문수량이 입력된 품목을 찾지 못했습니다. 시트명과 열 구조를 확인해 주세요.');
  return {orders,issues,peel};
}

function Login(){
  const [email,setEmail]=useState(''); const [password,setPassword]=useState(''); const [msg,setMsg]=useState(''); const [busy,setBusy]=useState(false);
  async function login(){
    if(!supabase){ setMsg('Netlify 환경변수가 설정되지 않았습니다.'); return; }
    setBusy(true); setMsg('');
    const result=await supabase.auth.signInWithPassword({email,password});
    setBusy(false);
    setMsg(result.error ? result.error.message : '로그인되었습니다.');
  }
  return <div className="login"><div className="loginbox">
    <h1>PharmFlow</h1><p className="muted">약국 주문·품절 관리</p>
    <label className="label">이메일</label><input className="input" value={email} onChange={e=>setEmail(e.target.value)} type="email" autoComplete="username" />
    <div style={{height:12}}/><label className="label">비밀번호</label><input className="input" value={password} onChange={e=>setPassword(e.target.value)} type="password" autoComplete="current-password" onKeyDown={e=>e.key==='Enter'&&login()} />
    <div style={{height:14}}/><button className="btn" disabled={busy} onClick={login}>로그인</button>
    <p className="muted" style={{marginTop:14}}>직원 계정은 관리자가 직원 관리 화면에서 생성합니다.</p>
    {msg && <p className={msg.includes('되었습니다')?'success':'error'}>{msg}</p>}
  </div></div>;
}

function PendingApproval({session,profile}){
  return <div className="login"><div className="loginbox">
    <h2>관리자 승인 대기</h2>
    <p><b>{session.user.email}</b> 계정은 가입되었지만 아직 사용 승인이 되지 않았습니다.</p>
    <p className="muted">관리자가 직원 관리 화면에서 승인하면 주문·품절·이력 기능을 사용할 수 있습니다.</p>
    <button className="btn secondary" onClick={()=>supabase.auth.signOut()}>로그아웃</button>
    {!profile && <p className="muted">프로필 생성 중입니다. 잠시 후 새로고침해 주세요.</p>}
  </div></div>;
}

function App(){
  const [session,setSession]=useState(null); const [profile,setProfile]=useState(null); const [profileLoaded,setProfileLoaded]=useState(false);
  const [tab,setTab]=useState('주문'); const [parsed,setParsed]=useState(null); const [filename,setFilename]=useState(''); const [drag,setDrag]=useState(false); const fileRef=useRef(null);
  const [settings,setSettings]=useState({greeting:'안녕하세요.',ending:'확인 부탁드립니다.'}); const [contacts,setContacts]=useState({}); const [shortages,setShortages]=useState([]); const [history,setHistory]=useState([]); const [notice,setNotice]=useState('');

  useEffect(()=>{
    if(!supabase) return;
    supabase.auth.getSession().then(({data})=>setSession(data.session));
    const {data:{subscription}}=supabase.auth.onAuthStateChange((_e,s)=>setSession(s));
    return()=>subscription.unsubscribe();
  },[]);
  useEffect(()=>{ if(session) loadProfile(); else {setProfile(null);setProfileLoaded(true);} },[session]);
  useEffect(()=>{ if(profile?.is_active) loadCloud(); },[profile?.is_active]);

  async function loadProfile(){
    setProfileLoaded(false);
    const {data,error}=await supabase.from('staff_profiles').select('*').eq('id',session.user.id).maybeSingle();
    if(error) setNotice(error.message);
    setProfile(data||null); setProfileLoaded(true);
  }
  async function loadCloud(){
    const [s,c,sh]=await Promise.all([
      supabase.from('app_settings').select('*').eq('id',1).maybeSingle(),
      supabase.from('vendor_contacts').select('*'),
      supabase.from('shortage_items').select('*').eq('active',true).order('created_at',{ascending:false})
    ]);
    if(s.data) setSettings({greeting:s.data.greeting||'안녕하세요.',ending:s.data.ending||'확인 부탁드립니다.'});
    const cm={}; (c.data||[]).forEach(x=>cm[x.vendor]=x); setContacts(cm); setShortages(sh.data||[]);
  }
  const isAdmin=profile?.role==='admin';
  async function audit(action,targetType='',targetName='',details={}){
    if(!session || !profile?.is_active) return;
    await supabase.from('audit_logs').insert({actor_id:session.user.id,actor_email:session.user.email||'',action,target_type:targetType,target_name:targetName,details});
  }
  async function readFile(file){
    try{
      setNotice(''); const buf=await file.arrayBuffer(); const p=parseWorkbook(buf);
      const shortageKeys=new Map(shortages.map(x=>[normalizeKey(x.item_name),x]));
      p.orders.forEach(o=>{ const x=shortageKeys.get(normalizeKey(o.name)); if(x)p.issues.push({유형:'품절 주의',약품명:o.name,수량:o.qty,위치:x.note||x.status}); });
      setParsed(p); setFilename(file.name); setTab('주문'); await audit('주문서 분석','file',file.name,{items:p.orders.length});
    }catch(e){ setNotice(e.message); }
  }
  const grouped=useMemo(()=>{ const g={}; (parsed?.orders||[]).forEach(o=>(g[o.vendor]??=[]).push(o)); return g; },[parsed]);
  function messageFor(vendor){ const items=grouped[vendor]||[]; return `${settings.greeting}\n${todayText()} 주문 부탁드립니다.\n\n${items.map(x=>`${x.name} ${x.qty}`).join('\n')}\n\n총 ${items.length}품목입니다.\n${settings.ending}`; }
  async function copy(text){ await navigator.clipboard.writeText(text); setNotice('복사했습니다.'); }
  async function saveHistory(){
    if(!parsed)return;
    const {data:batch,error}=await supabase.from('order_batches').insert({order_date:isoDate(),file_name:filename,total_items:parsed.orders.length,created_by:session.user.id}).select().single();
    if(error){setNotice(error.message);return;}
    const rows=parsed.orders.map(o=>({batch_id:batch.id,vendor:o.vendor,item_name:o.name,quantity:o.qty,category:o.category,source_sheet:o.source,source_row:o.row}));
    const r=await supabase.from('order_items').insert(rows);
    setNotice(r.error?r.error.message:'오늘 주문이력을 저장했습니다.');
    if(!r.error) await audit('주문이력 저장','order_batch',String(batch.id),{file_name:filename,total_items:parsed.orders.length});
  }
  async function loadHistory(date){
    const {data:b,error}=await supabase.from('order_batches').select('id,order_date,file_name,created_at').eq('order_date',date).order('created_at',{ascending:false});
    if(error){setNotice(error.message);return;} if(!b?.length){setHistory([]);return;}
    const ids=b.map(x=>x.id); const {data:i}=await supabase.from('order_items').select('*').in('batch_id',ids).order('vendor').order('item_name'); setHistory(i||[]);
  }
  async function saveSettings(){
    if(!isAdmin){setNotice('관리자만 설정을 변경할 수 있습니다.');return;}
    const r=await supabase.from('app_settings').upsert({id:1,greeting:settings.greeting,ending:settings.ending,updated_by:session.user.id});
    setNotice(r.error?r.error.message:'설정을 저장했습니다.'); if(!r.error) await audit('설정 변경','app_settings','메시지 설정',settings);
  }
  async function saveContact(vendor,vals){
    if(!isAdmin){setNotice('관리자만 거래처 정보를 변경할 수 있습니다.');return;}
    const payload={vendor,contact_name:vals.contact_name||'',phone:vals.phone||'',order_deadline:vals.order_deadline||'',note:vals.note||'',updated_by:session.user.id,updated_at:new Date().toISOString()};
    const r=await supabase.from('vendor_contacts').upsert(payload,{onConflict:'vendor'});
    setNotice(r.error?r.error.message:'거래처 정보를 저장했습니다.'); if(!r.error) await audit('거래처 변경','vendor',vendor,vals); loadCloud();
  }
  async function addShortage(form){
    const payload={...form,expected_date:form.expected_date||null,active:true,created_by:session.user.id};
    const r=await supabase.from('shortage_items').insert(payload); setNotice(r.error?r.error.message:'품절약을 등록했습니다.');
    if(!r.error) await audit('품절 등록','shortage',form.item_name,{status:form.status,vendors_checked:form.vendors_checked}); loadCloud();
  }
  async function resolveShortage(id,itemName){
    const r=await supabase.from('shortage_items').update({active:false,resolved_at:new Date().toISOString()}).eq('id',id); setNotice(r.error?r.error.message:'공급재개 처리했습니다.');
    if(!r.error) await audit('공급재개','shortage',itemName); loadCloud();
  }

  if(!session) return <Login/>;
  if(!profileLoaded) return <div className="login"><div className="loginbox">계정 권한을 확인하고 있습니다.</div></div>;
  if(!profile?.is_active) return <PendingApproval session={session} profile={profile}/>;

  const nav=['주문','까는약','확인 필요','품절','주문 이력','거래처','설정',...(isAdmin?['직원 관리','로그']:[])];
  return <div className="app">
    <header className="topbar"><div className="brand">PharmFlow</div><div className="user"><span>{session.user.email} · {isAdmin?'관리자':'직원'}</span><button className="btn small secondary" onClick={()=>supabase.auth.signOut()}>로그아웃</button></div></header>
    <div className="layout"><aside className="sidebar">{nav.map(n=><button key={n} className={`navbtn ${tab===n?'active':''}`} onClick={()=>setTab(n)}>{n}</button>)}</aside>
      <main className="content">{notice&&<div className="card noticebar">{notice}</div>}
        {tab==='주문'&&<OrderView parsed={parsed} grouped={grouped} filename={filename} drag={drag} setDrag={setDrag} fileRef={fileRef} readFile={readFile} messageFor={messageFor} copy={copy} saveHistory={saveHistory}/>} 
        {tab==='까는약'&&<PeelView rows={parsed?.peel||[]}/>} 
        {tab==='확인 필요'&&<IssuesView rows={parsed?.issues||[]}/>} 
        {tab==='품절'&&<ShortageView rows={shortages} addShortage={addShortage} resolveShortage={resolveShortage}/>} 
        {tab==='주문 이력'&&<HistoryView history={history} loadHistory={loadHistory}/>} 
        {tab==='거래처'&&<ContactsView contacts={contacts} saveContact={saveContact} readOnly={!isAdmin}/>} 
        {tab==='설정'&&<SettingsView settings={settings} setSettings={setSettings} saveSettings={saveSettings} readOnly={!isAdmin}/>} 
        {tab==='직원 관리'&&isAdmin&&<StaffManagement currentUserId={session.user.id} audit={audit} setNotice={setNotice}/>} 
        {tab==='로그'&&isAdmin&&<AuditLogView setNotice={setNotice}/>} 
      </main>
    </div>
  </div>;
}

function OrderView({parsed,grouped,filename,drag,setDrag,fileRef,readFile,messageFor,copy,saveHistory}){
  const vendors=Object.keys(grouped);
  return <>
    <div className="card"><h2>주문 엑셀 업로드</h2><div className={`dropzone ${drag?'drag':''}`}
      onDragOver={e=>{e.preventDefault();setDrag(true);}} onDragLeave={()=>setDrag(false)} onDrop={e=>{e.preventDefault();setDrag(false);const f=e.dataTransfer.files[0];if(f)readFile(f);}} onClick={()=>fileRef.current.click()}>
      <strong>엑셀파일을 여기로 끌어다 놓으세요</strong><p className="muted">또는 클릭해서 파일을 선택하세요</p>
      <input ref={fileRef} type="file" accept=".xlsx,.xls" style={{display:'none'}} onChange={e=>e.target.files[0]&&readFile(e.target.files[0])}/>
    </div></div>
    {parsed&&<><div className="summary"><Metric label="파일" value={filename} small/><Metric label="총 품목" value={parsed.orders.length}/><Metric label="도매 수" value={vendors.length}/><Metric label="확인 필요" value={parsed.issues.length}/></div>
      <div className="row"><button className="btn" onClick={saveHistory}>오늘 주문이력 저장</button><button className="btn secondary" onClick={()=>downloadWorkbook(`${isoDate()}_전체주문.xlsx`,{전체주문:parsed.orders.map(o=>({주문처:o.vendor,약품명:o.name,수량:o.qty,구분:o.category})),...Object.fromEntries(vendors.map(v=>[v,grouped[v].map(o=>({약품명:o.name,수량:o.qty,구분:o.category}))])),까는약:parsed.peel,확인필요:parsed.issues})}>전체 주문 엑셀 다운로드</button></div>
      <div className="grid" style={{marginTop:16}}>{vendors.map(v=><div className="card" key={v}><h3>{v} · {grouped[v].length}품목</h3><div className="message">{messageFor(v)}</div><div className="actions" style={{marginTop:10}}><button className="btn small" onClick={()=>copy(messageFor(v))}>메시지 복사</button><button className="btn small secondary" onClick={()=>downloadWorkbook(`${isoDate()}_${v}.xlsx`,{[v]:grouped[v].map(o=>({약품명:o.name,수량:o.qty,구분:o.category}))})}>엑셀 다운로드</button></div></div>)}</div>
    </>}
  </>;
}
function Metric({label,value,small}){ return <div className="metric">{label}<b style={small?{fontSize:15}:undefined}>{value}</b></div>; }
function PeelView({rows}){return <div className="card"><h2>까는약</h2><div className="row"><button className="btn" disabled={!rows.length} onClick={()=>copyText(rows.map(x=>`${x.약품명} ${x.수량}`).join('\n'))}>목록 복사</button><button className="btn secondary" disabled={!rows.length} onClick={()=>downloadWorkbook(`${isoDate()}_까는약.xlsx`,{까는약:rows})}>엑셀 다운로드</button></div><SimpleTable rows={rows}/></div>;}
function IssuesView({rows}){return <div className="card"><h2>확인 필요</h2>{rows.length?<SimpleTable rows={rows}/>:<p className="muted">확인할 항목이 없습니다.</p>}</div>;}

function ShortageView({rows,addShortage,resolveShortage}){
  const [f,setF]=useState({item_name:'',status:'품절',vendors_checked:'',expected_date:'',note:''});
  async function submit(){ if(!f.item_name.trim())return; await addShortage(f); setF({item_name:'',status:'품절',vendors_checked:'',expected_date:'',note:''}); }
  return <><div className="card"><h2>품절약 등록</h2><div className="grid">
    <Field label="품목명"><input className="input" value={f.item_name} onChange={e=>setF({...f,item_name:e.target.value})}/></Field>
    <Field label="상태"><select className="select" value={f.status} onChange={e=>setF({...f,status:e.target.value})}><option>품절</option><option>일부 도매 가능</option><option>공급 지연</option></select></Field>
    <Field label="확인 도매"><input className="input" value={f.vendors_checked} onChange={e=>setF({...f,vendors_checked:e.target.value})}/></Field>
    <Field label="예상 공급일"><input className="input" type="date" value={f.expected_date} onChange={e=>setF({...f,expected_date:e.target.value})}/></Field>
    <Field label="메모"><input className="input" value={f.note} onChange={e=>setF({...f,note:e.target.value})}/></Field>
  </div><button className="btn" onClick={submit}>등록</button></div>
  <div className="card"><h2>현재 품절목록 {rows.length}건</h2><div className="tablewrap"><table className="table"><thead><tr>{['품목명','상태','확인 도매','예상 공급일','메모',''].map(x=><th key={x}>{x}</th>)}</tr></thead><tbody>{rows.map(r=><tr key={r.id}><td>{r.item_name}</td><td><span className="badge danger">{r.status}</span></td><td>{r.vendors_checked}</td><td>{r.expected_date||''}</td><td>{r.note||''}</td><td><button className="btn small secondary" onClick={()=>resolveShortage(r.id,r.item_name)}>공급재개</button></td></tr>)}</tbody></table></div></div></>;
}

function HistoryView({history,loadHistory}){
  const [date,setDate]=useState(isoDate()); const [q,setQ]=useState('');
  const filtered=history.filter(x=>!q||x.item_name.includes(q)||x.vendor.includes(q));
  const g=filtered.reduce((a,x)=>{(a[x.vendor]??=[]).push(x);return a;},{});
  return <div className="card"><h2>주문 이력</h2><div className="row"><input className="input compact" type="date" value={date} onChange={e=>setDate(e.target.value)}/><button className="btn" onClick={()=>loadHistory(date)}>조회</button><input className="input search" placeholder="도매 또는 품목 검색" value={q} onChange={e=>setQ(e.target.value)}/><button className="btn secondary" disabled={!filtered.length} onClick={()=>downloadWorkbook(`${date}_주문이력.xlsx`,{주문이력:filtered.map(x=>({주문처:x.vendor,약품명:x.item_name,수량:x.quantity,구분:x.category}))})}>조회결과 엑셀</button></div><div className="grid" style={{marginTop:16}}>{Object.entries(g).map(([v,items])=><div className="vendorcard" key={v}><h3>{v} · {items.length}품목</h3><SimpleTable rows={items.map(x=>({약품명:x.item_name,수량:x.quantity,구분:x.category}))}/></div>)}</div></div>;
}

function ContactsView({contacts,saveContact,readOnly}){
  return <><div className={`permission-banner ${readOnly?'readonly':''}`}>{readOnly?'직원 계정은 거래처 정보를 조회만 할 수 있습니다.':'관리자는 거래처 정보를 수정할 수 있습니다.'}</div><div className="grid">{VENDORS.map(v=><ContactCard key={v} vendor={v} data={contacts[v]||{}} saveContact={saveContact} readOnly={readOnly}/>)}</div></>;
}
function ContactCard({vendor,data,saveContact,readOnly}){
  const blank={contact_name:'',phone:'',order_deadline:'',note:''};
  const [f,setF]=useState({...blank,...data}); useEffect(()=>setF({...blank,...data}),[data]);
  const fields={contact_name:'담당자',phone:'휴대전화',order_deadline:'주문마감',note:'메모'};
  return <div className="vendorcard"><h3>{vendor}</h3>{Object.entries(fields).map(([k,l])=><div key={k} style={{marginBottom:8}}><label className="label">{l}</label><input className="input" value={f[k]||''} disabled={readOnly} onChange={e=>setF({...f,[k]:e.target.value})}/></div>)}{!readOnly&&<button className="btn small" onClick={()=>saveContact(vendor,f)}>저장</button>}</div>;
}
function SettingsView({settings,setSettings,saveSettings,readOnly}){
  return <div className="card"><h2>메시지 설정</h2>{readOnly&&<div className="permission-banner readonly">직원 계정은 설정을 조회만 할 수 있습니다.</div>}<Field label="첫 문장"><input className="input" value={settings.greeting} disabled={readOnly} onChange={e=>setSettings({...settings,greeting:e.target.value})}/></Field><Field label="끝 문장"><input className="input" value={settings.ending} disabled={readOnly} onChange={e=>setSettings({...settings,ending:e.target.value})}/></Field>{!readOnly&&<button className="btn" onClick={saveSettings}>저장</button>}</div>;
}

function StaffManagement({currentUserId,audit,setNotice}){
  const [rows,setRows]=useState([]); const [busy,setBusy]=useState(false);
  const [form,setForm]=useState({email:'',display_name:'',password:''});
  async function load(){ setBusy(true); const {data,error}=await supabase.from('staff_profiles').select('*').order('created_at'); setBusy(false); if(error)setNotice(error.message); else setRows(data||[]); }
  useEffect(()=>{load();},[]);
  async function createStaff(){
    if(!form.email.trim() || form.password.length<8){ setNotice('이메일과 8자 이상의 임시 비밀번호를 입력하세요.'); return; }
    setBusy(true);
    const {data:{session}}=await supabase.auth.getSession();
    try{
      const response=await fetch('/.netlify/functions/create-staff',{
        method:'POST',
        headers:{'Content-Type':'application/json',Authorization:`Bearer ${session?.access_token||''}`},
        body:JSON.stringify(form)
      });
      const result=await response.json();
      if(!response.ok) throw new Error(result.error||'직원 계정 생성에 실패했습니다.');
      setNotice(`${form.email} 직원 계정을 생성했습니다.`);
      setForm({email:'',display_name:'',password:''});
      await audit('직원 계정 생성','staff',form.email,{display_name:form.display_name});
      load();
    }catch(error){ setNotice(error.message); }
    finally{ setBusy(false); }
  }
  async function updateStaff(row,changes){
    if(row.id===currentUserId && (changes.role==='employee' || changes.is_active===false)){ setNotice('현재 로그인한 관리자 계정은 직접 권한을 낮추거나 비활성화할 수 없습니다.'); return; }
    const {error}=await supabase.from('staff_profiles').update({...changes,updated_at:new Date().toISOString()}).eq('id',row.id);
    if(error){setNotice(error.message);return;}
    await audit('직원 권한 변경','staff',row.email,changes); setNotice('직원 권한을 변경했습니다.'); load();
  }
  return <><div className="card"><h2>직원 계정 생성</h2><p className="muted">직원은 회원가입하지 않습니다. 관리자가 계정을 만들고 임시 비밀번호를 전달합니다.</p>
    <div className="grid">
      <Field label="이메일"><input className="input" type="email" value={form.email} onChange={e=>setForm({...form,email:e.target.value})}/></Field>
      <Field label="직원 이름"><input className="input" value={form.display_name} onChange={e=>setForm({...form,display_name:e.target.value})}/></Field>
      <Field label="임시 비밀번호"><input className="input" type="password" value={form.password} onChange={e=>setForm({...form,password:e.target.value})} placeholder="8자 이상"/></Field>
    </div><button className="btn" disabled={busy} onClick={createStaff}>직원 계정 만들기</button></div>
    <div className="card"><div className="row between"><div><h2>직원 관리</h2><p className="muted">직원 계정의 사용 여부와 권한을 관리합니다.</p></div><button className="btn secondary" onClick={load} disabled={busy}>새로고침</button></div>
    <div className="tablewrap"><table className="table"><thead><tr><th>이메일</th><th>이름</th><th>권한</th><th>상태</th><th>생성일</th><th>관리</th></tr></thead><tbody>{rows.map(r=><tr key={r.id}><td>{r.email}</td><td>{r.display_name||'-'}</td><td><span className={`badge ${r.role==='admin'?'admin':''}`}>{r.role==='admin'?'관리자':'직원'}</span></td><td><span className={`badge ${r.is_active?'ok':'warn'}`}>{r.is_active?'사용 중':'사용 중지'}</span></td><td>{formatDateTime(r.created_at)}</td><td><div className="actions"><button className="btn small" disabled={r.is_active} onClick={()=>updateStaff(r,{is_active:true})}>사용</button><button className="btn small secondary" disabled={!r.is_active||r.id===currentUserId} onClick={()=>updateStaff(r,{is_active:false})}>사용 중지</button><button className="btn small secondary" disabled={r.role==='admin'} onClick={()=>updateStaff(r,{role:'admin',is_active:true})}>관리자로</button><button className="btn small secondary" disabled={r.role==='employee'||r.id===currentUserId} onClick={()=>updateStaff(r,{role:'employee'})}>직원으로</button></div></td></tr>)}</tbody></table></div>
  </div></>;
}

function AuditLogView({setNotice}){
  const [rows,setRows]=useState([]); const [q,setQ]=useState('');
  async function load(){ const {data,error}=await supabase.from('audit_logs').select('*').order('created_at',{ascending:false}).limit(500); if(error)setNotice(error.message); else setRows(data||[]); }
  useEffect(()=>{load();},[]);
  const filtered=rows.filter(r=>!q||[r.actor_email,r.action,r.target_type,r.target_name,JSON.stringify(r.details)].some(v=>String(v||'').toLowerCase().includes(q.toLowerCase())));
  return <div className="card"><div className="row between"><div><h2>활동 로그</h2><p className="muted">누가 주문이력·품절·거래처·설정을 변경했는지 확인합니다.</p></div><button className="btn secondary" onClick={load}>새로고침</button></div><input className="input search" placeholder="이메일, 작업, 품목 검색" value={q} onChange={e=>setQ(e.target.value)}/><div className="tablewrap"><table className="table"><thead><tr><th>일시</th><th>사용자</th><th>작업</th><th>대상</th><th>상세</th></tr></thead><tbody>{filtered.map(r=><tr key={r.id}><td>{formatDateTime(r.created_at)}</td><td>{r.actor_email}</td><td>{r.action}</td><td>{[r.target_type,r.target_name].filter(Boolean).join(' · ')}</td><td className="details-cell">{JSON.stringify(r.details||{})}</td></tr>)}</tbody></table></div></div>;
}

function Field({label,children}){ return <div><label className="label">{label}</label>{children}</div>; }
function SimpleTable({rows}){
  if(!rows?.length) return <p className="muted">데이터가 없습니다.</p>;
  const cols=Object.keys(rows[0]);
  return <div className="tablewrap"><table className="table"><thead><tr>{cols.map(c=><th key={c}>{c}</th>)}</tr></thead><tbody>{rows.map((r,i)=><tr key={i}>{cols.map(c=><td key={c}>{String(r[c]??'')}</td>)}</tr>)}</tbody></table></div>;
}
async function copyText(t){ await navigator.clipboard.writeText(t); }

createRoot(document.getElementById('root')).render(<React.StrictMode><App/></React.StrictMode>);
