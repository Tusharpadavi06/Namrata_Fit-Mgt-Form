import { supabase } from './supabase';

export interface CompressedImage {
  dataUrl: string;
  blob: Blob;
  sizeKb: number;
  width: number;
  height: number;
}

/**
 * Compresses an image file using HTML5 canvas.
 * Reduces 10MB mobile camera photos to ~150KB-250KB high-definition JPEGs.
 */
export async function compressImage(
  file: File | Blob,
  maxDimension: number = 1200,
  quality: number = 0.82
): Promise<CompressedImage> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Failed to read image file"));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error("Failed to decode image"));
      img.onload = () => {
        let width = img.width;
        let height = img.height;

        if (width > maxDimension || height > maxDimension) {
          if (width > height) {
            height = Math.round((height * maxDimension) / width);
            width = maxDimension;
          } else {
            width = Math.round((width * maxDimension) / height);
            height = maxDimension;
          }
        }

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          reject(new Error("Canvas context not available"));
          return;
        }

        // Draw with high quality smoothing
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(img, 0, 0, width, height);

        const dataUrl = canvas.toDataURL('image/jpeg', quality);
        canvas.toBlob(
          (blob) => {
            if (!blob) {
              reject(new Error("Canvas toBlob failed"));
              return;
            }
            resolve({
              dataUrl,
              blob,
              sizeKb: Math.round(blob.size / 1024),
              width,
              height
            });
          },
          'image/jpeg',
          quality
        );
      };
      img.src = reader.result as string;
    };
    reader.readAsDataURL(file);
  });
}

/**
 * Uploads an image blob or base64 dataUrl to the server's public upload storage.
 * Prioritizes the Express backend /api/upload-photo route for 100% guaranteed delivery,
 * with graceful fallback to Supabase Storage.
 */
export async function uploadImageToStorage(
  blobOrBase64: Blob | string,
  filePathOrName: string
): Promise<string | null> {
  // 1. First priority: Server-side Express /api/upload-photo
  try {
    let base64String = '';
    if (typeof blobOrBase64 === 'string') {
      base64String = blobOrBase64;
    } else {
      base64String = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(blobOrBase64);
      });
    }

    const cleanName = filePathOrName.replace(/[^a-zA-Z0-9._-]/g, '_');
    const apiRes = await fetch('/api/upload-photo', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        base64: base64String,
        fileName: cleanName
      })
    });

    if (apiRes.ok) {
      const data = await apiRes.json();
      if (data.url) {
        console.log("[Storage] Uploaded via /api/upload-photo:", data.url);
        return data.url;
      }
    }
  } catch (apiErr: any) {
    console.warn("[Storage] /api/upload-photo attempt error:", apiErr?.message || apiErr);
  }

  // 2. Second priority: Google Apps Script Webhook (Direct Google Drive Upload)
  try {
    let base64String = '';
    if (typeof blobOrBase64 === 'string') {
      base64String = blobOrBase64;
    } else {
      base64String = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(blobOrBase64);
      });
    }

    const webhookUrl = localStorage.getItem("custom_sheets_webhook_url") || 
                       import.meta.env.VITE_GOOGLE_SHEETS_WEBHOOK_URL || "";
                       
    if (webhookUrl && webhookUrl.startsWith("http")) {
      const gRes = await fetch(webhookUrl, {
        method: "POST",
        headers: { "Content-Type": "text/plain;charset=utf-8" },
        body: JSON.stringify({
          type: "UPLOAD_IMAGE",
          prefix: filePathOrName.replace(/[^a-zA-Z0-9._-]/g, '_'),
          base64: base64String
        })
      });

      if (gRes.ok) {
        const gText = await gRes.text();
        try {
          const gJson = JSON.parse(gText);
          if (gJson && gJson.success && gJson.directUrl) {
            console.log("[Storage] Uploaded to Google Drive via Apps Script:", gJson.directUrl);
            return gJson.directUrl;
          }
        } catch (_) {}
      }
    }
  } catch (driveErr: any) {
    console.warn("[Storage] Google Drive Apps Script upload note:", driveErr?.message || driveErr);
  }

  // 3. Third priority: Supabase Storage
  try {
    const bucketName = 'fit-attachments';
    let blob: Blob;
    if (typeof blobOrBase64 === 'string') {
      const r = await fetch(blobOrBase64);
      blob = await r.blob();
    } else {
      blob = blobOrBase64;
    }

    const { data, error } = await supabase.storage
      .from(bucketName)
      .upload(filePathOrName, blob, {
        contentType: 'image/jpeg',
        upsert: true
      });

    if (!error && data?.path) {
      const { data: publicUrlData } = supabase.storage
        .from(bucketName)
        .getPublicUrl(data.path);

      if (publicUrlData && publicUrlData.publicUrl) {
        console.log("[Storage] Uploaded to Supabase:", publicUrlData.publicUrl);
        return publicUrlData.publicUrl;
      }
    }
  } catch (err: any) {
    console.warn("[Storage] Supabase exception:", err?.message || err);
  }

  return null;
}
