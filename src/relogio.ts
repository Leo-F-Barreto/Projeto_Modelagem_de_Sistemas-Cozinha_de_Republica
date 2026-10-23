/** Fonte de tempo injetável: as regras de validade e escala dependem de "hoje", e os testes precisam controlá-lo. */
export interface Relogio {
  /** Data corrente no fuso da república, em AAAA-MM-DD. */
  hoje(): string;
  /** Instante corrente em ISO 8601 (UTC). */
  agora(): string;
  /** Instante corrente em segundos desde a época (para expiração de tokens). */
  segundos(): number;
}

export function relogioReal(fuso: string): Relogio {
  const formatador = new Intl.DateTimeFormat('en-CA', { timeZone: fuso, year: 'numeric', month: '2-digit', day: '2-digit' });
  return {
    hoje: () => formatador.format(new Date()),
    agora: () => new Date().toISOString(),
    segundos: () => Math.floor(Date.now() / 1000),
  };
}

/** Relógio fixo e ajustável, usado nos testes. */
export function relogioFixo(dataInicial: string): Relogio & { definir(data: string): void } {
  let data = dataInicial;
  return {
    hoje: () => data,
    agora: () => `${data}T12:00:00.000Z`,
    segundos: () => Math.floor(Date.parse(`${data}T12:00:00.000Z`) / 1000),
    definir: (nova: string) => {
      data = nova;
    },
  };
}
