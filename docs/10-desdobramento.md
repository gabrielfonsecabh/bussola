# 10 - Modelo de desdobramento por diretoria

Para desdobrar as demais diretorias (no seed de exemplo: Comercial, Operações e
Pessoas). A Diretoria Administrativo-Financeira já vem desdobrada na `0009` e
serve de exemplo completo.

## O que existe

- `docs/templates/desdobramento-diretoria.sql` - modelo que **já roda** com
  valores de exemplo. Enquanto está em `docs/templates/` ele não é aplicado; só
  passa a rodar quando copiado para `supabase/migrations/`.

## Passo a passo

1. Copie o modelo para `supabase/migrations/` com um número depois do último
   arquivo existente, por exemplo:
   - `0100_desdobramento_comercial.sql`
   - `0101_desdobramento_operacoes.sql`
   - `0102_desdobramento_pessoas.sql`
2. Ajuste os três pontos marcados com `PREENCHA`:
   - nome exato da diretoria (já criada no seed `0008`);
   - título único do OKR da diretoria (o guard de idempotência usa esse título);
   - nomes das gerências e o conteúdo dos OKRs/KRs.
3. Duplique ou remova os blocos de OKR e de KR conforme a diretoria.
4. Rode `npm run db:push`. Reaplicar não duplica (o guard cuida disso).

Os responsáveis (coluna de nome) só entram no sistema depois que as pessoas
forem cadastradas no Auth; deixe o vínculo para a tela de Pessoas, ou adicione
`responsavel_user_id` no insert da área quando os usuários existirem.

## Como preencher os Key Results

- Meta numérica ou percentual: `tipo` = `percentual`/`numerico`/`moeda`, com
  `meta` (número), `unidade` e `direcao` (`subir` para "quanto maior melhor",
  `descer` para "quanto menor melhor", como zero de multas). O farol calcula
  sozinho a partir disso.
- Meta em data ou texto (ex.: "até jul/27", "mínimo impacto", "garantida"):
  `tipo` = `marco`, `meta` = null, e escreva o alvo dentro do texto do KR.

## Dica de qualidade

Um bom desdobramento tem, por gerência, um objetivo claro (o "O" do OKR) e de 3
a 6 KRs mensuráveis. Evite KR sem número e sem data: se não dá para medir nem
marcar conclusão, provavelmente é atividade, e atividade vive no módulo de
Projetos, não como KR.
