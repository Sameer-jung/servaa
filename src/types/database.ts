export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export interface Database {
  public: {
    Tables: {
      restaurants: {
        Row: {
          id: string
          name: string
          slug: string
          owner_id: string
          address: string | null
          phone: string | null
          tax_rate: number
          currency: string
          is_active: boolean
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          name: string
          slug: string
          owner_id: string
          address?: string | null
          phone?: string | null
          tax_rate?: number
          currency?: string
          is_active?: boolean
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          name?: string
          slug?: string
          owner_id?: string
          address?: string | null
          phone?: string | null
          tax_rate?: number
          currency?: string
          is_active?: boolean
          created_at?: string
          updated_at?: string
        }
      }
      tables: {
        Row: {
          id: string
          restaurant_id: string
          table_number: string
          qr_code: string | null
          qr_code_data_url: string | null
          qr_url: string | null
          qr_token_hash: string | null
          qr_token_created_at: string | null
          is_active: boolean
          created_at: string
        }
        Insert: {
          id?: string
          restaurant_id: string
          table_number: string
          qr_code?: string | null
          qr_code_data_url?: string | null
          qr_url?: string | null
          qr_token_hash?: string | null
          qr_token_created_at?: string | null
          is_active?: boolean
          created_at?: string
        }
        Update: {
          id?: string
          restaurant_id?: string
          table_number?: string
          qr_code?: string | null
          qr_code_data_url?: string | null
          qr_url?: string | null
          qr_token_hash?: string | null
          qr_token_created_at?: string | null
          is_active?: boolean
          created_at?: string
        }
      }
      menu_categories: {
        Row: {
          id: string
          restaurant_id: string
          name: string
          sort_order: number
          created_at: string
        }
        Insert: {
          id?: string
          restaurant_id: string
          name: string
          sort_order?: number
          created_at?: string
        }
        Update: {
          id?: string
          restaurant_id?: string
          name?: string
          sort_order?: number
          created_at?: string
        }
      }
      menu_items: {
        Row: {
          id: string
          restaurant_id: string
          category_id: string | null
          name: string
          description: string | null
          image_url: string | null
          price: number
          available: boolean
          sort_order: number
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          restaurant_id: string
          category_id?: string | null
          name: string
          description?: string | null
          image_url?: string | null
          price: number
          available?: boolean
          sort_order?: number
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          restaurant_id?: string
          category_id?: string | null
          name?: string
          description?: string | null
          image_url?: string | null
          price?: number
          available?: boolean
          sort_order?: number
          created_at?: string
          updated_at?: string
        }
      }
      orders: {
        Row: {
          id: string
          restaurant_id: string
          table_id: string
          status: OrderStatus
          total_amount: number
          special_instructions: string | null
          customer_name: string | null
          customer_phone: string | null
          customer_session_id: string | null
          client_request_id: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          restaurant_id: string
          table_id: string
          status?: OrderStatus
          total_amount?: number
          special_instructions?: string | null
          customer_name?: string | null
          customer_phone?: string | null
          customer_session_id?: string | null
          client_request_id?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          restaurant_id?: string
          table_id?: string
          status?: OrderStatus
          total_amount?: number
          special_instructions?: string | null
          customer_name?: string | null
          customer_phone?: string | null
          customer_session_id?: string | null
          client_request_id?: string | null
          created_at?: string
          updated_at?: string
        }
      }
      order_items: {
        Row: {
          id: string
          order_id: string
          menu_item_id: string
          quantity: number
          price_snapshot: number
          notes: string | null
          created_at: string
        }
        Insert: {
          id?: string
          order_id: string
          menu_item_id: string
          quantity: number
          price_snapshot: number
          notes?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          order_id?: string
          menu_item_id?: string
          quantity?: number
          price_snapshot?: number
          notes?: string | null
          created_at?: string
        }
      }
      invoices: {
        Row: {
          id: string
          restaurant_id: string
          order_id: string
          invoice_number: string
          subtotal: number
          tax_amount: number
          grand_total: number
          payment_status: PaymentStatus
          payment_method: string | null
          notes: string | null
          sent_to_table_at: string | null
          acknowledged_by_table_at: string | null
          table_session_token_hash: string | null
          created_at: string
          paid_at: string | null
        }
        Insert: {
          id?: string
          restaurant_id: string
          order_id: string
          invoice_number?: string
          subtotal: number
          tax_amount?: number
          grand_total: number
          payment_status?: PaymentStatus
          payment_method?: string | null
          notes?: string | null
          sent_to_table_at?: string | null
          acknowledged_by_table_at?: string | null
          table_session_token_hash?: string | null
          created_at?: string
          paid_at?: string | null
        }
        Update: {
          id?: string
          restaurant_id?: string
          order_id?: string
          invoice_number?: string
          subtotal?: number
          tax_amount?: number
          grand_total?: number
          payment_status?: PaymentStatus
          payment_method?: string | null
          notes?: string | null
          sent_to_table_at?: string | null
          acknowledged_by_table_at?: string | null
          table_session_token_hash?: string | null
          created_at?: string
          paid_at?: string | null
        }
      }
      service_requests: {
        Row: {
          id: string
          restaurant_id: string
          table_id: string
          request_type: ServiceRequestType
          status: ServiceRequestStatus
          notes: string | null
          legacy_order_id: string | null
          customer_session_id: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          restaurant_id: string
          table_id: string
          request_type: ServiceRequestType
          status?: ServiceRequestStatus
          notes?: string | null
          legacy_order_id?: string | null
          customer_session_id?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          restaurant_id?: string
          table_id?: string
          request_type?: ServiceRequestType
          status?: ServiceRequestStatus
          notes?: string | null
          legacy_order_id?: string | null
          customer_session_id?: string | null
          created_at?: string
          updated_at?: string
        }
      }
      staff_members: {
        Row: {
          id: string
          restaurant_id: string
          user_id: string
          role: StaffRole
          is_active: boolean
          created_at: string
        }
        Insert: {
          id?: string
          restaurant_id: string
          user_id: string
          role?: StaffRole
          is_active?: boolean
          created_at?: string
        }
        Update: {
          id?: string
          restaurant_id?: string
          user_id?: string
          role?: StaffRole
          is_active?: boolean
          created_at?: string
        }
      }
      audit_logs: {
        Row: {
          id: string
          restaurant_id: string
          actor_user_id: string | null
          action: string
          entity_type: string
          entity_id: string
          metadata: Json
          created_at: string
        }
        Insert: {
          id?: string
          restaurant_id: string
          actor_user_id?: string | null
          action: string
          entity_type: string
          entity_id: string
          metadata?: Json
          created_at?: string
        }
        Update: {
          id?: string
          restaurant_id?: string
          actor_user_id?: string | null
          action?: string
          entity_type?: string
          entity_id?: string
          metadata?: Json
          created_at?: string
        }
      }
    }
  }
}

export type OrderStatus = 'pending' | 'accepted' | 'preparing' | 'ready' | 'completed' | 'cancelled'
export type PaymentStatus = 'unpaid' | 'paid' | 'refunded'
export type StaffRole = 'owner' | 'staff'
export type ServiceRequestType = 'water' | 'bill' | 'waiter'
export type ServiceRequestStatus = 'pending' | 'acknowledged' | 'completed' | 'cancelled'
export type PaymentMethod = 'cash' | 'online'
