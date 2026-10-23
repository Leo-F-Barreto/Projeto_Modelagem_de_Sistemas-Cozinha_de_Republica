import { createServer } from 'node:http';
import { carregarConfig } from './config.ts';
import { Banco } from './db.ts';
import { relogioReal } from './relogio.ts';
import { criarApp } from './http/app.ts';
import { executarRotinasGlobais } from './servicos/rotinas.ts';
import type { Contexto } from './servicos/contexto.ts';

const config = carregarConfig();
const ctx: Contexto = { db: new Banco(config.caminhoBanco), relogio: relogioReal(config.fuso), config };

// Log estruturado (uma linha JSON por evento) na saída padrão.
const registrar = (evento: Record<string, unknown>) => console.log(JSON.stringify({ em: new Date().toISOString(), ...evento }));

const servidor = createServer(criarApp(ctx, { limiteAuth: config.limiteAuth, registrar }));

// Ator "Sistema / Notificador Automatizado": roda na subida e a cada hora.
function rodarRotinas(): void {
  try {
    const inicio = performance.now();
    const republicas = executarRotinasGlobais(ctx);
    registrar({ nivel: 'info', evento: 'rotinas', republicas, duracaoMs: Math.round(performance.now() - inicio) });
  } catch (erro) {
    registrar({ nivel: 'erro', evento: 'rotinas', mensagem: String(erro) });
  }
}
rodarRotinas();
const agendador = setInterval(rodarRotinas, 60 * 60 * 1000);

servidor.listen(config.porta, () => registrar({ nivel: 'info', evento: 'servidor_iniciado', url: `http://localhost:${config.porta}` }));

function encerrar(): void {
  clearInterval(agendador);
  servidor.close(() => {
    ctx.db.fechar();
    process.exit(0);
  });
}
process.on('SIGINT', encerrar);
process.on('SIGTERM', encerrar);
