import type { Env } from '../types';
import { isAuthorizedAsync } from '../lib/auth';

// Supported image MIME types
const ALLOWED_MIME_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
]);

// File extension mapping
const MIME_TO_EXTENSION: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/gif': 'gif',
  'image/webp': 'webp',
};

// Max file size: 5MB
const MAX_FILE_SIZE = 5 * 1024 * 1024;

/**
 * Generate a unique filename for the uploaded image
 */
function generateFilename(mimeType: string): string {
  const timestamp = Date.now();
  const random = Math.random().toString(36).substring(2, 10);
  const extension = MIME_TO_EXTENSION[mimeType] || 'bin';
  return `${timestamp}-${random}.${extension}`;
}

/**
 * POST /api/images/upload
 * Upload an image to R2 bucket
 *
 * Request: multipart/form-data with 'file' field
 * Response: { url: string, filename: string }
 */
export async function handleImageUpload(
  request: Request,
  env: Env
): Promise<Response> {
  // Check authorization
  if (!(await isAuthorizedAsync(request, env))) {
    return new Response(
      JSON.stringify({ success: false, error: 'Unauthorized' }),
      { status: 401, headers: { 'Content-Type': 'application/json' } }
    );
  }

  // Check if R2 bucket is configured
  if (!env.IMAGES_BUCKET) {
    return new Response(
      JSON.stringify({ success: false, error: 'Image storage not configured' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }

  try {
    // Parse multipart form data
    const formData = await request.formData();
    const file = formData.get('file');

    if (!file || !(file instanceof File)) {
      return new Response(
        JSON.stringify({ success: false, error: 'No file provided' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Validate MIME type
    if (!ALLOWED_MIME_TYPES.has(file.type)) {
      return new Response(
        JSON.stringify({
          success: false,
          error: `Invalid file type: ${file.type}. Allowed types: jpg, png, gif, webp`,
        }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Validate file size
    if (file.size > MAX_FILE_SIZE) {
      return new Response(
        JSON.stringify({
          success: false,
          error: `File too large. Maximum size: ${MAX_FILE_SIZE / 1024 / 1024}MB`,
        }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Generate unique filename
    const filename = generateFilename(file.type);

    // Upload to R2
    const arrayBuffer = await file.arrayBuffer();
    const r2Object = await env.IMAGES_BUCKET.put(filename, arrayBuffer, {
      httpMetadata: { contentType: file.type },
    });

    if (!r2Object) {
      console.error('R2 put returned null for filename:', filename);
      return new Response(
        JSON.stringify({ success: false, error: 'Storage operation failed - please retry' }),
        { status: 500, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Construct public URL using environment variable or default
    const baseUrl = env.IMAGES_PUBLIC_URL || 'https://images.edgeshift.tech';
    const publicUrl = `${baseUrl}/${filename}`;

    return new Response(
      JSON.stringify({ url: publicUrl, filename }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Image upload error:', error);

    let errorMessage = 'Failed to upload image';
    let statusCode = 500;

    if (error instanceof TypeError && error.message.includes('formData')) {
      errorMessage = 'Invalid form data format';
      statusCode = 400;
    } else if (error instanceof Error) {
      if (error.message.includes('R2') || error.message.includes('bucket')) {
        errorMessage = 'Storage service temporarily unavailable';
      }
    }

    return new Response(
      JSON.stringify({ success: false, error: errorMessage }),
      { status: statusCode, headers: { 'Content-Type': 'application/json' } }
    );
  }
}
