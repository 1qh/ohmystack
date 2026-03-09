import { file } from '../lazy'

export const {
  assembleChunks,
  cancelChunkedUpload,
  CHUNK_SIZE,
  confirmChunk,
  finalizeAssembly,
  getSessionForAssembly,
  getUploadProgress,
  info,
  startChunkedUpload,
  upload,
  uploadChunk,
  validate
} = file
