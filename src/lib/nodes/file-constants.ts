export const NODE_FILE_BUCKET = "node-files";

export const FILE_NODE_TEXT_EXTENSIONS = new Set(["txt"]);
export const FILE_NODE_IMAGE_EXTENSIONS = new Set(["png", "jpg", "jpeg", "webp"]);
export const FILE_NODE_DOCUMENT_EXTENSIONS = new Set(["pdf", "docx"]);
export const FILE_NODE_ALL_EXTENSIONS = new Set([
  ...FILE_NODE_TEXT_EXTENSIONS,
  ...FILE_NODE_IMAGE_EXTENSIONS,
  ...FILE_NODE_DOCUMENT_EXTENSIONS,
]);

export const FILE_NODE_IMAGE_SIZE_LIMIT = 10 * 1024 * 1024;    // 10 MB per image
export const FILE_NODE_TEXT_SIZE_LIMIT = 100 * 1024;            // 100 KB per text file
export const FILE_NODE_DOCUMENT_SIZE_LIMIT = 50 * 1024 * 1024; // 50 MB per document
