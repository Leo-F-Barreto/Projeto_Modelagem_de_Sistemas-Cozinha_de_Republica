"""RF-07.2 / RF-07.5: token de sessão JWT (RFC 7519) assinado com HS256.

Só HS256 é aceito, o que elimina ataques por troca de algoritmo ("alg: none", confusão RS/HS).
A expiração é conferida contra o relógio injetado, para que os testes controlem o tempo.
"""

import jwt


def emitir_token(
    usuario_id: int, perfil: str, republica_id: int, segredo: str, agora_seg: int, duracao_seg: int
) -> str:
    dados = {
        "sub": str(usuario_id),
        "perfil": perfil,
        "rep": republica_id,
        "iat": agora_seg,
        "exp": agora_seg + duracao_seg,
    }
    return jwt.encode(dados, segredo, algorithm="HS256")


def verificar_token(token: str, segredo: str, agora_seg: int) -> int | None:
    """Devolve o id do usuário, ou None se o token for inválido, adulterado ou expirado."""
    try:
        dados = jwt.decode(
            token,
            segredo,
            algorithms=["HS256"],
            options={"verify_exp": False, "verify_iat": False, "require": ["sub", "exp"]},
        )
    except jwt.PyJWTError:
        return None
    exp = dados.get("exp")
    if not isinstance(exp, int) or exp <= agora_seg:
        return None
    sub = dados.get("sub")
    return int(sub) if isinstance(sub, str) and sub.isdigit() else None
