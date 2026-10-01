/**
 * 文件上传
 *
 * 只接受纯文本类文档，内存存储（不落磁盘，避免残留与路径处理风险）。
 * 校验双重把关：扩展名白名单 + 大小上限；解码时按 UTF-8 且拒绝二进制内容。
 */
import multer from 'multer';
import { AppError } from '../../shared/errors.js';

const ALLOWED_EXT = /\.(txt|md|markdown|csv|json|log)$/i;

export const textUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 2 * 1024 * 1024, files: 1 },
  fileFilter: (_req, file, cb) => {
    if (!ALLOWED_EXT.test(file.originalname)) {
      cb(AppError.badRequest('仅支持 txt / md / csv / json / log 文本文件'));
      return;
    }
    cb(null, true);
  },
});

/** 把上传的 Buffer 解成文本，含二进制探测 */
export function decodeTextFile(buffer: Buffer): string {
  // NUL 字节几乎只出现在二进制文件里，作为快速判据
  if (buffer.includes(0)) {
    throw AppError.badRequest('文件内容不是纯文本');
  }
  const text = buffer.toString('utf-8');
  if (!text.trim()) {
    throw AppError.badRequest('文件内容为空');
  }
  return text;
}

/** 净化用户提供的文件名，去掉路径分隔符，避免被当作路径使用 */
export function sanitizeFilename(name: string, fallback = '未命名'): string {
  const base = name.replace(/[/\\]/g, '_').replace(/[\u0000-\u001f]/g, '').trim();
  return (base || fallback).slice(0, 120);
}
