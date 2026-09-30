export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  __InternalSupabase: { PostgrestVersion: "14.18" }
  public: {
    Tables: {
      event_contributions: {
        Row: { content: string | null; created_at: string; event_id: string | null; id: string; kind: string; provider_event_id: string | null; provider_source: string | null; status: string; updated_at: string; url: string | null; user_id: string }
        Insert: { content?: string | null; created_at?: string; event_id?: string | null; id?: string; kind: string; provider_event_id?: string | null; provider_source?: string | null; status?: string; updated_at?: string; url?: string | null; user_id: string }
        Update: { content?: string | null; created_at?: string; event_id?: string | null; id?: string; kind?: string; provider_event_id?: string | null; provider_source?: string | null; status?: string; updated_at?: string; url?: string | null; user_id?: string }
        Relationships: []
      }
      events: {
        Row: { capacity: number | null; created_at: string; currency: string; description: string; ends_at: string; hide_exact_location: boolean; host_id: string; id: string; image_url: string | null; location: Json | null; price_cents: number; require_approval: boolean; starts_at: string; timezone: string; title: string; updated_at: string; visibility: string }
        Insert: { capacity?: number | null; created_at?: string; currency?: string; description?: string; ends_at: string; hide_exact_location?: boolean; host_id: string; id?: string; image_url?: string | null; location?: Json | null; price_cents?: number; require_approval?: boolean; starts_at: string; timezone?: string; title: string; updated_at?: string; visibility?: string }
        Update: { capacity?: number | null; created_at?: string; currency?: string; description?: string; ends_at?: string; hide_exact_location?: boolean; host_id?: string; id?: string; image_url?: string | null; location?: Json | null; price_cents?: number; require_approval?: boolean; starts_at?: string; timezone?: string; title?: string; updated_at?: string; visibility?: string }
        Relationships: []
      }
      follows: {
        Row: { created_at: string; entity_id: string; entity_type: string; user_id: string }
        Insert: { created_at?: string; entity_id: string; entity_type: string; user_id: string }
        Update: { created_at?: string; entity_id?: string; entity_type?: string; user_id?: string }
        Relationships: []
      }
      ingestion_status: {
        Row: { error: string | null; fetched_at: string; incomplete: boolean; item_count: number; source: string; updated_at: string }
        Insert: { error?: string | null; fetched_at: string; incomplete?: boolean; item_count?: number; source: string; updated_at?: string }
        Update: { error?: string | null; fetched_at?: string; incomplete?: boolean; item_count?: number; source?: string; updated_at?: string }
        Relationships: []
      }
      profiles: {
        Row: { avatar_path: string | null; avatar_url: string | null; bio: string; created_at: string; id: string; linkedin_url: string | null; name: string; onboarding_complete: boolean; resume_filename: string | null; resume_path: string | null; resume_size: number | null; resume_uploaded_at: string | null; updated_at: string }
        Insert: { avatar_path?: string | null; avatar_url?: string | null; bio?: string; created_at?: string; id: string; linkedin_url?: string | null; name?: string; onboarding_complete?: boolean; resume_filename?: string | null; resume_path?: string | null; resume_size?: number | null; resume_uploaded_at?: string | null; updated_at?: string }
        Update: { avatar_path?: string | null; avatar_url?: string | null; bio?: string; created_at?: string; id?: string; linkedin_url?: string | null; name?: string; onboarding_complete?: boolean; resume_filename?: string | null; resume_path?: string | null; resume_size?: number | null; resume_uploaded_at?: string | null; updated_at?: string }
        Relationships: []
      }
      provider_events: {
        Row: { data: Json; embedded_at: string | null; embedding: string | null; ends_at: string | null; fetched_at: string; provider_event_id: string; search_text: string; source: string; starts_at: string; startup: boolean; title: string; updated_at: string }
        Insert: { data: Json; embedded_at?: string | null; embedding?: string | null; ends_at?: string | null; fetched_at?: string; provider_event_id: string; search_text?: string; source: string; starts_at: string; startup?: boolean; title?: string; updated_at?: string }
        Update: { data?: Json; embedded_at?: string | null; embedding?: string | null; ends_at?: string | null; fetched_at?: string; provider_event_id?: string; search_text?: string; source?: string; starts_at?: string; startup?: boolean; title?: string; updated_at?: string }
        Relationships: []
      }
      user_interests: {
        Row: { about: string; embedding: string | null; interests: string[]; text_hash: string; updated_at: string; user_id: string }
        Insert: { about?: string; embedding?: string | null; interests?: string[]; text_hash?: string; updated_at?: string; user_id: string }
        Update: { about?: string; embedding?: string | null; interests?: string[]; text_hash?: string; updated_at?: string; user_id?: string }
        Relationships: []
      }
    }
    Views: { [_ in never]: never }
    Functions: {
      get_community_event: { Args: { target_id: string }; Returns: Json }
      list_community_events: { Args: { mine?: boolean; page_limit?: number }; Returns: Json }
      match_provider_events: { Args: { match_count?: number; query_embedding: string }; Returns: { data: Json; provider_event_id: string; similarity: number; source: string; starts_at: string }[] }
      my_recommended_provider_events: { Args: { limit_count?: number; offset_count?: number }; Returns: Json }
    }
    Enums: { [_ in never]: never }
    CompositeTypes: { [_ in never]: never }
  }
}
