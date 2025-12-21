/**
 * Supabase Storage Service for Chat Images
 */

import { getSupabaseClient } from "@/lib/supabase/client"
import { retryWithReset } from "@/lib/supabase/safe"

const BUCKET_NAME = "chat-images"

export class StorageService {
  private get supabase() {
    return getSupabaseClient() as any
  }

  /**
   * Upload an image to Supabase Storage
   * @param file - File object to upload
   * @param userId - User ID (for organizing files in user folders)
   * @returns Public URL of uploaded image
   */
  async uploadImage(file: File, userId: string): Promise<string> {
    const fileExt = file.name.split(".").pop()
    const fileName = `${userId}/${Date.now()}-${Math.random().toString(36).substring(7)}.${fileExt}`

    const { data, error } = await retryWithReset(
      () => this.supabase.storage
        .from(BUCKET_NAME)
        .upload(fileName, file, {
          cacheControl: "3600",
          upsert: false,
        }),
      10000
    ) as any

    if (error) {
      console.error("Image upload error:", error)
      throw new Error(`Failed to upload image: ${error.message}`)
    }

    // Get public URL
    const { data: { publicUrl } } = this.supabase.storage
      .from(BUCKET_NAME)
      .getPublicUrl(data.path) as any

    return publicUrl
  }

  /**
   * Delete an image from storage
   * @param imageUrl - Full public URL of the image
   */
  async deleteImage(imageUrl: string): Promise<void> {
    // Extract path from URL
    const url = new URL(imageUrl)
    const pathMatch = url.pathname.match(/\/storage\/v1\/object\/public\/chat-images\/(.+)$/)
    
    if (!pathMatch) {
      throw new Error("Invalid image URL")
    }

    const filePath = pathMatch[1]

    const { error } = await retryWithReset(
      () => this.supabase.storage
        .from(BUCKET_NAME)
        .remove([filePath]),
      10000
    ) as any

    if (error) {
      console.error("Image delete error:", error)
      throw new Error(`Failed to delete image: ${error.message}`)
    }
  }

  /**
   * Delete all images for a user (cleanup on account deletion)
   * @param userId - User ID
   */
  async deleteUserImages(userId: string): Promise<void> {
    const { data: files, error: listError } = await retryWithReset(
      () => this.supabase.storage
        .from(BUCKET_NAME)
        .list(userId),
      10000
    ) as any

    if (listError) {
      console.error("List user images error:", listError)
      return
    }

    if (!files || files.length === 0) {
      return
    }

  const filePaths = files.map((file: any) => `${userId}/${file.name}`)

    const { error: deleteError } = await retryWithReset(
      () => this.supabase.storage
        .from(BUCKET_NAME)
        .remove(filePaths),
      10000
    ) as any

    if (deleteError) {
      console.error("Delete user images error:", deleteError)
      throw new Error(`Failed to delete user images: ${deleteError.message}`)
    }
  }

  /**
   * Get image dimensions from URL (client-side only)
   * @param imageUrl - URL of the image
   * @returns Promise with width and height
   */
  async getImageDimensions(imageUrl: string): Promise<{ width: number; height: number }> {
    return new Promise((resolve, reject) => {
      const img = new Image()
      img.onload = () => {
        resolve({ width: img.width, height: img.height })
      }
      img.onerror = reject
      img.src = imageUrl
    })
  }
}

export const storageService = new StorageService()
