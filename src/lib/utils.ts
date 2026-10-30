/**
 * Um único `cn` no projeto.
 *
 * O CLI do shadcn gera componentes que importam `cn` do pacote `cn`
 * (implementação compilada de clsx + tailwind-merge, mantida pelo shadcn).
 * Este módulo reexporta a MESMA função para quem preferir o caminho
 * convencional `@/lib/utils`. Nunca crie uma segunda implementação: duas
 * versões de `cn` divergem em como resolvem conflito de classe e o bug
 * aparece só em produção, numa classe específica.
 */
export { cn } from 'cn'
