-- Menu item photo uploads: Supabase Storage bucket + RLS policies.
-- Objects are keyed as {restaurant_id}/{uuid}.webp so the first path
-- segment can be checked against is_restaurant_staff() without a join.

INSERT INTO storage.buckets (id, name, public)
VALUES ('menu-images', 'menu-images', true)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "menu_images_select_public" ON storage.objects;
CREATE POLICY "menu_images_select_public"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'menu-images');

DROP POLICY IF EXISTS "menu_images_insert_staff" ON storage.objects;
CREATE POLICY "menu_images_insert_staff"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'menu-images'
    AND is_restaurant_staff(((storage.foldername(name))[1])::uuid)
  );

DROP POLICY IF EXISTS "menu_images_update_staff" ON storage.objects;
CREATE POLICY "menu_images_update_staff"
  ON storage.objects FOR UPDATE
  USING (
    bucket_id = 'menu-images'
    AND is_restaurant_staff(((storage.foldername(name))[1])::uuid)
  )
  WITH CHECK (
    bucket_id = 'menu-images'
    AND is_restaurant_staff(((storage.foldername(name))[1])::uuid)
  );

DROP POLICY IF EXISTS "menu_images_delete_staff" ON storage.objects;
CREATE POLICY "menu_images_delete_staff"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'menu-images'
    AND is_restaurant_staff(((storage.foldername(name))[1])::uuid)
  );
