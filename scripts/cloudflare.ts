import { createHash } from 'node:crypto'
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import type { Plugin, ResolvedConfig } from 'vite'

/**
 * Gera o `_headers` do Cloudflare no fim do build.
 *
 * Por que gerar em vez de deixar em `public/`:
 *
 * 1. O CSP precisa da URL EXATA do Supabase, que muda entre ambientes. Um
 *    arquivo estático em `public/` só conseguiria um curinga `*.supabase.co`,
 *    que permitiria qualquer projeto Supabase do mundo como destino.
 * 2. O `index.html` tem um script INLINE (o que aplica o tema antes da primeira
 *    pintura, para não piscar branco no escuro). Com `script-src 'self'` ele
 *    seria bloqueado, e a página abriria no tema errado por um instante. Aqui o
 *    hash dele é calculado do arquivo construído, então o CSP libera exatamente
 *    aquele script e mais nenhum.
 */
export function cloudflarePages(): Plugin {
  let resolvido: ResolvedConfig

  return {
    name: 'bussola-cloudflare-pages',
    apply: 'build',
    configResolved(config) {
      resolvido = config
    },
    closeBundle() {
      const dist = join(process.cwd(), 'dist')

      /* NÃO existe `_redirects` aqui, e a ausência é deliberada.
         
         A regra `/*  /index.html  200`, que é o jeito clássico de resolver a
         rota profunda de um SPA, é REJEITADA pelo Workers no upload:
         
           Invalid _redirects configuration: Line 1: Infinite loop detected in
           this rule. This would cause a redirect to strip `.html` or `/index`
           and end up triggering this rule again.
         
         Quem resolve a rota profunda aqui é `not_found_handling =
         "single-page-application"`, no wrangler.toml, nativamente.
         
         Gerá-lo assim mesmo, para o dist servir também no Cloudflare Pages, foi
         uma decisão minha que custou um deploy inteiro. E não dava para pegar
         antes: `deploy --dry-run` e `wrangler dev` aceitam o arquivo sem
         reclamar; a validação só roda no servidor, depois de os 75 assets
         subirem. */

      /* `process.env` NÃO recebe as variáveis VITE_: o Vite as carrega do
         .env para o config resolvido, e só injeta no bundle. Ler de
         process.env funcionaria na Cloudflare (que define variável de ambiente
         de verdade) e falharia em todo build local, que é o pior dos dois
         mundos, porque o erro só apareceria para quem não pode consertar. */
      const bruto = resolvido.env?.VITE_SUPABASE_URL ?? process.env.VITE_SUPABASE_URL ?? ''
      const supabase = String(bruto).replace(/\/+$/, '')
      if (!supabase) {
        /* Falha o build de propósito. Sem esta variável o cliente do Supabase
           nasce nulo e o app não abre nem a tela de login, então publicar seria
           subir um site quebrado com erro visível só para quem o acessasse.

           A mensagem diz o CAMINHO EXATO porque o Workers tem DOIS conjuntos de
           variáveis com nomes parecidos, e o que aparece primeiro é o errado
           para este caso. */
        throw new Error(
          [
            'VITE_SUPABASE_URL não está definida, e sem ela o app não consegue falar com o banco.',
            '',
            'Na Cloudflare (projeto do tipo Workers), defina em:',
            '  Settings > Build > Variables and secrets  (variáveis de BUILD)',
            '',
            'NÃO é em "Settings > Variables and secrets", que é o conjunto de',
            'RUNTIME: essas chegam ao Worker em execução e não ao build, e o Vite',
            'precisa delas no BUILD, porque ele as grava dentro do bundle.',
            '',
            'São duas: VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY.',
          ].join('\n'),
        )
      }
      const wss = supabase.replace(/^https:/, 'wss:')

      const html = readFileSync(join(dist, 'index.html'), 'utf8')
      const inline = [...html.matchAll(/<script(?![^>]*\ssrc=)[^>]*>([\s\S]*?)<\/script>/g)]
        .map((m) => `'sha256-${createHash('sha256').update(m[1] ?? '', 'utf8').digest('base64')}'`)
        .join(' ')

      const csp = [
        `default-src 'self'`,
        // O app fala com o Supabase por REST, auth, realtime e edge functions.
        `connect-src 'self' ${supabase} ${wss}`,
        `script-src 'self' ${inline}`,
        // `unsafe-inline` em style é inevitável: Radix e Tailwind escrevem
        // estilo inline em tempo de execução (posição de popover, altura de
        // acordeão). Não vale nonce porque o estilo muda a cada interação.
        `style-src 'self' 'unsafe-inline' https://fonts.googleapis.com`,
        `font-src 'self' https://fonts.gstatic.com`,
        `img-src 'self' data: blob:`,
        `object-src 'none'`,
        `base-uri 'self'`,
        `form-action 'self'`,
        // O Bússola nunca é legitimamente embutido em outro site. Isto fecha
        // clickjacking sem depender do X-Frame-Options, que é o mecanismo antigo.
        `frame-ancestors 'none'`,
        `upgrade-insecure-requests`,
      ].join('; ')

      const headers = `# Gerado por scripts/cloudflare.ts durante o build. Não edite à mão.

/*
  Content-Security-Policy: ${csp}
  Strict-Transport-Security: max-age=63072000; includeSubDomains; preload
  X-Content-Type-Options: nosniff
  X-Frame-Options: DENY
  Referrer-Policy: strict-origin-when-cross-origin
  Permissions-Policy: camera=(), microphone=(), geolocation=(), payment=(), usb=()
  Cross-Origin-Opener-Policy: same-origin

# Os nomes dos arquivos de asset carregam hash de conteúdo, então o conteúdo
# nunca muda sob o mesmo nome: cachear por um ano é seguro e é o que torna a
# segunda visita instantânea.
/assets/*
  Cache-Control: public, max-age=31536000, immutable

# O index.html é o oposto: ele é quem aponta para os assets novos a cada
# deploy. Cacheá-lo deixaria o usuário preso na versão anterior até o cache
# expirar, sem nenhuma forma de perceber.
/index.html
  Cache-Control: no-cache, must-revalidate

/
  Cache-Control: no-cache, must-revalidate
`
      writeFileSync(join(dist, '_headers'), headers)
      this.info?.(`Cloudflare: _headers gerado (CSP para ${supabase})`)
    },
  }
}
