import { supabase } from "../config/supabase.js";

const BUCKET_NAME = "vendor-bills";

export const uploadBillFile = async (file, purchaseDate) => {
  if (!file) return null;

  const timestamp = Date.now();
  const filePath = `BILL_${purchaseDate}_${timestamp}_${file.originalname}`;

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

export const deleteBillFile = async (filePath) => {
  const { error } = await supabase.storage.from(BUCKET_NAME).remove([filePath]);
  if (error) throw new Error(`File deletion failed: ${error.message}`);
};
