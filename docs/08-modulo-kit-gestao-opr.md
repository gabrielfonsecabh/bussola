# 08 - Módulo Kit mínimo de gestão, OPR e Bônus

## Objetivo do módulo

Tornar visível e cobrável o Kit mínimo de gestão de cada área, gerar o OPR (One
Page Report) mensal, e apurar o modelo de bônus da empresa (indicadores globais, setoriais e
individuais, com a régua por nível).

## O Kit mínimo de gestão

O indicador setorial do bônus pode exigir o Kit mínimo de gestão:

1. **Mapa estratégico da área**: já existe no módulo OKR (objetivos e OKRs da
   área). O Kit apenas checa se está preenchido e atualizado.
2. **Processos e procedimentos**: vem do módulo de processos. O Kit checa se os
   processos-chave da área têm SIPOC e dono.
3. **OPR (One Page Report)**: o relatório de uma página do mês, publicado.

A tabela `kit_gestao` registra, por área e período, o status de cada item
(pendente, em_dia, atrasado) e um percentual. O painel do Kit mostra o farol de
cada área, para diretores cobrarem o que falta.

## OPR (One Page Report)

Relatório mensal por área, de uma página, com: destaques do mês, resumo dos OKRs
(faróis), snapshot de indicadores, riscos e próximos passos. Fica em `opr` com
status rascunho/publicado. Publicar o OPR do mês conta como o item OPR do Kit.

A tela de OPR monta o relatório puxando dados já existentes (OKRs, indicadores,
projetos) e deixa o autor escrever destaques, riscos e próximos passos. Exporta em
PDF de uma página.

## Modelo de bônus

Configurável por empresa e ano em `bonus_config` (jsonb). Os valores abaixo são
os do seed de demonstração; cada empresa define os seus na tela:

- **Indicadores globais** (o "bolo"): por exemplo EBITDA com peso 60% e
  faturamento com 40%, cada um com sua régua de faixas (ex.: EBITDA abaixo de
  85% paga 0%, de 85,01% a 92% paga 50%, ..., 100% paga 100%).
- **Indicadores setoriais**: Kit mínimo de gestão, com fator deflator.
- **Indicadores individuais**: assiduidade, com fator deflator.
- **Régua de pagamento por nível** (multiplicador de salários): por exemplo
  diretoria 2,5, gerência 1,8, coordenação 1,3, especialista 1,2, demais 1.

`bonus_apuracao` guarda o atingimento apurado por escopo (global, área,
individual) e período. A Bússola calcula e mostra o atingimento; o pagamento em
dinheiro segue fora do sistema no v1.

## Telas

1. **Painel do Kit de gestão**: matriz áreas x itens (mapa, processos, OPR) com
   farol e percentual. Diretor cobra o vermelho.
2. **OPR do mês**: editor do relatório, com dados puxados e campos livres;
   botão publicar; exportar PDF.
3. **Configuração de bônus**: pesos e réguas (só company_admin ou quem tiver a
   permissão `bonus.config`).
4. **Apuração de bônus**: atingimento global (EBITDA, faturamento), setorial (Kit
   por área) e individual, com a régua aplicada e simulação por nível.

## RPCs

- `app.kit_status(p_area_id uuid, p_periodo text)` - avalia os três itens do Kit
  a partir dos módulos e devolve status + percentual (agrega no banco).
- `app.opr_montar(p_area_id uuid, p_periodo text)` - monta o snapshot do OPR.
- `app.bonus_apurar(p_company uuid, p_periodo text)` - aplica réguas e pesos sobre
  os indicadores e grava `bonus_apuracao`. Gate por `bonus.config`; função
  sensível, com auditoria.

## Permissões

| Chave | Quem |
|---|---|
| `kit.view` | gerente+ |
| `opr.edit` | gerente da área |
| `opr.publish` | gerente+ |
| `bonus.view` | diretoria |
| `bonus.config` | company_admin ou gestão de pessoas |

## Critérios de aceite

- O status do Kit de uma área reflete de fato o que existe nos módulos OKR e
  Processos (não é digitado à mão isoladamente).
- Publicar o OPR do mês marca o item OPR do Kit como em_dia.
- A apuração de bônus reproduz as réguas configuradas para os mesmos números.
- Tabelas de bônus nunca renderizam vazio como zero; distinguem "sem dado" de
  "falha".
- Configuração e apuração de bônus só acessíveis a quem tem a permissão, com teste
  negativo passando.
