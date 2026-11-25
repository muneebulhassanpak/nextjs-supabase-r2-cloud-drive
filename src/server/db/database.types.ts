
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type Database = {
  
  "public": {
          Tables: {
            "activity": {
                  Row: {
                    "action": Database["public"]['Enums']["activity_action"],"actor_id": string | null,"created_at": string,"details": NonNullable<Json>,"id": number,"item_id": string | null,"item_kind": Database["public"]['Enums']["item_kind"] | null,"item_name": string | null,"owner_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "action": Database["public"]['Enums']["activity_action"],"actor_id"?: string | null,"created_at"?: string,"details"?: NonNullable<Json>,"id"?: never,"item_id"?: string | null,"item_kind"?: Database["public"]['Enums']["item_kind"] | null,"item_name"?: string | null,"owner_id": string
                  }
                  Update: {
                    "action"?: Database["public"]['Enums']["activity_action"],"actor_id"?: string | null,"created_at"?: string,"details"?: NonNullable<Json>,"id"?: never,"item_id"?: string | null,"item_kind"?: Database["public"]['Enums']["item_kind"] | null,"item_name"?: string | null,"owner_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "activity_actor_id_fkey"
      columns: ["actor_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "activity_item_id_fkey"
      columns: ["item_id"]
isOneToOne: false
      referencedRelation: "items"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "activity_owner_id_fkey"
      columns: ["owner_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"item_shares": {
                  Row: {
                    "created_at": string,"created_by": string,"item_id": string,"role": Database["public"]['Enums']["share_role"],"updated_at": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"created_by": string,"item_id": string,"role": Database["public"]['Enums']["share_role"],"updated_at"?: string,"user_id": string
                  }
                  Update: {
                    "created_at"?: string,"created_by"?: string,"item_id"?: string,"role"?: Database["public"]['Enums']["share_role"],"updated_at"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "item_shares_created_by_fkey"
      columns: ["created_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "item_shares_item_id_fkey"
      columns: ["item_id"]
isOneToOne: false
      referencedRelation: "items"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "item_shares_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"items": {
                  Row: {
                    "ancestors": (string)[],"category": Database["public"]['Enums']["item_category"] | null,"created_at": string,"id": string,"kind": Database["public"]['Enums']["item_kind"],"mime_type": string | null,"name": string,"object_key": string | null,"owner_id": string,"parent_id": string | null,"size": number | null,"status": Database["public"]['Enums']["item_status"],"trash_root": string | null,"trashed_at": string | null,"trashed_by": string | null,"updated_at": string,"updated_by": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "ancestors"?: (string)[],"category"?: never,"created_at"?: string,"id"?: string,"kind": Database["public"]['Enums']["item_kind"],"mime_type"?: string | null,"name": string,"object_key"?: string | null,"owner_id"?: string,"parent_id"?: string | null,"size"?: number | null,"status"?: Database["public"]['Enums']["item_status"],"trash_root"?: string | null,"trashed_at"?: string | null,"trashed_by"?: string | null,"updated_at"?: string,"updated_by"?: string | null
                  }
                  Update: {
                    "ancestors"?: (string)[],"category"?: never,"created_at"?: string,"id"?: string,"kind"?: Database["public"]['Enums']["item_kind"],"mime_type"?: string | null,"name"?: string,"object_key"?: string | null,"owner_id"?: string,"parent_id"?: string | null,"size"?: number | null,"status"?: Database["public"]['Enums']["item_status"],"trash_root"?: string | null,"trashed_at"?: string | null,"trashed_by"?: string | null,"updated_at"?: string,"updated_by"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "items_owner_id_fkey"
      columns: ["owner_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "items_parent_id_fkey"
      columns: ["parent_id"]
isOneToOne: false
      referencedRelation: "items"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "items_trashed_by_fkey"
      columns: ["trashed_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "items_updated_by_fkey"
      columns: ["updated_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"profiles": {
                  Row: {
                    "avatar_key": string | null,"created_at": string,"drive_view": Database["public"]['Enums']["drive_view"] | null,"email": string,"full_name": string | null,"id": string,"is_demo": boolean,"storage_quota": number,"storage_used": number,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "avatar_key"?: string | null,"created_at"?: string,"drive_view"?: Database["public"]['Enums']["drive_view"] | null,"email": string,"full_name"?: string | null,"id": string,"is_demo"?: boolean,"storage_quota"?: number,"storage_used"?: number,"updated_at"?: string
                  }
                  Update: {
                    "avatar_key"?: string | null,"created_at"?: string,"drive_view"?: Database["public"]['Enums']["drive_view"] | null,"email"?: string,"full_name"?: string | null,"id"?: string,"is_demo"?: boolean,"storage_quota"?: number,"storage_used"?: number,"updated_at"?: string
                  }
                  Relationships: [
                    
                  ]
                },"recents": {
                  Row: {
                    "item_id": string,"touched_at": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "item_id": string,"touched_at"?: string,"user_id"?: string
                  }
                  Update: {
                    "item_id"?: string,"touched_at"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "recents_item_id_fkey"
      columns: ["item_id"]
isOneToOne: false
      referencedRelation: "items"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "recents_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"share_invites": {
                  Row: {
                    "created_at": string,"created_by": string,"email": string,"id": string,"item_id": string,"role": Database["public"]['Enums']["share_role"]
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"created_by": string,"email": string,"id"?: string,"item_id": string,"role": Database["public"]['Enums']["share_role"]
                  }
                  Update: {
                    "created_at"?: string,"created_by"?: string,"email"?: string,"id"?: string,"item_id"?: string,"role"?: Database["public"]['Enums']["share_role"]
                  }
                  Relationships: [
                    {
      foreignKeyName: "share_invites_created_by_fkey"
      columns: ["created_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "share_invites_item_id_fkey"
      columns: ["item_id"]
isOneToOne: false
      referencedRelation: "items"
      referencedColumns: ["id"]
    }
                  ]
                },"share_links": {
                  Row: {
                    "created_at": string,"created_by": string,"expires_at": string | null,"id": string,"item_id": string,"revoked_at": string | null,"token_hash": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"created_by"?: string,"expires_at"?: string | null,"id"?: string,"item_id": string,"revoked_at"?: string | null,"token_hash": string
                  }
                  Update: {
                    "created_at"?: string,"created_by"?: string,"expires_at"?: string | null,"id"?: string,"item_id"?: string,"revoked_at"?: string | null,"token_hash"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "share_links_created_by_fkey"
      columns: ["created_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "share_links_item_id_fkey"
      columns: ["item_id"]
isOneToOne: false
      referencedRelation: "items"
      referencedColumns: ["id"]
    }
                  ]
                },"stars": {
                  Row: {
                    "created_at": string,"item_id": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"item_id": string,"user_id"?: string
                  }
                  Update: {
                    "created_at"?: string,"item_id"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "stars_item_id_fkey"
      columns: ["item_id"]
isOneToOne: false
      referencedRelation: "items"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "stars_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                }
          }
          Views: {
            [_ in never]: never
          }
          Functions: {
            "cancel_upload":
{ Args: { "p_item_id": string }; Returns: string
                           },
"cleanup_pending_uploads":
{ Args: { "p_older_than"?: string }; Returns: string[]
                           },
"complete_upload":
{ Args: { "p_item_id": string,"p_name"?: string }; Returns: string
                           },
"create_share_link":
{ Args: { "p_expires_at"?: string,"p_item_id": string,"p_token_hash": string }; Returns: string
                           },
"delete_forever":
{ Args: { "p_item_id": string }; Returns: string[]
                           },
"empty_trash":
{ Args: Record<PropertyKey, never>; Returns: string[]
                           },
"item_access_role":
{ Args: { "p_item_id": string }; Returns: Database["public"]['Enums']["access_role"]
                           },
"item_activity":
{ Args: { "p_before_at"?: string,"p_before_id"?: number,"p_item_id": string,"p_limit"?: number }; Returns: {
              "action": Database["public"]['Enums']["activity_action"],"actor_email": string,"actor_id": string,"actor_name": string,"created_at": string,"details": Json,"from_name": string,"id": number,"item_id": string,"item_kind": Database["public"]['Enums']["item_kind"],"item_name": string,"person_email": string,"person_name": string,"to_name": string
            }[]
                           },
"log_download":
{ Args: { "p_item_id": string }; Returns: undefined
                           },
"move_item":
{ Args: { "p_item_id": string,"p_parent_id": string }; Returns: undefined
                           },
"my_activity":
{ Args: { "p_before_at"?: string,"p_before_id"?: number,"p_limit"?: number,"p_type"?: string,"p_who"?: string }; Returns: {
              "action": Database["public"]['Enums']["activity_action"],"actor_email": string,"actor_id": string,"actor_name": string,"created_at": string,"details": Json,"from_name": string,"id": number,"item_id": string,"item_kind": Database["public"]['Enums']["item_kind"],"item_listed": boolean,"item_name": string,"item_trashed": boolean,"person_email": string,"person_name": string,"to_name": string
            }[]
                           },
"ping":
{ Args: Record<PropertyKey, never>; Returns: boolean
                           },
"purge_trash":
{ Args: { "p_limit"?: number,"p_older_than"?: string }; Returns: string[]
                           },
"resolve_share_link":
{ Args: { "p_token": string }; Returns: {
              "category": Database["public"]['Enums']["item_category"],"id": string,"kind": Database["public"]['Enums']["item_kind"],"mime_type": string,"name": string,"size": number,"updated_at": string
            }[]
                           },
"restore_item":
{ Args: { "p_item_id": string }; Returns: {
              "name": string,"parent_id": string
            }[]
                           },
"search_items":
{ Args: { "p_limit"?: number,"p_modified_from"?: string,"p_modified_to"?: string,"p_owner"?: string,"p_query": string,"p_type"?: string }; Returns: {
              "ancestors": (string)[],
"category": Database["public"]['Enums']["item_category"] | null,
"created_at": string,
"id": string,
"kind": Database["public"]['Enums']["item_kind"],
"mime_type": string | null,
"name": string,
"object_key": string | null,
"owner_id": string,
"parent_id": string | null,
"size": number | null,
"status": Database["public"]['Enums']["item_status"],
"trash_root": string | null,
"trashed_at": string | null,
"trashed_by": string | null,
"updated_at": string,
"updated_by": string | null
            }[]
                          SetofOptions: {
        from: "*"
        to: "items"
        isOneToOne: false
        isSetofReturn: true
      } },
"share_item":
{ Args: { "p_email": string,"p_item_id": string,"p_role": Database["public"]['Enums']["share_role"] }; Returns: boolean
                           },
"share_link_children":
{ Args: { "p_folder_id": string,"p_token": string }; Returns: {
              "category": Database["public"]['Enums']["item_category"],"id": string,"kind": Database["public"]['Enums']["item_kind"],"mime_type": string,"name": string,"size": number,"updated_at": string
            }[]
                           },
"share_link_file":
{ Args: { "p_item_id": string,"p_token": string }; Returns: {
              "mime_type": string,"name": string,"object_key": string,"size": number
            }[]
                           },
"share_link_path":
{ Args: { "p_item_id": string,"p_token": string }; Returns: {
              "id": string,"kind": Database["public"]['Enums']["item_kind"],"name": string
            }[]
                           },
"share_link_status":
{ Args: { "p_token": string }; Returns: {
              "expires_at": string,"status": string
            }[]
                           },
"start_upload":
{ Args: { "p_mime_type": string,"p_name": string,"p_parent_id": string,"p_size": number }; Returns: {
              "id": string,"object_key": string
            }[]
                           },
"touch_recent":
{ Args: { "p_item_id": string }; Returns: undefined
                           },
"trash_entries":
{ Args: Record<PropertyKey, never>; Returns: {
              "ancestors": (string)[],
"category": Database["public"]['Enums']["item_category"] | null,
"created_at": string,
"id": string,
"kind": Database["public"]['Enums']["item_kind"],
"mime_type": string | null,
"name": string,
"object_key": string | null,
"owner_id": string,
"parent_id": string | null,
"size": number | null,
"status": Database["public"]['Enums']["item_status"],
"trash_root": string | null,
"trashed_at": string | null,
"trashed_by": string | null,
"updated_at": string,
"updated_by": string | null
            }[]
                          SetofOptions: {
        from: "*"
        to: "items"
        isOneToOne: false
        isSetofReturn: true
      } },
"trash_item":
{ Args: { "p_item_id": string }; Returns: undefined
                           }
          }
          Enums: {
            "access_role": "viewer"|"editor"|"owner","activity_action": "created"|"uploaded"|"renamed"|"moved"|"trashed"|"restored"|"shared"|"share_changed"|"unshared"|"link_created"|"link_revoked"|"deleted"|"invited"|"invite_changed"|"invite_removed"|"starred"|"unstarred"|"downloaded"|"signed_in"|"name_changed"|"picture_changed"|"password_changed","drive_view": "grid"|"list","item_category": "image"|"video"|"audio"|"pdf"|"document"|"spreadsheet"|"presentation"|"text"|"archive"|"other","item_kind": "folder"|"file","item_status": "pending"|"ready","share_role": "viewer"|"editor"
          }
          CompositeTypes: {
            [_ in never]: never
          }
        }
}

type DatabaseWithoutInternals = Omit<Database, '__InternalSupabase'>

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
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
  ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
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
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
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
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
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
    : never = never
> = DefaultSchemaEnumNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
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
    : never = never
> = PublicCompositeTypeNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
  ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
  : never

export const Constants = {
  "public": {
          Enums: {
            "access_role": ["viewer", "editor", "owner"],"activity_action": ["created", "uploaded", "renamed", "moved", "trashed", "restored", "shared", "share_changed", "unshared", "link_created", "link_revoked", "deleted", "invited", "invite_changed", "invite_removed", "starred", "unstarred", "downloaded", "signed_in", "name_changed", "picture_changed", "password_changed"],"drive_view": ["grid", "list"],"item_category": ["image", "video", "audio", "pdf", "document", "spreadsheet", "presentation", "text", "archive", "other"],"item_kind": ["folder", "file"],"item_status": ["pending", "ready"],"share_role": ["viewer", "editor"]
          }
        }
} as const
