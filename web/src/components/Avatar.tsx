import { avatarColor, initials } from '../shared/lib/format';

interface AvatarProps {
  /** 用于稳定取色的 key，通常传实体 id */
  colorKey: string;
  /** 显示名称，用于取首字 */
  name?: string;
  /** 直接指定显示文本，优先级高于 name */
  text?: string;
  size?: number;
  fontSize?: number;
  className?: string;
  /** 是否显示在线小圆点 */
  online?: boolean;
  /** 在线小圆点的描边色，需与所在背景一致 */
  dotBorderColor?: string;
  dotSize?: number;
}

export default function Avatar({
  colorKey,
  name,
  text,
  size = 48,
  fontSize,
  className = '',
  online = false,
  dotBorderColor = '#fff',
  dotSize = 13,
}: AvatarProps) {
  const label = text ?? initials(name);

  return (
    <div
      className={`avatar ${className}`}
      style={{
        width: size,
        height: size,
        background: avatarColor(colorKey),
        fontSize: fontSize ?? Math.round(size * 0.38),
      }}
    >
      <span className="txt">{label}</span>
      {online && (
        <span
          className="online-dot"
          style={{ width: dotSize, height: dotSize, borderColor: dotBorderColor }}
        />
      )}
    </div>
  );
}
