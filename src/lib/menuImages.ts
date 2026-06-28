import type { SupabaseClient } from '@supabase/supabase-js'
import imageCompression from 'browser-image-compression'

const BUCKET = 'menu-images'
const STORAGE_PATH_MARKER = `/storage/v1/object/public/${BUCKET}/`

// Above this, client-side canvas compression gets slow/crash-prone on low-end devices.
export const MAX_RAW_MENU_IMAGE_BYTES = 15 * 1024 * 1024

export async function compressMenuImage(file: File): Promise<File> {
  return imageCompression(file, {
    maxSizeMB: 0.3,
    maxWidthOrHeight: 1280,
    fileType: 'image/webp',
    useWebWorker: true,
  })
}

export async function uploadMenuImage(
  supabase: SupabaseClient,
  restaurantId: string,
  file: File
): Promise<string> {
  if (file.size > MAX_RAW_MENU_IMAGE_BYTES) {
    throw new Error('Image is too large (max 15MB).')
  }

  const compressed = await compressMenuImage(file)
  const path = `${restaurantId}/${crypto.randomUUID()}.webp`

  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(path, compressed, { contentType: 'image/webp' })

  if (error) throw error

  return supabase.storage.from(BUCKET).getPublicUrl(path).data.publicUrl
}

// Only deletes images we host ourselves; pasted external URLs are left alone.
export async function deleteMenuImageIfOwned(supabase: SupabaseClient, imageUrl: string | null | undefined) {
  if (!imageUrl) return
  const markerIndex = imageUrl.indexOf(STORAGE_PATH_MARKER)
  if (markerIndex === -1) return

  const path = imageUrl.slice(markerIndex + STORAGE_PATH_MARKER.length)
  if (!path) return

  await supabase.storage.from(BUCKET).remove([path])
}
