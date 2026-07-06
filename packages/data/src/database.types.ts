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
  public: {
    Tables: {
      asistencias: {
        Row: {
          cliente_id: string
          consumio: boolean
          created_at: string
          deleted_at: string | null
          fecha: string
          gym_id: string
          hora: string | null
          id: string
        }
        Insert: {
          cliente_id: string
          consumio?: boolean
          created_at?: string
          deleted_at?: string | null
          fecha: string
          gym_id: string
          hora?: string | null
          id?: string
        }
        Update: {
          cliente_id?: string
          consumio?: boolean
          created_at?: string
          deleted_at?: string | null
          fecha?: string
          gym_id?: string
          hora?: string | null
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "asistencias_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "asistencias_gym_id_fkey"
            columns: ["gym_id"]
            isOneToOne: false
            referencedRelation: "gym"
            referencedColumns: ["id"]
          },
        ]
      }
      clientes: {
        Row: {
          auth_user_id: string | null
          birthday: string | null
          clases_restantes: number | null
          created_at: string
          email: string | null
          gym_id: string
          id: string
          nombre: string
          paquete_nombre: string | null
          phone_e164: string | null
          privacy_accepted_at: string | null
          tel: string
          terms_accepted_at: string | null
          vence: string | null
        }
        Insert: {
          auth_user_id?: string | null
          birthday?: string | null
          clases_restantes?: number | null
          created_at?: string
          email?: string | null
          gym_id: string
          id?: string
          nombre: string
          paquete_nombre?: string | null
          phone_e164?: string | null
          privacy_accepted_at?: string | null
          tel: string
          terms_accepted_at?: string | null
          vence?: string | null
        }
        Update: {
          auth_user_id?: string | null
          birthday?: string | null
          clases_restantes?: number | null
          created_at?: string
          email?: string | null
          gym_id?: string
          id?: string
          nombre?: string
          paquete_nombre?: string | null
          phone_e164?: string | null
          privacy_accepted_at?: string | null
          tel?: string
          terms_accepted_at?: string | null
          vence?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "clientes_gym_id_fkey"
            columns: ["gym_id"]
            isOneToOne: false
            referencedRelation: "gym"
            referencedColumns: ["id"]
          },
        ]
      }
      cobro: {
        Row: {
          acepta_efectivo: boolean
          acepta_tarjeta: boolean
          acepta_transferencia: boolean
          banco: string | null
          clabe: string | null
          created_at: string
          gym_id: string
          id: string
          tarjeta: string | null
          titular: string | null
        }
        Insert: {
          acepta_efectivo?: boolean
          acepta_tarjeta?: boolean
          acepta_transferencia?: boolean
          banco?: string | null
          clabe?: string | null
          created_at?: string
          gym_id: string
          id?: string
          tarjeta?: string | null
          titular?: string | null
        }
        Update: {
          acepta_efectivo?: boolean
          acepta_tarjeta?: boolean
          acepta_transferencia?: boolean
          banco?: string | null
          clabe?: string | null
          created_at?: string
          gym_id?: string
          id?: string
          tarjeta?: string | null
          titular?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "cobro_gym_id_fkey"
            columns: ["gym_id"]
            isOneToOne: true
            referencedRelation: "gym"
            referencedColumns: ["id"]
          },
        ]
      }
      gym: {
        Row: {
          brand_module_id: string
          brand_name: string
          created_at: string
          id: string
          legal_name: string | null
          owner_user_id: string | null
          slug: string
          timezone: string
          token_overrides: Json
        }
        Insert: {
          brand_module_id: string
          brand_name: string
          created_at?: string
          id?: string
          legal_name?: string | null
          owner_user_id?: string | null
          slug: string
          timezone: string
          token_overrides?: Json
        }
        Update: {
          brand_module_id?: string
          brand_name?: string
          created_at?: string
          id?: string
          legal_name?: string | null
          owner_user_id?: string | null
          slug?: string
          timezone?: string
          token_overrides?: Json
        }
        Relationships: []
      }
      gym_domain: {
        Row: {
          app: string
          created_at: string
          gym_id: string
          hostname: string
          id: string
        }
        Insert: {
          app: string
          created_at?: string
          gym_id: string
          hostname: string
          id?: string
        }
        Update: {
          app?: string
          created_at?: string
          gym_id?: string
          hostname?: string
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "gym_domain_gym_id_fkey"
            columns: ["gym_id"]
            isOneToOne: false
            referencedRelation: "gym"
            referencedColumns: ["id"]
          },
        ]
      }
      gym_folio_counter: {
        Row: {
          gym_id: string
          last_folio: number
        }
        Insert: {
          gym_id: string
          last_folio: number
        }
        Update: {
          gym_id?: string
          last_folio?: number
        }
        Relationships: [
          {
            foreignKeyName: "gym_folio_counter_gym_id_fkey"
            columns: ["gym_id"]
            isOneToOne: true
            referencedRelation: "gym"
            referencedColumns: ["id"]
          },
        ]
      }
      gym_membership: {
        Row: {
          created_at: string
          gym_id: string
          role: string
          user_id: string
        }
        Insert: {
          created_at?: string
          gym_id: string
          role: string
          user_id: string
        }
        Update: {
          created_at?: string
          gym_id?: string
          role?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "gym_membership_gym_id_fkey"
            columns: ["gym_id"]
            isOneToOne: false
            referencedRelation: "gym"
            referencedColumns: ["id"]
          },
        ]
      }
      paquetes: {
        Row: {
          badge: string | null
          cadence: string | null
          clases: number | null
          code: string | null
          created_at: string
          gym_id: string
          id: string
          name: string | null
          nombre: string
          orden: number
          popular: boolean
          precio: number
          subtitle: string | null
          vigencia_dias: number | null
          vigencia_tipo: string
        }
        Insert: {
          badge?: string | null
          cadence?: string | null
          clases?: number | null
          code?: string | null
          created_at?: string
          gym_id: string
          id?: string
          name?: string | null
          nombre: string
          orden?: number
          popular?: boolean
          precio: number
          subtitle?: string | null
          vigencia_dias?: number | null
          vigencia_tipo?: string
        }
        Update: {
          badge?: string | null
          cadence?: string | null
          clases?: number | null
          code?: string | null
          created_at?: string
          gym_id?: string
          id?: string
          name?: string | null
          nombre?: string
          orden?: number
          popular?: boolean
          precio?: number
          subtitle?: string | null
          vigencia_dias?: number | null
          vigencia_tipo?: string
        }
        Relationships: [
          {
            foreignKeyName: "paquetes_gym_id_fkey"
            columns: ["gym_id"]
            isOneToOne: false
            referencedRelation: "gym"
            referencedColumns: ["id"]
          },
        ]
      }
      perfil: {
        Row: {
          ciudad: string | null
          coach: string | null
          created_at: string
          gym_id: string
          id: string
          negocio: string
          tel: string | null
        }
        Insert: {
          ciudad?: string | null
          coach?: string | null
          created_at?: string
          gym_id: string
          id?: string
          negocio?: string
          tel?: string | null
        }
        Update: {
          ciudad?: string | null
          coach?: string | null
          created_at?: string
          gym_id?: string
          id?: string
          negocio?: string
          tel?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "perfil_gym_id_fkey"
            columns: ["gym_id"]
            isOneToOne: true
            referencedRelation: "gym"
            referencedColumns: ["id"]
          },
        ]
      }
      plan_feature: {
        Row: {
          created_at: string
          gym_id: string
          id: string
          label: string
          orden: number
          plan_id: string
        }
        Insert: {
          created_at?: string
          gym_id: string
          id?: string
          label: string
          orden: number
          plan_id: string
        }
        Update: {
          created_at?: string
          gym_id?: string
          id?: string
          label?: string
          orden?: number
          plan_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "plan_feature_gym_id_fkey"
            columns: ["gym_id"]
            isOneToOne: false
            referencedRelation: "gym"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "plan_feature_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "paquetes"
            referencedColumns: ["id"]
          },
        ]
      }
      plantillas: {
        Row: {
          body: string
          created_at: string
          gym_id: string
          id: string
          nombre: string
        }
        Insert: {
          body: string
          created_at?: string
          gym_id: string
          id?: string
          nombre: string
        }
        Update: {
          body?: string
          created_at?: string
          gym_id?: string
          id?: string
          nombre?: string
        }
        Relationships: [
          {
            foreignKeyName: "plantillas_gym_id_fkey"
            columns: ["gym_id"]
            isOneToOne: false
            referencedRelation: "gym"
            referencedColumns: ["id"]
          },
        ]
      }
      ventas: {
        Row: {
          clases: number | null
          cliente_id: string
          created_at: string
          fecha: string
          folio: number
          gym_id: string
          id: string
          metodo: string
          monto: number
          paquete_nombre: string
          vigencia_dias: number | null
          vigencia_tipo: string
        }
        Insert: {
          clases?: number | null
          cliente_id: string
          created_at?: string
          fecha?: string
          folio: number
          gym_id: string
          id?: string
          metodo: string
          monto: number
          paquete_nombre: string
          vigencia_dias?: number | null
          vigencia_tipo: string
        }
        Update: {
          clases?: number | null
          cliente_id?: string
          created_at?: string
          fecha?: string
          folio?: number
          gym_id?: string
          id?: string
          metodo?: string
          monto?: number
          paquete_nombre?: string
          vigencia_dias?: number | null
          vigencia_tipo?: string
        }
        Relationships: [
          {
            foreignKeyName: "ventas_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ventas_gym_id_fkey"
            columns: ["gym_id"]
            isOneToOne: false
            referencedRelation: "gym"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      actualizar_cliente: {
        Args: { p_cliente_id: string; p_nombre: string; p_tel: string }
        Returns: undefined
      }
      actualizar_paquete: {
        Args: {
          p_clases?: number
          p_id: string
          p_popular: boolean
          p_precio: number
        }
        Returns: undefined
      }
      actualizar_paquete_marketing: {
        Args: {
          p_badge: string
          p_cadence: string
          p_code: string
          p_id: string
          p_name: string
          p_subtitle: string
        }
        Returns: undefined
      }
      actualizar_plantilla: {
        Args: { p_body: string; p_id: string; p_nombre: string }
        Returns: undefined
      }
      crear_plantilla: {
        Args: { p_body: string; p_nombre: string }
        Returns: string
      }
      eliminar_plantilla: { Args: { p_id: string }; Returns: undefined }
      has_role: { Args: { p_gym: string; p_role: string }; Returns: boolean }
      is_member_of: { Args: { p_gym: string }; Returns: boolean }
      is_staff_of: { Args: { p_gym: string }; Returns: boolean }
      next_folio: { Args: { p_gym: string }; Returns: number }
      reclamar_o_crear_cliente: {
        Args: { p_gym_id: string }
        Returns: {
          cliente_id: string
          reclamado: boolean
        }[]
      }
      registrar_venta: {
        Args: {
          p_clases?: number
          p_clases_restantes?: number
          p_cliente_id?: string
          p_metodo: string
          p_monto: number
          p_nombre: string
          p_paquete_nombre: string
          p_tel: string
          p_vence?: string
          p_vigencia_dias?: number
          p_vigencia_tipo: string
        }
        Returns: {
          cliente_id: string
          folio: number
        }[]
      }
      sembrar_plantillas_default: { Args: never; Returns: undefined }
      set_plan_features: {
        Args: { p_labels: string[]; p_plan_id: string }
        Returns: undefined
      }
      staff_gym: { Args: never; Returns: string }
      toggle_pase: {
        Args: { p_cliente_id: string; p_fecha: string }
        Returns: {
          hora: string
          present: boolean
        }[]
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
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
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
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
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
