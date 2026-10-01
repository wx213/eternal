/** 设计稿头像色板 */
const AVATAR_COLORS = [
  '#3390ec', // blue
  '#6bcb77', // green
  '#4d96ff', // indigo
  '#ff6b9d', // pink
  '#9b72cf', // purple
  '#ff8c42', // orange
];

/** 依据稳定 key 取头像底色，保证同一实体每次渲染颜色一致 */
export function avatarColor(key: string): string {
  let hash = 0;
  for (let i = 0; i < key.length; i++) {
    hash = (hash * 31 + key.charCodeAt(i)) >>> 0;
  }
  return AVATAR_COLORS[hash % AVATAR_COLORS.length];
}

/** 取名称首字（兼容中英文） */
export function initials(name?: string): string {
  const trimmed = (name || '').trim();
  if (!trimmed) return '?';
  const first = trimmed[0];
  // 英文名取首字母大写，中文取首字
  return /[a-z]/i.test(first) ? first.toUpperCase() : first;
}

/** 会话列表时间：今天显示 HH:mm，昨天/本周显示中文，更早显示日期 */
export function formatListTime(ts?: number): string {
  if (!ts) return '';
  const d = new Date(ts);
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const dayMs = 86400000;

  if (ts >= startOfToday) {
    return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }
  if (ts >= startOfToday - dayMs) return '昨天';
  if (ts >= startOfToday - dayMs * 6) {
    return ['周日', '周一', '周二', '周三', '周四', '周五', '周六'][d.getDay()];
  }
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

/** 气泡内时间：HH:mm */
export function formatBubbleTime(ts?: number): string {
  if (!ts) return '';
  const d = new Date(ts);
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** 消息分组日期条：今天 / 昨天 / M月D日 */
export function formatDateChip(ts: number): string {
  const d = new Date(ts);
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  if (ts >= startOfToday) return '今天';
  if (ts >= startOfToday - 86400000) return '昨天';
  return `${d.getMonth() + 1}月${d.getDate()}日`;
}

/** 判断两个时间戳是否同一天 */
export function isSameDay(a: number, b: number): boolean {
  const da = new Date(a);
  const db = new Date(b);
  return (
    da.getFullYear() === db.getFullYear() &&
    da.getMonth() === db.getMonth() &&
    da.getDate() === db.getDate()
  );
}

/** 文件大小可读化 */
export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

/** 联系人分组首字母（非 A-Z 归入 #） */
export function groupLetter(name?: string): string {
  const c = initials(name);
  return /[A-Z]/.test(c) ? c : '#';
}

function pad(n: number): string {
  return n < 10 ? `0${n}` : `${n}`;
}
