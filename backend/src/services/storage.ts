// backend/src/services/storage.ts
import { Storage } from '@google-cloud/storage';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';

// Initialize GCS
// It will automatically look for GOOGLE_APPLICATION_CREDENTIALS env var
// or use default credentials if running on Cloud Run.
const storage = new Storage();

const bucketName = process.env.GCS_BUCKET_NAME || 'your-default-bucket-name';

/**
 * Uploads a file buffer to Google Cloud Storage.
 * @param fileBuffer The file content buffer
 * @param originalName The original file name
 * @param folder Optional folder prefix (e.g., "projects/123")
 * @returns The public URL or gs:// path of the uploaded file
 */
export const uploadToGCS = async (
  fileBuffer: Buffer, 
  originalName: string, 
  folder: string = 'uploads'
): Promise<string> => {
  if (!bucketName) {
    throw new Error("GCS_BUCKET_NAME is not configured.");
  }

  try {
    const bucket = storage.bucket(bucketName);
    
    // Create a unique filename to prevent overwrites
    const uniqueName = `${uuidv4()}-${path.basename(originalName)}`;
    const destination = `${folder}/${uniqueName}`;
    const file = bucket.file(destination);

    console.log(`[Storage] Uploading to gs://${bucketName}/${destination}...`);

    await file.save(fileBuffer, {
      resumable: false, // Good for smaller files in MVP; use resumable for huge files
      metadata: {
        contentType: 'application/octet-stream', // Or detect mime type
      },
    });

    console.log(`[Storage] Upload successful: ${destination}`);
    
    // Return the cloud storage URI (standard format)
    return `gs://${bucketName}/${destination}`;

  } catch (error) {
    console.error('[Storage] Upload failed:', error);
    throw new Error('Failed to upload file to storage.');
  }
};

/**
 * (Optional) Helper to get a Signed URL for downloading/viewing private files
 */
export const getSignedUrl = async (gcsPath: string): Promise<string> => {
    // gcsPath format: gs://bucket-name/path/to/file
    // We need to parse it or just store the path relative to bucket.
    // For simplicity in this MVP, let's assume we stored the full gs:// URI
    // but the library expects just the filename if we already have the bucket object.
    
    try {
        const bucket = storage.bucket(bucketName);
        
        // Strip "gs://bucketName/" to get the file path
        const filePath = gcsPath.replace(`gs://${bucketName}/`, '');
        const file = bucket.file(filePath);

        const [url] = await file.getSignedUrl({
            version: 'v4',
            action: 'read',
            expires: Date.now() + 15 * 60 * 1000, // 15 minutes
        });
        
        return url;
    } catch (error) {
        console.error("Error generating signed URL:", error);
        return "";
    }
};