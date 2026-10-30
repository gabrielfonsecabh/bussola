// ============================================================================
// cadastrar-pessoa
//
// POR QUE ISTO EXISTE NO SERVIDOR: criar usuário exige a `service_role`, e essa
// chave NUNCA pode ir para o frontend. É por aqui que uma pessoa nova ganha
// vínculo em `company_users` e passa a aparecer nos seletores de responsável.
//
// POR QUE SENHA TEMPORÁRIA E NÃO CONVITE POR E-MAIL: o envio de e-mail do
// Supabase nem sempre está configurado, e um convite que não chega é
// pior que nenhum convite, porque quem cadastrou acredita que chegou. Quem
// cadastra recebe a senha na resposta e repassa pelo canal que quiser.
//
// A senha volta UMA ÚNICA VEZ. Ela não fica guardada em lugar nenhum em texto
// aberto: o Auth guarda só o hash. Se a pessoa perder, o caminho é cadastrar de
// novo, que gera outra. E o banco já obriga a troca no primeiro acesso
// (`app.profiles.deve_trocar_senha`), então a senha temporária tem vida curta
// por desenho.
//
// A AUTORIZAÇÃO É VERIFICADA AQUI, não presumida: a função roda com a
// service_role, que ignora RLS, então ela mesma precisa provar que quem chamou
// pode convidar naquela empresa. É a mesma regra de um SECURITY DEFINER.
// ============================================================================
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.58.0'

/**
 * O preflight ECOA os cabeçalhos que o navegador pediu, em vez de listar os que
 * eu imagino que ele manda.
 *
 * A lista fixa ('authorization, x-client-info, apikey, content-type') passava
 * no curl e falhava no navegador com "Failed to send a request to the Edge
 * Function", porque o supabase-js acrescenta cabeçalhos próprios que mudam
 * entre versões. Cabeçalho de preflight não negociado é bloqueio silencioso: o
 * erro que chega na tela não diz qual cabeçalho faltou.
 */
function cors(req: Request) {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers':
      req.headers.get('Access-Control-Request-Headers') ??
      'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Max-Age': '86400',
  }
}

function responder(req: Request, corpo: unknown, status = 200) {
  return new Response(JSON.stringify(corpo), {
    status,
    headers: { ...cors(req), 'Content-Type': 'application/json' },
  })
}

/** Senha temporária forte. Só existe até o primeiro acesso. */
function senhaTemporaria(): string {
  const alfabeto = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789'
  const bytes = crypto.getRandomValues(new Uint8Array(14))
  const corpo = Array.from(bytes, (b) => alfabeto[b % alfabeto.length]).join('')
  // Garante os quatro tipos que a política de senha costuma exigir.
  return `Bu${corpo}9!`
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors(req) })
  if (req.method !== 'POST') return responder(req, { erro: 'Use POST' }, 405)

  const url = Deno.env.get('SUPABASE_URL')!
  const anon = Deno.env.get('SUPABASE_ANON_KEY')!
  const service = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

  const autorizacao = req.headers.get('Authorization') ?? ''
  if (!autorizacao.startsWith('Bearer ')) {
    return responder(req, { erro: 'Faltou o cabeçalho de autorização' }, 401)
  }

  // 1. Quem está chamando, provado pelo próprio token.
  const comoUsuario = createClient(url, anon, {
    global: { headers: { Authorization: autorizacao } },
  })
  const { data: sessao, error: erroSessao } = await comoUsuario.auth.getUser()
  if (erroSessao || !sessao?.user) {
    return responder(req, { erro: 'Sessão inválida' }, 401)
  }
  const quemChama = sessao.user.id

  let corpo: Record<string, unknown>
  try {
    corpo = await req.json()
  } catch {
    return responder(req, { erro: 'Corpo não é JSON válido' }, 400)
  }

  const email = String(corpo.email ?? '').trim().toLowerCase()
  const nome = String(corpo.nome ?? '').trim()
  const companyId = String(corpo.company_id ?? '')
  const nivel = String(corpo.nivel ?? 'colaborador')
  const papel = String(corpo.papel ?? 'colaborador')
  const cargo = corpo.cargo ? String(corpo.cargo).trim() : null
  const areaId = corpo.area_id ? String(corpo.area_id) : null

  if (!email.includes('@')) return responder(req, { erro: 'E-mail inválido' }, 400)
  if (nome.length < 2) return responder(req, { erro: 'Informe o nome da pessoa' }, 400)
  if (!companyId) return responder(req, { erro: 'Informe a empresa' }, 400)

  const admin = createClient(url, service, { auth: { persistSession: false } })

  // 2. A autorização, perguntada COM O TOKEN DE QUEM CHAMA.
  //
  //    Isto não é detalhe: `is_company_admin` e `has_permission` devolvem NULL
  //    de propósito quando alguém pergunta sobre TERCEIROS (é a decisão D13 do
  //    projeto, os predicados de acesso não respondem sobre outra pessoa).
  //    A service_role não tem auth.uid(), então perguntar por ela faz a própria
  //    função responder NULL, e a checagem falharia fechada para todo mundo,
  //    inclusive o admin. Perguntando com o token do chamador, _user_id é igual
  //    a auth.uid() e a resposta é a verdadeira.
  //
  //    E é o desenho certo: quem chama prova a própria permissão.
  const { data: ehAdmin } = await comoUsuario.schema('app').rpc('is_company_admin', {
    _user_id: quemChama,
    _company_id: companyId,
  })
  const { data: temChave } = await comoUsuario.schema('app').rpc('has_permission', {
    _user_id: quemChama,
    _company_id: companyId,
    _key: 'admin.pessoas',
  })
  if (!ehAdmin && !temChave) {
    return responder(
      { erro: 'Sem permissão para convidar pessoas nesta empresa (admin.pessoas)' },
      403,
    )
  }

  // 3. A pessoa pode já existir: neste caso só se cria o vínculo novo, e a
  //    senha NÃO é trocada. Convidar alguém que já usa o sistema para uma
  //    segunda empresa é caso legítimo, e resetar a senha dela seria um
  //    estrago silencioso.
  const { data: existentes } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 })
  const jaExiste = existentes?.users?.find((u) => u.email?.toLowerCase() === email)

  let userId: string
  let senha: string | null = null

  if (jaExiste) {
    userId = jaExiste.id
  } else {
    senha = senhaTemporaria()
    const { data: criado, error: erroCriar } = await admin.auth.admin.createUser({
      email,
      password: senha,
      email_confirm: true,
      user_metadata: { nome },
    })
    if (erroCriar || !criado?.user) {
      return responder(req, { erro: `Não foi possível criar o acesso: ${erroCriar?.message}` }, 400)
    }
    userId = criado.user.id
  }

  // 4. O dado de negócio vai por RPC, com o token de QUEM CONVIDOU.
  //
  //    A service_role NÃO tem acesso ao schema app (é postura deliberada do
  //    projeto: só `authenticated` recebeu grant). Afrouxar isso daria à chave
  //    de serviço acesso irrestrito às 34 tabelas para resolver dois inserts.
  //    Então a chave de serviço faz só o que só ela pode, criar o usuário no
  //    auth, e perfil, vínculo e papel vão juntos numa transação do banco.
  const { error: erroVinculo } = await comoUsuario.schema('app').rpc('vincular_pessoa', {
    p_company: companyId,
    p_user: userId,
    p_nome: nome,
    p_email: email,
    p_nivel: nivel,
    p_papel: papel,
    p_cargo: cargo,
    p_area_id: areaId,
    // Só força a troca quando ESTA chamada criou o acesso.
    p_forcar_troca: !jaExiste,
  })

  if (erroVinculo) {
    // O acesso foi criado e o vínculo não. Dizer isso é melhor que fingir
    // sucesso: a pessoa existe no auth e não aparece em lugar nenhum.
    return responder(
      {
        erro: `O acesso foi criado, mas o vínculo com a empresa falhou: ${erroVinculo.message}`,
        user_id: userId,
        senha_temporaria: senha,
      },
      207,
    )
  }

  return responder(req, {
    user_id: userId,
    ja_existia: !!jaExiste,
    senha_temporaria: senha,
    email,
    nome,
    aviso: senha
      ? 'Esta senha aparece uma única vez. Repasse à pessoa: o sistema vai exigir a troca no primeiro acesso.'
      : 'Esta pessoa já tinha acesso ao sistema. Foi criado apenas o vínculo com esta empresa, e a senha dela não mudou.',
  })
})
