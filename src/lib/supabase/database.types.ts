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
          hora: string | null
          id: string
          user_id: string
        }
        Insert: {
          cliente_id: string
          consumio?: boolean
          created_at?: string
          deleted_at?: string | null
          fecha: string
          hora?: string | null
          id?: string
          user_id: string
        }
        Update: {
          cliente_id?: string
          consumio?: boolean
          created_at?: string
          deleted_at?: string | null
          fecha?: string
          hora?: string | null
          id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "asistencias_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
        ]
      }
      clientes: {
        Row: {
          birthday: string | null
          clases_restantes: number | null
          created_at: string
          email: string | null
          id: string
          nombre: string
          paquete_nombre: string | null
          tel: string
          user_id: string
          vence: string | null
        }
        Insert: {
          birthday?: string | null
          clases_restantes?: number | null
          created_at?: string
          email?: string | null
          id?: string
          nombre: string
          paquete_nombre?: string | null
          tel: string
          user_id: string
          vence?: string | null
        }
        Update: {
          birthday?: string | null
          clases_restantes?: number | null
          created_at?: string
          email?: string | null
          id?: string
          nombre?: string
          paquete_nombre?: string | null
          tel?: string
          user_id?: string
          vence?: string | null
        }
        Relationships: []
      }
      paquetes: {
        Row: {
          clases: number | null
          created_at: string
          id: string
          nombre: string
          orden: number
          popular: boolean
          precio: number
          user_id: string
          vigencia_dias: number | null
          vigencia_tipo: string
        }
        Insert: {
          clases?: number | null
          created_at?: string
          id?: string
          nombre: string
          orden?: number
          popular?: boolean
          precio: number
          user_id: string
          vigencia_dias?: number | null
          vigencia_tipo?: string
        }
        Update: {
          clases?: number | null
          created_at?: string
          id?: string
          nombre?: string
          orden?: number
          popular?: boolean
          precio?: number
          user_id?: string
          vigencia_dias?: number | null
          vigencia_tipo?: string
        }
        Relationships: []
      }
      perfil: {
        Row: {
          ciudad: string | null
          coach: string | null
          created_at: string
          id: string
          negocio: string
          tel: string | null
          user_id: string
        }
        Insert: {
          ciudad?: string | null
          coach?: string | null
          created_at?: string
          id?: string
          negocio?: string
          tel?: string | null
          user_id: string
        }
        Update: {
          ciudad?: string | null
          coach?: string | null
          created_at?: string
          id?: string
          negocio?: string
          tel?: string | null
          user_id?: string
        }
        Relationships: []
      }
      plantillas: {
        Row: {
          body: string
          clave: string
          created_at: string
          id: string
          user_id: string
        }
        Insert: {
          body: string
          clave: string
          created_at?: string
          id?: string
          user_id: string
        }
        Update: {
          body?: string
          clave?: string
          created_at?: string
          id?: string
          user_id?: string
        }
        Relationships: []
      }
      ventas: {
        Row: {
          clases: number | null
          cliente_id: string
          created_at: string
          fecha: string
          folio: number
          id: string
          metodo: string
          monto: number
          paquete_nombre: string
          user_id: string
          vigencia_dias: number | null
          vigencia_tipo: string
        }
        Insert: {
          clases?: number | null
          cliente_id: string
          created_at?: string
          fecha?: string
          folio?: number
          id?: string
          metodo: string
          monto: number
          paquete_nombre: string
          user_id: string
          vigencia_dias?: number | null
          vigencia_tipo: string
        }
        Update: {
          clases?: number | null
          cliente_id?: string
          created_at?: string
          fecha?: string
          folio?: number
          id?: string
          metodo?: string
          monto?: number
          paquete_nombre?: string
          user_id?: string
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
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
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
