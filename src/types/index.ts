import { OrderStatus, PaymentStatus } from './database'

export type { OrderStatus, PaymentStatus } from './database'

// ============================================
// RESTAURANT
// ============================================
export interface Restaurant {
  id: string
  name: string
  slug: string
  owner_id: string
  address?: string
  phone?: string
  tax_rate: number
  currency: string
  is_active: boolean
  created_at: string
}

// ============================================
// TABLE
// ============================================
export interface Table {
  id: string
  restaurant_id: string
  table_number: string
  qr_code?: string
  is_active: boolean
  created_at: string
}

// ============================================
// MENU
// ============================================
export interface MenuCategory {
  id: string
  restaurant_id: string
  name: string
  sort_order: number
  created_at: string
}

export interface MenuItem {
  id: string
  restaurant_id: string
  category_id: string | null
  name: string
  description?: string
  image_url?: string
  price: number
  available: boolean
  sort_order: number
  created_at: string
  category?: MenuCategory
}

export interface MenuCategoryWithItems extends MenuCategory {
  items: MenuItem[]
}

// ============================================
// CART
// ============================================
export interface CartItem {
  menuItem: MenuItem
  quantity: number
  notes?: string
}

export interface CartState {
  items: CartItem[]
  addItem: (item: MenuItem, quantity?: number, notes?: string) => void
  removeItem: (itemId: string) => void
  updateQuantity: (itemId: string, quantity: number) => void
  updateNotes: (itemId: string, notes: string) => void
  clearCart: () => void
  totalItems: number
  totalPrice: number
}

// ============================================
// ORDERS
// ============================================
export interface OrderItem {
  id: string
  order_id: string
  menu_item_id: string
  quantity: number
  price_snapshot: number
  notes?: string
  created_at: string
  menu_item?: MenuItem
}

export interface Order {
  id: string
  restaurant_id: string
  table_id: string
  status: OrderStatus
  total_amount: number
  special_instructions?: string
  customer_name?: string
  customer_phone?: string
  created_at: string
  updated_at: string
  table?: Table
  items?: OrderItem[]
}

export interface OrderWithItems extends Order {
  items: OrderItem[]
  table: Table
}

// ============================================
// INVOICE
// ============================================
export interface Invoice {
  id: string
  restaurant_id: string
  order_id: string
  invoice_number: string
  subtotal: number
  tax_amount: number
  grand_total: number
  payment_status: PaymentStatus
  payment_method?: string
  notes?: string
  created_at: string
  paid_at?: string
  order?: Order
}

// ============================================
// STAFF
// ============================================
export interface StaffMember {
  id: string
  restaurant_id: string
  user_id: string
  role: 'owner' | 'staff'
  is_active: boolean
  created_at: string
  user?: {
    email: string
    user_metadata: { full_name?: string }
  }
}

// ============================================
// DASHBOARD STATS
// ============================================
export interface DashboardStats {
  activeOrders: number
  activeTables: number
  todaySales: number
  pendingOrders: number
  todayOrderCount: number
}

// ============================================
// API RESPONSES
// ============================================
export interface ApiResponse<T> {
  data?: T
  error?: string
  message?: string
}

// ============================================
// REALTIME
// ============================================
export interface RealtimeOrderUpdate {
  orderId: string
  status?: OrderStatus
  type: 'INSERT' | 'UPDATE' | 'DELETE'
}
