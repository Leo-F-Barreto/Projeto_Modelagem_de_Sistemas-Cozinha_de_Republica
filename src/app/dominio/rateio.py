"""RB-02 / EX-05.4: divisão igualitária de uma compra coletiva entre os moradores ativos, em centavos inteiros."""


def ratear(valor_centavos: int, moradores: list[int], pagador_id: int) -> dict[int, int]:
    """Os centavos residuais ficam na cota do pagador, de modo que a soma das cotas é sempre o valor da compra.
    Se o pagador não participa do rateio, o resíduo é distribuído um centavo por morador, em ordem de id."""
    if isinstance(valor_centavos, bool) or not isinstance(valor_centavos, int) or valor_centavos <= 0:
        raise ValueError("valor deve ser inteiro positivo em centavos")
    participantes = sorted(set(moradores))
    if not participantes:
        raise ValueError("rateio exige ao menos um morador ativo")

    base, resto = divmod(valor_centavos, len(participantes))
    cotas = {morador: base for morador in participantes}
    if pagador_id in cotas:
        cotas[pagador_id] += resto
    else:
        for morador in participantes[:resto]:
            cotas[morador] += 1
    return cotas
