import type {
  ConnectionStatus,
  ContentType,
  PermissionStatus,
  Platform,
  SyncJobStatus,
  SyncStatus,
  TriggerSource,
} from './domain';

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string;
          email: string;
          full_name: string | null;
          avatar_url: string | null;
          role: 'owner' | 'admin' | 'viewer';
          timezone: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          email: string;
          full_name?: string | null;
          avatar_url?: string | null;
          role?: 'owner' | 'admin' | 'viewer';
          timezone?: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          email?: string;
          full_name?: string | null;
          avatar_url?: string | null;
          role?: 'owner' | 'admin' | 'viewer';
          timezone?: string;
          updated_at?: string;
        };
      };
      social_accounts: {
        Row: {
          id: string;
          user_id: string;
          platform: Platform;
          external_account_id: string;
          account_name: string;
          account_handle: string | null;
          account_avatar_url: string | null;
          followers_count: number;
          following_count: number | null;
          posts_count: number;
          connection_status: ConnectionStatus;
          last_error_code: string | null;
          last_error_message: string | null;
          last_synced_at: string | null;
          next_allowed_sync_at: string | null;
          metadata: Record<string, unknown>;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          platform: Platform;
          external_account_id: string;
          account_name: string;
          account_handle?: string | null;
          account_avatar_url?: string | null;
          followers_count?: number;
          following_count?: number | null;
          posts_count?: number;
          connection_status?: ConnectionStatus;
          last_error_code?: string | null;
          last_error_message?: string | null;
          last_synced_at?: string | null;
          next_allowed_sync_at?: string | null;
          metadata?: Record<string, unknown>;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          account_name?: string;
          account_handle?: string | null;
          account_avatar_url?: string | null;
          followers_count?: number;
          following_count?: number | null;
          posts_count?: number;
          connection_status?: ConnectionStatus;
          last_error_code?: string | null;
          last_error_message?: string | null;
          last_synced_at?: string | null;
          next_allowed_sync_at?: string | null;
          metadata?: Record<string, unknown>;
          updated_at?: string;
        };
      };
      oauth_credentials: {
        Row: {
          id: string;
          social_account_id: string;
          user_id: string;
          platform: Platform;
          access_token_encrypted: string;
          refresh_token_encrypted: string | null;
          token_type: string;
          expires_at: string | null;
          refresh_token_expires_at: string | null;
          encryption_key_version: number;
          last_refreshed_at: string | null;
          revoked_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          social_account_id: string;
          user_id: string;
          platform: Platform;
          access_token_encrypted: string;
          refresh_token_encrypted?: string | null;
          token_type?: string;
          expires_at?: string | null;
          refresh_token_expires_at?: string | null;
          encryption_key_version?: number;
          last_refreshed_at?: string | null;
          revoked_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          access_token_encrypted?: string;
          refresh_token_encrypted?: string | null;
          token_type?: string;
          expires_at?: string | null;
          refresh_token_expires_at?: string | null;
          encryption_key_version?: number;
          last_refreshed_at?: string | null;
          revoked_at?: string | null;
          updated_at?: string;
        };
      };
      platform_permissions: {
        Row: {
          id: string;
          social_account_id: string;
          user_id: string;
          platform: Platform;
          scope: string;
          status: PermissionStatus;
          granted_at: string;
          expires_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          social_account_id: string;
          user_id: string;
          platform: Platform;
          scope: string;
          status?: PermissionStatus;
          granted_at?: string;
          expires_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          status?: PermissionStatus;
          granted_at?: string;
          expires_at?: string | null;
          updated_at?: string;
        };
      };
      videos: {
        Row: {
          id: string;
          social_account_id: string;
          user_id: string;
          platform: Platform;
          external_video_id: string;
          title: string;
          description: string | null;
          thumbnail_url: string | null;
          permalink: string;
          duration_seconds: number | null;
          published_at: string;
          content_type: ContentType;
          sync_status: SyncStatus;
          views_count: number;
          likes_count: number;
          comments_count: number;
          shares_count: number | null;
          reach_count: number | null;
          impressions_count: number | null;
          watch_time_minutes: number | null;
          avg_view_duration_seconds: number | null;
          unavailable_metrics: string[];
          raw_metadata: Record<string, unknown>;
          last_synced_at: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          social_account_id: string;
          user_id: string;
          platform: Platform;
          external_video_id: string;
          title: string;
          description?: string | null;
          thumbnail_url?: string | null;
          permalink: string;
          duration_seconds?: number | null;
          published_at: string;
          content_type?: ContentType;
          sync_status?: SyncStatus;
          views_count?: number;
          likes_count?: number;
          comments_count?: number;
          shares_count?: number | null;
          reach_count?: number | null;
          impressions_count?: number | null;
          watch_time_minutes?: number | null;
          avg_view_duration_seconds?: number | null;
          unavailable_metrics?: string[];
          raw_metadata?: Record<string, unknown>;
          last_synced_at?: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          title?: string;
          description?: string | null;
          thumbnail_url?: string | null;
          permalink?: string;
          duration_seconds?: number | null;
          content_type?: ContentType;
          sync_status?: SyncStatus;
          views_count?: number;
          likes_count?: number;
          comments_count?: number;
          shares_count?: number | null;
          reach_count?: number | null;
          impressions_count?: number | null;
          watch_time_minutes?: number | null;
          avg_view_duration_seconds?: number | null;
          unavailable_metrics?: string[];
          raw_metadata?: Record<string, unknown>;
          last_synced_at?: string;
          updated_at?: string;
        };
      };
      video_metrics: {
        Row: {
          id: string;
          video_id: string;
          social_account_id: string;
          user_id: string;
          platform: Platform;
          snapshot_date: string;
          snapshot_hour: string;
          captured_at: string;
          views_count: number;
          likes_count: number;
          comments_count: number;
          shares_count: number | null;
          reach_count: number | null;
          impressions_count: number | null;
          followers_count_snapshot: number | null;
          watch_time_minutes: number | null;
          avg_view_duration_seconds: number | null;
          views_delta: number;
          likes_delta: number;
          comments_delta: number;
          shares_delta: number | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          video_id: string;
          social_account_id: string;
          user_id: string;
          platform: Platform;
          snapshot_date?: string;
          snapshot_hour?: string;
          captured_at?: string;
          views_count?: number;
          likes_count?: number;
          comments_count?: number;
          shares_count?: number | null;
          reach_count?: number | null;
          impressions_count?: number | null;
          followers_count_snapshot?: number | null;
          watch_time_minutes?: number | null;
          avg_view_duration_seconds?: number | null;
          views_delta?: number;
          likes_delta?: number;
          comments_delta?: number;
          shares_delta?: number | null;
          created_at?: string;
        };
        Update: {
          views_count?: number;
          likes_count?: number;
          comments_count?: number;
          shares_count?: number | null;
          reach_count?: number | null;
          impressions_count?: number | null;
          followers_count_snapshot?: number | null;
          watch_time_minutes?: number | null;
          avg_view_duration_seconds?: number | null;
          views_delta?: number;
          likes_delta?: number;
          comments_delta?: number;
          shares_delta?: number | null;
        };
      };
      sync_jobs: {
        Row: {
          id: string;
          user_id: string;
          social_account_id: string | null;
          platform: Platform | null;
          trigger_source: TriggerSource;
          status: SyncJobStatus;
          idempotency_key: string;
          videos_processed: number;
          metrics_captured: number;
          attempt_count: number;
          max_attempts: number;
          next_retry_at: string | null;
          started_at: string | null;
          completed_at: string | null;
          error_code: string | null;
          error_message: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          social_account_id?: string | null;
          platform?: Platform | null;
          trigger_source: TriggerSource;
          status?: SyncJobStatus;
          idempotency_key: string;
          videos_processed?: number;
          metrics_captured?: number;
          attempt_count?: number;
          max_attempts?: number;
          next_retry_at?: string | null;
          started_at?: string | null;
          completed_at?: string | null;
          error_code?: string | null;
          error_message?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          status?: SyncJobStatus;
          videos_processed?: number;
          metrics_captured?: number;
          attempt_count?: number;
          next_retry_at?: string | null;
          started_at?: string | null;
          completed_at?: string | null;
          error_code?: string | null;
          error_message?: string | null;
          updated_at?: string;
        };
      };
      sync_logs: {
        Row: {
          id: string;
          sync_job_id: string;
          user_id: string;
          social_account_id: string | null;
          platform: Platform | null;
          level: 'info' | 'warn' | 'error';
          event_type: string;
          message: string;
          details: Record<string, unknown>;
          created_at: string;
        };
        Insert: {
          id?: string;
          sync_job_id: string;
          user_id: string;
          social_account_id?: string | null;
          platform?: Platform | null;
          level: 'info' | 'warn' | 'error';
          event_type: string;
          message: string;
          details?: Record<string, unknown>;
          created_at?: string;
        };
        Update: never;
      };
    };
  };
}
