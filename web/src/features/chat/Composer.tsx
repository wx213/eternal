import { useEffect, useRef, useState } from 'react';
import { IconAttach, IconEmoji, IconSend, IconSparkle, IconStop } from '../../components/Icons';

const QUICK_PROMPTS = [
  { label: '写文案', text: '帮我写一段文案：' },
  { label: '做总结', text: '帮我总结一下以下内容：' },
  { label: '查资料', text: '帮我查一下：' },
  { label: '翻译', text: '帮我翻译成英文：' },
];

const MAX_HEIGHT = 132;

interface ComposerProps {
  streaming: boolean;
  /** 切换会话时用于重置草稿 */
  conversationId: string;
  onSend: (text: string) => void;
  onStop: () => void;
}

export default function Composer({ streaming, conversationId, onSend, onStop }: ComposerProps) {
  const [value, setValue] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // 自适应高度
  useEffect(() => {
    const element = textareaRef.current;
    if (!element) return;
    element.style.height = 'auto';
    element.style.height = `${Math.min(element.scrollHeight, MAX_HEIGHT)}px`;
  }, [value]);

  // 换会话清草稿
  useEffect(() => {
    setValue('');
  }, [conversationId]);

  const submit = () => {
    const text = value.trim();
    if (!text || streaming) return;
    setValue('');
    onSend(text);
  };

  const appendPrompt = (text: string) => {
    setValue((previous) => (previous ? `${previous}${text}` : text));
    textareaRef.current?.focus();
  };

  return (
    <>
      <div className="quick-prompts">
        {QUICK_PROMPTS.map((prompt) => (
          <button key={prompt.label} className="qp-chip" onClick={() => appendPrompt(prompt.text)}>
            <IconSparkle size={13} />
            {prompt.label}
          </button>
        ))}
      </div>

      <div className="input-bar">
        <div className="input-box">
          <button className="in-icon" title="表情" aria-label="表情">
            <IconEmoji />
          </button>
          <textarea
            ref={textareaRef}
            rows={1}
            value={value}
            onChange={(event) => setValue(event.target.value)}
            onKeyDown={(event) => {
              // isComposing：中文输入法选词时的回车不应发送
              if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
                event.preventDefault();
                submit();
              }
            }}
            placeholder="问我任何问题…"
            aria-label="消息输入框"
          />
          <button className="in-icon" title="附件" aria-label="附件">
            <IconAttach />
          </button>
        </div>

        {streaming ? (
          <button className="send-btn" onClick={onStop} title="停止生成" aria-label="停止生成">
            <IconStop />
          </button>
        ) : (
          <button
            className="send-btn"
            onClick={submit}
            disabled={!value.trim()}
            title="发送"
            aria-label="发送"
          >
            <IconSend />
          </button>
        )}
      </div>
    </>
  );
}
