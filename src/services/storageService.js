import { supabase } from "../config/supabase.js";

const BUCKET_NAME = "vendor-bills";

export const uploadFile = async (file, prefix) => {
  if (!file) return null;

  const timestamp = Date.now();
  const filePath = `${prefix}_${timestamp}`;

  const { data, error } = await supabase.storage
    .from(BUCKET_NAME)
    .upload(filePath, file.buffer, {
      contentType: file.mimetype,
    });

  if (error) throw new Error(`File upload failed: ${error.message}`);

  // Get public URL
  const { data: urlData } = supabase.storage
    .from(BUCKET_NAME)
    .getPublicUrl(filePath);

  return urlData.publicUrl;
};

export const deleteFile = async (fileUrl) => {
  if (!fileUrl) {
    console.warn("deleteFile called with no URL. Skipping.");
    return;
  }

  // Extract the path correctly from the URL
  // The path you need is everything after the bucket name.
  // Example: https://.../object/public/vendor-bills/SIGNATURE/VENDOR/file.png
  // We split on '/object/public/'
  const pathParts = fileUrl.split("/object/public/");

  if (pathParts.length < 2) {
    throw new Error(`Invalid file URL structure: ${fileUrl}`);
  }

  // pathParts[1] will be "vendor-bills/SIGNATURE/VENDOR/file.png"
  const fullPath = pathParts[1];

  // Split to get bucket name and file path
  const firstSlashIndex = fullPath.indexOf("/");
  if (firstSlashIndex === -1) {
    throw new Error(`No bucket name found in URL: ${fileUrl}`);
  }

  const bucketName = fullPath.substring(0, firstSlashIndex);
  // filePath is everything after the bucket name: "SIGNATURE/VENDOR/file.png"
  const filePath = fullPath.substring(firstSlashIndex + 1);

  if (!bucketName || !filePath) {
    throw new Error(
      `Could not extract bucket name or file path from URL: ${fileUrl}`,
    );
  }

  // console.log(`Deleting file from bucket '${bucketName}' at path: ${filePath}`);

  // Delete the file
  const { error } = await supabase.storage.from(bucketName).remove([filePath]);

  if (error) {
    console.error(`Deletion failed for ${fileUrl}:`, error.message);
    throw new Error(`Failed to delete file: ${error.message}`);
  }

  // console.log(`Successfully deleted: ${fileUrl}`);
};
