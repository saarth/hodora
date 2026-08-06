export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.15";
  };
  public: {
    Tables: {
      cloud_connections: {
        Row: {
          account_email: string | null;
          created_at: string;
          encrypted_secret: string | null;
          id: string;
          last_error: string | null;
          last_synced_at: string | null;
          provider: string;
          remote_folder_id: string | null;
          status: string;
          sync_folder: string;
          sync_started_at: string | null;
          syncing: boolean;
          updated_at: string;
          user_id: string;
          webdav_url: string | null;
          webdav_username: string | null;
        };
        Insert: {
          account_email?: string | null;
          created_at?: string;
          encrypted_secret?: string | null;
          id?: string;
          last_error?: string | null;
          last_synced_at?: string | null;
          provider: string;
          remote_folder_id?: string | null;
          status?: string;
          sync_folder?: string;
          sync_started_at?: string | null;
          syncing?: boolean;
          updated_at?: string;
          user_id: string;
          webdav_url?: string | null;
          webdav_username?: string | null;
        };
        Update: {
          account_email?: string | null;
          created_at?: string;
          encrypted_secret?: string | null;
          id?: string;
          last_error?: string | null;
          last_synced_at?: string | null;
          provider?: string;
          remote_folder_id?: string | null;
          status?: string;
          sync_folder?: string;
          sync_started_at?: string | null;
          syncing?: boolean;
          updated_at?: string;
          user_id?: string;
          webdav_url?: string | null;
          webdav_username?: string | null;
        };
        Relationships: [];
      };
      profiles: {
        Row: {
          avatar_url: string | null;
          created_at: string;
          deactivated_at: string | null;
          display_name: string | null;
          id: string;
          unit: string;
          updated_at: string;
          username: string;
        };
        Insert: {
          avatar_url?: string | null;
          created_at?: string;
          deactivated_at?: string | null;
          display_name?: string | null;
          id: string;
          unit?: string;
          updated_at?: string;
          username: string;
        };
        Update: {
          avatar_url?: string | null;
          created_at?: string;
          deactivated_at?: string | null;
          display_name?: string | null;
          id?: string;
          unit?: string;
          updated_at?: string;
          username?: string;
        };
        Relationships: [];
      };
      ride_sync_state: {
        Row: {
          connection_id: string;
          created_at: string;
          id: string;
          last_synced_at: string | null;
          local_updated_at: string | null;
          remote_etag: string | null;
          remote_path: string;
          remote_updated_at: string | null;
          ride_id: string | null;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          connection_id: string;
          created_at?: string;
          id?: string;
          last_synced_at?: string | null;
          local_updated_at?: string | null;
          remote_etag?: string | null;
          remote_path: string;
          remote_updated_at?: string | null;
          ride_id?: string | null;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          connection_id?: string;
          created_at?: string;
          id?: string;
          last_synced_at?: string | null;
          local_updated_at?: string | null;
          remote_etag?: string | null;
          remote_path?: string;
          remote_updated_at?: string | null;
          ride_id?: string | null;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [];
      };
      rides: {
        Row: {
          ascent_m: number;
          created_at: string;
          descent_m: number;
          description: string | null;
          distance_m: number;
          id: string;
          max_lat: number | null;
          max_lon: number | null;
          min_lat: number | null;
          min_lon: number | null;
          name: string;
          points: Json;
          source_filename: string | null;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          ascent_m?: number;
          created_at?: string;
          descent_m?: number;
          description?: string | null;
          distance_m?: number;
          id?: string;
          max_lat?: number | null;
          max_lon?: number | null;
          min_lat?: number | null;
          min_lon?: number | null;
          name: string;
          points?: Json;
          source_filename?: string | null;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          ascent_m?: number;
          created_at?: string;
          descent_m?: number;
          description?: string | null;
          distance_m?: number;
          id?: string;
          max_lat?: number | null;
          max_lon?: number | null;
          min_lat?: number | null;
          min_lon?: number | null;
          name?: string;
          points?: Json;
          source_filename?: string | null;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      [_ in never]: never;
    };
    Enums: {
      [_ in never]: never;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">;

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">];

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R;
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R;
      }
      ? R
      : never
    : never;

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I;
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I;
      }
      ? I
      : never
    : never;

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U;
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U;
      }
      ? U
      : never
    : never;

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    keyof DefaultSchema["Enums"] | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never;

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    keyof DefaultSchema["CompositeTypes"] | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never;

export const Constants = {
  public: {
    Enums: {},
  },
} as const;
