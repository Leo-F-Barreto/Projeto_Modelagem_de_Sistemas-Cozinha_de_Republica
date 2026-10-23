// CoChef: interface ligada à API (/api). Todo dado vem do servidor; o navegador guarda só o token da sessão.
// Sem servidor (arquivo aberto direto no navegador) ou com ?preview na URL, a página entra no modo
// demonstração de preview.js, que responde no mesmo formato da API com dados de exemplo em memória.
(() => {
  'use strict';
  if (window.__cochefIniciado) return; // o script pode ser incluído duas vezes (caminho absoluto e relativo)
  window.__cochefIniciado = true;

  const $ = (s, root = document) => root.querySelector(s);
  const $$ = (s, root = document) => [...root.querySelectorAll(s)];
  const CHAVE_SESSAO = 'cochef-sessao';

  // ---------------------------------------------------------------- utilidades
  const escapeHtml = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const fmtMoney = (cents) => (cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  const fmtDate = (iso) => (iso ? new Date(`${iso}T12:00:00`).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' }) : 'Sem validade');
  const fmtNum = (n) => Number(n).toLocaleString('pt-BR', { maximumFractionDigits: 3 });
  const iniciais = (nome) => String(nome || '?').trim().split(/\s+/).slice(0, 2).map((p) => p[0]).join('').toUpperCase();
  const primeiroNome = (nome) => String(nome || '').split(' ')[0];
  const somarDias = (iso, dias) => { const d = new Date(`${iso}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + dias); return d.toISOString().slice(0, 10); };
  const emojiFor = (name) => {
    const n = String(name).toLowerCase();
    if (n.includes('leite') || n.includes('iogurte')) return '🥛';
    if (n.includes('ovo')) return '🥚';
    if (n.includes('arroz')) return '🍚';
    if (n.includes('tomate')) return '🍅';
    if (n.includes('café')) return '☕';
    if (n.includes('detergente') || n.includes('limpeza') || n.includes('esponja')) return '🧽';
    if (n.includes('pão')) return '🥖';
    return '🛒';
  };
  const ROTULO_TURNO = { LIMPEZA: 'Limpeza', REFEICAO: 'Refeição' };

  function toast(message) {
    const el = $('#toast');
    el.textContent = message;
    el.classList.add('show');
    clearTimeout(toast.timer);
    toast.timer = setTimeout(() => el.classList.remove('show'), 3500);
  }

  // ---------------------------------------------------------------- sessão e chamadas à API
  let sessao = null;
  try { sessao = JSON.parse(localStorage.getItem(CHAVE_SESSAO) || 'null'); } catch { sessao = null; }
  let modoPreview = false;
  const salvarSessao = (s) => { sessao = s; if (modoPreview) return; try { s ? localStorage.setItem(CHAVE_SESSAO, JSON.stringify(s)) : localStorage.removeItem(CHAVE_SESSAO); } catch { /* sem armazenamento */ } };

  class ErroApi extends Error {
    constructor(status, codigo, mensagem) { super(mensagem); this.status = status; this.codigo = codigo; }
  }

  async function api(metodo, caminho, corpo) {
    if (modoPreview) return window.CoChefPreview.api(metodo, caminho, corpo);
    const headers = { Accept: 'application/json' };
    if (corpo !== undefined) headers['Content-Type'] = 'application/json';
    if (sessao?.token) headers.Authorization = `Bearer ${sessao.token}`;
    let resposta;
    try {
      resposta = await fetch(`/api${caminho}`, { method: metodo, headers, body: corpo === undefined ? undefined : JSON.stringify(corpo) });
    } catch {
      throw new ErroApi(0, 'SEM_CONEXAO', 'Sem conexão com o servidor. Tente novamente.');
    }
    if (resposta.status === 204) return null;
    const dados = await resposta.json().catch(() => null);
    if (!resposta.ok) {
      const erro = dados?.erro || {};
      if (resposta.status === 401 && sessao && !caminho.startsWith('/auth/')) {
        sair('Sua sessão expirou. Entre novamente.');
      }
      throw new ErroApi(resposta.status, erro.codigo || 'ERRO', erro.mensagem || 'Não foi possível concluir a ação.');
    }
    return dados;
  }

  // Executa uma ação, mostra o resultado e recarrega os dados.
  async function agir(promessa, sucesso) {
    try {
      const r = await promessa;
      if (sucesso) toast(typeof sucesso === 'function' ? sucesso(r) : sucesso);
      await carregar();
      return r;
    } catch (e) {
      toast(e.message);
      return null;
    }
  }

  // ---------------------------------------------------------------- estado vindo do servidor
  const estado = { eu: null, republica: null, painel: null, produtos: [], lista: [], compras: [], balanco: null, escala: null, notificacoes: [] };
  const ehAdmin = () => estado.eu?.perfil === 'ADMIN';

  async function carregar() {
    const [eu, republica, painel, produtos, lista, compras, balanco, escala, notificacoes] = await Promise.all([
      api('GET', '/eu'), api('GET', '/republica'), api('GET', '/painel'), api('GET', '/produtos?todos=1'), api('GET', '/lista'),
      api('GET', '/compras'), api('GET', '/balanco'), api('GET', '/escala'), api('GET', '/notificacoes'),
    ]);
    Object.assign(estado, { eu, republica, painel, produtos, lista, compras, balanco, escala, notificacoes });
    renderAll();
  }

  // ---------------------------------------------------------------- caixa de diálogo genérica (substitui prompt)
  function pedir({ titulo, texto = '', campos, confirmar = 'Confirmar' }) {
    $('#ask-title').textContent = titulo;
    $('#ask-text').textContent = texto;
    $('#ask-submit').textContent = confirmar;
    $('#ask-fields').innerHTML = campos.map((c) => {
      const id = `ask-${c.nome}`;
      const comum = `id="${id}" name="${c.nome}" ${c.obrigatorio ? 'required' : ''}`;
      const controle = c.tipo === 'select'
        ? `<select ${comum}>${c.opcoes.map((o) => `<option value="${escapeHtml(o.valor)}">${escapeHtml(o.rotulo)}</option>`).join('')}</select>`
        : `<input ${comum} type="${c.tipo || 'text'}" value="${escapeHtml(c.valor ?? '')}" ${c.min !== undefined ? `min="${c.min}"` : ''} ${c.max !== undefined ? `max="${c.max}"` : ''} ${c.passo ? `step="${c.passo}"` : ''} ${c.maximo ? `maxlength="${c.maximo}"` : ''}>`;
      return `<div class="field ${c.largo ? 'full' : ''}"><label for="${id}">${escapeHtml(c.rotulo)}</label>${controle}</div>`;
    }).join('');
    const modal = $('#ask-modal');
    return new Promise((resolve) => {
      const form = $('#ask-form');
      const fechar = (valor) => { modal.classList.remove('open'); form.onsubmit = null; modal.onclose = null; resolve(valor); };
      form.onsubmit = (e) => { e.preventDefault(); fechar(Object.fromEntries(new FormData(form))); };
      modal.onclose = () => fechar(null);
      openModal('ask-modal');
    });
  }

  // ---------------------------------------------------------------- navegação e modais
  const ROTULOS = {
    dashboard: ['CASA ORGANIZADA', 'Visão geral'], stock: ['INVENTÁRIO COMPARTILHADO', 'Estoque da cozinha'],
    shopping: ['TODO MUNDO PARTICIPA', 'Lista de compras'], finance: ['TRANSPARÊNCIA SEM ATRITO', 'Financeiro da república'],
    schedule: ['DIVIDINDO A ROTINA', 'Escala da casa'], people: ['A CASA É DE TODO MUNDO', 'Moradores'],
  };
  function useView(name, { historico = true } = {}) {
    if (!ROTULOS[name]) name = 'dashboard';
    if (historico && location.hash.slice(1) !== name) { try { history.pushState(null, '', `#${name}`); } catch { /* file:// em alguns navegadores */ } }
    $$('.view').forEach((v) => v.classList.toggle('active', v.id === `view-${name}`));
    $$('#navigation button').forEach((b) => b.classList.toggle('active', b.dataset.view === name));
    const hoje = estado.painel?.hoje;
    const diaSemana = hoje ? new Date(`${hoje}T12:00:00`).toLocaleDateString('pt-BR', { weekday: 'long' }).toUpperCase() : '';
    $('#page-eyebrow').textContent = diaSemana ? `${diaSemana}, ${ROTULOS[name][0]}` : ROTULOS[name][0];
    $('#page-title').textContent = ROTULOS[name][1];
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }
  function openModal(id) {
    const m = $(`#${id}`);
    if (!m) return;
    m.classList.add('open');
    const first = $('input:not([type="hidden"]),select', m);
    setTimeout(() => first?.focus(), 40);
  }
  function closeModal(m) {
    if (!m) return;
    m.classList.remove('open');
    if (typeof m.onclose === 'function') m.onclose();
  }

  // ---------------------------------------------------------------- renderização
  const ativos = () => estado.produtos.filter((p) => p.status === 'ATIVO' || p.status === 'ESGOTADO');
  const disponiveis = () => estado.produtos.filter((p) => p.status === 'ATIVO');

  function statusOf(p) {
    if (p.status === 'ESGOTADO') return { label: 'Esgotado', cls: 'neutral' };
    if (p.status === 'VENCIDO') return { label: 'Vencido', cls: 'critical' };
    if (p.status === 'DESCARTADO') return { label: 'Descartado', cls: 'neutral' };
    if (p.estadoValidade === 'CRITICA') return { label: 'Validade crítica', cls: 'critical' };
    if (p.abaixoDoMinimo) return { label: 'Estoque baixo', cls: 'warning' };
    return { label: 'Em dia', cls: 'ok' };
  }

  function renderShell() {
    const { eu, republica, painel } = estado;
    document.body.classList.toggle('is-admin', ehAdmin());
    const membrosAtivos = republica.membros.filter((m) => m.ativo);
    $('#house-name').textContent = republica.nome;
    $('#house-meta').textContent = `${membrosAtivos.length} ${membrosAtivos.length === 1 ? 'morador ativo' : 'moradores ativos'}`;
    $('#house-people').innerHTML = membrosAtivos.slice(0, 6).map((m) => `<span class="person-dot" title="${escapeHtml(m.nome)}">${escapeHtml(iniciais(m.nome))}</span>`).join('');
    $('#profile-avatar').textContent = iniciais(eu.nome);
    $('#profile-name').textContent = eu.nome;
    $('#profile-role').textContent = eu.perfil === 'ADMIN' ? 'Administrador' : 'Morador';
    $('#welcome-name').textContent = primeiroNome(eu.nome);
    const hoje = new Date(`${painel.hoje}T12:00:00`);
    $('#today-chip').textContent = hoje.toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long' });
    $('#notifications-dot').hidden = !painel.notificacoesNaoLidas;
    $('#notifications-button').setAttribute('aria-label', `Ver notificações (${painel.notificacoesNaoLidas} não lidas)`);
    if (modoPreview) {
      $('#preview-user').innerHTML = window.CoChefPreview.membros().map((m) => `<option value="${m.id}" ${m.id === eu.id ? 'selected' : ''}>${escapeHtml(m.nome)}${m.perfil === 'ADMIN' ? ' (admin)' : ''}</option>`).join('');
    }
  }

  function renderStats() {
    const { painel, lista, balanco, escala } = estado;
    const pendentes = lista.filter((i) => i.status === 'PENDENTE');
    $('#stat-stock').textContent = disponiveis().length;
    $('#stat-expiry').textContent = painel.validadeCritica.length;
    $('#stat-shopping').textContent = pendentes.length;
    const saldo = painel.meuSaldoCentavos;
    $('#stat-balance').textContent = fmtMoney(saldo);
    $('#stat-balance').className = `stat-value ${saldo > 0 ? 'positive' : saldo < 0 ? 'negative' : ''}`;
    $('#nav-stock-count').textContent = disponiveis().length;
    $('#nav-shopping-count').textContent = pendentes.length;
    $('#shopping-pending-count').textContent = pendentes.length;
    $('#shopping-bought-count').textContent = lista.filter((i) => i.status === 'COMPRADO').length;
    const aprovadas = estado.compras.filter((c) => c.status === 'APROVADA');
    $('#finance-total').textContent = fmtMoney(aprovadas.reduce((s, c) => s + c.valorCentavos, 0));
    $('#finance-active').textContent = balanco.saldos.filter((s) => s.ativo).length;
    $('#tasks-today').textContent = escala.turnos.filter((t) => t.data === painel.hoje && t.status === 'PENDENTE').length;
    const semanaAtras = somarDias(painel.hoje, -7);
    $('#tasks-done').textContent = escala.turnos.filter((t) => t.status === 'CONCLUIDO' && t.data >= semanaAtras).length;
  }

  function renderDashboard() {
    const { painel } = estado;
    const alerts = [...painel.validadeCritica].sort((a, b) => a.diasParaVencer - b.diasParaVencer);
    $('#dashboard-alerts').innerHTML = alerts.length ? alerts.slice(0, 4).map((p) => {
      const d = p.diasParaVencer;
      return `<div class="alert"><div class="alert-icon">${emojiFor(p.nome)}</div><div class="alert-info"><div class="alert-name">${escapeHtml(p.nome)}</div><div class="alert-detail">${escapeHtml(p.compartimento)} · ${d === 0 ? 'vence hoje' : d === 1 ? 'vence amanhã' : `vence em ${d} dias`}</div></div><span class="pill ${d <= 1 ? 'critical' : 'warning'}">${d <= 1 ? 'Urgente' : 'Atenção'}</span></div>`;
    }).join('') : '<div class="empty">Nenhum item na janela crítica de validade. 🌿</div>';

    const turnos = estado.escala.turnos.filter((t) => t.status === 'PENDENTE' && t.data >= painel.hoje).slice(0, 4);
    $('#dashboard-tasks').innerHTML = turnos.length ? turnos.map((t) => taskRow(t, true)).join('') : '<div class="empty">Nenhum turno pendente. Tudo em dia por aqui.</div>';

    const lows = painel.estoqueBaixo.filter((p) => p.status === 'ATIVO' || p.status === 'ESGOTADO');
    $('#dashboard-low-stock').innerHTML = lows.length ? lows.slice(0, 4).map((p) => `<div class="stock-line"><div class="item-main"><div class="item-emoji">${emojiFor(p.nome)}</div><div style="min-width:0"><div class="item-name">${escapeHtml(p.nome)}</div><div class="item-loc">Mínimo ${fmtNum(p.quantidadeMinima)} ${escapeHtml(p.unidade)}</div></div></div><div><div class="quantity">${fmtNum(p.quantidade)} ${escapeHtml(p.unidade)}</div><div class="progress"><span style="width:${Math.max(4, Math.min(100, (p.quantidade / Math.max(1, p.quantidadeMinima)) * 100))}%"></span></div></div><span class="pill warning">Repor</span></div>`).join('') : '<div class="empty">Nenhum item abaixo do mínimo. ✨</div>';
  }

  function renderStock() {
    const q = ($('#stock-search').value || '').trim().toLowerCase();
    const f = $('#stock-filter').value || 'TODOS';
    const base = f === 'INATIVOS' ? estado.produtos.filter((p) => p.status === 'VENCIDO' || p.status === 'DESCARTADO') : ativos();
    const itens = base
      .filter((p) => `${p.nome} ${p.compartimento} ${p.donoNome || ''}`.toLowerCase().includes(q))
      .filter((p) => f === 'TODOS' || f === 'INATIVOS' || (f === 'COLETIVO' && p.classificacao === 'COLETIVO') || (f === 'INDIVIDUAL' && p.classificacao === 'INDIVIDUAL')
        || (f === 'ATENCAO' && p.status === 'ATIVO' && p.estadoValidade === 'CRITICA') || (f === 'BAIXO' && (p.abaixoDoMinimo || p.status === 'ESGOTADO')))
      .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
    $('#stock-table').innerHTML = itens.map((p) => {
      const s = statusOf(p);
      const lotes = p.lotes.length > 1 ? `<div class="lot-list">${p.lotes.map((l) => `${fmtNum(l.quantidade)} até ${fmtDate(l.validade)}`).join(' · ')}</div>` : '';
      const podeMexer = p.meu;
      const ativo = p.status === 'ATIVO' || p.status === 'ESGOTADO';
      const acoes = ativo && podeMexer
        ? `<button class="icon-action" data-consume="${p.id}" ${p.status !== 'ATIVO' ? 'disabled' : ''} title="Registrar consumo">− Baixar</button><button class="icon-action" data-restock="${p.id}" title="Repor estoque">＋ Repor</button><button class="icon-action" data-discard="${p.id}" title="Descartar">Descartar</button>`
        : ativo ? '<span class="small-muted">Uso individual</span>' : '';
      return `<tr><td><div class="cell-product"><div class="item-emoji">${emojiFor(p.nome)}</div><div><div class="item-name">${escapeHtml(p.nome)}</div><div class="item-loc">⌖ ${escapeHtml(p.compartimento)}</div></div></div></td><td><div>${p.classificacao === 'COLETIVO' ? '<span class="pill ok">Coletivo</span>' : '<span class="pill neutral">Individual</span>'}</div>${p.classificacao === 'INDIVIDUAL' ? `<div class="owner-label">Dono: ${escapeHtml(p.donoNome)}</div>` : ''}</td><td><strong>${fmtNum(p.quantidade)}</strong> ${escapeHtml(p.unidade)}${p.quantidadeMinima != null ? `<div class="small-muted">Mínimo ${fmtNum(p.quantidadeMinima)}</div>` : ''}</td><td>${fmtDate(p.validade)}${lotes}</td><td><span class="pill ${s.cls}">${s.label}</span></td><td><div class="actions-cell">${acoes}</div></td></tr>`;
    }).join('');
    $('#stock-empty').hidden = itens.length > 0;
  }

  function renderShopping() {
    const f = $('#shopping-filter').value || 'PENDENTE';
    const itens = estado.lista.filter((i) => f === 'TODOS' || i.status === f);
    $('#shopping-list').innerHTML = itens.length ? itens.map((i) => {
      const meta = `${i.origem === 'AUTOMATICA' ? '↻ Reposição automática' : `＋ Adicionado por ${escapeHtml(primeiroNome(i.criadorNome))}`} · ${i.status === 'COMPRADO' ? `Comprado por ${escapeHtml(primeiroNome(i.compradorNome))}` : 'Pendente'}`;
      const podeRemover = i.status === 'PENDENTE' && i.origem === 'MANUAL' && (i.criadoPor === estado.eu.id || ehAdmin());
      const botao = i.status === 'PENDENTE' ? `<button class="btn btn-light btn-small" data-bought="${i.id}">✓ Comprado</button>` : `<button class="btn btn-outline btn-small" data-expense-from-shopping="${i.id}">Registrar nota</button>`;
      return `<div class="shopping-item ${i.status === 'COMPRADO' ? 'purchased' : ''}"><div class="item-emoji">${emojiFor(i.nome)}</div><div class="shopping-copy"><div class="shopping-title">${escapeHtml(i.nome)}</div><div class="shopping-meta">${meta}</div></div><div class="shopping-qty">${fmtNum(i.quantidade)} ${escapeHtml(i.unidade || '')}</div>${botao}${i.status === 'PENDENTE' ? `<button class="icon-action" data-adjust-shopping="${i.id}" aria-label="Ajustar quantidade de ${escapeHtml(i.nome)}">✎</button>` : ''}${podeRemover ? `<button class="icon-action" data-remove-shopping="${i.id}" aria-label="Remover ${escapeHtml(i.nome)}">×</button>` : ''}</div>`;
    }).join('') : '<div class="empty">Essa lista está vazia. Adicione um item ou aguarde uma sugestão automática.</div>';
  }

  function renderFinance() {
    const { balanco, compras } = estado;
    $('#balance-list').innerHTML = balanco.saldos.filter((s) => s.ativo || s.saldoCentavos !== 0).map((s) => `<div class="balance-row"><div class="avatar" style="width:34px;height:34px;font-size:11px">${escapeHtml(iniciais(s.nome))}</div><div class="balance-name">${escapeHtml(s.nome)}</div><div class="balance-value ${s.saldoCentavos > 0 ? 'positive' : s.saldoCentavos < 0 ? 'negative' : ''}">${s.saldoCentavos > 0 ? '+' : ''}${fmtMoney(s.saldoCentavos)}</div></div>`).join('');

    const pill = { APROVADA: '<span class="pill ok">Aprovada</span>', PENDENTE: '<span class="pill warning">Aguardando aprovação</span>', REJEITADA: '<span class="pill neutral">Rejeitada</span>' };
    $('#expense-list').innerHTML = compras.length ? compras.slice(0, 12).map((c) => {
      const decidir = ehAdmin() && c.status === 'PENDENTE' ? `<div class="row-actions"><button class="btn btn-light btn-small" data-approve="${c.id}">Aprovar</button><button class="btn btn-outline btn-small" data-reject="${c.id}">Rejeitar</button></div>` : '';
      const motivo = c.status === 'REJEITADA' && c.motivoRejeicao ? ` · Motivo: ${escapeHtml(c.motivoRejeicao)}` : '';
      return `<div class="expense-row"><div><div class="expense-name">${escapeHtml(c.descricao)}</div><div class="expense-meta">${fmtDate(c.data)} · Pago por ${escapeHtml(c.pagadorNome)}${motivo}</div><div style="margin-top:6px">${pill[c.status]}</div></div><div><div class="expense-value">${fmtMoney(c.valorCentavos)}</div>${decidir}</div></div>`;
    }).join('') : '<div class="empty">Nenhuma compra registrada.</div>';

    const ts = balanco.transferenciasSugeridas;
    $('#transfers-list').innerHTML = ts.length ? ts.map((t) => `<div class="transfer-row"><span style="font-weight:750">${escapeHtml(primeiroNome(t.devedorNome))}</span><span class="transfer-arrow">→</span><span style="font-weight:750">${escapeHtml(primeiroNome(t.credorNome))}</span><span class="transfer-amount">${fmtMoney(t.valorCentavos)}</span></div>`).join('') : '<div class="empty">Todos os saldos estão zerados. 🎉</div>';

    const acertos = balanco.fechamentos.flatMap((f) => f.acertos.map((a) => ({ ...a, periodo: f.periodo }))).filter((a) => a.status === 'PENDENTE');
    $('#settlements-list').innerHTML = acertos.length ? acertos.map((a) => {
      const pode = a.devedorId !== estado.eu.id && (a.credorId === estado.eu.id || ehAdmin());
      return `<div class="transfer-row"><div><div style="font-weight:750">${escapeHtml(primeiroNome(a.devedorNome))} → ${escapeHtml(primeiroNome(a.credorNome))}</div><div class="small-muted">Fechamento ${escapeHtml(a.periodo)}</div></div><span class="transfer-amount">${fmtMoney(a.valorCentavos)}</span>${pode ? `<button class="btn btn-light btn-small" data-confirm-settlement="${a.id}">Confirmar recebimento</button>` : ''}</div>`;
    }).join('') : '<div class="empty">Nenhum acerto pendente.</div>';
  }

  function taskRow(t, compacto = false) {
    const meu = t.responsavelId === estado.eu.id;
    const hoje = estado.painel.hoje;
    const podeConcluir = meu && t.status === 'PENDENTE' && t.data <= hoje;
    const quando = t.data === hoje ? 'Hoje' : fmtDate(t.data);
    const atraso = t.atrasado ? ' · <span class="negative">atrasado</span>' : '';
    const check = `<input class="check" type="checkbox" data-task-check="${t.id}" ${t.status === 'CONCLUIDO' ? 'checked disabled' : ''} ${podeConcluir ? '' : 'disabled'} aria-label="Concluir ${escapeHtml(ROTULO_TURNO[t.tipo])} de ${escapeHtml(quando)}">`;
    const troca = !compacto && meu && t.status === 'PENDENTE' && t.data > hoje ? `<button class="text-link" data-swap="${t.id}">Pedir troca</button>` : '';
    return `<div class="task ${t.status === 'CONCLUIDO' ? 'done' : ''}">${check}<div class="task-copy"><div class="task-name">${escapeHtml(t.descricao || ROTULO_TURNO[t.tipo])}</div><div class="task-meta">${quando} · ${escapeHtml(t.responsavelNome)}${atraso}</div></div><span class="task-owner">${escapeHtml(ROTULO_TURNO[t.tipo])}</span>${troca}</div>`;
  }

  function renderSchedule() {
    const { escala, painel } = estado;
    const nomes = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
    $('#schedule-grid').innerHTML = Array.from({ length: 7 }, (_, n) => somarDias(painel.hoje, n)).map((iso) => {
      const d = new Date(`${iso}T12:00:00`);
      const doDia = escala.turnos.filter((t) => t.data === iso);
      return `<div class="day-card ${iso === painel.hoje ? 'today' : ''}"><div class="day-label">${nomes[d.getDay()]}</div><div class="day-number">${d.getDate()}</div>${doDia.length ? doDia.map((t) => `<div class="day-task">${escapeHtml(ROTULO_TURNO[t.tipo])}${t.status === 'CONCLUIDO' ? ' ✓' : ''}</div><div class="day-owner">${escapeHtml(primeiroNome(t.responsavelNome))}</div>`).join('<div style="height:8px"></div>') : '<div class="small-muted">Sem turno</div>'}</div>`;
    }).join('');
    const lista = escala.turnos.filter((t) => t.data >= painel.hoje || t.status === 'PENDENTE');
    $('#full-task-list').innerHTML = lista.length ? lista.map((t) => taskRow(t)).join('') : `<div class="empty">Nenhum turno na escala.${ehAdmin() ? ' Use “Gerar escala” para montar o rodízio.' : ''}</div>`;

    const trocas = escala.trocas;
    $('#swap-panel').hidden = trocas.length === 0;
    $('#swap-list').innerHTML = trocas.map((tr) => {
      const descr = `${escapeHtml(primeiroNome(tr.solicitanteNome))} oferece ${escapeHtml(ROTULO_TURNO[tr.turnoSolicitante.tipo])} de ${fmtDate(tr.turnoSolicitante.data)} por ${escapeHtml(ROTULO_TURNO[tr.turnoSolicitado.tipo])} de ${fmtDate(tr.turnoSolicitado.data)} (${escapeHtml(primeiroNome(tr.solicitadoNome))})`;
      const acoes = tr.solicitadoId === estado.eu.id
        ? `<button class="btn btn-light btn-small" data-swap-accept="${tr.id}">Aceitar</button><button class="btn btn-outline btn-small" data-swap-refuse="${tr.id}">Recusar</button>`
        : tr.solicitanteId === estado.eu.id ? `<button class="btn btn-outline btn-small" data-swap-cancel="${tr.id}">Cancelar pedido</button>` : '';
      return `<div class="task"><div class="task-copy"><div class="task-name">${descr}</div></div><div class="row-actions">${acoes}</div></div>`;
    }).join('');
  }

  function renderPeople() {
    const { republica, balanco } = estado;
    const saldo = new Map(balanco.saldos.map((s) => [s.usuarioId, s.saldoCentavos]));
    $('#invite-code').textContent = republica.codigoConvite || '';
    $('#people-grid').innerHTML = republica.membros.map((m) => {
      const valor = saldo.get(m.id) || 0;
      const eu = m.id === estado.eu.id;
      const acoes = ehAdmin() ? `<div class="person-actions">${m.ativo ? `<button class="btn btn-outline btn-small" data-member-role="${m.id}" data-role="${m.perfil === 'ADMIN' ? 'MORADOR' : 'ADMIN'}">${m.perfil === 'ADMIN' ? 'Tornar morador' : 'Tornar administrador'}</button>` : ''}<button class="btn btn-outline btn-small" data-member-active="${m.id}" data-active="${m.ativo ? 'false' : 'true'}">${m.ativo ? 'Desativar' : 'Reativar'}</button></div>` : '';
      return `<article class="person-card"><div class="person-card-head"><div class="avatar">${escapeHtml(iniciais(m.nome))}</div><div><div class="person-card-name">${escapeHtml(m.nome)}${eu ? ' (você)' : ''}</div><div class="person-card-mail">${escapeHtml(m.email || '')}</div></div></div><div style="margin-top:12px"><span class="pill ${m.perfil === 'ADMIN' ? 'ok' : 'neutral'}">${m.perfil === 'ADMIN' ? 'Administrador' : 'Morador'}</span> <span class="pill ${m.ativo ? 'ok' : 'neutral'}">${m.ativo ? 'Ativo' : 'Inativo'}</span></div><div class="person-details"><span class="small-muted">Saldo atual</span><strong class="${valor > 0 ? 'positive' : valor < 0 ? 'negative' : ''}">${fmtMoney(valor)}</strong></div>${acoes}</article>`;
    }).join('');
  }

  function renderNotifications() {
    $('#notifications-list').innerHTML = estado.notificacoes.length ? estado.notificacoes.map((n) => `<div class="notification ${n.lida ? '' : 'unread'}"><div>${escapeHtml(n.mensagem)}</div><div class="when">${new Date(n.criadoEm).toLocaleString('pt-BR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}</div></div>`).join('') : '<div class="empty">Nenhuma notificação.</div>';
  }

  function renderAll() {
    renderShell(); renderStats(); renderDashboard(); renderStock(); renderShopping(); renderFinance(); renderSchedule(); renderPeople(); renderNotifications();
  }

  // ---------------------------------------------------------------- ações
  const produto = (id) => estado.produtos.find((p) => p.id === Number(id));

  async function consumir(id) {
    const p = produto(id);
    const r = await pedir({ titulo: `Consumir ${p.nome}`, texto: `Disponível: ${fmtNum(p.quantidade)} ${p.unidade}. A baixa sai do lote que vence primeiro.`, campos: [{ nome: 'quantidade', rotulo: `Quantidade (${p.unidade})`, tipo: 'number', valor: 1, min: 0.01, passo: 0.01, obrigatorio: true }], confirmar: 'Registrar baixa' });
    if (r) await agir(api('POST', `/produtos/${p.id}/consumo`, { quantidade: Number(r.quantidade) }), `Baixa registrada: ${r.quantidade} ${p.unidade} de ${p.nome}.`);
  }

  async function repor(id) {
    const p = produto(id);
    const r = await pedir({ titulo: `Repor ${p.nome}`, texto: 'Validades diferentes viram lotes separados.', campos: [
      { nome: 'quantidade', rotulo: `Quantidade (${p.unidade})`, tipo: 'number', valor: 1, min: 0.01, passo: 0.01, obrigatorio: true },
      { nome: 'validade', rotulo: 'Validade do lote', tipo: 'date', min: estado.painel.hoje },
    ], confirmar: 'Repor' });
    if (r) await agir(api('POST', `/produtos/${p.id}/reposicao`, { quantidade: Number(r.quantidade), validade: r.validade || null }), `${p.nome} reposto.`);
  }

  async function descartar(id) {
    const p = produto(id);
    const r = await pedir({ titulo: `Descartar ${p.nome}?`, texto: 'O produto sai do estoque. Esta ação não pode ser desfeita.', campos: [], confirmar: 'Descartar' });
    if (r) await agir(api('POST', `/produtos/${p.id}/descarte`, {}), `${p.nome} descartado.`);
  }

  async function pedirTroca(turnoId) {
    const meu = estado.escala.turnos.find((t) => t.id === Number(turnoId));
    const opcoes = estado.escala.turnos.filter((t) => t.responsavelId !== estado.eu.id && t.status === 'PENDENTE' && t.data > estado.painel.hoje);
    if (!opcoes.length) { toast('Não há turnos de outros moradores disponíveis para troca.'); return; }
    const r = await pedir({ titulo: 'Pedir troca de turno', texto: `Seu turno: ${ROTULO_TURNO[meu.tipo]} em ${fmtDate(meu.data)}. A troca só vale depois do aceite da outra pessoa.`, campos: [
      { nome: 'outro', rotulo: 'Trocar por', tipo: 'select', largo: true, opcoes: opcoes.map((t) => ({ valor: t.id, rotulo: `${ROTULO_TURNO[t.tipo]} · ${fmtDate(t.data)} · ${t.responsavelNome}` })) },
    ], confirmar: 'Enviar pedido' });
    if (r) await agir(api('POST', '/trocas', { meuTurnoId: meu.id, outroTurnoId: Number(r.outro) }), 'Pedido de troca enviado.');
  }

  async function gerarEscala() {
    const r = await pedir({ titulo: 'Gerar escala', texto: 'O rodízio continua de onde parou, entre os moradores ativos. Dias que já têm turno não são duplicados.', campos: [
      { nome: 'inicio', rotulo: 'A partir de', tipo: 'date', valor: estado.painel.hoje, min: estado.painel.hoje, obrigatorio: true },
      { nome: 'dias', rotulo: 'Quantos dias', tipo: 'number', valor: 7, min: 1, max: 60, obrigatorio: true },
      { nome: 'tipos', rotulo: 'Turnos', tipo: 'select', largo: true, opcoes: [{ valor: 'LIMPEZA,REFEICAO', rotulo: 'Limpeza e refeição' }, { valor: 'LIMPEZA', rotulo: 'Só limpeza' }, { valor: 'REFEICAO', rotulo: 'Só refeição' }] },
    ], confirmar: 'Gerar' });
    if (r) await agir(api('POST', '/escala', { inicio: r.inicio, dias: Number(r.dias), tipos: r.tipos.split(',') }), (x) => `${x.turnosCriados} turno(s) criado(s).`);
  }

  async function fecharMes() {
    const r = await pedir({ titulo: 'Fechar mês', texto: 'Congela as compras do período e gera os acertos entre os moradores. Compras pendentes precisam ser decididas antes.', campos: [
      { nome: 'periodo', rotulo: 'Mês', tipo: 'month', valor: estado.painel.hoje.slice(0, 7), max: estado.painel.hoje.slice(0, 7), obrigatorio: true },
    ], confirmar: 'Fechar mês' });
    if (r) await agir(api('POST', '/fechamentos', { periodo: r.periodo }), (x) => `Mês ${x.periodo} fechado com ${x.acertos.length} acerto(s).`);
  }

  async function rejeitar(id) {
    const r = await pedir({ titulo: 'Rejeitar compra', campos: [{ nome: 'motivo', rotulo: 'Motivo', largo: true, maximo: 200, obrigatorio: true }], confirmar: 'Rejeitar' });
    if (r) await agir(api('POST', `/compras/${id}/rejeicao`, { motivo: r.motivo }), 'Compra rejeitada.');
  }

  async function ajustarItem(id) {
    const item = estado.lista.find((i) => i.id === Number(id));
    const r = await pedir({ titulo: `Quantidade de ${item.nome}`, campos: [{ nome: 'quantidade', rotulo: 'Quantidade', tipo: 'number', valor: item.quantidade, min: 0.01, passo: 0.01, obrigatorio: true }], confirmar: 'Salvar' });
    if (r) await agir(api('PATCH', `/lista/${item.id}`, { quantidade: Number(r.quantidade) }), 'Quantidade atualizada.');
  }

  function abrirCompra(descricao = '') {
    const ativos = estado.republica.membros.filter((m) => m.ativo);
    $('#expense-payer').innerHTML = ativos.map((m) => `<option value="${m.id}" ${m.id === estado.eu.id ? 'selected' : ''}>${escapeHtml(m.nome)}</option>`).join('');
    $('#expense-date').value = estado.painel.hoje;
    $('#expense-date').max = estado.painel.hoje;
    if (descricao) $('#expense-description').value = descricao;
    openModal('expense-modal');
  }

  // ---------------------------------------------------------------- eventos
  $$('#navigation button').forEach((b) => b.addEventListener('click', () => useView(b.dataset.view)));

  document.addEventListener('click', (e) => {
    const alvo = (sel) => e.target.closest(sel);
    let el;
    if ((el = alvo('[data-go-view]'))) {
      if (el.dataset.goFilter) { $('#stock-filter').value = el.dataset.goFilter; renderStock(); }
      useView(el.dataset.goView);
    }
    if ((el = alvo('[data-open-modal]'))) {
      if (el.dataset.openModal === 'expense-modal') abrirCompra();
      else { if (el.dataset.openModal === 'item-modal') $('#item-class').dispatchEvent(new Event('change')); openModal(el.dataset.openModal); }
    }
    if ((el = alvo('[data-close-modal]'))) closeModal(el.closest('.modal-backdrop'));
    if ((el = alvo('[data-consume]'))) consumir(el.dataset.consume);
    if ((el = alvo('[data-restock]'))) repor(el.dataset.restock);
    if ((el = alvo('[data-discard]'))) descartar(el.dataset.discard);
    if ((el = alvo('[data-bought]'))) agir(api('POST', `/lista/${el.dataset.bought}/comprado`, {}), 'Item marcado como comprado. Registre a nota no financeiro.');
    if ((el = alvo('[data-remove-shopping]'))) agir(api('DELETE', `/lista/${el.dataset.removeShopping}`), 'Item removido da lista.');
    if ((el = alvo('[data-adjust-shopping]'))) ajustarItem(el.dataset.adjustShopping);
    if ((el = alvo('[data-expense-from-shopping]'))) abrirCompra(`Compra: ${estado.lista.find((i) => i.id === Number(el.dataset.expenseFromShopping))?.nome || ''}`);
    if ((el = alvo('[data-approve]'))) agir(api('POST', `/compras/${el.dataset.approve}/aprovacao`, {}), 'Compra aprovada e rateada.');
    if ((el = alvo('[data-reject]'))) rejeitar(el.dataset.reject);
    if ((el = alvo('[data-confirm-settlement]'))) agir(api('POST', `/acertos/${el.dataset.confirmSettlement}/confirmacao`, {}), 'Pagamento confirmado.');
    if ((el = alvo('[data-swap]'))) pedirTroca(el.dataset.swap);
    if ((el = alvo('[data-swap-accept]'))) agir(api('POST', `/trocas/${el.dataset.swapAccept}/aceite`, {}), 'Troca aceita. A escala foi atualizada.');
    if ((el = alvo('[data-swap-refuse]'))) agir(api('POST', `/trocas/${el.dataset.swapRefuse}/recusa`, {}), 'Troca recusada.');
    if ((el = alvo('[data-swap-cancel]'))) agir(api('POST', `/trocas/${el.dataset.swapCancel}/cancelamento`, {}), 'Pedido cancelado.');
    if ((el = alvo('[data-member-role]'))) agir(api('PATCH', `/moradores/${el.dataset.memberRole}`, { perfil: el.dataset.role }), 'Perfil atualizado.');
    if ((el = alvo('[data-member-active]'))) agir(api('PATCH', `/moradores/${el.dataset.memberActive}`, { ativo: el.dataset.active === 'true' }), 'Situação do morador atualizada.');
    if ((el = alvo('[data-auth-tab]'))) trocarAba(el.dataset.authTab);
  });

  document.addEventListener('change', (e) => {
    if (e.target.matches('[data-task-check]') && e.target.checked) {
      agir(api('POST', `/turnos/${e.target.dataset.taskCheck}/conclusao`, {}), 'Turno marcado como concluído.');
    }
    if (e.target.name === 'modo') {
      const convite = e.target.value === 'convite';
      $('#register-house-field').hidden = convite;
      $('#register-invite-field').hidden = !convite;
    }
  });

  $('#item-class').addEventListener('change', () => {
    const individual = $('#item-class').value === 'INDIVIDUAL';
    $('#item-min').disabled = individual;
    if (individual) $('#item-min').value = '0';
  });

  $('#item-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const form = e.currentTarget;
    const d = new FormData(form);
    const classificacao = String(d.get('classification'));
    const minimo = Number(d.get('min') || 0);
    const corpo = {
      nome: String(d.get('name')).trim(), quantidade: Number(d.get('quantity')), unidade: String(d.get('unit')),
      classificacao, compartimento: String(d.get('location')).trim(), validade: String(d.get('expiry') || '') || null,
      quantidadeMinima: classificacao === 'COLETIVO' && minimo > 0 ? minimo : null,
    };
    const r = await agir(api('POST', '/produtos', corpo), 'Item cadastrado no estoque.');
    if (r) { closeModal($('#item-modal')); form.reset(); $('#item-min').value = '0'; useView('stock'); }
  });

  $('#shopping-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const form = e.currentTarget;
    const corpo = { nome: $('#shopping-name').value.trim(), quantidade: Number($('#shopping-quantity').value), unidade: $('#shopping-unit').value };
    const r = await agir(api('POST', '/lista', corpo), 'Item adicionado à lista compartilhada.');
    if (r) { closeModal($('#shopping-modal')); form.reset(); $('#shopping-quantity').value = '1'; }
  });

  $('#expense-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const form = e.currentTarget;
    const corpo = {
      descricao: $('#expense-description').value.trim(), valorCentavos: Math.round(Number($('#expense-amount').value) * 100),
      pagadorId: Number($('#expense-payer').value), data: $('#expense-date').value,
    };
    const r = await agir(api('POST', '/compras', corpo), (c) => (c.status === 'APROVADA' ? 'Compra registrada e rateada. Nenhum pagamento foi realizado.' : 'Compra registrada. Ela entra no rateio depois da aprovação do administrador.'));
    if (r) { closeModal($('#expense-modal')); form.reset(); }
  });

  $('#stock-search').addEventListener('input', renderStock);
  $('#stock-filter').addEventListener('change', renderStock);
  $('#shopping-filter').addEventListener('change', renderShopping);
  $('#new-task-button').addEventListener('click', gerarEscala);
  $('#close-period-button').addEventListener('click', fecharMes);
  $('#invite-regenerate').addEventListener('click', () => agir(api('POST', '/republica/convite', {}), 'Novo código gerado. O anterior deixou de valer.'));
  $('#notifications-button').addEventListener('click', () => { renderNotifications(); openModal('notifications-modal'); });
  $('#notifications-read-all').addEventListener('click', async () => { await agir(api('POST', '/notificacoes/lidas', {})); closeModal($('#notifications-modal')); });
  $('#logout-button').addEventListener('click', () => sair('Você saiu da sua conta.'));

  $$('.modal-backdrop').forEach((m) => m.addEventListener('click', (e) => { if (e.target === m) closeModal(m); }));
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') $$('.modal-backdrop.open').forEach(closeModal);
    // Cartões clicáveis do painel também respondem ao teclado.
    if ((e.key === 'Enter' || e.key === ' ') && e.target.matches('.stat-link')) { e.preventDefault(); e.target.click(); }
  });
  window.addEventListener('popstate', () => { if (!$('#app').hidden) useView(location.hash.slice(1), { historico: false }); });

  // ---------------------------------------------------------------- modo demonstração
  const painelPreview = (abrir) => {
    $('#preview-panel').hidden = !abrir;
    $('#preview-toggle').setAttribute('aria-expanded', String(abrir));
  };
  $('#preview-user').addEventListener('change', async (e) => {
    painelPreview(false);
    sessao = window.CoChefPreview.entrarComo(e.target.value);
    await carregar();
    toast(`Agora você vê a casa como ${estado.eu.nome}.`);
  });
  $('#preview-toggle').addEventListener('click', () => painelPreview($('#preview-panel').hidden));
  document.addEventListener('click', (e) => { if (!e.target.closest('#preview-bar')) painelPreview(false); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') painelPreview(false); });
  $('#preview-reset').addEventListener('click', async () => {
    painelPreview(false);
    sessao = window.CoChefPreview.recomecar();
    $('#stock-filter').value = 'TODOS';
    $('#stock-search').value = '';
    await carregar();
    toast('Dados de exemplo restaurados.');
  });

  // ---------------------------------------------------------------- acesso
  function trocarAba(aba) {
    $$('[data-auth-tab]').forEach((b) => b.classList.toggle('active', b.dataset.authTab === aba));
    $('#login-form').hidden = aba !== 'login';
    $('#register-form').hidden = aba !== 'register';
    $('#auth-error').textContent = '';
  }

  function mostrarAcesso(mensagem = '') {
    $('#preview-hint').hidden = !modoPreview;
    $('#app').hidden = true;
    $('#auth-screen').hidden = false;
    $('#auth-error').textContent = mensagem;
    $('#auth-error').style.color = mensagem.startsWith('Você saiu') ? 'var(--muted)' : '';
  }

  async function entrarNoApp() {
    try {
      await carregar();
      $('#auth-screen').hidden = true;
      $('#app').hidden = false;
      $('#preview-bar').hidden = !modoPreview;
      useView(location.hash.slice(1) || 'dashboard', { historico: false });
    } catch (e) {
      if (sessao) mostrarAcesso(e.message);
    }
  }

  function sair(mensagem) {
    salvarSessao(null);
    trocarAba('login');
    mostrarAcesso(mensagem);
  }

  $('#login-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const form = e.currentTarget;
    const d = new FormData(form);
    try {
      salvarSessao(await api('POST', '/auth/login', { email: String(d.get('email')).trim(), senha: String(d.get('senha')) }));
      form.reset();
      await entrarNoApp();
    } catch (erro) {
      $('#auth-error').textContent = erro.message;
    }
  });

  $('#register-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const form = e.currentTarget;
    const d = new FormData(form);
    const convite = d.get('modo') === 'convite';
    const corpo = { nome: String(d.get('nome')).trim(), email: String(d.get('email')).trim(), senha: String(d.get('senha')) };
    if (convite) corpo.codigoConvite = String(d.get('codigoConvite')).trim();
    else corpo.nomeRepublica = String(d.get('nomeRepublica')).trim();
    try {
      salvarSessao(await api('POST', '/auth/registro', corpo));
      form.reset();
      await entrarNoApp();
    } catch (erro) {
      $('#auth-error').textContent = erro.message;
    }
  });

  // A API existe? Com o servidor Python, /api responde JSON (mesmo sem login).
  async function apiDisponivel() {
    if (location.protocol === 'file:') return false;
    try {
      const r = await fetch('/api/eu', { headers: { Accept: 'application/json' } });
      return (r.headers.get('content-type') || '').includes('json');
    } catch {
      return false;
    }
  }

  async function iniciar() {
    const pediuPreview = new URLSearchParams(location.search).has('preview');
    if (pediuPreview || !(await apiDisponivel())) {
      if (!window.CoChefPreview) { mostrarAcesso('Não foi possível falar com o servidor do CoChef.'); return; }
      modoPreview = true;
      document.body.classList.add('is-preview');
      $('#footer-note').textContent = 'CoChef · Protótipo navegável · Dados fictícios guardados apenas nesta aba';
      sessao = window.CoChefPreview.recomecar();
      await entrarNoApp();
      toast('Modo demonstração: explore à vontade, nada é salvo.');
      return;
    }
    if (sessao?.token) entrarNoApp();
    else mostrarAcesso();
  }

  iniciar();
})();
