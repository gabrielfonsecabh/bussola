/**
 * Tipos gerados do banco. NÃO EDITE À MÃO.
 *
 * Regerar depois de qualquer migration:
 *   npm run db:types
 *
 * Tipos escritos à mão divergem do banco em silêncio, que é exatamente a
 * classe de falha que este projeto combate.
 */

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  app: {
    Tables: {
      areas: {
        Row: {
          company_id: string
          created_at: string
          created_by: string | null
          id: string
          nome: string
          parent_area_id: string | null
          responsavel_user_id: string | null
          tipo: string
          updated_at: string
        }
        Insert: {
          company_id: string
          created_at?: string
          created_by?: string | null
          id?: string
          nome: string
          parent_area_id?: string | null
          responsavel_user_id?: string | null
          tipo?: string
          updated_at?: string
        }
        Update: {
          company_id?: string
          created_at?: string
          created_by?: string | null
          id?: string
          nome?: string
          parent_area_id?: string | null
          responsavel_user_id?: string | null
          tipo?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "areas_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "areas_parent_area_id_fkey"
            columns: ["parent_area_id"]
            isOneToOne: false
            referencedRelation: "areas"
            referencedColumns: ["id"]
          },
        ]
      }
      atividades: {
        Row: {
          area_id: string | null
          company_id: string
          created_at: string
          created_by: string | null
          data_prazo: string | null
          descricao: string | null
          esforco_h: number | null
          estimativa_h: number | null
          horizonte: string
          id: string
          key_result_id: string | null
          ordem: number
          parent_atividade_id: string | null
          prioridade: string
          projeto_id: string | null
          responsavel_user_id: string | null
          sprint_id: string | null
          status: string
          titulo: string
          updated_at: string
        }
        Insert: {
          area_id?: string | null
          company_id: string
          created_at?: string
          created_by?: string | null
          data_prazo?: string | null
          descricao?: string | null
          esforco_h?: number | null
          estimativa_h?: number | null
          horizonte?: string
          id?: string
          key_result_id?: string | null
          ordem?: number
          parent_atividade_id?: string | null
          prioridade?: string
          projeto_id?: string | null
          responsavel_user_id?: string | null
          sprint_id?: string | null
          status?: string
          titulo: string
          updated_at?: string
        }
        Update: {
          area_id?: string | null
          company_id?: string
          created_at?: string
          created_by?: string | null
          data_prazo?: string | null
          descricao?: string | null
          esforco_h?: number | null
          estimativa_h?: number | null
          horizonte?: string
          id?: string
          key_result_id?: string | null
          ordem?: number
          parent_atividade_id?: string | null
          prioridade?: string
          projeto_id?: string | null
          responsavel_user_id?: string | null
          sprint_id?: string | null
          status?: string
          titulo?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "atividades_area_id_fkey"
            columns: ["area_id"]
            isOneToOne: false
            referencedRelation: "areas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "atividades_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "atividades_key_result_id_fkey"
            columns: ["key_result_id"]
            isOneToOne: false
            referencedRelation: "key_results"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "atividades_parent_atividade_id_fkey"
            columns: ["parent_atividade_id"]
            isOneToOne: false
            referencedRelation: "atividades"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "atividades_projeto_id_fkey"
            columns: ["projeto_id"]
            isOneToOne: false
            referencedRelation: "projetos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "atividades_sprint_id_fkey"
            columns: ["sprint_id"]
            isOneToOne: false
            referencedRelation: "sprints"
            referencedColumns: ["id"]
          },
        ]
      }
      bonus_apuracao: {
        Row: {
          area_id: string | null
          atingimento_pct: number | null
          company_id: string
          componente: string
          created_at: string
          created_by: string | null
          escopo: string
          id: string
          periodo: string
          peso: number | null
          resultado_pct: number | null
          updated_at: string
          user_id: string | null
        }
        Insert: {
          area_id?: string | null
          atingimento_pct?: number | null
          company_id: string
          componente: string
          created_at?: string
          created_by?: string | null
          escopo: string
          id?: string
          periodo: string
          peso?: number | null
          resultado_pct?: number | null
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          area_id?: string | null
          atingimento_pct?: number | null
          company_id?: string
          componente?: string
          created_at?: string
          created_by?: string | null
          escopo?: string
          id?: string
          periodo?: string
          peso?: number | null
          resultado_pct?: number | null
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "bonus_apuracao_area_id_fkey"
            columns: ["area_id"]
            isOneToOne: false
            referencedRelation: "areas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bonus_apuracao_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      bonus_config: {
        Row: {
          ano: number
          company_id: string
          created_at: string
          created_by: string | null
          id: string
          pesos: Json
          reguas: Json
          updated_at: string
        }
        Insert: {
          ano: number
          company_id: string
          created_at?: string
          created_by?: string | null
          id?: string
          pesos?: Json
          reguas?: Json
          updated_at?: string
        }
        Update: {
          ano?: number
          company_id?: string
          created_at?: string
          created_by?: string | null
          id?: string
          pesos?: Json
          reguas?: Json
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "bonus_config_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      comite_membros: {
        Row: {
          comite_id: string
          company_id: string
          created_at: string
          id: string
          papel: string
          user_id: string
        }
        Insert: {
          comite_id: string
          company_id: string
          created_at?: string
          id?: string
          papel?: string
          user_id: string
        }
        Update: {
          comite_id?: string
          company_id?: string
          created_at?: string
          id?: string
          papel?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "comite_membros_comite_id_fkey"
            columns: ["comite_id"]
            isOneToOne: false
            referencedRelation: "comites"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "comite_membros_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      comite_okrs: {
        Row: {
          comite_id: string
          company_id: string
          created_at: string
          created_by: string | null
          id: string
          okr_id: string
        }
        Insert: {
          comite_id: string
          company_id: string
          created_at?: string
          created_by?: string | null
          id?: string
          okr_id: string
        }
        Update: {
          comite_id?: string
          company_id?: string
          created_at?: string
          created_by?: string | null
          id?: string
          okr_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "comite_okrs_comite_id_fkey"
            columns: ["comite_id"]
            isOneToOne: false
            referencedRelation: "comites"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "comite_okrs_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "comite_okrs_okr_id_fkey"
            columns: ["okr_id"]
            isOneToOne: false
            referencedRelation: "okrs"
            referencedColumns: ["id"]
          },
        ]
      }
      comite_processos: {
        Row: {
          comite_id: string
          company_id: string
          created_at: string
          created_by: string | null
          id: string
          processo_id: string
        }
        Insert: {
          comite_id: string
          company_id: string
          created_at?: string
          created_by?: string | null
          id?: string
          processo_id: string
        }
        Update: {
          comite_id?: string
          company_id?: string
          created_at?: string
          created_by?: string | null
          id?: string
          processo_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "comite_processos_comite_id_fkey"
            columns: ["comite_id"]
            isOneToOne: false
            referencedRelation: "comites"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "comite_processos_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "comite_processos_processo_id_fkey"
            columns: ["processo_id"]
            isOneToOne: false
            referencedRelation: "processos"
            referencedColumns: ["id"]
          },
        ]
      }
      comite_projetos: {
        Row: {
          comite_id: string
          company_id: string
          created_at: string
          created_by: string | null
          id: string
          projeto_id: string
        }
        Insert: {
          comite_id: string
          company_id: string
          created_at?: string
          created_by?: string | null
          id?: string
          projeto_id: string
        }
        Update: {
          comite_id?: string
          company_id?: string
          created_at?: string
          created_by?: string | null
          id?: string
          projeto_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "comite_projetos_comite_id_fkey"
            columns: ["comite_id"]
            isOneToOne: false
            referencedRelation: "comites"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "comite_projetos_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "comite_projetos_projeto_id_fkey"
            columns: ["projeto_id"]
            isOneToOne: false
            referencedRelation: "projetos"
            referencedColumns: ["id"]
          },
        ]
      }
      comites: {
        Row: {
          ativo: boolean
          cadencia: string | null
          company_id: string
          coordenador_user_id: string | null
          created_at: string
          created_by: string | null
          descricao: string | null
          id: string
          nome: string
          updated_at: string
        }
        Insert: {
          ativo?: boolean
          cadencia?: string | null
          company_id: string
          coordenador_user_id?: string | null
          created_at?: string
          created_by?: string | null
          descricao?: string | null
          id?: string
          nome: string
          updated_at?: string
        }
        Update: {
          ativo?: boolean
          cadencia?: string | null
          company_id?: string
          coordenador_user_id?: string | null
          created_at?: string
          created_by?: string | null
          descricao?: string | null
          id?: string
          nome?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "comites_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      companies: {
        Row: {
          created_at: string
          created_by: string | null
          dias_para_checkin_atrasado: number
          id: string
          nome_fantasia: string | null
          parent_company_id: string | null
          razao_social: string
          tipo: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          dias_para_checkin_atrasado?: number
          id?: string
          nome_fantasia?: string | null
          parent_company_id?: string | null
          razao_social: string
          tipo?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          dias_para_checkin_atrasado?: number
          id?: string
          nome_fantasia?: string | null
          parent_company_id?: string | null
          razao_social?: string
          tipo?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "companies_parent_company_id_fkey"
            columns: ["parent_company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      company_users: {
        Row: {
          area_id: string | null
          cargo: string | null
          company_id: string
          created_at: string
          created_by: string | null
          id: string
          is_active: boolean
          is_admin: boolean
          nivel: string
          updated_at: string
          user_id: string
        }
        Insert: {
          area_id?: string | null
          cargo?: string | null
          company_id: string
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean
          is_admin?: boolean
          nivel?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          area_id?: string | null
          cargo?: string | null
          company_id?: string
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean
          is_admin?: boolean
          nivel?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "company_users_area_id_fkey"
            columns: ["area_id"]
            isOneToOne: false
            referencedRelation: "areas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "company_users_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      dmaic_etapas: {
        Row: {
          aprovado_por: string | null
          company_id: string
          created_at: string
          created_by: string | null
          data_conclusao: string | null
          entregaveis: Json
          fase: string
          id: string
          projeto_melhoria_id: string
          status: string
          updated_at: string
        }
        Insert: {
          aprovado_por?: string | null
          company_id: string
          created_at?: string
          created_by?: string | null
          data_conclusao?: string | null
          entregaveis?: Json
          fase: string
          id?: string
          projeto_melhoria_id: string
          status?: string
          updated_at?: string
        }
        Update: {
          aprovado_por?: string | null
          company_id?: string
          created_at?: string
          created_by?: string | null
          data_conclusao?: string | null
          entregaveis?: Json
          fase?: string
          id?: string
          projeto_melhoria_id?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "dmaic_etapas_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dmaic_etapas_projeto_melhoria_id_fkey"
            columns: ["projeto_melhoria_id"]
            isOneToOne: false
            referencedRelation: "projetos_melhoria"
            referencedColumns: ["id"]
          },
        ]
      }
      indicador_medicoes: {
        Row: {
          company_id: string
          created_at: string
          created_by: string | null
          data: string
          id: string
          indicador_id: string
          origem: string
          updated_at: string
          valor: number
        }
        Insert: {
          company_id: string
          created_at?: string
          created_by?: string | null
          data?: string
          id?: string
          indicador_id: string
          origem?: string
          updated_at?: string
          valor: number
        }
        Update: {
          company_id?: string
          created_at?: string
          created_by?: string | null
          data?: string
          id?: string
          indicador_id?: string
          origem?: string
          updated_at?: string
          valor?: number
        }
        Relationships: [
          {
            foreignKeyName: "indicador_medicoes_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "indicador_medicoes_indicador_id_fkey"
            columns: ["indicador_id"]
            isOneToOne: false
            referencedRelation: "indicadores_processo"
            referencedColumns: ["id"]
          },
        ]
      }
      indicadores_processo: {
        Row: {
          baseline: number | null
          company_id: string
          created_at: string
          created_by: string | null
          formula: string | null
          id: string
          meta: number | null
          nome: string
          processo_id: string
          tipo: string
          unidade: string | null
          updated_at: string
        }
        Insert: {
          baseline?: number | null
          company_id: string
          created_at?: string
          created_by?: string | null
          formula?: string | null
          id?: string
          meta?: number | null
          nome: string
          processo_id: string
          tipo?: string
          unidade?: string | null
          updated_at?: string
        }
        Update: {
          baseline?: number | null
          company_id?: string
          created_at?: string
          created_by?: string | null
          formula?: string | null
          id?: string
          meta?: number | null
          nome?: string
          processo_id?: string
          tipo?: string
          unidade?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "indicadores_processo_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "indicadores_processo_processo_id_fkey"
            columns: ["processo_id"]
            isOneToOne: false
            referencedRelation: "processos"
            referencedColumns: ["id"]
          },
        ]
      }
      key_results: {
        Row: {
          atual: number | null
          baseline: number | null
          company_id: string
          created_at: string
          created_by: string | null
          descricao: string
          direcao: string
          farol: string
          id: string
          meta: number | null
          okr_id: string
          peso: number
          tipo: string
          unidade: string | null
          updated_at: string
        }
        Insert: {
          atual?: number | null
          baseline?: number | null
          company_id: string
          created_at?: string
          created_by?: string | null
          descricao: string
          direcao?: string
          farol?: string
          id?: string
          meta?: number | null
          okr_id: string
          peso?: number
          tipo?: string
          unidade?: string | null
          updated_at?: string
        }
        Update: {
          atual?: number | null
          baseline?: number | null
          company_id?: string
          created_at?: string
          created_by?: string | null
          descricao?: string
          direcao?: string
          farol?: string
          id?: string
          meta?: number | null
          okr_id?: string
          peso?: number
          tipo?: string
          unidade?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "key_results_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "key_results_okr_id_fkey"
            columns: ["okr_id"]
            isOneToOne: false
            referencedRelation: "okrs"
            referencedColumns: ["id"]
          },
        ]
      }
      kit_gestao: {
        Row: {
          area_id: string
          avaliador_user_id: string | null
          company_id: string
          created_at: string
          created_by: string | null
          id: string
          item: string
          observacao: string | null
          percentual: number
          periodo: string
          status: string
          updated_at: string
        }
        Insert: {
          area_id: string
          avaliador_user_id?: string | null
          company_id: string
          created_at?: string
          created_by?: string | null
          id?: string
          item: string
          observacao?: string | null
          percentual?: number
          periodo: string
          status?: string
          updated_at?: string
        }
        Update: {
          area_id?: string
          avaliador_user_id?: string | null
          company_id?: string
          created_at?: string
          created_by?: string | null
          id?: string
          item?: string
          observacao?: string | null
          percentual?: number
          periodo?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "kit_gestao_area_id_fkey"
            columns: ["area_id"]
            isOneToOne: false
            referencedRelation: "areas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "kit_gestao_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      kr_checkins: {
        Row: {
          autor_user_id: string | null
          comentario: string | null
          company_id: string
          created_at: string
          data: string
          id: string
          key_result_id: string
          updated_at: string
          valor: number
        }
        Insert: {
          autor_user_id?: string | null
          comentario?: string | null
          company_id: string
          created_at?: string
          data?: string
          id?: string
          key_result_id: string
          updated_at?: string
          valor: number
        }
        Update: {
          autor_user_id?: string | null
          comentario?: string | null
          company_id?: string
          created_at?: string
          data?: string
          id?: string
          key_result_id?: string
          updated_at?: string
          valor?: number
        }
        Relationships: [
          {
            foreignKeyName: "kr_checkins_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "kr_checkins_key_result_id_fkey"
            columns: ["key_result_id"]
            isOneToOne: false
            referencedRelation: "key_results"
            referencedColumns: ["id"]
          },
        ]
      }
      missoes_semanais: {
        Row: {
          alvo: number
          area_id: string
          base: number
          codigo: string
          company_id: string
          created_at: string
          id: string
          semana: string
        }
        Insert: {
          alvo: number
          area_id: string
          base: number
          codigo: string
          company_id: string
          created_at?: string
          id?: string
          semana: string
        }
        Update: {
          alvo?: number
          area_id?: string
          base?: number
          codigo?: string
          company_id?: string
          created_at?: string
          id?: string
          semana?: string
        }
        Relationships: [
          {
            foreignKeyName: "missoes_semanais_area_id_fkey"
            columns: ["area_id"]
            isOneToOne: false
            referencedRelation: "areas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "missoes_semanais_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      objetivos_estrategicos: {
        Row: {
          ciclo: string
          company_id: string
          created_at: string
          created_by: string | null
          descricao: string | null
          id: string
          is_estrela_do_norte: boolean
          perspectiva_id: string | null
          titulo: string
          updated_at: string
        }
        Insert: {
          ciclo?: string
          company_id: string
          created_at?: string
          created_by?: string | null
          descricao?: string | null
          id?: string
          is_estrela_do_norte?: boolean
          perspectiva_id?: string | null
          titulo: string
          updated_at?: string
        }
        Update: {
          ciclo?: string
          company_id?: string
          created_at?: string
          created_by?: string | null
          descricao?: string | null
          id?: string
          is_estrela_do_norte?: boolean
          perspectiva_id?: string | null
          titulo?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "objetivos_estrategicos_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "objetivos_estrategicos_perspectiva_id_fkey"
            columns: ["perspectiva_id"]
            isOneToOne: false
            referencedRelation: "perspectivas"
            referencedColumns: ["id"]
          },
        ]
      }
      okrs: {
        Row: {
          ano: number
          area_id: string | null
          company_id: string
          created_at: string
          created_by: string | null
          descricao: string | null
          id: string
          nivel: string
          objetivo_estrategico_id: string | null
          owner_user_id: string | null
          parent_okr_id: string | null
          perspectiva_id: string | null
          status: string
          titulo: string
          trimestre: number | null
          updated_at: string
        }
        Insert: {
          ano: number
          area_id?: string | null
          company_id: string
          created_at?: string
          created_by?: string | null
          descricao?: string | null
          id?: string
          nivel?: string
          objetivo_estrategico_id?: string | null
          owner_user_id?: string | null
          parent_okr_id?: string | null
          perspectiva_id?: string | null
          status?: string
          titulo: string
          trimestre?: number | null
          updated_at?: string
        }
        Update: {
          ano?: number
          area_id?: string | null
          company_id?: string
          created_at?: string
          created_by?: string | null
          descricao?: string | null
          id?: string
          nivel?: string
          objetivo_estrategico_id?: string | null
          owner_user_id?: string | null
          parent_okr_id?: string | null
          perspectiva_id?: string | null
          status?: string
          titulo?: string
          trimestre?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "okrs_area_id_fkey"
            columns: ["area_id"]
            isOneToOne: false
            referencedRelation: "areas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "okrs_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "okrs_objetivo_estrategico_id_fkey"
            columns: ["objetivo_estrategico_id"]
            isOneToOne: false
            referencedRelation: "objetivos_estrategicos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "okrs_parent_okr_id_fkey"
            columns: ["parent_okr_id"]
            isOneToOne: false
            referencedRelation: "okrs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "okrs_perspectiva_id_fkey"
            columns: ["perspectiva_id"]
            isOneToOne: false
            referencedRelation: "perspectivas"
            referencedColumns: ["id"]
          },
        ]
      }
      opr: {
        Row: {
          area_id: string
          autor_user_id: string | null
          company_id: string
          created_at: string
          created_by: string | null
          destaques: string | null
          id: string
          indicadores: Json
          okr_resumo: Json
          periodo: string
          proximos_passos: string | null
          publicado_em: string | null
          riscos: string | null
          status: string
          updated_at: string
        }
        Insert: {
          area_id: string
          autor_user_id?: string | null
          company_id: string
          created_at?: string
          created_by?: string | null
          destaques?: string | null
          id?: string
          indicadores?: Json
          okr_resumo?: Json
          periodo: string
          proximos_passos?: string | null
          publicado_em?: string | null
          riscos?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          area_id?: string
          autor_user_id?: string | null
          company_id?: string
          created_at?: string
          created_by?: string | null
          destaques?: string | null
          id?: string
          indicadores?: Json
          okr_resumo?: Json
          periodo?: string
          proximos_passos?: string | null
          publicado_em?: string | null
          riscos?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "opr_area_id_fkey"
            columns: ["area_id"]
            isOneToOne: false
            referencedRelation: "areas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "opr_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      perspectivas: {
        Row: {
          chave: string
          company_id: string
          cor_token: string
          created_at: string
          created_by: string | null
          id: string
          nome: string
          ordem: number
          updated_at: string
        }
        Insert: {
          chave: string
          company_id: string
          cor_token?: string
          created_at?: string
          created_by?: string | null
          id?: string
          nome: string
          ordem?: number
          updated_at?: string
        }
        Update: {
          chave?: string
          company_id?: string
          cor_token?: string
          created_at?: string
          created_by?: string | null
          id?: string
          nome?: string
          ordem?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "perspectivas_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      platform_admins: {
        Row: {
          created_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          user_id?: string
        }
        Relationships: []
      }
      pop_modelos: {
        Row: {
          abrangencia_padrao: string | null
          area_id: string | null
          ativo: boolean
          company_id: string
          controles_internos: Json
          created_at: string
          created_by: string | null
          definicoes: Json
          descricao: string | null
          id: string
          indicadores_sugeridos: Json
          nome: string
          objetivo_padrao: string | null
          prefixo_codigo: string | null
          registros: Json
          responsabilidades: Json
          riscos: Json
          updated_at: string
        }
        Insert: {
          abrangencia_padrao?: string | null
          area_id?: string | null
          ativo?: boolean
          company_id: string
          controles_internos?: Json
          created_at?: string
          created_by?: string | null
          definicoes?: Json
          descricao?: string | null
          id?: string
          indicadores_sugeridos?: Json
          nome: string
          objetivo_padrao?: string | null
          prefixo_codigo?: string | null
          registros?: Json
          responsabilidades?: Json
          riscos?: Json
          updated_at?: string
        }
        Update: {
          abrangencia_padrao?: string | null
          area_id?: string | null
          ativo?: boolean
          company_id?: string
          controles_internos?: Json
          created_at?: string
          created_by?: string | null
          definicoes?: Json
          descricao?: string | null
          id?: string
          indicadores_sugeridos?: Json
          nome?: string
          objetivo_padrao?: string | null
          prefixo_codigo?: string | null
          registros?: Json
          responsabilidades?: Json
          riscos?: Json
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "pop_modelos_area_id_fkey"
            columns: ["area_id"]
            isOneToOne: false
            referencedRelation: "areas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pop_modelos_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      processo_etapas: {
        Row: {
          area_id: string | null
          company_id: string
          created_at: string
          created_by: string | null
          descricao: string | null
          desvio_para_etapa_id: string | null
          eh_gargalo: boolean
          id: string
          ordem: number
          processo_id: string
          responsavel_user_id: string | null
          rotulo_nao: string | null
          rotulo_sim: string | null
          sistema: string | null
          tempo_estimado_min: number | null
          tipo: string
          titulo: string
          updated_at: string
        }
        Insert: {
          area_id?: string | null
          company_id: string
          created_at?: string
          created_by?: string | null
          descricao?: string | null
          desvio_para_etapa_id?: string | null
          eh_gargalo?: boolean
          id?: string
          ordem?: number
          processo_id: string
          responsavel_user_id?: string | null
          rotulo_nao?: string | null
          rotulo_sim?: string | null
          sistema?: string | null
          tempo_estimado_min?: number | null
          tipo?: string
          titulo: string
          updated_at?: string
        }
        Update: {
          area_id?: string | null
          company_id?: string
          created_at?: string
          created_by?: string | null
          descricao?: string | null
          desvio_para_etapa_id?: string | null
          eh_gargalo?: boolean
          id?: string
          ordem?: number
          processo_id?: string
          responsavel_user_id?: string | null
          rotulo_nao?: string | null
          rotulo_sim?: string | null
          sistema?: string | null
          tempo_estimado_min?: number | null
          tipo?: string
          titulo?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "processo_etapas_area_id_fkey"
            columns: ["area_id"]
            isOneToOne: false
            referencedRelation: "areas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "processo_etapas_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "processo_etapas_desvio_para_etapa_id_fkey"
            columns: ["desvio_para_etapa_id"]
            isOneToOne: false
            referencedRelation: "processo_etapas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "processo_etapas_processo_id_fkey"
            columns: ["processo_id"]
            isOneToOne: false
            referencedRelation: "processos"
            referencedColumns: ["id"]
          },
        ]
      }
      processo_pop: {
        Row: {
          abrangencia: string | null
          aprovado_por: string | null
          codigo: string | null
          company_id: string
          controles_internos: Json
          created_at: string
          created_by: string | null
          data_emissao: string | null
          definicoes: Json
          elaborado_por: string | null
          id: string
          modelo_id: string | null
          objetivo: string | null
          processo_id: string
          registros: Json
          responsabilidades: Json
          revisado_por: string | null
          riscos: Json
          status: string
          updated_at: string
          versao: number
        }
        Insert: {
          abrangencia?: string | null
          aprovado_por?: string | null
          codigo?: string | null
          company_id: string
          controles_internos?: Json
          created_at?: string
          created_by?: string | null
          data_emissao?: string | null
          definicoes?: Json
          elaborado_por?: string | null
          id?: string
          modelo_id?: string | null
          objetivo?: string | null
          processo_id: string
          registros?: Json
          responsabilidades?: Json
          revisado_por?: string | null
          riscos?: Json
          status?: string
          updated_at?: string
          versao?: number
        }
        Update: {
          abrangencia?: string | null
          aprovado_por?: string | null
          codigo?: string | null
          company_id?: string
          controles_internos?: Json
          created_at?: string
          created_by?: string | null
          data_emissao?: string | null
          definicoes?: Json
          elaborado_por?: string | null
          id?: string
          modelo_id?: string | null
          objetivo?: string | null
          processo_id?: string
          registros?: Json
          responsabilidades?: Json
          revisado_por?: string | null
          riscos?: Json
          status?: string
          updated_at?: string
          versao?: number
        }
        Relationships: [
          {
            foreignKeyName: "processo_pop_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "processo_pop_modelo_id_fkey"
            columns: ["modelo_id"]
            isOneToOne: false
            referencedRelation: "pop_modelos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "processo_pop_processo_id_fkey"
            columns: ["processo_id"]
            isOneToOne: true
            referencedRelation: "processos"
            referencedColumns: ["id"]
          },
        ]
      }
      processo_pop_revisoes: {
        Row: {
          alteracao: string
          company_id: string
          created_at: string
          created_by: string | null
          data: string
          id: string
          pop_id: string
          responsavel_user_id: string | null
          versao: number
        }
        Insert: {
          alteracao: string
          company_id: string
          created_at?: string
          created_by?: string | null
          data?: string
          id?: string
          pop_id: string
          responsavel_user_id?: string | null
          versao: number
        }
        Update: {
          alteracao?: string
          company_id?: string
          created_at?: string
          created_by?: string | null
          data?: string
          id?: string
          pop_id?: string
          responsavel_user_id?: string | null
          versao?: number
        }
        Relationships: [
          {
            foreignKeyName: "processo_pop_revisoes_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "processo_pop_revisoes_pop_id_fkey"
            columns: ["pop_id"]
            isOneToOne: false
            referencedRelation: "processo_pop"
            referencedColumns: ["id"]
          },
        ]
      }
      processo_sipoc: {
        Row: {
          company_id: string
          created_at: string
          created_by: string | null
          customers: string | null
          id: string
          inputs: string | null
          outputs: string | null
          processo_id: string
          steps: Json
          suppliers: string | null
          updated_at: string
        }
        Insert: {
          company_id: string
          created_at?: string
          created_by?: string | null
          customers?: string | null
          id?: string
          inputs?: string | null
          outputs?: string | null
          processo_id: string
          steps?: Json
          suppliers?: string | null
          updated_at?: string
        }
        Update: {
          company_id?: string
          created_at?: string
          created_by?: string | null
          customers?: string | null
          id?: string
          inputs?: string | null
          outputs?: string | null
          processo_id?: string
          steps?: Json
          suppliers?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "processo_sipoc_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "processo_sipoc_processo_id_fkey"
            columns: ["processo_id"]
            isOneToOne: true
            referencedRelation: "processos"
            referencedColumns: ["id"]
          },
        ]
      }
      processos: {
        Row: {
          area_id: string | null
          categoria: string | null
          company_id: string
          created_at: string
          created_by: string | null
          descricao: string | null
          dono_user_id: string | null
          id: string
          nivel_maturidade: number
          nome: string
          origem_do_registro: string
          pendencia_de_mapeamento: string | null
          periodicidade: string | null
          periodicidade_origem: string | null
          prazo_referencia: string | null
          status: string
          tipo: string
          updated_at: string
        }
        Insert: {
          area_id?: string | null
          categoria?: string | null
          company_id: string
          created_at?: string
          created_by?: string | null
          descricao?: string | null
          dono_user_id?: string | null
          id?: string
          nivel_maturidade?: number
          nome: string
          origem_do_registro?: string
          pendencia_de_mapeamento?: string | null
          periodicidade?: string | null
          periodicidade_origem?: string | null
          prazo_referencia?: string | null
          status?: string
          tipo?: string
          updated_at?: string
        }
        Update: {
          area_id?: string | null
          categoria?: string | null
          company_id?: string
          created_at?: string
          created_by?: string | null
          descricao?: string | null
          dono_user_id?: string | null
          id?: string
          nivel_maturidade?: number
          nome?: string
          origem_do_registro?: string
          pendencia_de_mapeamento?: string | null
          periodicidade?: string | null
          periodicidade_origem?: string | null
          prazo_referencia?: string | null
          status?: string
          tipo?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "processos_area_id_fkey"
            columns: ["area_id"]
            isOneToOne: false
            referencedRelation: "areas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "processos_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          deve_trocar_senha: boolean
          email: string | null
          nome: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          deve_trocar_senha?: boolean
          email?: string | null
          nome?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          deve_trocar_senha?: boolean
          email?: string | null
          nome?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      projetos: {
        Row: {
          area_id: string | null
          categoria: string
          company_id: string
          created_at: string
          created_by: string | null
          descricao: string | null
          id: string
          inicio_previsto: string | null
          inicio_real: string | null
          nome: string
          okr_id: string | null
          patrocinador_user_id: string | null
          prioridade: string
          processo_id: string | null
          progresso_pct: number
          responsavel_user_id: string | null
          status: string
          termino_previsto: string | null
          termino_real: string | null
          tipo: string
          updated_at: string
        }
        Insert: {
          area_id?: string | null
          categoria?: string
          company_id: string
          created_at?: string
          created_by?: string | null
          descricao?: string | null
          id?: string
          inicio_previsto?: string | null
          inicio_real?: string | null
          nome: string
          okr_id?: string | null
          patrocinador_user_id?: string | null
          prioridade?: string
          processo_id?: string | null
          progresso_pct?: number
          responsavel_user_id?: string | null
          status?: string
          termino_previsto?: string | null
          termino_real?: string | null
          tipo?: string
          updated_at?: string
        }
        Update: {
          area_id?: string | null
          categoria?: string
          company_id?: string
          created_at?: string
          created_by?: string | null
          descricao?: string | null
          id?: string
          inicio_previsto?: string | null
          inicio_real?: string | null
          nome?: string
          okr_id?: string | null
          patrocinador_user_id?: string | null
          prioridade?: string
          processo_id?: string | null
          progresso_pct?: number
          responsavel_user_id?: string | null
          status?: string
          termino_previsto?: string | null
          termino_real?: string | null
          tipo?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "projetos_area_id_fkey"
            columns: ["area_id"]
            isOneToOne: false
            referencedRelation: "areas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "projetos_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "projetos_okr_id_fkey"
            columns: ["okr_id"]
            isOneToOne: false
            referencedRelation: "okrs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "projetos_processo_id_fkey"
            columns: ["processo_id"]
            isOneToOne: false
            referencedRelation: "processos"
            referencedColumns: ["id"]
          },
        ]
      }
      projetos_melhoria: {
        Row: {
          area_id: string | null
          belt_user_id: string | null
          company_id: string
          created_at: string
          created_by: string | null
          fase_atual: string
          ganho_estimado: number | null
          ganho_realizado: number | null
          id: string
          inicio_previsto: string | null
          meta_smart: string | null
          metodo: string
          nome: string
          problema: string | null
          processo_id: string | null
          projeto_id: string | null
          status: string
          termino_previsto: string | null
          updated_at: string
        }
        Insert: {
          area_id?: string | null
          belt_user_id?: string | null
          company_id: string
          created_at?: string
          created_by?: string | null
          fase_atual?: string
          ganho_estimado?: number | null
          ganho_realizado?: number | null
          id?: string
          inicio_previsto?: string | null
          meta_smart?: string | null
          metodo?: string
          nome: string
          problema?: string | null
          processo_id?: string | null
          projeto_id?: string | null
          status?: string
          termino_previsto?: string | null
          updated_at?: string
        }
        Update: {
          area_id?: string | null
          belt_user_id?: string | null
          company_id?: string
          created_at?: string
          created_by?: string | null
          fase_atual?: string
          ganho_estimado?: number | null
          ganho_realizado?: number | null
          id?: string
          inicio_previsto?: string | null
          meta_smart?: string | null
          metodo?: string
          nome?: string
          problema?: string | null
          processo_id?: string | null
          projeto_id?: string | null
          status?: string
          termino_previsto?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "projetos_melhoria_area_id_fkey"
            columns: ["area_id"]
            isOneToOne: false
            referencedRelation: "areas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "projetos_melhoria_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "projetos_melhoria_processo_id_fkey"
            columns: ["processo_id"]
            isOneToOne: false
            referencedRelation: "processos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "projetos_melhoria_projeto_id_fkey"
            columns: ["projeto_id"]
            isOneToOne: false
            referencedRelation: "projetos"
            referencedColumns: ["id"]
          },
        ]
      }
      sprints: {
        Row: {
          area_id: string | null
          company_id: string
          created_at: string
          created_by: string | null
          data_fim: string
          data_inicio: string
          id: string
          nome: string
          objetivo: string | null
          status: string
          updated_at: string
        }
        Insert: {
          area_id?: string | null
          company_id: string
          created_at?: string
          created_by?: string | null
          data_fim: string
          data_inicio: string
          id?: string
          nome: string
          objetivo?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          area_id?: string | null
          company_id?: string
          created_at?: string
          created_by?: string | null
          data_fim?: string
          data_inicio?: string
          id?: string
          nome?: string
          objetivo?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "sprints_area_id_fkey"
            columns: ["area_id"]
            isOneToOne: false
            referencedRelation: "areas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sprints_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          company_id: string
          created_at: string
          created_by: string | null
          id: string
          role: string
          updated_at: string
          user_id: string
        }
        Insert: {
          company_id: string
          created_at?: string
          created_by?: string | null
          id?: string
          role: string
          updated_at?: string
          user_id: string
        }
        Update: {
          company_id?: string
          created_at?: string
          created_by?: string | null
          id?: string
          role?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_roles_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      alcada_sobre_area: {
        Args: { _area: string; _user: string }
        Returns: boolean
      }
      ancestrais_de_area: {
        Args: { p_area: string }
        Returns: {
          area_id: string
        }[]
      }
      atividade_mover: {
        Args: {
          p_id: string
          p_ordem?: number
          p_sprint_id?: string
          p_status: string
          p_versao?: string
        }
        Returns: {
          area_id: string | null
          company_id: string
          created_at: string
          created_by: string | null
          data_prazo: string | null
          descricao: string | null
          esforco_h: number | null
          estimativa_h: number | null
          horizonte: string
          id: string
          key_result_id: string | null
          ordem: number
          parent_atividade_id: string | null
          prioridade: string
          projeto_id: string | null
          responsavel_user_id: string | null
          sprint_id: string | null
          status: string
          titulo: string
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "atividades"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      belongs_to_company: {
        Args: { _company_id: string; _user_id: string }
        Returns: boolean
      }
      bonus_aplicar_regua: {
        Args: { p_atingimento: number; p_regua: Json }
        Returns: number
      }
      bonus_apurar: {
        Args: {
          p_company: string
          p_ebitda_pct?: number
          p_faturamento_pct?: number
          p_periodo: string
        }
        Returns: {
          atingimento_pct: number
          componente: string
          escopo: string
          peso: number
          referencia: string
          resultado_pct: number
        }[]
      }
      ciclo_decorrido: {
        Args: { p_ano: number; p_trimestre?: number }
        Returns: number
      }
      comites_da_empresa: {
        Args: { p_company: string }
        Returns: {
          cadencia: string
          coordenador_nome: string
          id: string
          membros: number
          nome: string
          okrs: number
          processos: number
          projetos: number
        }[]
      }
      cronograma_carga: {
        Args: {
          p_area_id?: string
          p_ate?: string
          p_company: string
          p_de?: string
        }
        Returns: {
          mes: string
          nomes: string[]
          projetos: number
        }[]
      }
      cronograma_gestao: {
        Args: {
          p_area_id?: string
          p_ate?: string
          p_company: string
          p_de?: string
        }
        Returns: {
          area_nome: string
          atividades: number
          atividades_abertas: number
          atrasado: boolean
          categoria: string
          dias: number
          inicio: string
          nome: string
          prioridade: string
          progresso_pct: number
          projeto_id: string
          responsavel_nome: string
          sem_prazo: boolean
          sobrepoe: number
          status: string
          termino: string
        }[]
      }
      definir_papel: {
        Args: { p_company: string; p_role: string; p_user: string }
        Returns: {
          company_id: string
          created_at: string
          created_by: string | null
          id: string
          role: string
          updated_at: string
          user_id: string
        }
        SetofOptions: {
          from: "*"
          to: "user_roles"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      dmaic_concluir_tollgate: {
        Args: { p_entregaveis?: Json; p_fase: string; p_melhoria_id: string }
        Returns: {
          aprovado_por: string | null
          company_id: string
          created_at: string
          created_by: string | null
          data_conclusao: string | null
          entregaveis: Json
          fase: string
          id: string
          projeto_melhoria_id: string
          status: string
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "dmaic_etapas"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      exigir_troca_de_senha: { Args: { p_user_id: string }; Returns: boolean }
      farol_por_ritmo: {
        Args: { p_ano: number; p_atingimento: number; p_trimestre?: number }
        Returns: string
      }
      farol_recalcular: { Args: { p_company: string }; Returns: number }
      get_role_preset_permissions: {
        Args: { _role: string }
        Returns: string[]
      }
      has_permission: {
        Args: { _company_id: string; _key: string; _user_id: string }
        Returns: boolean
      }
      has_role: { Args: { _role: string; _user_id: string }; Returns: boolean }
      is_company_admin: {
        Args: { _company_id: string; _user_id: string }
        Returns: boolean
      }
      is_super_admin: { Args: { _user_id: string }; Returns: boolean }
      jornada_lacunas: {
        Args: { p_area: string; p_company: string }
        Returns: {
          codigo: string
          lacuna: number
          teto: number
        }[]
      }
      jornada_placar: {
        Args: { p_company: string }
        Returns: {
          area_id: string
          area_nome: string
          com_pendencia: number
          completos: number
          percentual: number
          processos: number
          selos_ganhos: number
          selos_possiveis: number
          sem_dono: number
        }[]
      }
      kit_congelar: {
        Args: { p_company: string; p_periodo: string }
        Returns: number
      }
      kit_matriz: {
        Args: { p_company: string; p_periodo: string }
        Returns: {
          area_id: string
          area_nome: string
          area_tipo: string
          mapa_detalhe: string
          mapa_status: string
          opr_detalhe: string
          opr_status: string
          parent_area_id: string
          percentual: number
          processos_detalhe: string
          processos_status: string
          responsavel_nome: string
        }[]
      }
      kit_status: {
        Args: { p_area_id: string; p_periodo: string }
        Returns: {
          item: string
          percentual: number
          status: string
        }[]
      }
      kr_atingimento: {
        Args: {
          p_atual: number
          p_baseline: number
          p_direcao: string
          p_meta: number
        }
        Returns: number
      }
      kr_checkin: {
        Args: {
          p_comentario?: string
          p_data?: string
          p_kr_id: string
          p_valor: number
        }
        Returns: {
          atual: number | null
          baseline: number | null
          company_id: string
          created_at: string
          created_by: string | null
          descricao: string
          direcao: string
          farol: string
          id: string
          meta: number | null
          okr_id: string
          peso: number
          tipo: string
          unidade: string | null
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "key_results"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      kr_mover: {
        Args: { p_kr_id: string; p_okr_destino: string }
        Returns: {
          atual: number | null
          baseline: number | null
          company_id: string
          created_at: string
          created_by: string | null
          descricao: string
          direcao: string
          farol: string
          id: string
          meta: number | null
          okr_id: string
          peso: number
          tipo: string
          unidade: string | null
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "key_results"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      melhoria_avancar_fase: {
        Args: { p_entregaveis?: Json; p_fase: string; p_id: string }
        Returns: {
          area_id: string | null
          belt_user_id: string | null
          company_id: string
          created_at: string
          created_by: string | null
          fase_atual: string
          ganho_estimado: number | null
          ganho_realizado: number | null
          id: string
          inicio_previsto: string | null
          meta_smart: string | null
          metodo: string
          nome: string
          problema: string | null
          processo_id: string | null
          projeto_id: string | null
          status: string
          termino_previsto: string | null
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "projetos_melhoria"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      melhoria_dar_corpo: {
        Args: { p_melhoria_id: string }
        Returns: {
          area_id: string | null
          categoria: string
          company_id: string
          created_at: string
          created_by: string | null
          descricao: string | null
          id: string
          inicio_previsto: string | null
          inicio_real: string | null
          nome: string
          okr_id: string | null
          patrocinador_user_id: string | null
          prioridade: string
          processo_id: string | null
          progresso_pct: number
          responsavel_user_id: string | null
          status: string
          termino_previsto: string | null
          termino_real: string | null
          tipo: string
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "projetos"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      melhorias_quadro: {
        Args: { p_company: string; p_processo_id?: string }
        Returns: {
          area_nome: string
          belt_nome: string
          belt_user_id: string
          fase_atual: string
          fases_concluidas: string[]
          ganho_estimado: number
          ganho_realizado: number
          id: string
          meta_smart: string
          metodo: string
          nome: string
          problema: string
          processo_id: string
          processo_nome: string
          status: string
          termino_previsto: string
          tollgates_concluidos: number
        }[]
      }
      meu_contexto: { Args: never; Returns: Json }
      meus_dmaics: {
        Args: { p_company: string }
        Returns: {
          area_nome: string
          atividades_abertas: number
          fase_atual: string
          ganho_estimado: number
          ganho_realizado: number
          id: string
          metodo: string
          nome: string
          processo_id: string
          processo_nome: string
          projeto_id: string
          status: string
          termino_previsto: string
        }[]
      }
      minhas_areas: {
        Args: { p_company: string }
        Returns: {
          area_id: string
          motivo: string
          nome: string
          tipo: string
        }[]
      }
      minhas_atividades_resumo: {
        Args: { p_company: string }
        Returns: {
          atrasadas: number
          concluidas: number
          horizonte: string
          total: number
        }[]
      }
      minhas_permissoes: { Args: { p_company: string }; Returns: string[] }
      missoes_da_semana: {
        Args: { p_area: string; p_company: string; p_referencia?: string }
        Returns: {
          alvo: number
          base: number
          codigo: string
          concluida: boolean
          feito: number
          restante: number
          titulo: string
        }[]
      }
      okr_arvore: {
        Args: { p_ano: number; p_area_id?: string; p_company: string }
        Returns: {
          ano: number
          area_id: string
          area_nome: string
          atingimento: number
          caminho: string[]
          farol: string
          id: string
          nivel: string
          objetivo_estrategico_id: string
          objetivo_titulo: string
          owner_nome: string
          owner_user_id: string
          parent_okr_id: string
          perspectiva_chave: string
          perspectiva_nome: string
          profundidade: number
          status: string
          titulo: string
          total_filhos: number
          total_krs: number
          trimestre: number
        }[]
      }
      okr_desdobrar: {
        Args: {
          p_area_id?: string
          p_okr_id: string
          p_owner_user_id?: string
          p_titulo: string
          p_trimestre?: number
        }
        Returns: {
          ano: number
          area_id: string | null
          company_id: string
          created_at: string
          created_by: string | null
          descricao: string | null
          id: string
          nivel: string
          objetivo_estrategico_id: string | null
          owner_user_id: string | null
          parent_okr_id: string | null
          perspectiva_id: string | null
          status: string
          titulo: string
          trimestre: number | null
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "okrs"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      okr_grafo: {
        Args: { p_ano: number; p_area_id?: string; p_company: string }
        Returns: {
          ano: number
          area_id: string
          area_nome: string
          atingimento: number
          farol: string
          id: string
          is_estrela_do_norte: boolean
          krs: Json
          nivel: string
          objetivo_estrategico_id: string
          objetivo_titulo: string
          owner_nome: string
          owner_user_id: string
          parent_okr_id: string
          pendencias: string[]
          perspectiva_chave: string
          perspectiva_cor: string
          perspectiva_id: string
          perspectiva_nome: string
          perspectiva_ordem: number
          status: string
          tipo: string
          titulo: string
          total_krs: number
          total_okrs: number
          trimestre: number
          ultimo_checkin: string
        }[]
      }
      okr_nivel_aceita_pai: {
        Args: { p_nivel_filho: string; p_nivel_pai: string }
        Returns: boolean
      }
      okr_vincular: {
        Args: {
          p_objetivo_id?: string
          p_okr_id: string
          p_parent_okr_id?: string
        }
        Returns: {
          ano: number
          area_id: string | null
          company_id: string
          created_at: string
          created_by: string | null
          descricao: string | null
          id: string
          nivel: string
          objetivo_estrategico_id: string | null
          owner_user_id: string | null
          parent_okr_id: string | null
          perspectiva_id: string | null
          status: string
          titulo: string
          trimestre: number | null
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "okrs"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      opr_montar: {
        Args: { p_area_id: string; p_periodo: string }
        Returns: Json
      }
      opr_publicar: {
        Args: { p_opr_id: string }
        Returns: {
          area_id: string
          autor_user_id: string | null
          company_id: string
          created_at: string
          created_by: string | null
          destaques: string | null
          id: string
          indicadores: Json
          okr_resumo: Json
          periodo: string
          proximos_passos: string | null
          publicado_em: string | null
          riscos: string | null
          status: string
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "opr"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      painel_areas: {
        Args: { p_ano: number; p_company: string }
        Returns: {
          area_id: string
          area_nome: string
          area_tipo: string
          atingimento: number
          atividades_abertas: number
          farol: string
          kit_percentual: number
          krs: number
          melhorias_ativas: number
          okrs: number
          parent_area_id: string
          processos: number
          projetos: number
          projetos_atrasados: number
          responsavel_nome: string
        }[]
      }
      painel_comite: {
        Args: { p_ano: number; p_comite_id: string }
        Returns: Json
      }
      painel_executivo: {
        Args: { p_ano: number; p_company: string }
        Returns: Json
      }
      pessoas_da_empresa: {
        Args: { p_company: string }
        Returns: {
          area_id: string
          area_nome: string
          areas_responsavel: string[]
          cargo: string
          email: string
          is_active: boolean
          is_admin: boolean
          nivel: string
          nome: string
          papeis: string[]
          user_id: string
        }[]
      }
      pop_aplicar_modelo: {
        Args: { p_modelo_id?: string; p_processo_id: string }
        Returns: {
          abrangencia: string | null
          aprovado_por: string | null
          codigo: string | null
          company_id: string
          controles_internos: Json
          created_at: string
          created_by: string | null
          data_emissao: string | null
          definicoes: Json
          elaborado_por: string | null
          id: string
          modelo_id: string | null
          objetivo: string | null
          processo_id: string
          registros: Json
          responsabilidades: Json
          revisado_por: string | null
          riscos: Json
          status: string
          updated_at: string
          versao: number
        }
        SetofOptions: {
          from: "*"
          to: "processo_pop"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      portfolio_resumo: {
        Args: {
          p_area_id?: string
          p_ate?: string
          p_categoria?: string[]
          p_company: string
          p_de?: string
          p_responsavel?: string
          p_status?: string[]
        }
        Returns: {
          atrasados: number
          concluidos: number
          progresso_medio: number
          sem_prazo: number
          sem_responsavel: number
          total: number
        }[]
      }
      presets_de_permissao: {
        Args: never
        Returns: {
          papel: string
          permissoes: string[]
        }[]
      }
      processo_etapas_reordenar: {
        Args: { p_ids: string[]; p_processo_id: string }
        Returns: number
      }
      processo_fluxo: {
        Args: { p_processo_id: string }
        Returns: {
          area_id: string
          area_nome: string
          descricao: string
          desvio_para_etapa_id: string
          eh_gargalo: boolean
          id: string
          ordem: number
          responsavel_nome: string
          responsavel_user_id: string
          rotulo_nao: string
          rotulo_sim: string
          sistema: string
          tempo_estimado_min: number
          tipo: string
          titulo: string
        }[]
      }
      processo_fluxo_resumo: {
        Args: { p_processo_id: string }
        Returns: {
          decisoes: number
          etapas_sem_tempo: number
          gargalos: number
          sem_responsavel: number
          sistemas: number
          tem_fim: boolean
          tem_inicio: boolean
          tempo_total_min: number
          total_etapas: number
        }[]
      }
      processo_indicadores: {
        Args: {
          p_ate?: string
          p_de?: string
          p_grao?: string
          p_processo_id: string
        }
        Returns: {
          baseline: number
          indicador_id: string
          indicador_nome: string
          medicoes: number
          meta: number
          periodo: string
          tipo: string
          unidade: string
          valor: number
        }[]
      }
      processo_pop_aprovar: {
        Args: { p_alteracao?: string; p_pop_id: string }
        Returns: {
          abrangencia: string | null
          aprovado_por: string | null
          codigo: string | null
          company_id: string
          controles_internos: Json
          created_at: string
          created_by: string | null
          data_emissao: string | null
          definicoes: Json
          elaborado_por: string | null
          id: string
          modelo_id: string | null
          objetivo: string | null
          processo_id: string
          registros: Json
          responsabilidades: Json
          revisado_por: string | null
          riscos: Json
          status: string
          updated_at: string
          versao: number
        }
        SetofOptions: {
          from: "*"
          to: "processo_pop"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      processo_pop_completo: { Args: { p_processo_id: string }; Returns: Json }
      processos_categorias: {
        Args: { p_area_id?: string; p_company: string }
        Returns: {
          categoria: string
          processos: number
        }[]
      }
      processos_inventario: {
        Args: { p_area_id?: string; p_categoria?: string; p_company: string }
        Returns: {
          area_id: string
          area_nome: string
          categoria: string
          dono_nome: string
          dono_user_id: string
          ganho_realizado: number
          id: string
          indicadores_x: number
          indicadores_y: number
          melhorias_ativas: number
          nivel_maturidade: number
          nome: string
          origem_do_registro: string
          pendencia_de_mapeamento: string
          periodicidade: string
          periodicidade_origem: string
          prazo_referencia: string
          pronto_para_dmaic: boolean
          sipoc_iniciado: boolean
          status: string
          tem_sipoc: boolean
          tipo: string
        }[]
      }
      processos_jornada: {
        Args: { p_area?: string; p_company: string }
        Returns: {
          area_id: string
          area_nome: string
          categoria: string
          estagio: string
          nome: string
          pendencia_de_mapeamento: string
          periodicidade: string
          prazo_referencia: string
          processo_id: string
          selo_dono: boolean
          selo_fluxo: boolean
          selo_indicador: boolean
          selo_melhoria: boolean
          selo_pop: boolean
          selo_sipoc: boolean
          selos: number
        }[]
      }
      projeto_progresso: {
        Args: { p_projeto_id: string }
        Returns: {
          area_id: string | null
          categoria: string
          company_id: string
          created_at: string
          created_by: string | null
          descricao: string | null
          id: string
          inicio_previsto: string | null
          inicio_real: string | null
          nome: string
          okr_id: string | null
          patrocinador_user_id: string | null
          prioridade: string
          processo_id: string | null
          progresso_pct: number
          responsavel_user_id: string | null
          status: string
          termino_previsto: string | null
          termino_real: string | null
          tipo: string
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "projetos"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      senha_trocada: { Args: never; Returns: boolean }
      sipoc_completo: {
        Args: {
          p_customers: string
          p_inputs: string
          p_outputs: string
          p_suppliers: string
        }
        Returns: boolean
      }
      sprint_resumo: {
        Args: { p_sprint_id: string }
        Returns: {
          status: string
          total: number
        }[]
      }
      sprints_do_quadro: {
        Args: { p_area_id?: string; p_company: string; p_referencia?: string }
        Returns: {
          area_id: string
          area_nome: string
          atividades: number
          bloqueadas: number
          concluidas: number
          data_fim: string
          data_inicio: string
          dias_ate_o_fim: number
          dias_ate_o_inicio: number
          e_atual: boolean
          id: string
          nome: string
          objetivo: string
          projeto_nomes: string[]
          projetos: number
          status: string
        }[]
      }
      subarvore_de_area: {
        Args: { p_area: string }
        Returns: {
          area_id: string
        }[]
      }
      vincular_pessoa: {
        Args: {
          p_area_id?: string
          p_cargo?: string
          p_company: string
          p_email: string
          p_forcar_troca?: boolean
          p_nivel?: string
          p_nome: string
          p_papel?: string
          p_user: string
        }
        Returns: {
          area_id: string | null
          cargo: string | null
          company_id: string
          created_at: string
          created_by: string | null
          id: string
          is_active: boolean
          is_admin: boolean
          nivel: string
          updated_at: string
          user_id: string
        }
        SetofOptions: {
          from: "*"
          to: "company_users"
          isOneToOne: true
          isSetofReturn: false
        }
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  app: {
    Enums: {},
  },
} as const
