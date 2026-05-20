-- ============================================
-- QR Order SaaS - PostgreSQL Schema
-- ============================================

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================
-- 1. RESTAURANTS
-- ============================================
CREATE TABLE restaurants (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  owner_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  address TEXT,
  phone TEXT,
  tax_rate DECIMAL(5,2) DEFAULT 0.00,
  currency TEXT DEFAULT 'USD',
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_restaurants_owner ON restaurants(owner_id);
CREATE INDEX idx_restaurants_slug ON restaurants(slug);

-- ============================================
-- 2. TABLES
-- ============================================
CREATE TABLE tables (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  restaurant_id UUID NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
  table_number TEXT NOT NULL,
  qr_code TEXT,
  qr_code_data_url TEXT,
  qr_url TEXT,
  qr_token_hash TEXT,
  qr_token_created_at TIMESTAMPTZ,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(restaurant_id, table_number)
);

CREATE INDEX idx_tables_restaurant ON tables(restaurant_id);
CREATE INDEX idx_tables_qr_token_hash ON tables(qr_token_hash);

-- ============================================
-- 3. MENU CATEGORIES
-- ============================================
CREATE TABLE menu_categories (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  restaurant_id UUID NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_categories_restaurant ON menu_categories(restaurant_id);

-- ============================================
-- 4. MENU ITEMS
-- ============================================
CREATE TABLE menu_items (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  restaurant_id UUID NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
  category_id UUID REFERENCES menu_categories(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  description TEXT,
  image_url TEXT,
  price DECIMAL(10,2) NOT NULL,
  available BOOLEAN DEFAULT true,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_menu_items_restaurant ON menu_items(restaurant_id);
CREATE INDEX idx_menu_items_category ON menu_items(category_id);
CREATE INDEX idx_menu_items_available ON menu_items(available);

-- ============================================
-- 5. ORDERS
-- ============================================
CREATE TYPE order_status AS ENUM (
  'pending', 'accepted', 'preparing', 'ready', 'completed', 'cancelled'
);

CREATE TABLE orders (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  restaurant_id UUID NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
  table_id UUID NOT NULL REFERENCES tables(id) ON DELETE CASCADE,
  status order_status DEFAULT 'pending',
  total_amount DECIMAL(10,2) NOT NULL DEFAULT 0,
  special_instructions TEXT,
  customer_name TEXT,
  customer_phone TEXT,
  customer_session_id TEXT,
  client_request_id TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_orders_restaurant ON orders(restaurant_id);
CREATE INDEX idx_orders_table ON orders(table_id);
CREATE INDEX idx_orders_status ON orders(status);
CREATE INDEX idx_orders_created ON orders(created_at DESC);
CREATE UNIQUE INDEX idx_orders_client_request
  ON orders(restaurant_id, table_id, client_request_id)
  WHERE client_request_id IS NOT NULL;

-- ============================================
-- 6. ORDER ITEMS
-- ============================================
CREATE TABLE order_items (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  menu_item_id UUID NOT NULL REFERENCES menu_items(id) ON DELETE RESTRICT,
  quantity INTEGER NOT NULL DEFAULT 1,
  price_snapshot DECIMAL(10,2) NOT NULL,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_order_items_order ON order_items(order_id);

-- ============================================
-- 7. INVOICES
-- ============================================
CREATE TYPE payment_status AS ENUM ('unpaid', 'paid', 'refunded');

CREATE TABLE invoices (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  restaurant_id UUID NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
  order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  invoice_number TEXT NOT NULL,
  subtotal DECIMAL(10,2) NOT NULL,
  tax_amount DECIMAL(10,2) NOT NULL DEFAULT 0,
  grand_total DECIMAL(10,2) NOT NULL,
  payment_status payment_status DEFAULT 'unpaid',
  payment_method TEXT,
  notes TEXT,
  sent_to_table_at TIMESTAMPTZ,
  acknowledged_by_table_at TIMESTAMPTZ,
  table_session_token_hash TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  paid_at TIMESTAMPTZ,
  UNIQUE(restaurant_id, invoice_number)
);

CREATE INDEX idx_invoices_restaurant ON invoices(restaurant_id);
CREATE INDEX idx_invoices_order ON invoices(order_id);
CREATE INDEX idx_invoices_payment ON invoices(payment_status);
CREATE INDEX idx_invoices_sent_to_table ON invoices(sent_to_table_at);

-- ============================================
-- 8. SERVICE REQUESTS
-- ============================================
CREATE TYPE service_request_type AS ENUM ('water', 'bill');
CREATE TYPE service_request_status AS ENUM ('pending', 'acknowledged', 'completed', 'cancelled');

CREATE TABLE service_requests (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  restaurant_id UUID NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
  table_id UUID NOT NULL REFERENCES tables(id) ON DELETE CASCADE,
  request_type service_request_type NOT NULL,
  status service_request_status DEFAULT 'pending',
  notes TEXT,
  legacy_order_id UUID REFERENCES orders(id) ON DELETE SET NULL,
  customer_session_id TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_service_requests_restaurant ON service_requests(restaurant_id);
CREATE INDEX idx_service_requests_table ON service_requests(table_id);
CREATE INDEX idx_service_requests_status ON service_requests(status);

-- ============================================
-- 9. STAFF MEMBERS (for multi-staff access)
-- ============================================
CREATE TABLE staff_members (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  restaurant_id UUID NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'staff' CHECK (role IN ('owner', 'staff', 'manager', 'cashier', 'kitchen')),
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(restaurant_id, user_id)
);

CREATE INDEX idx_staff_restaurant ON staff_members(restaurant_id);
CREATE INDEX idx_staff_user ON staff_members(user_id);

-- ============================================
-- FUNCTIONS
-- ============================================

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_restaurants_updated_at
  BEFORE UPDATE ON restaurants
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_menu_items_updated_at
  BEFORE UPDATE ON menu_items
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_orders_updated_at
  BEFORE UPDATE ON orders
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_service_requests_updated_at
  BEFORE UPDATE ON service_requests
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Calculate order total
CREATE OR REPLACE FUNCTION calculate_order_total(p_order_id UUID)
RETURNS DECIMAL AS $$
DECLARE
  v_total DECIMAL;
BEGIN
  SELECT COALESCE(SUM(quantity * price_snapshot), 0)
  INTO v_total
  FROM order_items
  WHERE order_id = p_order_id;

  RETURN v_total;
END;
$$ LANGUAGE plpgsql;

-- Trigger to auto-update order total
CREATE OR REPLACE FUNCTION update_order_total()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE orders
  SET total_amount = calculate_order_total(
    CASE 
      WHEN TG_OP = 'DELETE' THEN OLD.order_id
      ELSE NEW.order_id
    END
  )
  WHERE id = CASE 
    WHEN TG_OP = 'DELETE' THEN OLD.order_id
    ELSE NEW.order_id
  END;

  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_order_total_on_item_change
  AFTER INSERT OR UPDATE OR DELETE ON order_items
  FOR EACH ROW EXECUTE FUNCTION update_order_total();

-- Generate invoice number
CREATE OR REPLACE FUNCTION generate_invoice_number()
RETURNS TRIGGER AS $$
DECLARE
  v_count INTEGER;
  v_prefix TEXT;
BEGIN
  SELECT COUNT(*) + 1 INTO v_count
  FROM invoices
  WHERE restaurant_id = NEW.restaurant_id
  AND DATE(created_at) = DATE(NOW());

  v_prefix := TO_CHAR(NOW(), 'YYYYMMDD');
  NEW.invoice_number := v_prefix || '-' || LPAD(v_count::TEXT, 4, '0');

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER set_invoice_number
  BEFORE INSERT ON invoices
  FOR EACH ROW EXECUTE FUNCTION generate_invoice_number();

-- ============================================
-- ENABLE REALTIME
-- ============================================
ALTER TABLE orders REPLICA IDENTITY FULL;
ALTER TABLE order_items REPLICA IDENTITY FULL;
ALTER TABLE invoices REPLICA IDENTITY FULL;
ALTER TABLE service_requests REPLICA IDENTITY FULL;

-- ============================================
-- SEED DATA (optional - for testing)
-- ============================================
-- Uncomment to add sample data after creating a restaurant
