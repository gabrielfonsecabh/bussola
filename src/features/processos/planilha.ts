/**
 * Leitura e classificação da planilha de mapeamento de processos.
 *
 * Módulo puro: sem React e sem Supabase. As regras abaixo saíram da análise da
 * planilha real da controladoria e são as mesmas usadas na carga inicial. Elas
 * moram aqui, isoladas, para poderem ser conferidas e testadas sem subir tela
 * nem banco: a classificação de uma linha é uma decisão sobre o processo de
 * alguém, e ela precisa ser auditável.
 *
 * A biblioteca de leitura entra por `import()` dinâmico dentro da função de
 * leitura, e não no topo do arquivo: quem abre a rota sem subir planilha não
 * paga o download do parser de xlsx.
 */

/**
 * As dez cadências aceitas pelo banco (espelha `PERIODICIDADES` de `api.ts`).
 *
 * A lista é duplicada de propósito: importar de `api.ts` arrastaria o cliente
 * do Supabase para dentro de um módulo que precisa continuar puro. Se o check
 * do banco mudar, os dois lugares mudam juntos.
 */
export const CADENCIAS = [
  'diario',
  'semanal',
  'quinzenal',
  'mensal',
  'bimestral',
  'trimestral',
  'semestral',
  'anual',
  'sob_demanda',
  'continuo',
] as const

export type Cadencia = (typeof CADENCIAS)[number]

/** Uma linha da planilha já interpretada, pronta para virar processo. */
export type LinhaImportada = {
  /** Número da linha NA PLANILHA (o cabeçalho é a linha 1), para o usuário
   *  achar no arquivo dele exatamente a linha que a tela está comentando. */
  linha: number
  nome: string
  categoria: string | null
  /** S do SIPOC: responsável de origem, de quem vem a entrada. */
  suppliers: string | null
  /** C do SIPOC: responsável de destino, quem recebe a saída. */
  customers: string | null
  /** O do SIPOC: a entrega descrita pela área. */
  outputs: string | null
  /** Cadência classificada, ou NULA quando não dá para classificar. */
  periodicidade: Cadencia | null
  /** O que a planilha escreveu na periodicidade, palavra por palavra. */
  periodicidade_origem: string | null
  /** O prazo como a área o enuncia: "dia 5", "15 dias antes do vencimento". */
  prazo_referencia: string | null
  /** Pergunta ou recado que vinha colado no nome da atividade. */
  pendencia_de_mapeamento: string | null
  descricao: string | null
}

export type ErroDaPlanilha = {
  /** 'arquivo' impede tudo; 'coluna' impede a importação; 'linha' descarta só
   *  aquela linha, e existe para que ela não suma em silêncio. */
  tipo: 'arquivo' | 'coluna' | 'linha'
  mensagem: string
  linha?: number
}

export type ResultadoDaLeitura = {
  linhas: LinhaImportada[]
  erros: ErroDaPlanilha[]
}

type ChaveDeColuna =
  | 'atividade'
  | 'tempo'
  | 'categoria'
  | 'origem'
  | 'destino'
  | 'periodicidade'
  | 'prazo'
  | 'entrega'

type DefinicaoDeColuna = {
  chave: ChaveDeColuna
  /** Como o cabeçalho aparece na planilha, para a mensagem de erro citar o
   *  nome que a pessoa vê no arquivo dela. */
  rotulo: string
  /** Já normalizados (sem acento, minúsculos, pontuação virando espaço). */
  apelidos: string[]
}

const COLUNAS: DefinicaoDeColuna[] = [
  { chave: 'atividade', rotulo: 'Atividade', apelidos: ['atividade', 'atividades'] },
  {
    chave: 'tempo',
    rotulo: 'Tempo estimado de execução',
    apelidos: ['tempo estimado de execucao', 'tempo estimado', 'tempo'],
  },
  { chave: 'categoria', rotulo: 'Categoria', apelidos: ['categoria'] },
  {
    chave: 'origem',
    rotulo: 'Responsável de origem',
    apelidos: ['responsavel de origem', 'responsavel origem', 'origem'],
  },
  {
    chave: 'destino',
    rotulo: 'Responsável de destino',
    apelidos: ['responsavel de destino', 'responsavel destino', 'destino'],
  },
  { chave: 'periodicidade', rotulo: 'Periodicidade', apelidos: ['periodicidade'] },
  { chave: 'prazo', rotulo: 'Prazo', apelidos: ['prazo'] },
  {
    chave: 'entrega',
    rotulo: 'Entrega / Resultado',
    apelidos: ['entrega resultado', 'entrega', 'resultado'],
  },
]

/**
 * Texto comparável: sem acento, minúsculo, e com qualquer pontuação virando
 * espaço. É o que faz "Entrega / Resultado" casar com "entrega resultado" e
 * "Quinzenal/Mensal" virar duas palavras em vez de uma só.
 */
export function normalizar(texto: string): string {
  return texto
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

/**
 * Os padrões de cadência, um por valor aceito.
 *
 * `\b` no início importa: sem ele "semianual" viraria "anual" e "1 dia" já
 * estaria a um caractere de virar "diário".
 */
const PADROES: { cadencia: Cadencia; padrao: RegExp }[] = [
  { cadencia: 'diario', padrao: /\bdiari[oa]/ },
  { cadencia: 'semanal', padrao: /\bsemanal/ },
  { cadencia: 'quinzenal', padrao: /\bquinzenal/ },
  { cadencia: 'mensal', padrao: /\bmensal/ },
  { cadencia: 'bimestral', padrao: /\bbimestral/ },
  { cadencia: 'trimestral', padrao: /\btrimestral/ },
  { cadencia: 'semestral', padrao: /\bsemestral/ },
  { cadencia: 'anual', padrao: /\banual/ },
  { cadencia: 'sob_demanda', padrao: /\b(sob|conforme) (a )?demanda\b/ },
  { cadencia: 'continuo', padrao: /\bcontinu[oa]|\bmanter atualizad[oa]/ },
]

/**
 * Classifica o texto de periodicidade numa das dez cadências, ou em NADA.
 *
 * Duas regras que parecem detalhe e não são:
 *
 * 1. Texto com MAIS DE UMA cadência ("Quinzenal/Mensal/Conforme demanda") não
 *    vira a primeira que casou. Ele vira nulo, porque a área ainda não decidiu
 *    qual é, e escolher por ela produziria um POP e um calendário errados sem
 *    ninguém perceber.
 * 2. Texto que não casa com nada ("15 dias antes do vencimento", que é gatilho,
 *    e "1 dia", que é prazo de execução) também vira nulo. Cadência
 *    desconhecida NÃO é "sob demanda": "sob demanda" é uma afirmação sobre o
 *    processo, e aqui não se sabe nada.
 *
 * Em qualquer um dos casos o texto original continua guardado em
 * `periodicidade_origem`, que é quem devolve a pergunta para a área.
 */
export function classificarCadencia(texto: string | null | undefined): Cadencia | null {
  if (!texto) return null
  const normalizado = normalizar(texto)
  if (normalizado === '') return null

  const achadas = new Set<Cadencia>()
  for (const { cadencia, padrao } of PADROES) {
    if (padrao.test(normalizado)) achadas.add(cadencia)
  }
  if (achadas.size !== 1) return null
  return [...achadas][0] ?? null
}

/** Marcas de recado, já normalizadas. */
const MARCAS_DE_PENDENCIA = [
  'ver com',
  'vamos',
  'ver se',
  'vai ver',
  'a detalhar',
  'nao seria',
]

/** Hífen ou travessão cercado de espaços, capturado para o `split`. */
const SEPARADOR = /(\s+[-\u2013\u2014]\s+)/

function ehRecado(pedaco: string): boolean {
  if (pedaco.includes('?')) return true
  const normalizado = normalizar(pedaco)
  return MARCAS_DE_PENDENCIA.some((marca) => normalizado.includes(marca))
}

export type NomeSeparado = { nome: string; pendencia: string | null }

/**
 * Separa o recado que veio colado no nome da atividade.
 *
 * O corte é conservador de propósito: só sai do nome o pedaço que É recado
 * (tem "?" ou uma das marcas). Pedaço que não é recado CONTINUA NO NOME.
 *
 * Cortar tudo o que vem depois do hífen parece mais limpo e é pior: "Certidões
 * - controle geral" viraria "Certidões", o nome perderia o que ele distingue,
 * e duas linhas que compartilham o prefixo virariam dois processos com nome
 * idêntico no inventário. Quem nomeou o processo foi a área.
 */
export function separarPendencia(bruto: string): NomeSeparado {
  const pedacos = bruto
    .split(SEPARADOR)
    // O `split` com grupo de captura devolve [pedaço, separador, pedaço, ...]:
    // os índices ímpares são os separadores e não interessam aqui.
    .filter((_, i) => i % 2 === 0)
    .map((p) => p.trim())
    .filter((p) => p !== '')

  const recados = pedacos.filter((p) => ehRecado(p))
  if (recados.length === 0) return { nome: bruto.trim(), pendencia: null }

  const mantidos = pedacos.filter((p) => !ehRecado(p))
  return {
    // Quando TODO o conteúdo da célula é recado (a atividade inteira é uma
    // pergunta), o nome fica com o texto inteiro: um processo sem nome é pior
    // que um processo com nome esquisito, e a pendência abaixo já avisa.
    nome: mantidos.length > 0 ? mantidos.join(' - ') : bruto.trim(),
    pendencia: recados.join(' | '),
  }
}

function formatarData(data: Date): string {
  const dia = String(data.getDate()).padStart(2, '0')
  const mes = String(data.getMonth() + 1).padStart(2, '0')
  return `${dia}/${mes}/${data.getFullYear()}`
}

/**
 * Célula bruta para texto. Vazio vira NULL, nunca string vazia: `''` e `null`
 * parecem a mesma coisa na tela e são coisas diferentes na consulta.
 */
function comoTexto(celula: unknown): string | null {
  if (celula === null || celula === undefined) return null
  if (celula instanceof Date) return formatarData(celula)
  if (typeof celula === 'number') return Number.isFinite(celula) ? String(celula) : null
  if (typeof celula === 'boolean') return celula ? 'sim' : 'não'
  const texto = String(celula).trim()
  return texto === '' ? null : texto
}

function mapearCabecalho(cabecalho: readonly unknown[]): {
  indices: Partial<Record<ChaveDeColuna, number>>
  faltando: DefinicaoDeColuna[]
} {
  const indices: Partial<Record<ChaveDeColuna, number>> = {}

  for (const [i, celula] of cabecalho.entries()) {
    const texto = comoTexto(celula)
    if (!texto) continue
    const normalizado = normalizar(texto)
    const definicao = COLUNAS.find((c) =>
      // Exato primeiro, e só então prefixo: cabeçalho real costuma vir com
      // sufixo ("Responsável de origem (área)") sem mudar de significado.
      c.apelidos.some((a) => normalizado === a || normalizado.startsWith(`${a} `)),
    )
    // Primeira ocorrência vence: planilha com a coluna repetida não deve
    // trocar silenciosamente qual das duas está sendo lida.
    if (definicao && indices[definicao.chave] === undefined) indices[definicao.chave] = i
  }

  return { indices, faltando: COLUNAS.filter((c) => indices[c.chave] === undefined) }
}

/**
 * O coração da leitura, separado do arquivo para poder ser testado com uma
 * matriz escrita à mão.
 */
export function interpretarLinhas(
  matriz: readonly (readonly unknown[])[],
): ResultadoDaLeitura {
  const erros: ErroDaPlanilha[] = []
  const cabecalho = matriz[0]

  if (!cabecalho) {
    erros.push({ tipo: 'arquivo', mensagem: 'A planilha não tem nenhuma linha.' })
    return { linhas: [], erros }
  }

  const { indices, faltando } = mapearCabecalho(cabecalho)

  // Cabeçalho que não bate vira erro NOMEADO, nunca importação silenciosa com
  // a coluna vazia: importar sem o responsável de destino produz um inventário
  // que parece completo e não tem dono de saída em lugar nenhum.
  for (const coluna of faltando) {
    erros.push({
      tipo: 'coluna',
      mensagem: `A coluna "${coluna.rotulo}" não foi encontrada no cabeçalho da primeira linha.`,
    })
  }

  const iAtividade = indices.atividade
  if (iAtividade === undefined) {
    return { linhas: [], erros }
  }

  const ler = (linha: readonly unknown[], chave: ChaveDeColuna): string | null => {
    const i = indices[chave]
    return i === undefined ? null : comoTexto(linha[i])
  }

  const linhas: LinhaImportada[] = []

  for (let i = 1; i < matriz.length; i++) {
    const bruta = matriz[i]
    if (!bruta) continue
    const numeroNaPlanilha = i + 1

    const atividade = comoTexto(bruta[iAtividade])
    if (!atividade) {
      const temAlgumDado = bruta.some((c) => comoTexto(c) !== null)
      // Linha totalmente vazia é sobra de formatação da planilha e some sem
      // ruído. Linha COM dado e SEM atividade é outra coisa: alguém escreveu
      // ali, e o descarte precisa aparecer.
      if (temAlgumDado) {
        erros.push({
          tipo: 'linha',
          linha: numeroNaPlanilha,
          mensagem: `A linha ${numeroNaPlanilha} tem conteúdo mas está sem "Atividade", então não será importada.`,
        })
      }
      continue
    }

    const { nome, pendencia } = separarPendencia(atividade)
    const periodicidadeOrigem = ler(bruta, 'periodicidade')
    const prazo = ler(bruta, 'prazo')

    linhas.push({
      linha: numeroNaPlanilha,
      nome,
      categoria: ler(bruta, 'categoria'),
      suppliers: ler(bruta, 'origem'),
      customers: ler(bruta, 'destino'),
      outputs: ler(bruta, 'entrega'),
      // Só cai no prazo quando a periodicidade está VAZIA. Periodicidade
      // preenchida e não classificável continua não classificada: o prazo
      // responde outra pergunta ("até quando"), não "de quanto em quanto".
      periodicidade: classificarCadencia(periodicidadeOrigem ?? prazo),
      periodicidade_origem: periodicidadeOrigem,
      prazo_referencia: prazo,
      pendencia_de_mapeamento: pendencia,
      // A coluna "Tempo estimado de execução" da planilha real não tem tempo
      // nenhum: onde tem algo, é recado ("Disponibilizar no drive"). Vai para
      // a descrição. Inventar minutos a partir dela seria criar medição onde
      // não houve medição.
      descricao: ler(bruta, 'tempo'),
    })
  }

  return { linhas, erros }
}

/**
 * Lê o arquivo .xlsx e devolve as linhas já interpretadas.
 *
 * O parser entra por `import()` aqui dentro para ficar num chunk separado,
 * baixado só quando alguém realmente escolhe um arquivo.
 */
export async function lerPlanilhaDeProcessos(
  entrada: File | Blob | ArrayBuffer,
): Promise<ResultadoDaLeitura> {
  // O caminho `/browser` é o que a versão 9 expõe para o navegador; o pacote
  // não tem mais entrada raiz.
  const { readSheet } = await import('read-excel-file/browser')
  const matriz = await readSheet(entrada)
  return interpretarLinhas(matriz)
}
