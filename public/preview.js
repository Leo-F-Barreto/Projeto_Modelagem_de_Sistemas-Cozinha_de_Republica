// CoChef: modo demonstração.
// Só é usado quando a página não encontra a API do Python (arquivo aberto direto no navegador,
// servidor estático sem backend) ou quando a URL tem ?preview. Os dados ficam só na memória da aba
// e somem ao recarregar. Com o servidor Python rodando, a interface usa a API de verdade.
(() => {
  'use strict';
  if (window.CoChefPreview) return; // o script pode ser incluído duas vezes (caminho absoluto e relativo)

  const DIAS_CRITICOS = 3;
  const ROTULO = { LIMPEZA: 'Limpeza', REFEICAO: 'Refeição' };
  // Descrições só da demonstração, para a escala ficar mais parecida com a rotina de uma casa.
  const DESCRICOES = {
    LIMPEZA: ['Limpar a bancada e o fogão', 'Lavar e guardar a louça', 'Limpar a geladeira', 'Tirar o lixo e o reciclável'],
    REFEICAO: ['Preparar jantar coletivo', 'Fazer o almoço de domingo', 'Organizar o café da manhã'],
  };

  const isoHoje = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
  const somarDias = (iso, n) => { const d = new Date(`${iso}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
  const diasEntre = (a, b) => Math.round((new Date(`${b}T12:00:00Z`) - new Date(`${a}T12:00:00Z`)) / 86400000);
  const arred = (n) => Math.round(n * 1000) / 1000;

  class ErroPreview extends Error {
    constructor(status, codigo, mensagem) { super(mensagem); this.status = status; this.codigo = codigo; }
  }
  const falha = (mensagem, status = 422, codigo = 'REGRA_DE_NEGOCIO') => { throw new ErroPreview(status, codigo, mensagem); };

  // ------------------------------------------------------------------ dados de exemplo
  let db;
  let euId = 1;
  let proximoId = 100;
  const novoId = () => ++proximoId;

  function semear() {
    const h = isoHoje();
    proximoId = 100;
    db = {
      republica: { nome: 'República Ipê', codigoConvite: 'IPE-2026' },
      membros: [
        { id: 1, nome: 'Kauê Stang', email: 'kaue@exemplo.com', perfil: 'ADMIN', ativo: true },
        { id: 2, nome: 'Ana Martins', email: 'ana@exemplo.com', perfil: 'MORADOR', ativo: true },
        { id: 3, nome: 'Bruno Lima', email: 'bruno@exemplo.com', perfil: 'MORADOR', ativo: true },
        { id: 4, nome: 'Júlia Reis', email: 'julia@exemplo.com', perfil: 'MORADOR', ativo: true },
      ],
      produtos: [
        { id: 1, nome: 'Ovos caipiras', unidade: 'un.', compartimento: 'Geladeira · gaveta inferior', classificacao: 'COLETIVO', donoId: null, quantidadeMinima: null, status: 'ATIVO', lotes: [{ id: 1, quantidade: 6, validade: somarDias(h, 0) }, { id: 2, quantidade: 6, validade: somarDias(h, 14) }] },
        { id: 2, nome: 'Leite integral', unidade: 'L', compartimento: 'Geladeira · prateleira do meio', classificacao: 'COLETIVO', donoId: null, quantidadeMinima: 3, status: 'ATIVO', lotes: [{ id: 3, quantidade: 2, validade: somarDias(h, 1) }] },
        { id: 3, nome: 'Tomate italiano', unidade: 'un.', compartimento: 'Fruteira · cesto da frente', classificacao: 'COLETIVO', donoId: null, quantidadeMinima: 4, status: 'ATIVO', lotes: [{ id: 4, quantidade: 4, validade: somarDias(h, 2) }] },
        { id: 4, nome: 'Arroz branco', unidade: 'kg', compartimento: 'Armário de cima', classificacao: 'COLETIVO', donoId: null, quantidadeMinima: 2, status: 'ATIVO', lotes: [{ id: 5, quantidade: 1, validade: null }] },
        { id: 5, nome: 'Café em pó', unidade: 'pacotes', compartimento: 'Armário da pia', classificacao: 'COLETIVO', donoId: null, quantidadeMinima: 1, status: 'ATIVO', lotes: [{ id: 6, quantidade: 2, validade: somarDias(h, 60) }] },
        { id: 6, nome: 'Iogurte grego', unidade: 'un.', compartimento: 'Geladeira · gaveta da Ana', classificacao: 'INDIVIDUAL', donoId: 2, quantidadeMinima: null, status: 'ATIVO', lotes: [{ id: 7, quantidade: 3, validade: somarDias(h, 5) }] },
        { id: 7, nome: 'Pão de forma', unidade: 'pacotes', compartimento: 'Armário da pia', classificacao: 'INDIVIDUAL', donoId: 1, quantidadeMinima: null, status: 'ATIVO', lotes: [{ id: 8, quantidade: 1, validade: somarDias(h, 6) }] },
        { id: 8, nome: 'Requeijão', unidade: 'un.', compartimento: 'Geladeira · porta', classificacao: 'COLETIVO', donoId: null, quantidadeMinima: null, status: 'VENCIDO', lotes: [{ id: 9, quantidade: 1, validade: somarDias(h, -2) }] },
      ],
      lista: [
        { id: 1, nome: 'Leite integral', quantidade: 4, unidade: 'L', status: 'PENDENTE', origem: 'AUTOMATICA', criadoPor: null, compradoPor: null },
        { id: 2, nome: 'Detergente', quantidade: 2, unidade: 'un.', status: 'PENDENTE', origem: 'MANUAL', criadoPor: 4, compradoPor: null },
        { id: 3, nome: 'Esponja de louça', quantidade: 3, unidade: 'un.', status: 'PENDENTE', origem: 'MANUAL', criadoPor: 2, compradoPor: null },
        { id: 4, nome: 'Feijão', quantidade: 2, unidade: 'kg', status: 'COMPRADO', origem: 'MANUAL', criadoPor: 3, compradoPor: 3 },
      ],
      compras: [
        { id: 1, descricao: 'Compra da feira', valorCentavos: 9600, data: somarDias(h, -6), status: 'APROVADA', pagadorId: 1, registradaPor: 1, motivoRejeicao: null, fechada: false },
        { id: 2, descricao: 'Mercado do mês', valorCentavos: 24000, data: somarDias(h, -4), status: 'APROVADA', pagadorId: 2, registradaPor: 2, motivoRejeicao: null, fechada: false },
        { id: 3, descricao: 'Gás de cozinha', valorCentavos: 12000, data: somarDias(h, -1), status: 'PENDENTE', pagadorId: 4, registradaPor: 4, motivoRejeicao: null, fechada: false },
      ],
      fechamentos: [],
      turnos: [],
      trocas: [],
      notificacoes: [],
      rodizio: 0,
    };
    db.compras.forEach((c) => { c.participantes = ativosIds(); });
    gerarTurnos(somarDias(h, -3), 10, ['LIMPEZA', 'REFEICAO']);
    db.turnos.filter((t) => t.data < h).forEach((t, i) => { if (i % 3 !== 2) t.status = 'CONCLUIDO'; });
    const turnoAna = db.turnos.find((t) => t.responsavelId === 2 && t.data > h);
    const turnoKaue = db.turnos.find((t) => t.responsavelId === 1 && t.data > h);
    if (turnoAna && turnoKaue) db.trocas.push({ id: 1, solicitanteId: 2, solicitadoId: 1, turnoSolicitanteId: turnoAna.id, turnoSolicitadoId: turnoKaue.id });
    notificar(null, 'Ovos caipiras vencem hoje. Consuma primeiro o lote mais antigo.');
    notificar(null, 'Leite integral chegou ao mínimo e entrou na lista de compras.');
    notificar(1, 'Júlia registrou "Gás de cozinha" (R$ 120,00) e aguarda sua aprovação.');
    notificar(1, 'Ana pediu para trocar de turno com você.');
  }

  function notificar(usuarioId, mensagem) {
    db.notificacoes.unshift({ id: novoId(), usuarioId, mensagem, lida: false, criadoEm: new Date().toISOString() });
  }

  // ------------------------------------------------------------------ regras (versão simplificada das do servidor)
  const membro = (id) => db.membros.find((m) => m.id === id);
  const nome = (id) => membro(id)?.nome || '';
  const eu = () => membro(euId);
  const ehAdmin = () => eu().perfil === 'ADMIN';
  const exigirAdmin = () => { if (!ehAdmin()) falha('Só o administrador da república pode fazer isso.', 403, 'PROIBIDO'); };
  const ativosIds = () => db.membros.filter((m) => m.ativo).map((m) => m.id).sort((a, b) => a - b);
  const achar = (lista, id, rotulo) => lista.find((x) => x.id === Number(id)) || falha(`${rotulo} não encontrado(a).`, 404, 'NAO_ENCONTRADO');

  function estadoValidade(validade, hoje) {
    if (!validade) return 'SEM_VALIDADE';
    const d = diasEntre(hoje, validade);
    if (d < 0) return 'VENCIDA';
    return d <= DIAS_CRITICOS ? 'CRITICA' : 'OK';
  }

  function atualizarProduto(p) {
    const hoje = isoHoje();
    p.lotes = p.lotes.filter((l) => l.quantidade > 0.0001);
    if (p.status === 'DESCARTADO' || p.status === 'VENCIDO') return;
    const total = arred(p.lotes.reduce((s, l) => s + l.quantidade, 0));
    p.status = total > 0 ? 'ATIVO' : 'ESGOTADO';
    const validos = p.lotes.filter((l) => l.validade);
    if (validos.length && validos.every((l) => l.validade < hoje)) p.status = 'VENCIDO';
    // Reposição automática: item coletivo no mínimo entra sozinho na lista.
    if (p.classificacao === 'COLETIVO' && p.quantidadeMinima != null && total <= p.quantidadeMinima && p.status !== 'VENCIDO') {
      const jaNaLista = db.lista.some((i) => i.status === 'PENDENTE' && i.nome.toLowerCase() === p.nome.toLowerCase());
      if (!jaNaLista) {
        db.lista.unshift({ id: novoId(), nome: p.nome, quantidade: Math.max(1, arred(p.quantidadeMinima * 2 - total)), unidade: p.unidade, status: 'PENDENTE', origem: 'AUTOMATICA', criadoPor: null, compradoPor: null });
        notificar(null, `${p.nome} chegou ao mínimo e entrou na lista de compras.`);
      }
    }
  }

  function serProduto(p) {
    const hoje = isoHoje();
    const quantidade = arred(p.lotes.reduce((s, l) => s + l.quantidade, 0));
    const datas = p.lotes.map((l) => l.validade).filter(Boolean).sort();
    const validade = datas[0] || null;
    return {
      id: p.id, nome: p.nome, quantidade, unidade: p.unidade, validade, compartimento: p.compartimento,
      classificacao: p.classificacao, donoId: p.donoId, donoNome: p.donoId ? nome(p.donoId) : null,
      quantidadeMinima: p.quantidadeMinima, status: p.status, estadoValidade: estadoValidade(validade, hoje),
      diasParaVencer: validade ? diasEntre(hoje, validade) : null,
      abaixoDoMinimo: p.quantidadeMinima != null && quantidade <= p.quantidadeMinima,
      meu: p.classificacao === 'COLETIVO' || p.donoId === euId,
      lotes: [...p.lotes].sort((a, b) => (a.validade || '9999').localeCompare(b.validade || '9999')).map((l) => ({ ...l })),
    };
  }

  function serItem(i) {
    return { ...i, criadorNome: i.criadoPor ? nome(i.criadoPor) : 'CoChef', compradorNome: i.compradoPor ? nome(i.compradoPor) : null };
  }

  function serCompra(c) {
    return { ...c, pagadorNome: nome(c.pagadorId), registradorNome: nome(c.registradaPor) };
  }

  function ratear(valor, moradores, pagador) {
    const base = Math.floor(valor / moradores.length);
    let resto = valor - base * moradores.length;
    const cotas = new Map(moradores.map((m) => [m, base]));
    if (cotas.has(pagador)) cotas.set(pagador, base + resto);
    else moradores.forEach((m) => { if (resto > 0) { cotas.set(m, cotas.get(m) + 1); resto -= 1; } });
    return cotas;
  }

  function saldosDe(compras) {
    const saldos = new Map(db.membros.map((m) => [m.id, 0]));
    compras.filter((c) => c.status === 'APROVADA').forEach((c) => {
      saldos.set(c.pagadorId, saldos.get(c.pagadorId) + c.valorCentavos);
      ratear(c.valorCentavos, c.participantes, c.pagadorId).forEach((v, m) => saldos.set(m, saldos.get(m) - v));
    });
    return saldos;
  }

  function simplificar(saldos) {
    const dev = [...saldos].filter(([, v]) => v < 0).map(([i, v]) => [i, -v]);
    const cre = [...saldos].filter(([, v]) => v > 0).map(([i, v]) => [i, v]);
    const out = [];
    while (dev.length && cre.length) {
      dev.sort((a, b) => b[1] - a[1] || a[0] - b[0]);
      cre.sort((a, b) => b[1] - a[1] || a[0] - b[0]);
      const v = Math.min(dev[0][1], cre[0][1]);
      out.push({ devedorId: dev[0][0], credorId: cre[0][0], valorCentavos: v });
      dev[0][1] -= v; cre[0][1] -= v;
      if (!dev[0][1]) dev.shift();
      if (!cre[0][1]) cre.shift();
    }
    return out;
  }

  function balanco() {
    const saldos = saldosDe(db.compras.filter((c) => !c.fechada));
    return {
      saldos: db.membros.map((m) => ({ usuarioId: m.id, nome: m.nome, ativo: m.ativo, saldoCentavos: saldos.get(m.id) || 0 })),
      transferenciasSugeridas: simplificar(saldos).map((t) => ({ ...t, devedorNome: nome(t.devedorId), credorNome: nome(t.credorId) })),
      fechamentos: db.fechamentos.map((f) => ({ ...f, acertos: f.acertos.map((a) => ({ ...a, devedorNome: nome(a.devedorId), credorNome: nome(a.credorId) })) })),
    };
  }

  function gerarTurnos(inicio, dias, tipos) {
    const ativos = ativosIds();
    if (!ativos.length) falha('Não há moradores ativos para a escala.');
    let criados = 0;
    for (let n = 0; n < dias; n += 1) {
      const data = somarDias(inicio, n);
      tipos.forEach((tipo) => {
        if (db.turnos.some((t) => t.data === data && t.tipo === tipo)) return;
        const responsavelId = ativos[db.rodizio % ativos.length];
        db.rodizio += 1;
        const opcoes = DESCRICOES[tipo];
        db.turnos.push({ id: novoId(), tipo, data, responsavelId, status: 'PENDENTE', descricao: opcoes[db.rodizio % opcoes.length] });
        criados += 1;
      });
    }
    db.turnos.sort((a, b) => a.data.localeCompare(b.data) || a.tipo.localeCompare(b.tipo));
    return criados;
  }

  const serTurno = (t) => ({ ...t, responsavelNome: nome(t.responsavelId), atrasado: t.status === 'PENDENTE' && t.data < isoHoje() });

  function escala() {
    const hoje = isoHoje();
    const turnos = db.turnos.filter((t) => t.data >= somarDias(hoje, -7) && t.data <= somarDias(hoje, 21)).map(serTurno);
    const trocas = db.trocas.filter((tr) => tr.solicitanteId === euId || tr.solicitadoId === euId || ehAdmin()).map((tr) => ({
      ...tr, solicitanteNome: nome(tr.solicitanteId), solicitadoNome: nome(tr.solicitadoId),
      turnoSolicitante: serTurno(achar(db.turnos, tr.turnoSolicitanteId, 'Turno')), turnoSolicitado: serTurno(achar(db.turnos, tr.turnoSolicitadoId, 'Turno')),
    }));
    return { turnos, trocas };
  }

  const minhasNotificacoes = () => db.notificacoes.filter((n) => n.usuarioId === null || n.usuarioId === euId);

  function painel() {
    const hoje = isoHoje();
    const produtos = db.produtos.map(serProduto);
    return {
      hoje,
      validadeCritica: produtos.filter((p) => p.status === 'ATIVO' && p.estadoValidade === 'CRITICA'),
      estoqueBaixo: produtos.filter((p) => p.classificacao === 'COLETIVO' && p.abaixoDoMinimo),
      meuSaldoCentavos: balanco().saldos.find((s) => s.usuarioId === euId)?.saldoCentavos || 0,
      notificacoesNaoLidas: minhasNotificacoes().filter((n) => !n.lida).length,
    };
  }

  function sessao() {
    return { token: 'preview', usuario: { ...eu() } };
  }

  // ------------------------------------------------------------------ rotas falsas, mesmo formato da API
  const rotas = [
    ['POST', /^\/auth\/login$/, () => { euId = 1; return sessao(); }],
    ['POST', /^\/auth\/registro$/, (_, c) => {
      if (!c.nome || c.nome.length < 2) falha('Informe seu nome.');
      const id = novoId();
      db.membros.push({ id, nome: c.nome, email: c.email, perfil: c.codigoConvite ? 'MORADOR' : 'ADMIN', ativo: true });
      if (c.nomeRepublica) db.republica.nome = `${c.nomeRepublica} (demonstração)`;
      euId = id;
      return sessao();
    }],
    ['GET', /^\/eu$/, () => ({ ...eu() })],
    ['GET', /^\/painel$/, painel],
    ['GET', /^\/republica$/, () => ({ ...db.republica, codigoConvite: ehAdmin() ? db.republica.codigoConvite : null, membros: db.membros.map((m) => ({ ...m })) })],
    ['POST', /^\/republica\/convite$/, () => { exigirAdmin(); db.republica.codigoConvite = `IPE-${Math.floor(1000 + Math.random() * 9000)}`; return { codigoConvite: db.republica.codigoConvite }; }],
    ['PATCH', /^\/moradores\/(\d+)$/, ([id], c) => {
      exigirAdmin();
      const m = achar(db.membros, id, 'Morador');
      if (c.perfil) m.perfil = c.perfil;
      if (c.ativo !== undefined) {
        if (m.id === euId && !c.ativo) falha('Você não pode desativar a própria conta.');
        m.ativo = c.ativo;
      }
      if (!db.membros.some((x) => x.ativo && x.perfil === 'ADMIN')) { m.perfil = 'ADMIN'; m.ativo = true; falha('A república precisa de ao menos um administrador ativo.'); }
      return { ...m };
    }],
    ['GET', /^\/produtos/, () => db.produtos.map(serProduto)],
    ['POST', /^\/produtos$/, (_, c) => {
      if (!c.nome) falha('Informe o nome do produto.');
      if (!(c.quantidade > 0)) falha('A quantidade deve ser maior que zero.');
      if (!c.compartimento || c.compartimento.length < 2) falha('Informe o compartimento físico.');
      if (c.validade && c.validade < isoHoje()) falha('Não dá para cadastrar um produto já vencido.');
      const p = { id: novoId(), nome: c.nome, unidade: c.unidade, compartimento: c.compartimento, classificacao: c.classificacao, donoId: c.classificacao === 'INDIVIDUAL' ? euId : null, quantidadeMinima: c.quantidadeMinima, status: 'ATIVO', lotes: [{ id: novoId(), quantidade: c.quantidade, validade: c.validade }] };
      db.produtos.push(p);
      atualizarProduto(p);
      return serProduto(p);
    }],
    ['POST', /^\/produtos\/(\d+)\/consumo$/, ([id], c) => {
      const p = achar(db.produtos, id, 'Produto');
      if (p.classificacao === 'INDIVIDUAL' && p.donoId !== euId) falha('Este item é individual e pertence a outro morador.', 403, 'PROIBIDO');
      let falta = Number(c.quantidade);
      const total = p.lotes.reduce((s, l) => s + l.quantidade, 0);
      if (!(falta > 0)) falha('A quantidade deve ser maior que zero.');
      if (falta > total + 0.0001) falha(`Só há ${arred(total)} ${p.unidade} disponível(is).`);
      // FEFO: a baixa sai primeiro do lote que vence antes.
      [...p.lotes].sort((a, b) => (a.validade || '9999').localeCompare(b.validade || '9999')).forEach((l) => {
        const tira = Math.min(l.quantidade, falta); l.quantidade = arred(l.quantidade - tira); falta = arred(falta - tira);
      });
      atualizarProduto(p);
      return serProduto(p);
    }],
    ['POST', /^\/produtos\/(\d+)\/reposicao$/, ([id], c) => {
      const p = achar(db.produtos, id, 'Produto');
      if (!(Number(c.quantidade) > 0)) falha('A quantidade deve ser maior que zero.');
      const lote = p.lotes.find((l) => (l.validade || null) === (c.validade || null));
      if (lote) lote.quantidade = arred(lote.quantidade + Number(c.quantidade));
      else p.lotes.push({ id: novoId(), quantidade: Number(c.quantidade), validade: c.validade || null });
      atualizarProduto(p);
      return serProduto(p);
    }],
    ['POST', /^\/produtos\/(\d+)\/descarte$/, ([id]) => { const p = achar(db.produtos, id, 'Produto'); p.status = 'DESCARTADO'; return serProduto(p); }],
    ['GET', /^\/lista$/, () => db.lista.map(serItem)],
    ['POST', /^\/lista$/, (_, c) => {
      if (!c.nome) falha('Informe o produto.');
      if (!(c.quantidade > 0)) falha('A quantidade deve ser maior que zero.');
      const i = { id: novoId(), nome: c.nome, quantidade: c.quantidade, unidade: c.unidade, status: 'PENDENTE', origem: 'MANUAL', criadoPor: euId, compradoPor: null };
      db.lista.unshift(i);
      return serItem(i);
    }],
    ['PATCH', /^\/lista\/(\d+)$/, ([id], c) => { const i = achar(db.lista, id, 'Item'); if (!(c.quantidade > 0)) falha('A quantidade deve ser maior que zero.'); i.quantidade = c.quantidade; return serItem(i); }],
    ['POST', /^\/lista\/(\d+)\/comprado$/, ([id]) => { const i = achar(db.lista, id, 'Item'); i.status = 'COMPRADO'; i.compradoPor = euId; return serItem(i); }],
    ['DELETE', /^\/lista\/(\d+)$/, ([id]) => { const i = achar(db.lista, id, 'Item'); db.lista = db.lista.filter((x) => x !== i); return null; }],
    ['GET', /^\/compras$/, () => [...db.compras].sort((a, b) => b.data.localeCompare(a.data) || b.id - a.id).map(serCompra)],
    ['POST', /^\/compras$/, (_, c) => {
      if (!c.descricao) falha('Informe a descrição.');
      if (!(c.valorCentavos > 0)) falha('O valor deve ser maior que zero.');
      if (c.data > isoHoje()) falha('A data da compra não pode estar no futuro.');
      const compra = { id: novoId(), descricao: c.descricao, valorCentavos: c.valorCentavos, data: c.data, pagadorId: c.pagadorId, registradaPor: euId, status: ehAdmin() ? 'APROVADA' : 'PENDENTE', motivoRejeicao: null, fechada: false, participantes: ativosIds() };
      db.compras.push(compra);
      if (!ehAdmin()) notificar(db.membros.find((m) => m.perfil === 'ADMIN')?.id ?? null, `${eu().nome} registrou "${c.descricao}" e aguarda aprovação.`);
      return serCompra(compra);
    }],
    ['POST', /^\/compras\/(\d+)\/aprovacao$/, ([id]) => { exigirAdmin(); const c = achar(db.compras, id, 'Compra'); c.status = 'APROVADA'; c.participantes = ativosIds(); return serCompra(c); }],
    ['POST', /^\/compras\/(\d+)\/rejeicao$/, ([id], b) => { exigirAdmin(); const c = achar(db.compras, id, 'Compra'); c.status = 'REJEITADA'; c.motivoRejeicao = b?.motivo || null; return serCompra(c); }],
    ['GET', /^\/balanco$/, balanco],
    ['POST', /^\/fechamentos$/, (_, c) => {
      exigirAdmin();
      const doMes = db.compras.filter((x) => !x.fechada && x.data.slice(0, 7) <= c.periodo);
      if (doMes.some((x) => x.status === 'PENDENTE')) falha('Ainda há compras aguardando aprovação neste período.');
      if (db.fechamentos.some((f) => f.periodo === c.periodo)) falha('Este mês já foi fechado.');
      const acertos = simplificar(saldosDe(doMes)).map((t) => ({ id: novoId(), ...t, status: 'PENDENTE' }));
      doMes.forEach((x) => { x.fechada = true; });
      const f = { id: novoId(), periodo: c.periodo, acertos };
      db.fechamentos.push(f);
      return { ...f, acertos: acertos.map((a) => ({ ...a })) };
    }],
    ['POST', /^\/acertos\/(\d+)\/confirmacao$/, ([id]) => {
      const a = db.fechamentos.flatMap((f) => f.acertos).find((x) => x.id === Number(id)) || falha('Acerto não encontrado.', 404, 'NAO_ENCONTRADO');
      if (a.credorId !== euId && !ehAdmin()) falha('Só quem recebeu pode confirmar.', 403, 'PROIBIDO');
      a.status = 'CONFIRMADO';
      return { ...a };
    }],
    ['GET', /^\/escala/, escala],
    ['POST', /^\/escala$/, (_, c) => { exigirAdmin(); return { turnosCriados: gerarTurnos(c.inicio, c.dias, c.tipos) }; }],
    ['POST', /^\/turnos\/(\d+)\/conclusao$/, ([id]) => {
      const t = achar(db.turnos, id, 'Turno');
      if (t.responsavelId !== euId) falha('Só o responsável pode concluir este turno.', 403, 'PROIBIDO');
      if (t.data > isoHoje()) falha('Não dá para concluir um turno futuro.');
      t.status = 'CONCLUIDO';
      return serTurno(t);
    }],
    ['POST', /^\/trocas$/, (_, c) => {
      const meu = achar(db.turnos, c.meuTurnoId, 'Turno');
      const outro = achar(db.turnos, c.outroTurnoId, 'Turno');
      if (db.trocas.some((tr) => tr.turnoSolicitanteId === meu.id)) falha('Já existe um pedido de troca para este turno.');
      const tr = { id: novoId(), solicitanteId: euId, solicitadoId: outro.responsavelId, turnoSolicitanteId: meu.id, turnoSolicitadoId: outro.id };
      db.trocas.push(tr);
      notificar(outro.responsavelId, `${eu().nome} pediu para trocar ${ROTULO[meu.tipo]} com você.`);
      return { ...tr };
    }],
    ['POST', /^\/trocas\/(\d+)\/(aceite|recusa|cancelamento)$/, ([id, acao]) => {
      const tr = achar(db.trocas, id, 'Pedido de troca');
      if (acao === 'cancelamento' && tr.solicitanteId !== euId) falha('Só quem pediu pode cancelar.', 403, 'PROIBIDO');
      if (acao !== 'cancelamento' && tr.solicitadoId !== euId) falha('Só quem recebeu o pedido pode responder.', 403, 'PROIBIDO');
      if (acao === 'aceite') {
        const a = achar(db.turnos, tr.turnoSolicitanteId, 'Turno');
        const b = achar(db.turnos, tr.turnoSolicitadoId, 'Turno');
        [a.responsavelId, b.responsavelId] = [b.responsavelId, a.responsavelId];
        notificar(tr.solicitanteId, `${eu().nome} aceitou sua troca de turno.`);
      }
      db.trocas = db.trocas.filter((x) => x !== tr);
      return { id: tr.id, status: acao };
    }],
    ['GET', /^\/notificacoes$/, () => minhasNotificacoes().map((n) => ({ ...n }))],
    ['POST', /^\/notificacoes\/lidas$/, () => { minhasNotificacoes().forEach((n) => { n.lida = true; }); return null; }],
  ];

  async function api(metodo, caminho, corpo) {
    if (!db) semear();
    await new Promise((r) => setTimeout(r, 60)); // simula a ida ao servidor
    const sem = caminho.split('?')[0];
    for (const [m, re, fn] of rotas) {
      const achado = m === metodo && sem.match(re);
      if (achado) {
        const r = fn(achado.slice(1), corpo ? JSON.parse(JSON.stringify(corpo)) : corpo);
        return r === null || r === undefined ? null : JSON.parse(JSON.stringify(r));
      }
    }
    throw new ErroPreview(404, 'NAO_ENCONTRADO', 'Esta ação não existe no modo demonstração.');
  }

  window.CoChefPreview = {
    api,
    membros: () => { if (!db) semear(); return db.membros.filter((m) => m.ativo).map((m) => ({ id: m.id, nome: m.nome, perfil: m.perfil })); },
    usuarioAtual: () => euId,
    entrarComo: (id) => { euId = Number(id); return sessao(); },
    recomecar: () => { semear(); euId = 1; return sessao(); },
  };
})();
