import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { createClient } from '@supabase/supabase-js';
import * as XLSX from 'xlsx';
import './styles.css';

const h = React.createElement;
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
const supabase = SUPABASE_URL && SUPABASE_KEY ? createClient(SUPABASE_URL, SUPABASE_KEY) : null;
const VENDORS = ['건화','하이스트','하은','호림','복산','지오영','백제','명인','인천','복시','고가'];
const CODE_MAP = {A:'건화','건':'건화','하이':'하이스트','하':'하은','호':'호림','복':'복산','영':'지오영',B:'백제',M:'명인','인':'인천','고가':'고가'};

function cleanName(name){
  return String(name ?? '').replace(/\s*\([^)]*\)\s*$/g,'').replace(/\s+/g,' ').trim();
}
function vendorFor(code){
  const key=String(code??'').trim();
  return CODE_MAP[key] || '복시';
}
function validQty(q){
  const s=String(q??'').trim();
  return !!s && (/^\*?\d+(?:\.\d+)?$/.test(s) || /^\d+(?:\.\d+)?\*\d+(?:\.\d+)?$/.test(s));
}
function todayText(){const d=new Date();return `${d.getMonth()+1}/${d.getDate()}`;}
function isoDate(){return new Date().toISOString().slice(0,10);}
function normalizeKey(s){return cleanName(s).toLowerCase().replace(/\s/g,'');}
function downloadWorkbook(filename, sheets){
  const wb=XLSX.utils.book_new();
  Object.entries(sheets).forEach(([name,rows])=>{const ws=XLSX.utils.json_to_sheet(rows);XLSX.utils.book_append_sheet(wb,ws,name.slice(0,31));});
  XLSX.writeFile(wb,filename);
}
function parseWorkbook(arrayBuffer){
  const wb=XLSX.read(arrayBuffer,{type:'array'});
  const orders=[]; const issues=[]; const peel=[];
  const separate=wb.SheetNames.find(n=>n.includes('별도주문'));
  if(separate){
    const rows=XLSX.utils.sheet_to_json(wb.Sheets[separate],{header:1,defval:''});
    rows.forEach((r,i)=>{
      const category=String(r[0]??'').trim(); const vendorCode=String(r[1]??'').trim(); const rawName=r[2]; const qty=r[3];
      if(!String(qty??'').trim() || !String(rawName??'').trim()) return;
      const item={vendor:vendorFor(vendorCode),name:cleanName(rawName),qty:String(qty).trim(),category,source:'별도주문',row:i+1};
      orders.push(item); if(category.includes('까는약')) peel.push({약품명:item.name,수량:item.qty}); if(!validQty(qty)) issues.push({유형:'수량 확인',약품명:item.name,수량:item.qty,위치:`별도주문 ${i+1}행`});
    });
  }
  const boksi=wb.SheetNames.find(n=>n.includes('복시'));
  if(boksi){
    const rows=XLSX.utils.sheet_to_json(wb.Sheets[boksi],{header:1,defval:''});
    rows.forEach((r,i)=>{
      const vendorCode=String(r[2]??'').trim(); const rawName=r[3]; const qty=r[4];
      if(!String(qty??'').trim() || !String(rawName??'').trim()) return;
      const item={vendor:vendorFor(vendorCode),name:cleanName(rawName),qty:String(qty).trim(),category:'복시',source:'복시',row:i+1};
      orders.push(item); if(!validQty(qty)) issues.push({유형:'수량 확인',약품명:item.name,수량:item.qty,위치:`복시 ${i+1}행`});
    });
  }
  const dupMap={}; orders.forEach(o=>{const k=normalizeKey(o.name);(dupMap[k]??=[]).push(o);});
  Object.values(dupMap).filter(v=>v.length>1).forEach(v=>issues.push({유형:'중복 주문',약품명:v[0].name,수량:v.map(x=>x.qty).join(', '),위치:v.map(x=>`${x.source} ${x.row}행`).join(' / ')}));
  if(!orders.length) throw new Error('주문수량이 입력된 품목을 찾지 못했습니다. 시트명과 열 구조를 확인해 주세요.');
  return {orders,issues,peel};
}

function Login(){
  const [email,setEmail]=useState(''); const [password,setPassword]=useState(''); const [msg,setMsg]=useState(''); const [busy,setBusy]=useState(false);
  async function act(type){if(!supabase){setMsg('Netlify 환경변수가 설정되지 않았습니다.');return;} setBusy(true);setMsg(''); const result=type==='login'?await supabase.auth.signInWithPassword({email,password}):await supabase.auth.signUp({email,password}); setBusy(false); setMsg(result.error?result.error.message:(type==='login'?'로그인되었습니다.':'회원가입되었습니다. 이메일 인증 설정에 따라 확인이 필요할 수 있습니다.'));}
  return h('div',{className:'login'},h('div',{className:'loginbox'},h('h1',null,'PharmFlow'),h('p',{className:'muted'},'약국 주문·품절 관리'),h('label',{className:'label'},'이메일'),h('input',{className:'input',value:email,onChange:e=>setEmail(e.target.value),type:'email'}),h('div',{style:{height:12}}),h('label',{className:'label'},'비밀번호'),h('input',{className:'input',value:password,onChange:e=>setPassword(e.target.value),type:'password'}),h('div',{style:{height:14}}),h('div',{className:'row'},h('button',{className:'btn',disabled:busy,onClick:()=>act('login')},'로그인'),h('button',{className:'btn secondary',disabled:busy,onClick:()=>act('signup')},'회원가입')),msg&&h('p',{className:msg.includes('되었습니다')?'success':'error'},msg)));
}

function App(){
  const [session,setSession]=useState(null); const [tab,setTab]=useState('주문'); const [parsed,setParsed]=useState(null); const [filename,setFilename]=useState(''); const [drag,setDrag]=useState(false); const fileRef=useRef(null);
  const [settings,setSettings]=useState({greeting:'안녕하세요.',ending:'확인 부탁드립니다.'}); const [contacts,setContacts]=useState({}); const [shortages,setShortages]=useState([]); const [history,setHistory]=useState([]); const [notice,setNotice]=useState('');
  useEffect(()=>{if(!supabase)return; supabase.auth.getSession().then(({data})=>setSession(data.session)); const {data:{subscription}}=supabase.auth.onAuthStateChange((_e,s)=>setSession(s)); return()=>subscription.unsubscribe();},[]);
  useEffect(()=>{if(session) loadCloud();},[session]);
  async function loadCloud(){
    const [s,c,sh]=await Promise.all([
      supabase.from('app_settings').select('*').eq('id',1).maybeSingle(),
      supabase.from('vendor_contacts').select('*'),
      supabase.from('shortage_items').select('*').eq('active',true).order('created_at',{ascending:false})
    ]);
    if(s.data) setSettings({greeting:s.data.greeting||'안녕하세요.',ending:s.data.ending||'확인 부탁드립니다.'});
    const cm={}; (c.data||[]).forEach(x=>cm[x.vendor]=x); setContacts(cm); setShortages(sh.data||[]);
  }
  async function readFile(file){try{setNotice(''); const buf=await file.arrayBuffer(); const p=parseWorkbook(buf); const shortageKeys=new Map(shortages.map(x=>[normalizeKey(x.item_name),x])); p.orders.forEach(o=>{const x=shortageKeys.get(normalizeKey(o.name)); if(x)p.issues.push({유형:'품절 주의',약품명:o.name,수량:o.qty,위치:x.note||x.status});}); setParsed(p);setFilename(file.name);setTab('주문');}catch(e){setNotice(e.message);}}
  const grouped=useMemo(()=>{const g={};(parsed?.orders||[]).forEach(o=>(g[o.vendor]??=[]).push(o));return g;},[parsed]);
  function messageFor(vendor){const items=grouped[vendor]||[];return `${settings.greeting}\n${todayText()} 주문 부탁드립니다.\n\n${items.map(x=>`${x.name} ${x.qty}`).join('\n')}\n\n총 ${items.length}품목입니다.\n${settings.ending}`;}
  async function copy(text){await navigator.clipboard.writeText(text);setNotice('복사했습니다.');}
  async function saveHistory(){if(!parsed)return; const {data:batch,error}=await supabase.from('order_batches').insert({order_date:isoDate(),file_name:filename,total_items:parsed.orders.length,created_by:session.user.id}).select().single(); if(error){setNotice(error.message);return;} const rows=parsed.orders.map(o=>({batch_id:batch.id,vendor:o.vendor,item_name:o.name,quantity:o.qty,category:o.category,source_sheet:o.source,source_row:o.row})); const r=await supabase.from('order_items').insert(rows); setNotice(r.error?r.error.message:'오늘 주문이력을 저장했습니다.');}
  async function loadHistory(date){const {data:b,error}=await supabase.from('order_batches').select('id,order_date,file_name,created_at').eq('order_date',date).order('created_at',{ascending:false}); if(error){setNotice(error.message);return;} if(!b?.length){setHistory([]);return;} const ids=b.map(x=>x.id); const {data:i}=await supabase.from('order_items').select('*').in('batch_id',ids).order('vendor').order('item_name'); setHistory(i||[]);}
  async function saveSettings(){const r=await supabase.from('app_settings').upsert({id:1,greeting:settings.greeting,ending:settings.ending,updated_by:session.user.id});setNotice(r.error?r.error.message:'설정을 저장했습니다.');}
  async function saveContact(vendor,vals){const r=await supabase.from('vendor_contacts').upsert({vendor,...vals,updated_by:session.user.id},{onConflict:'vendor'});setNotice(r.error?r.error.message:'거래처 정보를 저장했습니다.');loadCloud();}
  async function addShortage(form){const r=await supabase.from('shortage_items').insert({...form,active:true,created_by:session.user.id});setNotice(r.error?r.error.message:'품절약을 등록했습니다.');loadCloud();}
  async function resolveShortage(id){const r=await supabase.from('shortage_items').update({active:false,resolved_at:new Date().toISOString()}).eq('id',id);setNotice(r.error?r.error.message:'공급재개 처리했습니다.');loadCloud();}
  if(!session)return h(Login);
  const nav=['주문','까는약','확인 필요','품절','주문 이력','거래처','설정'];
  return h('div',{className:'app'},h('header',{className:'topbar'},h('div',{className:'brand'},'PharmFlow'),h('div',{className:'user'},h('span',null,session.user.email),h('button',{className:'btn small secondary',onClick:()=>supabase.auth.signOut()},'로그아웃'))),h('div',{className:'layout'},h('aside',{className:'sidebar'},...nav.map(n=>h('button',{key:n,className:`navbtn ${tab===n?'active':''}`,onClick:()=>setTab(n)},n))),h('main',{className:'content'},notice&&h('div',{className:'card'},notice),tab==='주문'&&h(OrderView,{parsed,grouped,filename,drag,setDrag,fileRef,readFile,messageFor,copy,saveHistory}),tab==='까는약'&&h(PeelView,{rows:parsed?.peel||[]}),tab==='확인 필요'&&h(IssuesView,{rows:parsed?.issues||[]}),tab==='품절'&&h(ShortageView,{rows:shortages,addShortage,resolveShortage}),tab==='주문 이력'&&h(HistoryView,{history,loadHistory}),tab==='거래처'&&h(ContactsView,{contacts,saveContact}),tab==='설정'&&h(SettingsView,{settings,setSettings,saveSettings}))));
}

function OrderView({parsed,grouped,filename,drag,setDrag,fileRef,readFile,messageFor,copy,saveHistory}){
  const vendors=Object.keys(grouped);
  return h(React.Fragment,null,h('div',{className:'card'},h('h2',null,'주문 엑셀 업로드'),h('div',{className:`dropzone ${drag?'drag':''}`,onDragOver:e=>{e.preventDefault();setDrag(true);},onDragLeave:()=>setDrag(false),onDrop:e=>{e.preventDefault();setDrag(false);const f=e.dataTransfer.files[0];if(f)readFile(f);},onClick:()=>fileRef.current.click()},h('strong',null,'엑셀파일을 여기로 끌어다 놓으세요'),h('p',{className:'muted'},'또는 클릭해서 파일을 선택하세요'),h('input',{ref:fileRef,type:'file',accept:'.xlsx,.xls',style:{display:'none'},onChange:e=>e.target.files[0]&&readFile(e.target.files[0])}))),parsed&&h(React.Fragment,null,h('div',{className:'summary'},h('div',{className:'metric'},'파일',h('b',{style:{fontSize:15}},filename)),h('div',{className:'metric'},'총 품목',h('b',null,parsed.orders.length)),h('div',{className:'metric'},'도매 수',h('b',null,vendors.length)),h('div',{className:'metric'},'확인 필요',h('b',null,parsed.issues.length))),h('div',{className:'row'},h('button',{className:'btn',onClick:saveHistory},'오늘 주문이력 저장'),h('button',{className:'btn secondary',onClick:()=>downloadWorkbook(`${isoDate()}_전체주문.xlsx`,{전체주문:parsed.orders.map(o=>({주문처:o.vendor,약품명:o.name,수량:o.qty,구분:o.category})),...Object.fromEntries(vendors.map(v=>[v,grouped[v].map(o=>({약품명:o.name,수량:o.qty,구분:o.category}))])),까는약:parsed.peel,'확인필요':parsed.issues})},'전체 주문 엑셀 다운로드')),h('div',{className:'grid',style:{marginTop:16}},...vendors.map(v=>h('div',{className:'card',key:v},h('h3',null,`${v} · ${grouped[v].length}품목`),h('div',{className:'message'},messageFor(v)),h('div',{className:'actions',style:{marginTop:10}},h('button',{className:'btn small',onClick:()=>copy(messageFor(v))},'메시지 복사'),h('button',{className:'btn small secondary',onClick:()=>downloadWorkbook(`${isoDate()}_${v}.xlsx`,{[v]:grouped[v].map(o=>({약품명:o.name,수량:o.qty,구분:o.category}))})},'엑셀 다운로드')))))));
}
function PeelView({rows}){return h('div',{className:'card'},h('h2',null,'까는약'),h('div',{className:'row'},h('button',{className:'btn',disabled:!rows.length,onClick:()=>copyText(rows.map(x=>`${x.약품명} ${x.수량}`).join('\n'))},'목록 복사'),h('button',{className:'btn secondary',disabled:!rows.length,onClick:()=>downloadWorkbook(`${isoDate()}_까는약.xlsx`,{까는약:rows})},'엑셀 다운로드')),h(SimpleTable,{rows}));}
function IssuesView({rows}){return h('div',{className:'card'},h('h2',null,'확인 필요'),rows.length?h(SimpleTable,{rows}):h('p',{className:'muted'},'확인할 항목이 없습니다.'));}
function ShortageView({rows,addShortage,resolveShortage}) {
  const [f,setF]=useState({item_name:'',status:'품절',vendors_checked:'',expected_date:'',note:''});
  const formCard = h('div',{className:'card'},
    h('h2',null,'품절약 등록'),
    h('div',{className:'grid'},
      Field('품목명',h('input',{className:'input',value:f.item_name,onChange:e=>setF({...f,item_name:e.target.value})})),
      Field('상태',h('select',{className:'select',value:f.status,onChange:e=>setF({...f,status:e.target.value})},
        h('option',null,'품절'),h('option',null,'일부 도매 가능'),h('option',null,'공급 지연'))),
      Field('확인 도매',h('input',{className:'input',value:f.vendors_checked,onChange:e=>setF({...f,vendors_checked:e.target.value})})),
      Field('예상 공급일',h('input',{className:'input',type:'date',value:f.expected_date,onChange:e=>setF({...f,expected_date:e.target.value})})),
      Field('메모',h('input',{className:'input',value:f.note,onChange:e=>setF({...f,note:e.target.value})}))
    ),
    h('button',{className:'btn',onClick:()=>f.item_name&&addShortage(f)},'등록')
  );
  const header = h('thead',null,h('tr',null,...['품목명','상태','확인 도매','예상 공급일','메모',''].map(x=>h('th',{key:x},x))));
  const body = h('tbody',null,...rows.map(r=>h('tr',{key:r.id},
    h('td',null,r.item_name),
    h('td',null,h('span',{className:'badge danger'},r.status)),
    h('td',null,r.vendors_checked),
    h('td',null,r.expected_date||''),
    h('td',null,r.note||''),
    h('td',null,h('button',{className:'btn small secondary',onClick:()=>resolveShortage(r.id)},'공급재개'))
  )));
  const listCard = h('div',{className:'card'},
    h('h2',null,`현재 품절목록 ${rows.length}건`),
    h('div',{className:'tablewrap'},h('table',{className:'table'},header,body))
  );
  return h(React.Fragment,null,formCard,listCard);
}
function HistoryView({history,loadHistory}){const [date,setDate]=useState(isoDate());const [q,setQ]=useState('');const filtered=history.filter(x=>!q||x.item_name.includes(q)||x.vendor.includes(q));const g=filtered.reduce((a,x)=>{(a[x.vendor]??=[]).push(x);return a;},{});return h('div',{className:'card'},h('h2',null,'주문 이력'),h('div',{className:'row'},h('input',{className:'input',style:{maxWidth:190},type:'date',value:date,onChange:e=>setDate(e.target.value)}),h('button',{className:'btn',onClick:()=>loadHistory(date)},'조회'),h('input',{className:'input',style:{maxWidth:260},placeholder:'도매 또는 품목 검색',value:q,onChange:e=>setQ(e.target.value)}),h('button',{className:'btn secondary',disabled:!filtered.length,onClick:()=>downloadWorkbook(`${date}_주문이력.xlsx`,{주문이력:filtered.map(x=>({주문처:x.vendor,약품명:x.item_name,수량:x.quantity,구분:x.category}))})},'조회결과 엑셀')),h('div',{className:'grid',style:{marginTop:16}},...Object.entries(g).map(([v,items])=>h('div',{className:'vendorcard',key:v},h('h3',null,`${v} · ${items.length}품목`),h(SimpleTable,{rows:items.map(x=>({약품명:x.item_name,수량:x.quantity,구분:x.category}))})))));}
function ContactsView({contacts,saveContact}){return h('div',{className:'grid'},...VENDORS.map(v=>h(ContactCard,{key:v,vendor:v,data:contacts[v]||{},saveContact})));}
function ContactCard({vendor,data,saveContact}){const [f,setF]=useState({contact_name:data.contact_name||'',phone:data.phone||'',office_phone:data.office_phone||'',website:data.website||'',order_method:data.order_method||'카카오톡',order_deadline:data.order_deadline||'',note:data.note||''});useEffect(()=>setF({contact_name:data.contact_name||'',phone:data.phone||'',office_phone:data.office_phone||'',website:data.website||'',order_method:data.order_method||'카카오톡',order_deadline:data.order_deadline||'',note:data.note||''}),[data]);return h('div',{className:'vendorcard'},h('h3',null,vendor),...Object.entries({contact_name:'담당자',phone:'휴대전화',office_phone:'사무실 전화',website:'홈페이지',order_method:'주문방법',order_deadline:'주문마감',note:'메모'}).map(([k,l])=>h('div',{key:k,style:{marginBottom:8}},h('label',{className:'label'},l),h('input',{className:'input',value:f[k],onChange:e=>setF({...f,[k]:e.target.value})}))),h('button',{className:'btn small',onClick:()=>saveContact(vendor,f)},'저장'));}
function SettingsView({settings,setSettings,saveSettings}){return h('div',{className:'card'},h('h2',null,'메시지 설정'),Field('첫 문장',h('input',{className:'input',value:settings.greeting,onChange:e=>setSettings({...settings,greeting:e.target.value})})),Field('끝 문장',h('input',{className:'input',value:settings.ending,onChange:e=>setSettings({...settings,ending:e.target.value})})),h('button',{className:'btn',onClick:saveSettings},'저장'));}
function Field(label,node){return h('div',null,h('label',{className:'label'},label),node);}
function SimpleTable({rows}) {
  if (!rows?.length) return h('p',{className:'muted'},'데이터가 없습니다.');
  const cols=Object.keys(rows[0]);
  const head=h('thead',null,h('tr',null,...cols.map(c=>h('th',{key:c},c))));
  const body=h('tbody',null,...rows.map((r,i)=>h('tr',{key:i},...cols.map(c=>h('td',{key:c},String(r[c]??''))))));
  return h('div',{className:'tablewrap'},h('table',{className:'table'},head,body));
}
async function copyText(t){await navigator.clipboard.writeText(t);}

createRoot(document.getElementById('root')).render(h(React.StrictMode,null,h(App)));
