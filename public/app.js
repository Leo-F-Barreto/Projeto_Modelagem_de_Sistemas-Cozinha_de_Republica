(() => {
  const $ = (s, root=document) => root.querySelector(s);
  const $$ = (s, root=document) => [...root.querySelectorAll(s)];
  const today = new Date(); today.setHours(0,0,0,0);
  const dayISO = (offset=0) => { const d = new Date(today); d.setDate(d.getDate()+offset); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; };
  const fmtDate = value => value ? new Date(`${value}T12:00:00`).toLocaleDateString('pt-BR',{day:'2-digit',month:'short'}) : 'Sem validade';
  const fmtMoney = cents => (cents/100).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
  const people = [
    {id:1,name:'Kauê Stang',initials:'K',role:'Administrador',email:'kaue@rep-ipê.demo',active:true},
    {id:2,name:'Ana Martins',initials:'A',role:'Moradora',email:'ana@rep-ipê.demo',active:true},
    {id:3,name:'Bruno Lima',initials:'B',role:'Morador',email:'bruno@rep-ipê.demo',active:true},
    {id:4,name:'Júlia Reis',initials:'J',role:'Moradora',email:'julia@rep-ipê.demo',active:true}
  ];
  const seed = {
    items:[
      {id:1,name:'Leite integral',emoji:'🥛',quantity:2,unit:'L',classification:'COLETIVO',owner:1,location:'Geladeira · prateleira do meio',expiry:dayISO(2),min:3},
      {id:2,name:'Ovos caipiras',emoji:'🥚',quantity:8,unit:'un.',classification:'COLETIVO',owner:1,location:'Geladeira · gaveta inferior',expiry:dayISO(1),min:6},
      {id:3,name:'Tomate italiano',emoji:'🍅',quantity:4,unit:'un.',classification:'COLETIVO',owner:2,location:'Fruteira · cesto da frente',expiry:dayISO(3),min:4},
      {id:4,name:'Arroz branco',emoji:'🍚',quantity:1,unit:'kg',classification:'COLETIVO',owner:3,location:'Armário 2 · prateleira 1',expiry:null,min:2},
      {id:5,name:'Iogurte natural',emoji:'🥣',quantity:6,unit:'un.',classification:'COLETIVO',owner:2,location:'Geladeira · prateleira superior',expiry:dayISO(6),min:3},
      {id:6,name:'Pasta de amendoim',emoji:'🥜',quantity:1,unit:'un.',classification:'INDIVIDUAL',owner:4,location:'Armário 1 · cesta da Júlia',expiry:dayISO(60),min:0},
      {id:7,name:'Café em pó',emoji:'☕',quantity:2,unit:'pacotes',classification:'COLETIVO',owner:1,location:'Armário 2 · prateleira 2',expiry:dayISO(25),min:1}
    ],
    shopping:[
      {id:1,name:'Arroz branco',quantity:1,unit:'kg',origin:'AUTO',status:'PENDENTE',productId:4},
      {id:2,name:'Leite integral',quantity:1,unit:'L',origin:'AUTO',status:'PENDENTE',productId:1},
      {id:3,name:'Detergente neutro',quantity:2,unit:'un.',origin:'MANUAL',status:'PENDENTE'}
    ],
    expenses:[
      {id:1,description:'Compra da feira',amountCents:8640,payer:2,date:dayISO(-3)},
      {id:2,description:'Produtos de limpeza',amountCents:4280,payer:3,date:dayISO(-6)},
      {id:3,description:'Pães e frios',amountCents:3250,payer:1,date:dayISO(-8)}
    ],
    tasks:[
      {id:1,title:'Limpar a bancada e o fogão',type:'Limpeza',date:dayISO(0),owner:2,done:false},
      {id:2,title:'Preparar jantar coletivo',type:'Cozinha',date:dayISO(0),owner:3,done:false},
      {id:3,title:'Lavar e guardar a louça',type:'Limpeza',date:dayISO(1),owner:4,done:false},
      {id:4,title:'Limpar a geladeira',type:'Limpeza',date:dayISO(2),owner:1,done:false},
      {id:5,title:'Organizar a despensa',type:'Organização',date:dayISO(3),owner:2,done:true},
      {id:6,title:'Preparar almoço de sábado',type:'Cozinha',date:dayISO(4),owner:3,done:false},
      {id:7,title:'Higienizar a pia',type:'Limpeza',date:dayISO(5),owner:4,done:false}
    ],
    nextId:20
  };
  let state;
  try { const saved = localStorage.getItem('cochef-demo-v1'); state = saved ? {...seed,...JSON.parse(saved)} : seed; } catch { state = seed; }
  const persist = () => { try { localStorage.setItem('cochef-demo-v1',JSON.stringify(state)); } catch {} };
  const person = id => people.find(p=>p.id===Number(id)) || people[0];
  const daysToExpiry = value => { if(!value) return null; const d=new Date(`${value}T00:00:00`); return Math.round((d-today)/86400000); };
  const statusOf = item => { if(item.quantity<=0) return {label:'Esgotado',cls:'neutral'}; const days=daysToExpiry(item.expiry); if(days!==null && days<0) return {label:'Vencido',cls:'critical'}; if(days!==null&&days<=3) return {label:'Validade crítica',cls:'critical'}; if(item.classification==='COLETIVO'&&item.min>0&&item.quantity<=item.min) return {label:'Estoque baixo',cls:'warning'}; return {label:'Em dia',cls:'ok'}; };
  const activeItems = () => state.items.filter(i=>i.quantity>0 && !(daysToExpiry(i.expiry)<0));
  function syncAutomaticShopping(){
    state.items.filter(i=>i.classification==='COLETIVO'&&i.min>0).forEach(i=>{
      const needed=Math.max(0,Math.ceil(i.min-i.quantity)); let line=state.shopping.find(s=>s.origin==='AUTO'&&s.productId===i.id&&s.status==='PENDENTE');
      if(needed>0){ if(line) line.quantity=needed; else state.shopping.push({id:state.nextId++,name:i.name,quantity:needed,unit:i.unit,origin:'AUTO',status:'PENDENTE',productId:i.id}); }
      else if(line){state.shopping=state.shopping.filter(s=>s.id!==line.id);}
    });
  }
  function calculateBalances(){
    const balances=new Map(people.filter(p=>p.active).map(p=>[p.id,0]));
    state.expenses.forEach(e=>{const ids=[...balances.keys()].sort((a,b)=>a-b); if(!ids.length)return; const base=Math.floor(e.amountCents/ids.length); let remainder=e.amountCents-base*ids.length; ids.forEach(id=>{let share=base;if(id===e.payer)share+=remainder;balances.set(id,(balances.get(id)||0)+(id===e.payer?e.amountCents:0)-share);});});
    return balances;
  }
  function transfers(){
    const b=calculateBalances(); let debtors=[...b].filter(([,v])=>v<0).map(([id,v])=>({id,amount:-v})); let creditors=[...b].filter(([,v])=>v>0).map(([id,v])=>({id,amount:v})); const out=[]; let i=0,j=0;
    while(i<debtors.length&&j<creditors.length){const amount=Math.min(debtors[i].amount,creditors[j].amount); if(amount>0)out.push({from:debtors[i].id,to:creditors[j].id,amount});debtors[i].amount-=amount;creditors[j].amount-=amount;if(debtors[i].amount===0)i++;if(creditors[j].amount===0)j++;}
    return out;
  }
  function toast(message){const el=$('#toast');el.textContent=message;el.classList.add('show');clearTimeout(toast.timer);toast.timer=setTimeout(()=>el.classList.remove('show'),3000);}
  const escapeHtml = value => String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const emojiFor = name => { const n=name.toLowerCase(); if(n.includes('leite')||n.includes('iogurte'))return '🥛';if(n.includes('ovo'))return '🥚';if(n.includes('arroz'))return '🍚';if(n.includes('tomate'))return '🍅';if(n.includes('café'))return '☕';if(n.includes('detergente')||n.includes('limpeza'))return '🧽';if(n.includes('pão'))return '🥖';return '🛒'; };
  function useView(name){
    $$('.view').forEach(v=>v.classList.toggle('active',v.id===`view-${name}`));
    $$('#navigation button').forEach(b=>b.classList.toggle('active',b.dataset.view===name));
    const labels={dashboard:['QUINTA-FEIRA, CASA ORGANIZADA','Visão geral'],stock:['INVENTÁRIO COMPARTILHADO','Estoque da cozinha'],shopping:['TODO MUNDO PARTICIPA','Lista de compras'],finance:['TRANSPARÊNCIA SEM ATRITO','Financeiro da república'],schedule:['DIVIDINDO A ROTINA','Escala da casa'],people:['A CASA É DE TODO MUNDO','Moradores']};
    $('#page-eyebrow').textContent=labels[name][0];$('#page-title').textContent=labels[name][1]; window.scrollTo({top:0,behavior:'smooth'});
    renderAll();
  }
  function itemStatusPill(item){const s=statusOf(item);return `<span class="pill ${s.cls}">${s.label}</span>`;}
  function renderStats(){
    const available=activeItems();const critical=available.filter(i=>daysToExpiry(i.expiry)!==null&&daysToExpiry(i.expiry)>=0&&daysToExpiry(i.expiry)<=3);
    const pending=state.shopping.filter(s=>s.status==='PENDENTE');const balances=calculateBalances();
    $('#stat-stock').textContent=available.length;$('#stat-expiry').textContent=critical.length;$('#stat-shopping').textContent=pending.length;
    const total=state.expenses.reduce((s,e)=>s+e.amountCents,0);$('#stat-balance').textContent=fmtMoney(total).replace(/,00$/,'');
    $('#nav-stock-count').textContent=available.length;$('#nav-shopping-count').textContent=pending.length;
    $('#shopping-pending-count').textContent=pending.length;$('#shopping-bought-count').textContent=state.shopping.filter(s=>s.status==='COMPRADO').length;
    $('#finance-total').textContent=fmtMoney(total);
    $('#tasks-today').textContent=state.tasks.filter(t=>t.date===dayISO(0)&&!t.done).length;$('#tasks-done').textContent=state.tasks.filter(t=>t.done).length;
  }
  function renderDashboard(){
    const alerts=activeItems().filter(i=>{const d=daysToExpiry(i.expiry);return d!==null&&d>=0&&d<=3;}).sort((a,b)=>daysToExpiry(a.expiry)-daysToExpiry(b.expiry));
    $('#dashboard-alerts').innerHTML=alerts.length?alerts.slice(0,4).map(i=>{const d=daysToExpiry(i.expiry);return `<div class="alert"><div class="alert-icon">${i.emoji||emojiFor(i.name)}</div><div class="alert-info"><div class="alert-name">${escapeHtml(i.name)}</div><div class="alert-detail">${escapeHtml(i.location)} · ${d===0?'vence hoje':d===1?'vence amanhã':`vence em ${d} dias`}</div></div><span class="pill ${d<=1?'critical':'warning'}">${d<=1?'Urgente':'Atenção'}</span></div>`;}).join(''):'<div class="empty">Nenhum item na janela crítica de validade. 🌿</div>';
    const tasks=state.tasks.filter(t=>!t.done).sort((a,b)=>a.date.localeCompare(b.date)).slice(0,4);
    $('#dashboard-tasks').innerHTML=tasks.length?tasks.map(t=>`<div class="task"><input class="check" type="checkbox" data-task-check="${t.id}" aria-label="Concluir ${escapeHtml(t.title)}"><div class="task-copy"><div class="task-name">${escapeHtml(t.title)}</div><div class="task-meta">${t.date===dayISO(0)?'Hoje':fmtDate(t.date)} · ${escapeHtml(person(t.owner).name)}</div></div><span class="task-owner">${escapeHtml(t.type)}</span></div>`).join(''):'<div class="empty">Tudo em dia por aqui.</div>';
    const lows=state.items.filter(i=>i.classification==='COLETIVO'&&i.min>0&&i.quantity<=i.min&&i.quantity>0);
    $('#dashboard-low-stock').innerHTML=lows.length?lows.slice(0,4).map(i=>`<div class="stock-line"><div class="item-main"><div class="item-emoji">${i.emoji||emojiFor(i.name)}</div><div style="min-width:0"><div class="item-name">${escapeHtml(i.name)}</div><div class="item-loc">Mínimo ${i.min} ${escapeHtml(i.unit)}</div></div></div><div><div class="quantity">${i.quantity} ${escapeHtml(i.unit)}</div><div class="progress"><span style="width:${Math.max(4,Math.min(100,i.quantity/Math.max(1,i.min)*100))}%"></span></div></div><span class="pill warning">Repor</span></div>`).join(''):'<div class="empty">Nenhum item abaixo do mínimo. ✨</div>';
  }
  function renderStock(){
    const q=($('#stock-search')?.value||'').trim().toLowerCase();const f=$('#stock-filter')?.value||'TODOS';
    let items=[...state.items].sort((a,b)=>a.name.localeCompare(b.name,'pt-BR'));
    items=items.filter(i=>{const match=`${i.name} ${i.location} ${person(i.owner).name}`.toLowerCase().includes(q);const s=statusOf(i);return match&&(f==='TODOS'||(f==='COLETIVO'&&i.classification==='COLETIVO')||(f==='INDIVIDUAL'&&i.classification==='INDIVIDUAL')||(f==='ATENCAO'&&s.label==='Validade crítica')||(f==='BAIXO'&&['Estoque baixo','Esgotado'].includes(s.label)));});
    $('#stock-table').innerHTML=items.map(i=>`<tr><td><div class="cell-product"><div class="item-emoji">${i.emoji||emojiFor(i.name)}</div><div><div class="item-name">${escapeHtml(i.name)}</div><div class="item-loc">⌖ ${escapeHtml(i.location)}</div></div></div></td><td><div>${i.classification==='COLETIVO'?'<span class="pill ok">Coletivo</span>':'<span class="pill neutral">Individual</span>'}</div><div class="owner-label">${i.classification==='INDIVIDUAL'?'Dono: ': 'Cadastrado por: '}${escapeHtml(person(i.owner).name)}</div></td><td><strong>${i.quantity}</strong> ${escapeHtml(i.unit)}${i.classification==='COLETIVO'&&i.min>0?`<div class="small-muted">Mínimo ${i.min}</div>`:''}</td><td>${fmtDate(i.expiry)}</td><td>${itemStatusPill(i)}</td><td><div class="actions-cell"><button class="icon-action" data-consume="${i.id}" ${i.quantity<=0||daysToExpiry(i.expiry)<0?'disabled':''} title="Registrar consumo">− Baixar</button></div></td></tr>`).join('');
    $('#stock-empty').hidden=items.length>0;
  }
  function renderShopping(){
    const f=$('#shopping-filter')?.value||'PENDENTE';let list=[...state.shopping].filter(s=>f==='TODOS'||s.status===f).sort((a,b)=>(a.status==='PENDENTE'?-1:1)-(b.status==='PENDENTE'?-1:1));
    $('#shopping-list').innerHTML=list.length?list.map(s=>`<div class="shopping-item ${s.status==='COMPRADO'?'purchased':''}"><div class="item-emoji">${emojiFor(s.name)}</div><div class="shopping-copy"><div class="shopping-title">${escapeHtml(s.name)}</div><div class="shopping-meta">${s.origin==='AUTO'?'↻ Reposição automática':'＋ Adicionado manualmente'} · ${s.status==='COMPRADO'?'Compra marcada':'Pendente'}</div></div><div class="shopping-qty">${s.quantity} ${escapeHtml(s.unit)}</div>${s.status==='PENDENTE'?`<button class="btn btn-light btn-small" data-bought="${s.id}">✓ Comprado</button>`:`<button class="btn btn-outline btn-small" data-expense-from-shopping="${s.id}">Registrar nota</button>`}${s.origin==='MANUAL'&&s.status==='PENDENTE'?`<button class="icon-action" data-remove-shopping="${s.id}" aria-label="Remover ${escapeHtml(s.name)}">×</button>`:''}</div>`).join(''):'<div class="empty">Essa lista está vazia. Adicione um item ou aguarde uma sugestão automática.</div>';
  }
  function renderFinance(){
    const balances=calculateBalances();
    $('#balance-list').innerHTML=[...balances].map(([id,value])=>`<div class="balance-row"><div class="avatar" style="width:34px;height:34px;font-size:11px">${person(id).initials}</div><div class="balance-name">${escapeHtml(person(id).name)}</div><div class="balance-value ${value>0?'positive':value<0?'negative':''}">${value>0?'+':''}${fmtMoney(value)}</div></div>`).join('');
    $('#expense-list').innerHTML=state.expenses.length?[...state.expenses].sort((a,b)=>b.date.localeCompare(a.date)).slice(0,6).map(e=>`<div class="expense-row"><div><div class="expense-name">${escapeHtml(e.description)}</div><div class="expense-meta">${fmtDate(e.date)} · Pago por ${escapeHtml(person(e.payer).name)}</div></div><div class="expense-value">${fmtMoney(e.amountCents)}</div></div>`).join(''):'<div class="empty">Nenhuma compra registrada.</div>';
    const ts=transfers();$('#transfers-list').innerHTML=ts.length?ts.map(t=>`<div class="transfer-row"><span style="font-weight:750">${escapeHtml(person(t.from).name.split(' ')[0])}</span><span class="transfer-arrow">→</span><span style="font-weight:750">${escapeHtml(person(t.to).name.split(' ')[0])}</span><span class="transfer-amount">${fmtMoney(t.amount)}</span></div>`).join(''):'<div class="empty">Todos os saldos estão zerados. 🎉</div>';
  }
  function renderSchedule(){
    const names=['Dom','Seg','Ter','Qua','Qui','Sex','Sáb'];const days=Array.from({length:7},(_,n)=>new Date(today.getFullYear(),today.getMonth(),today.getDate()+n));
    $('#schedule-grid').innerHTML=days.map(d=>{const iso=dayISO(Math.round((d-today)/86400000));const tasks=state.tasks.filter(t=>t.date===iso);return `<div class="day-card ${iso===dayISO(0)?'today':''}"><div class="day-label">${names[d.getDay()]}</div><div class="day-number">${d.getDate()}</div>${tasks.length?tasks.map(t=>`<div class="day-task">${escapeHtml(t.title)}</div><div class="day-owner">${escapeHtml(person(t.owner).name.split(' ')[0])}</div><span class="day-type">${escapeHtml(t.type)}</span>`).join('<div style="height:8px"></div>'):'<div class="small-muted">Sem tarefa</div>'}</div>`;}).join('');
    $('#full-task-list').innerHTML=[...state.tasks].sort((a,b)=>a.date.localeCompare(b.date)).map(t=>`<div class="task ${t.done?'done':''}"><input class="check" type="checkbox" data-task-check="${t.id}" ${t.done?'checked':''} aria-label="${t.done?'Reabrir':'Concluir'} ${escapeHtml(t.title)}"><div class="task-copy"><div class="task-name">${escapeHtml(t.title)}</div><div class="task-meta">${fmtDate(t.date)} · ${escapeHtml(person(t.owner).name)}</div></div><span class="task-owner">${escapeHtml(t.type)}</span><button class="text-link" data-swap="${t.id}">Pedir troca</button></div>`).join('');
  }
  function renderPeople(){
    $('#people-grid').innerHTML=people.map(p=>`<article class="person-card"><div class="person-card-head"><div class="avatar">${p.initials}</div><div><div class="person-card-name">${escapeHtml(p.name)}</div><div class="person-card-mail">${escapeHtml(p.email)}</div></div></div><div style="margin-top:12px"><span class="pill ${p.role==='Administrador'?'ok':'neutral'}">${p.role}</span> <span class="pill ok">Ativo</span></div><div class="person-details"><span class="small-muted">Saldo atual</span><strong class="${(calculateBalances().get(p.id)||0)>0?'positive':(calculateBalances().get(p.id)||0)<0?'negative':''}">${fmtMoney(calculateBalances().get(p.id)||0)}</strong></div></article>`).join('');
  }
  function renderAll(){ syncAutomaticShopping();persist();renderStats();renderDashboard();renderStock();renderShopping();renderFinance();renderSchedule();renderPeople(); }
  function openModal(id){const m=$(`#${id}`);if(m){m.classList.add('open');const first=$('input:not([type="hidden"]),select',m);setTimeout(()=>first?.focus(),40);}}
  function closeModal(el){el.closest('.modal-backdrop')?.classList.remove('open');}
  $$('#navigation button').forEach(b=>b.addEventListener('click',()=>useView(b.dataset.view)));
  document.addEventListener('click',e=>{
    const go=e.target.closest('[data-go-view]');if(go)useView(go.dataset.goView);
    const open=e.target.closest('[data-open-modal]');if(open){if(open.dataset.openModal==='item-modal'){ $('#item-owner').innerHTML=people.map(p=>`<option value="${p.id}">${escapeHtml(p.name)}</option>`).join('');$('#item-class').dispatchEvent(new Event('change'));}if(open.dataset.openModal==='expense-modal'){ $('#expense-payer').innerHTML=people.filter(p=>p.active).map(p=>`<option value="${p.id}">${escapeHtml(p.name)}</option>`).join('');$('#expense-date').value=dayISO(0);}openModal(open.dataset.openModal);}
    const close=e.target.closest('[data-close-modal]');if(close)closeModal(close);
    const consume=e.target.closest('[data-consume]');if(consume){const item=state.items.find(i=>i.id===Number(consume.dataset.consume));if(!item)return;if(item.classification==='INDIVIDUAL'&&item.owner!==1){toast('Este item pertence a '+person(item.owner).name+'.');return;}const amount=Number(prompt(`Quanto de ${item.name} foi consumido?\nDisponível: ${item.quantity} ${item.unit}`, '1'));if(!Number.isFinite(amount)||amount<=0)return;if(amount>item.quantity){toast('Quantidade maior que o estoque disponível.');return;}item.quantity=Math.round((item.quantity-amount)*100)/100;renderAll();toast(`Baixa registrada: ${amount} ${item.unit} de ${item.name}.`);}
    const bought=e.target.closest('[data-bought]');if(bought){const s=state.shopping.find(x=>x.id===Number(bought.dataset.bought));if(s){s.status='COMPRADO';renderAll();toast('Item marcado como comprado. Registre a nota no financeiro.');}}
    const remove=e.target.closest('[data-remove-shopping]');if(remove){const s=state.shopping.find(x=>x.id===Number(remove.dataset.removeShopping));if(s?.origin==='MANUAL'){state.shopping=state.shopping.filter(x=>x.id!==s.id);renderAll();toast('Item removido da lista.');}}
    const expenseFrom=e.target.closest('[data-expense-from-shopping]');if(expenseFrom){$('#expense-description').value='Compra: '+state.shopping.find(s=>s.id===Number(expenseFrom.dataset.expenseFromShopping))?.name;openModal('expense-modal');$('#expense-payer').innerHTML=people.map(p=>`<option value="${p.id}">${escapeHtml(p.name)}</option>`).join('');$('#expense-date').value=dayISO(0);}
    const swap=e.target.closest('[data-swap]');if(swap){const t=state.tasks.find(x=>x.id===Number(swap.dataset.swap));toast(`Pedido de troca enviado para os moradores (demonstração). O turno não muda sem aceite bilateral.`);}
  });
  document.addEventListener('change',e=>{
    if(e.target.matches('[data-task-check]')){const t=state.tasks.find(x=>x.id===Number(e.target.dataset.taskCheck));if(t){t.done=e.target.checked;renderAll();toast(t.done?'Tarefa marcada como concluída.':'Tarefa reaberta.');}}
  });
  $('#item-class').addEventListener('change',()=>{$('#item-min').disabled=$('#item-class').value==='INDIVIDUAL';$('#item-min').value=$('#item-class').value==='INDIVIDUAL'?'0':$('#item-min').value;});
  $('#item-form').addEventListener('submit',e=>{
    e.preventDefault();const data=new FormData(e.currentTarget);const name=String(data.get('name')).trim();const quantity=Number(data.get('quantity'));const cls=String(data.get('classification'));const expiry=String(data.get('expiry')||'')||null;const min=Number(data.get('min')||0);
    if(!name||!Number.isFinite(quantity)||quantity<=0){toast('Informe nome e quantidade válida.');return;}if(cls==='COLETIVO'&&min<0){toast('O estoque mínimo não pode ser negativo.');return;}if(expiry&&daysToExpiry(expiry)<0){toast('A validade não pode estar no passado.');return;}
    state.items.push({id:state.nextId++,name,emoji:emojiFor(name),quantity,unit:String(data.get('unit')),classification:cls,owner:Number(data.get('owner')),location:String(data.get('location')).trim(),expiry,min:cls==='INDIVIDUAL'?0:min});closeModal($('#item-modal'));e.currentTarget.reset();$('#item-min').value='0';renderAll();toast('Item cadastrado no protótipo.');useView('stock');
  });
  $('#shopping-form').addEventListener('submit',e=>{e.preventDefault();const name=$('#shopping-name').value.trim(),quantity=Number($('#shopping-quantity').value);if(!name||quantity<=0){toast('Informe um item e uma quantidade positiva.');return;}const existing=state.shopping.find(s=>s.name.toLowerCase()===name.toLowerCase()&&s.status==='PENDENTE');if(existing){existing.quantity=Math.round((existing.quantity+quantity)*100)/100;}else state.shopping.push({id:state.nextId++,name,quantity,unit:$('#shopping-unit').value,origin:'MANUAL',status:'PENDENTE'});closeModal($('#shopping-modal'));e.currentTarget.reset();$('#shopping-quantity').value='1';renderAll();toast('Item adicionado à lista compartilhada.');});
  $('#expense-form').addEventListener('submit',e=>{e.preventDefault();const desc=$('#expense-description').value.trim();const amount=Number($('#expense-amount').value);const payer=Number($('#expense-payer').value);const date=$('#expense-date').value;if(!desc||!Number.isFinite(amount)||amount<=0||!date||date>dayISO(0)){toast('Confira a descrição, o valor positivo e a data da compra.');return;}state.expenses.push({id:state.nextId++,description:desc,amountCents:Math.round(amount*100),payer,date});closeModal($('#expense-modal'));e.currentTarget.reset();renderAll();toast('Compra registrada e cotas recalculadas. Nenhum pagamento foi realizado.');});
  $('#stock-search').addEventListener('input',renderStock);$('#stock-filter').addEventListener('change',renderStock);$('#shopping-filter').addEventListener('change',renderShopping);
  $('#notifications-button').addEventListener('click',()=>{const n=activeItems().filter(i=>daysToExpiry(i.expiry)!==null&&daysToExpiry(i.expiry)>=0&&daysToExpiry(i.expiry)<=3);toast(n.length?`${n.length} item(ns) em validade crítica. Confira o painel.`:'Nenhuma nova notificação no momento.');});
  $('#new-task-button').addEventListener('click',()=>{const title=prompt('Qual tarefa precisa entrar na escala?');if(!title||!title.trim())return;const owner=Number(prompt('ID do morador responsável (1 Kauê, 2 Ana, 3 Bruno, 4 Júlia):','1'));if(!people.some(p=>p.id===owner)){toast('Morador inválido.');return;}state.tasks.push({id:state.nextId++,title:title.trim(),type:'Limpeza',date:dayISO(1),owner,done:false});renderAll();toast('Tarefa adicionada para amanhã.');});
  const weekday=new Intl.DateTimeFormat('pt-BR',{weekday:'long'}).format(today);$('#page-eyebrow').textContent=`${weekday.toLocaleUpperCase('pt-BR')}, CASA ORGANIZADA`;
  $('#expense-payer').innerHTML=people.filter(p=>p.active).map(p=>`<option value="${p.id}">${escapeHtml(p.name)}</option>`).join('');$('#expense-date').value=dayISO(0);
  // Delegação de modais, clicando fora da caixa fecha sem salvar alterações.
  $$('.modal-backdrop').forEach(m=>m.addEventListener('click',e=>{if(e.target===m)m.classList.remove('open');}));
  document.addEventListener('keydown',e=>{if(e.key==='Escape')$$('.modal-backdrop.open').forEach(m=>m.classList.remove('open'));});
  renderAll();
})();
