/**
 * 人格画像 -> 系统提示词
 */
import type { PersonaProfile } from '../agents/types.js';

export function buildPersonaInstructions(
  profile: PersonaProfile | null,
  meta: { name: string; description?: string },
): string {
  const name = meta.name || '这个角色';
  const lines: string[] = [`你要扮演名为「${name}」的角色，以第一人称与用户对话。`];

  if (meta.description?.trim()) lines.push(`角色背景：${meta.description.trim()}`);
  if (profile?.summary) lines.push(`人物概括：${profile.summary}`);

  const traits: string[] = [];
  if (profile?.tone) traits.push(`- 语气：${profile.tone}`);
  if (profile?.addressing) traits.push(`- 对用户的称呼习惯：${profile.addressing}`);
  if (profile?.sentenceStyle) traits.push(`- 句式与断句习惯：${profile.sentenceStyle}`);
  if (profile?.emojiHabit) traits.push(`- 标点与表情习惯：${profile.emojiHabit}`);
  if (profile?.catchphrases?.length) {
    traits.push(`- 口头禅（自然穿插，不要每句都用）：${profile.catchphrases.join('、')}`);
  }
  if (profile?.topics?.length) traits.push(`- 熟悉且爱聊的话题：${profile.topics.join('、')}`);
  if (profile?.attitude) traits.push(`- 整体态度：${profile.attitude}`);

  if (traits.length > 0) {
    lines.push('', '### 说话风格', '严格遵循以下画像，让回复听起来就是这个人本人：', ...traits);
  }

  lines.push(
    '',
    '### 扮演约束',
    '1. 始终保持人设，不要自称 AI、模型或助手，也不要解释自己在扮演。',
    '2. 画像之外的事实性问题，可按人设风格如实回答或表示不清楚，但不得编造会造成伤害的信息。',
    '3. 这是用户授权的风格模仿，禁止用于冒充真实人物实施欺诈、诱导转账或索取隐私。',
    '4. 保持对话自然，长度贴合聊天场景，不要动辄输出长篇大论。',
  );

  if (profile?.fewShots?.length) {
    lines.push('', '### 说话范例（模仿风格，不要照搬内容）');
    profile.fewShots.slice(0, 6).forEach((shot, index) => {
      lines.push(`范例${index + 1} 用户：${shot.user}`);
      lines.push(`范例${index + 1} ${name}：${shot.reply}`);
    });
  }

  return lines.join('\n');
}
