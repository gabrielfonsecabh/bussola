#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Monta o guia do Bússola num ARQUIVO ÚNICO, para anexar e enviar.

    python3 scripts/gerar-guia.py

Lê `docs/guia/guia.src.html`, troca cada marca {{IMG:nome}} pela imagem
correspondente de `docs/guia/telas/` embutida em base64, e escreve
`docs/guia-do-bussola.html`.

POR QUE EMBUTIR AS IMAGENS: o arquivo precisa funcionar sozinho, anexado num
e-mail ou mandado por WhatsApp, sem uma pasta de imagens ao lado que se perde
no caminho. É o que separa "um guia" de "um guia e 21 arquivos soltos".

POR QUE NÃO EMBUTIR AS FONTES: seriam mais alguns megabytes para um ganho que
só aparece offline, e a folha já declara pilha de fallback real (Georgia para o
corpo, Helvetica para os títulos). Vale a pena quando alguém pedir.
"""
import base64
import pathlib
import re
import sys

RAIZ = pathlib.Path(__file__).resolve().parent.parent
FONTE = RAIZ / "docs" / "guia" / "guia.src.html"
TELAS = RAIZ / "docs" / "guia" / "telas"
SAIDA = RAIZ / "docs" / "guia-do-bussola.html"

MIME = {".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png"}


def main() -> int:
    if not FONTE.exists():
        print(f"não achei a fonte: {FONTE}", file=sys.stderr)
        return 1

    corpo = FONTE.read_text(encoding="utf-8")
    faltando: list[str] = []

    def trocar(m: re.Match[str]) -> str:
        nome = m.group(1)
        for ext in (".jpg", ".jpeg", ".png"):
            caminho = TELAS / f"{nome}{ext}"
            if caminho.exists():
                dados = base64.b64encode(caminho.read_bytes()).decode()
                return f"data:{MIME[ext]};base64,{dados}"
        faltando.append(nome)
        return m.group(0)

    corpo = re.sub(r"\{\{IMG:([a-z0-9\-]+)\}\}", trocar, corpo)
    if faltando:
        print("imagens faltando: " + ", ".join(sorted(set(faltando))), file=sys.stderr)
        return 1

    # O arquivo autônomo precisa do envelope que o host do artefato fornecia:
    # doctype, charset, viewport e um reset mínimo. Sem `color-scheme`, o
    # navegador pinta os controles e a barra de rolagem sempre no tema claro,
    # mesmo com a página escura.
    pagina = f"""<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light dark">
<meta name="description" content="Guia de uso do Bússola, o sistema de gestão estratégica open source.">
<style>
  *,*::before,*::after{{box-sizing:border-box}}
  html{{-webkit-text-size-adjust:100%}}
  body{{margin:0}}
  img{{max-width:100%}}
  [hidden]{{display:none!important}}
</style>
{corpo}
</body>
</html>
"""
    SAIDA.parent.mkdir(parents=True, exist_ok=True)
    SAIDA.write_text(pagina, encoding="utf-8")
    tamanho = SAIDA.stat().st_size / 1024 / 1024
    telas = len(re.findall(r"data:image/", pagina))
    print(f"{SAIDA.relative_to(RAIZ)}: {tamanho:.2f} MB, {telas} telas embutidas")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
