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
      about_value: {
        Row: {
          created_at: string
          description: string
          gym_id: string
          id: string
          sort_order: number
          title: string
        }
        Insert: {
          created_at?: string
          description: string
          gym_id: string
          id?: string
          sort_order?: number
          title: string
        }
        Update: {
          created_at?: string
          description?: string
          gym_id?: string
          id?: string
          sort_order?: number
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "about_value_gym_id_fkey"
            columns: ["gym_id"]
            isOneToOne: false
            referencedRelation: "gym"
            referencedColumns: ["id"]
          },
        ]
      }
      asistencias: {
        Row: {
          class_session_id: string | null
          cliente_id: string
          consumio: boolean
          created_at: string
          deleted_at: string | null
          fecha: string
          gym_id: string
          hora: string | null
          id: string
          reservation_id: string | null
        }
        Insert: {
          class_session_id?: string | null
          cliente_id: string
          consumio?: boolean
          created_at?: string
          deleted_at?: string | null
          fecha: string
          gym_id: string
          hora?: string | null
          id?: string
          reservation_id?: string | null
        }
        Update: {
          class_session_id?: string | null
          cliente_id?: string
          consumio?: boolean
          created_at?: string
          deleted_at?: string | null
          fecha?: string
          gym_id?: string
          hora?: string | null
          id?: string
          reservation_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "asistencias_class_session_id_fkey"
            columns: ["class_session_id"]
            isOneToOne: false
            referencedRelation: "class_session"
            referencedColumns: ["id"]
          },
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
          {
            foreignKeyName: "asistencias_reservation_id_fkey"
            columns: ["reservation_id"]
            isOneToOne: false
            referencedRelation: "reservation"
            referencedColumns: ["id"]
          },
        ]
      }
      class_session: {
        Row: {
          cancelled_at: string | null
          capacity: number
          class_type_id: string
          created_at: string
          duration_min: number
          gym_id: string
          id: string
          is_special: boolean
          room_id: string | null
          special_name: string | null
          starts_at: string
          template_id: string | null
        }
        Insert: {
          cancelled_at?: string | null
          capacity: number
          class_type_id: string
          created_at?: string
          duration_min: number
          gym_id: string
          id?: string
          is_special?: boolean
          room_id?: string | null
          special_name?: string | null
          starts_at: string
          template_id?: string | null
        }
        Update: {
          cancelled_at?: string | null
          capacity?: number
          class_type_id?: string
          created_at?: string
          duration_min?: number
          gym_id?: string
          id?: string
          is_special?: boolean
          room_id?: string | null
          special_name?: string | null
          starts_at?: string
          template_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "class_session_class_type_id_fkey"
            columns: ["class_type_id"]
            isOneToOne: false
            referencedRelation: "class_type"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "class_session_gym_id_fkey"
            columns: ["gym_id"]
            isOneToOne: false
            referencedRelation: "gym"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "class_session_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: false
            referencedRelation: "room"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "class_session_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "schedule_template"
            referencedColumns: ["id"]
          },
        ]
      }
      class_session_coach: {
        Row: {
          coach_id: string
          gym_id: string
          session_id: string
        }
        Insert: {
          coach_id: string
          gym_id: string
          session_id: string
        }
        Update: {
          coach_id?: string
          gym_id?: string
          session_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "class_session_coach_coach_id_fkey"
            columns: ["coach_id"]
            isOneToOne: false
            referencedRelation: "coach"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "class_session_coach_gym_id_fkey"
            columns: ["gym_id"]
            isOneToOne: false
            referencedRelation: "gym"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "class_session_coach_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "class_session"
            referencedColumns: ["id"]
          },
        ]
      }
      class_type: {
        Row: {
          created_at: string
          default_duration_min: number | null
          description: string | null
          gym_id: string
          id: string
          level: string | null
          name: string
          sala: string | null
        }
        Insert: {
          created_at?: string
          default_duration_min?: number | null
          description?: string | null
          gym_id: string
          id?: string
          level?: string | null
          name: string
          sala?: string | null
        }
        Update: {
          created_at?: string
          default_duration_min?: number | null
          description?: string | null
          gym_id?: string
          id?: string
          level?: string | null
          name?: string
          sala?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "class_type_gym_id_fkey"
            columns: ["gym_id"]
            isOneToOne: false
            referencedRelation: "gym"
            referencedColumns: ["id"]
          },
        ]
      }
      class_type_bring_item: {
        Row: {
          class_type_id: string
          created_at: string
          gym_id: string
          id: string
          label: string
          sort_order: number
        }
        Insert: {
          class_type_id: string
          created_at?: string
          gym_id: string
          id?: string
          label: string
          sort_order?: number
        }
        Update: {
          class_type_id?: string
          created_at?: string
          gym_id?: string
          id?: string
          label?: string
          sort_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "class_type_bring_item_class_type_id_fkey"
            columns: ["class_type_id"]
            isOneToOne: false
            referencedRelation: "class_type"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "class_type_bring_item_gym_id_fkey"
            columns: ["gym_id"]
            isOneToOne: false
            referencedRelation: "gym"
            referencedColumns: ["id"]
          },
        ]
      }
      class_type_workblock: {
        Row: {
          class_type_id: string
          created_at: string
          gym_id: string
          id: string
          label: string
          sort_order: number
          value: string | null
        }
        Insert: {
          class_type_id: string
          created_at?: string
          gym_id: string
          id?: string
          label: string
          sort_order?: number
          value?: string | null
        }
        Update: {
          class_type_id?: string
          created_at?: string
          gym_id?: string
          id?: string
          label?: string
          sort_order?: number
          value?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "class_type_workblock_class_type_id_fkey"
            columns: ["class_type_id"]
            isOneToOne: false
            referencedRelation: "class_type"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "class_type_workblock_gym_id_fkey"
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
          claim_code: string | null
          clases_restantes: number | null
          created_at: string
          email: string | null
          favorite_class_type_id: string | null
          gym_id: string
          id: string
          invitacion_enviada_at: string | null
          nombre: string
          notificaciones_activadas: boolean
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
          claim_code?: string | null
          clases_restantes?: number | null
          created_at?: string
          email?: string | null
          favorite_class_type_id?: string | null
          gym_id: string
          id?: string
          invitacion_enviada_at?: string | null
          nombre: string
          notificaciones_activadas?: boolean
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
          claim_code?: string | null
          clases_restantes?: number | null
          created_at?: string
          email?: string | null
          favorite_class_type_id?: string | null
          gym_id?: string
          id?: string
          invitacion_enviada_at?: string | null
          nombre?: string
          notificaciones_activadas?: boolean
          paquete_nombre?: string | null
          phone_e164?: string | null
          privacy_accepted_at?: string | null
          tel?: string
          terms_accepted_at?: string | null
          vence?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "clientes_favorite_class_type_id_fkey"
            columns: ["favorite_class_type_id"]
            isOneToOne: false
            referencedRelation: "class_type"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "clientes_gym_id_fkey"
            columns: ["gym_id"]
            isOneToOne: false
            referencedRelation: "gym"
            referencedColumns: ["id"]
          },
        ]
      }
      coach: {
        Row: {
          bio: string | null
          created_at: string
          gym_id: string
          id: string
          initials: string
          is_active: boolean
          name: string
          role: string
          sort_order: number
          specialty: string | null
        }
        Insert: {
          bio?: string | null
          created_at?: string
          gym_id: string
          id?: string
          initials: string
          is_active?: boolean
          name: string
          role: string
          sort_order?: number
          specialty?: string | null
        }
        Update: {
          bio?: string | null
          created_at?: string
          gym_id?: string
          id?: string
          initials?: string
          is_active?: boolean
          name?: string
          role?: string
          sort_order?: number
          specialty?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "coach_gym_id_fkey"
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
      contact_message: {
        Row: {
          correo: string
          created_at: string
          gym_id: string
          id: string
          ip: string | null
          mensaje: string
          nombre: string
          read_at: string | null
        }
        Insert: {
          correo: string
          created_at?: string
          gym_id: string
          id?: string
          ip?: string | null
          mensaje: string
          nombre: string
          read_at?: string | null
        }
        Update: {
          correo?: string
          created_at?: string
          gym_id?: string
          id?: string
          ip?: string | null
          mensaje?: string
          nombre?: string
          read_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "contact_message_gym_id_fkey"
            columns: ["gym_id"]
            isOneToOne: false
            referencedRelation: "gym"
            referencedColumns: ["id"]
          },
        ]
      }
      facility: {
        Row: {
          created_at: string
          description: string
          gym_id: string
          id: string
          name: string
          sort_order: number
        }
        Insert: {
          created_at?: string
          description: string
          gym_id: string
          id?: string
          name: string
          sort_order?: number
        }
        Update: {
          created_at?: string
          description?: string
          gym_id?: string
          id?: string
          name?: string
          sort_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "facility_gym_id_fkey"
            columns: ["gym_id"]
            isOneToOne: false
            referencedRelation: "gym"
            referencedColumns: ["id"]
          },
        ]
      }
      faq: {
        Row: {
          answer: string
          created_at: string
          gym_id: string
          id: string
          question: string
          sort_order: number
        }
        Insert: {
          answer: string
          created_at?: string
          gym_id: string
          id?: string
          question: string
          sort_order?: number
        }
        Update: {
          answer?: string
          created_at?: string
          gym_id?: string
          id?: string
          question?: string
          sort_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "faq_gym_id_fkey"
            columns: ["gym_id"]
            isOneToOne: false
            referencedRelation: "gym"
            referencedColumns: ["id"]
          },
        ]
      }
      gym: {
        Row: {
          about_pull_quote: string | null
          about_story: string | null
          about_tagline: string | null
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
          about_pull_quote?: string | null
          about_story?: string | null
          about_tagline?: string | null
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
          about_pull_quote?: string | null
          about_story?: string | null
          about_tagline?: string | null
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
      gym_contact: {
        Row: {
          address_line: string | null
          address_note: string | null
          email: string | null
          gym_id: string
          hours: Json
          instagram: string | null
          latitude: number | null
          longitude: number | null
          updated_at: string
          whatsapp: string | null
        }
        Insert: {
          address_line?: string | null
          address_note?: string | null
          email?: string | null
          gym_id: string
          hours?: Json
          instagram?: string | null
          latitude?: number | null
          longitude?: number | null
          updated_at?: string
          whatsapp?: string | null
        }
        Update: {
          address_line?: string | null
          address_note?: string | null
          email?: string | null
          gym_id?: string
          hours?: Json
          instagram?: string | null
          latitude?: number | null
          longitude?: number | null
          updated_at?: string
          whatsapp?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "gym_contact_gym_id_fkey"
            columns: ["gym_id"]
            isOneToOne: true
            referencedRelation: "gym"
            referencedColumns: ["id"]
          },
        ]
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
          nota: string | null
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
          nota?: string | null
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
          nota?: string | null
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
          negocio: string
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
      reservation: {
        Row: {
          cancelled_at: string | null
          checked_at: string | null
          class_session_id: string
          consumio: boolean
          created_at: string
          gym_id: string
          id: string
          is_walk_in: boolean
          member_id: string
          status: string
        }
        Insert: {
          cancelled_at?: string | null
          checked_at?: string | null
          class_session_id: string
          consumio?: boolean
          created_at?: string
          gym_id: string
          id?: string
          is_walk_in?: boolean
          member_id: string
          status?: string
        }
        Update: {
          cancelled_at?: string | null
          checked_at?: string | null
          class_session_id?: string
          consumio?: boolean
          created_at?: string
          gym_id?: string
          id?: string
          is_walk_in?: boolean
          member_id?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "reservation_class_session_id_fkey"
            columns: ["class_session_id"]
            isOneToOne: false
            referencedRelation: "class_session"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reservation_gym_id_fkey"
            columns: ["gym_id"]
            isOneToOne: false
            referencedRelation: "gym"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reservation_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
        ]
      }
      room: {
        Row: {
          capacity: number | null
          created_at: string
          gym_id: string
          id: string
          name: string
        }
        Insert: {
          capacity?: number | null
          created_at?: string
          gym_id: string
          id?: string
          name: string
        }
        Update: {
          capacity?: number | null
          created_at?: string
          gym_id?: string
          id?: string
          name?: string
        }
        Relationships: [
          {
            foreignKeyName: "room_gym_id_fkey"
            columns: ["gym_id"]
            isOneToOne: false
            referencedRelation: "gym"
            referencedColumns: ["id"]
          },
        ]
      }
      schedule_template: {
        Row: {
          capacity: number
          class_type_id: string
          created_at: string
          duration_min: number
          gym_id: string
          id: string
          is_active: boolean
          start_time: string
          weekday: number
        }
        Insert: {
          capacity: number
          class_type_id: string
          created_at?: string
          duration_min: number
          gym_id: string
          id?: string
          is_active?: boolean
          start_time: string
          weekday: number
        }
        Update: {
          capacity?: number
          class_type_id?: string
          created_at?: string
          duration_min?: number
          gym_id?: string
          id?: string
          is_active?: boolean
          start_time?: string
          weekday?: number
        }
        Relationships: [
          {
            foreignKeyName: "schedule_template_class_type_id_fkey"
            columns: ["class_type_id"]
            isOneToOne: false
            referencedRelation: "class_type"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "schedule_template_gym_id_fkey"
            columns: ["gym_id"]
            isOneToOne: false
            referencedRelation: "gym"
            referencedColumns: ["id"]
          },
        ]
      }
      schedule_template_coach: {
        Row: {
          coach_id: string
          gym_id: string
          template_id: string
        }
        Insert: {
          coach_id: string
          gym_id: string
          template_id: string
        }
        Update: {
          coach_id?: string
          gym_id?: string
          template_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "schedule_template_coach_coach_id_fkey"
            columns: ["coach_id"]
            isOneToOne: false
            referencedRelation: "coach"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "schedule_template_coach_gym_id_fkey"
            columns: ["gym_id"]
            isOneToOne: false
            referencedRelation: "gym"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "schedule_template_coach_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "schedule_template"
            referencedColumns: ["id"]
          },
        ]
      }
      schedule_template_week: {
        Row: {
          created_at: string
          gym_id: string
          template_id: string
          week_start: string
        }
        Insert: {
          created_at?: string
          gym_id: string
          template_id: string
          week_start: string
        }
        Update: {
          created_at?: string
          gym_id?: string
          template_id?: string
          week_start?: string
        }
        Relationships: [
          {
            foreignKeyName: "schedule_template_week_gym_id_fkey"
            columns: ["gym_id"]
            isOneToOne: false
            referencedRelation: "gym"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "schedule_template_week_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "schedule_template"
            referencedColumns: ["id"]
          },
        ]
      }
      stat: {
        Row: {
          created_at: string
          gym_id: string
          id: string
          label: string
          sort_order: number
          value: string
        }
        Insert: {
          created_at?: string
          gym_id: string
          id?: string
          label: string
          sort_order?: number
          value: string
        }
        Update: {
          created_at?: string
          gym_id?: string
          id?: string
          label?: string
          sort_order?: number
          value?: string
        }
        Relationships: [
          {
            foreignKeyName: "stat_gym_id_fkey"
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
          idempotency_key: string | null
          metodo: string
          monto: number
          paquete_nombre: string
          personalizado: boolean
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
          idempotency_key?: string | null
          metodo: string
          monto: number
          paquete_nombre: string
          personalizado?: boolean
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
          idempotency_key?: string | null
          metodo?: string
          monto?: number
          paquete_nombre?: string
          personalizado?: boolean
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
        Args: {
          p_cliente_id: string
          p_email?: string
          p_nombre: string
          p_tel: string
        }
        Returns: {
          email_changed: boolean
          unclaimed: boolean
        }[]
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
      asistencias_mes_por_cliente: {
        Args: { p_desde: string; p_gym_id: string }
        Returns: {
          cliente_id: string
          n: number
        }[]
      }
      cancel_class_session: {
        Args: { p_session_id: string }
        Returns: undefined
      }
      cancelar_reserva: {
        Args: { p_session_id: string }
        Returns: {
          clases_restantes: number
          reservation_id: string
        }[]
      }
      contar_reservas_activas: {
        Args: { p_session_ids: string[] }
        Returns: {
          activos: number
          session_id: string
        }[]
      }
      crear_plantilla: {
        Args: { p_body: string; p_nombre: string }
        Returns: string
      }
      create_class_session: {
        Args: {
          p_capacity: number
          p_class_type_id: string
          p_coach_ids?: string[]
          p_duration_min: number
          p_is_special?: boolean
          p_room_id?: string
          p_special_name?: string
          p_starts_at: string
        }
        Returns: string
      }
      create_recurring_schedule: {
        Args: {
          p_capacity: number
          p_class_type_id: string
          p_coach_ids?: string[]
          p_duration_min: number
          p_horizon_weeks?: number
          p_start_time: string
          p_weekdays: number[]
        }
        Returns: string[]
      }
      edit_class_session: {
        Args: {
          p_capacity: number
          p_class_type_id: string
          p_coach_ids?: string[]
          p_duration_min: number
          p_is_special?: boolean
          p_room_id?: string
          p_session_id: string
          p_special_name?: string
          p_starts_at: string
        }
        Returns: undefined
      }
      eliminar_plantilla: { Args: { p_id: string }; Returns: undefined }
      ensure_week_materialized: {
        Args: { p_week_start: string }
        Returns: number
      }
      enviar_mensaje_contacto: {
        Args: {
          p_correo: string
          p_gym_slug: string
          p_ip?: string
          p_mensaje: string
          p_nombre: string
        }
        Returns: undefined
      }
      has_role: { Args: { p_gym: string; p_role: string }; Returns: boolean }
      invitacion_info: {
        Args: { p_codigo: string }
        Returns: {
          cliente_nombre: string
          gym_nombre: string
          gym_slug: string
        }[]
      }
      is_member_of: { Args: { p_gym: string }; Returns: boolean }
      is_staff_of: { Args: { p_gym: string }; Returns: boolean }
      marcadas_por_gym: {
        Args: { p_desde: string; p_gym_id: string; p_hasta: string }
        Returns: Json
      }
      marcadas_presencia: {
        Args: { p_desde: string; p_gym_id: string; p_hasta: string }
        Returns: Json
      }
      marcar_invitacion_enviada: {
        Args: { p_cliente_id: string }
        Returns: undefined
      }
      mi_membresia: {
        Args: never
        Returns: {
          anchor_dia: string
          anchor_monto: number
          anchor_vigencia_dias: number
          anchor_vigencia_tipo: string
          attended_since_purchase: number
          clases_restantes: number
          paquete_nombre: string
          vence: string
        }[]
      }
      next_folio: { Args: { p_gym: string }; Returns: number }
      pasar_lista_sesion: {
        Args: { p_cliente_id: string; p_session_id: string }
        Returns: {
          hora: string
          present: boolean
        }[]
      }
      preparar_invitacion: {
        Args: { p_cliente_id: string }
        Returns: {
          codigo: string
          email: string
          gym_id: string
          gym_nombre: string
          gym_slug: string
          nombre: string
        }[]
      }
      reclamar_o_crear_cliente: {
        Args: { p_firma: string; p_gym_id: string }
        Returns: {
          cliente_id: string
          reclamado: boolean
        }[]
      }
      reclamar_por_codigo: {
        Args: { p_codigo: string }
        Returns: {
          gym_slug: string
        }[]
      }
      registrar_venta: {
        Args: {
          p_cliente_id?: string
          p_custom_clases?: number
          p_custom_dias?: number
          p_custom_ilimitado?: boolean
          p_custom_nombre?: string
          p_custom_precio?: number
          p_email?: string
          p_fecha_inicio?: string
          p_forzar_nuevo?: boolean
          p_idempotency_key: string
          p_metodo: string
          p_nombre?: string
          p_paquete_id?: string
          p_tel?: string
        }
        Returns: {
          clases_restantes: number
          cliente_id: string
          folio: number
          monto: number
          paquete_nombre: string
          vence: string
        }[]
      }
      reservar_clase: {
        Args: { p_session_id: string }
        Returns: {
          clases_restantes: number
          reservation_id: string
        }[]
      }
      roster_clase: {
        Args: { p_session_id: string }
        Returns: {
          iniciales: string
        }[]
      }
      sembrar_plantillas_default: { Args: never; Returns: undefined }
      set_plan_features: {
        Args: { p_labels: string[]; p_plan_id: string }
        Returns: undefined
      }
      staff_gym: { Args: never; Returns: string }
      toggle_favorito_tipo: {
        Args: { p_class_type_id: string }
        Returns: {
          favorito: string
        }[]
      }
      toggle_pase: {
        Args: { p_cliente_id: string; p_fecha: string }
        Returns: {
          hora: string
          present: boolean
        }[]
      }
      ventas_count_por_cliente: {
        Args: { p_gym_id: string }
        Returns: {
          cliente_id: string
          n: number
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
