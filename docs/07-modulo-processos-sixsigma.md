# 07 - Módulo Processos e Six Sigma

## Objetivo do módulo

Mapear os processos da companhia, medir o que importa e conduzir melhorias com
método (Six Sigma / DMAIC), ligando o ganho de cada melhoria ao objetivo
de melhoria do mapa da área.

## Conceitos

- **Processo**: um fluxo de trabalho com dono. Tipo primário, de apoio ou de
  gestão. Tem nível de maturidade (1 a 5) e um SIPOC.
- **SIPOC**: Suppliers, Inputs, Process, Outputs, Customers. A foto de alto nível
  do processo. `steps` em jsonb para a sequência.
- **Projeto de melhoria**: a iniciativa que melhora um processo. Método pode ser
  `dmaic` (completo), `kaizen` ou `just_do_it` (mais leves).
- **DMAIC**: as cinco fases (Define, Measure, Analyze, Improve, Control), cada uma
  um tollgate em `dmaic_etapas` com entregáveis e aprovação.
- **Indicador de processo**: métrica do tipo Y (resultado) ou X (causa), com meta
  e baseline; medições formam a série temporal.

## Fluxo DMAIC (ver diagrama)

1. **Define**: problema, meta SMART, escopo, SIPOC. Tollgate: escopo aprovado.
2. **Measure**: definir os Y, coletar baseline. Tollgate: sistema de medição ok.
3. **Analyze**: causas-raiz, identificar os X vitais. Tollgate: causas validadas.
4. **Improve**: desenhar e pilotar melhorias. Tollgate: piloto aprovado.
5. **Control**: padronizar, monitorar o Y, registrar o ganho. Tollgate:
   sustentação comprovada.

Cada tollgate registra data de conclusão, entregáveis e quem aprovou. Melhorias
`kaizen`/`just_do_it` pulam os tollgates que não fazem sentido para o porte.

## Ligações

- `projetos_melhoria.processo_id` conecta a melhoria ao processo.
- O ganho estimado e o realizado somam por área, alimentando o painel de melhoria
  e o Kit de gestão.
- Uma melhoria também pode virar um `projeto` no módulo de projetos quando exigir
  gestão de cronograma e time (referência cruzada, não duplicação de dados).

## Telas

1. **Inventário de processos** (por área): lista com dono, tipo, maturidade,
   status. Drill-down para o processo e seu SIPOC.
2. **Processo** (detalhe): SIPOC, indicadores (com mini-série), melhorias ligadas.
3. **Projetos de melhoria**: quadro por fase DMAIC (colunas D-M-A-I-C), com o
   avanço dos tollgates. Filtro por belt responsável e por processo.
4. **Melhoria** (detalhe): problema, meta SMART, etapas DMAIC com entregáveis,
   ganho estimado vs. realizado.
5. **Indicadores de processo**: cadastro e medições, com gráfico de tendência.

## RPCs

- `app.melhoria_avancar_fase(p_id uuid, p_fase text)` - move a fase respeitando a
  ordem dos tollgates; gate por `processo.edit`.
- `app.processo_indicadores(p_processo_id uuid, p_de date, p_ate date)` - série
  agregada no banco para o gráfico.

## Permissões

| Chave | Quem |
|---|---|
| `processo.view` | todos da empresa |
| `processo.edit` | dono do processo, gerente+ |
| `melhoria.edit` | belt responsável, gerente+ |
| `processo.delete` | company_admin |

## Critérios de aceite

- Um processo tem SIPOC e pelo menos um indicador Y antes de abrir melhoria DMAIC.
- Avançar de fase exige o tollgate anterior concluído (regra no banco).
- O ganho realizado só é preenchido na fase Control.
- Séries de indicadores abrem por RPC agregada, sem puxar todas as medições ao
  cliente.
