import multer from "multer";
import path from "path";
import fs from "fs-extra";

// TEMP DIRECTORY FOR MULTER BEFORE PROCESSING
const tempDir = path.join(process.cwd(), "uploads", "temp");
fs.ensureDirSync(tempDir);

// Multer storage config
const storage = multer.memoryStorage({
  destination: (req, file, cb) => {
    cb(null, tempDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
    const ext = path.extname(file.originalname);
    const base = path.basename(file.originalname, ext);
    cb(null, `${base}-${uniqueSuffix}${ext}`);
  },
});

// Allowed mime types (extend for future support)
const allowedMimeTypes = [
  "application/pdf",
  "image/png",
  "image/jpeg",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
];

// File filter
const fileFilter = (req, file, cb) => {
  if (allowedMimeTypes.includes(file.mimetype)) return cb(null, true);
  cb(new Error("Unsupported file type"), false);
};

// Multer instance
const uploader = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: 50 * 1024 * 1024, // 50MB limit
  },
});

// Export middleware handlers
const upload = {
  singleFile: uploader.single("file"), // for routes like POST /convert
  multipleFiles: uploader.array("files", 10), // for future batch conversions
};

export default upload;
