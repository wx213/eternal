import { useState } from 'react';
import { IconBack, IconUpload } from '../../components/Icons';
import { agentsApi } from '../../shared/api';
import { useAgentStore, useChatStore, useUiStore } from '../../shared/store';
import type { PersonaProfile } from '../../shared/types';

type Step = 'input' | 'analyzing' | 'result';

const ACCEPT = '.txt,.md,.markdown,.csv,.json,.log';
/** 与后端 multer 限制保持一致 */
const MAX_FILE_SIZE = 2 * 1024 * 1024;

/** 导入聊天记录 -> 抽取说话风格 -> 生成拟真人格 */
export default function ImportChatPage() {
  const setView = useUiStore((state) => state.setView);
  const refreshAgents = useAgentStore((state) => state.refresh);
  const openAgent = useChatStore((state) => state.openAgent);

  const [step, setStep] = useState<Step>('input');
  const [name, setName] = useState('');
  const [speaker, setSpeaker] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [profileText, setProfileText] = useState('');
  const [error, setError] = useState('');
  const [profile, setProfile] = useState<PersonaProfile | null>(null);
  const [agentId, setAgentId] = useState('');

  const pickFile = (picked: File | null) => {
    if (picked && picked.size > MAX_FILE_SIZE) {
      setError('文件超过 2MB，请拆分后再上传');
      return;
    }
    setError('');
    setFile(picked);
  };

  const submit = async () => {
    const trimmedName = name.trim();
    if (!trimmedName) {
      setError('请填写这个角色的名字');
      return;
    }
    if (!file && !profileText.trim()) {
      setError('请上传聊天记录文件，或粘贴人物设定文本');
      return;
    }

    setError('');
    setStep('analyzing');

    try {
      // 先建角色，再挂语料，最后抽风格：任一步失败角色都已存在，用户可在设置里续传
      const { agent } = await agentsApi.create({
        name: trimmedName,
        type: 'persona',
        description: `根据${file ? '聊天记录' : '人物设定'}克隆的拟真人格`,
      });
      setAgentId(agent.id);

      if (file) await agentsApi.uploadCorpusFile(agent.id, file);
      if (profileText.trim()) await agentsApi.uploadCorpusText(agent.id, profileText.trim());

      const extracted = await agentsApi.extractPersona(agent.id, speaker.trim() || trimmedName);
      setProfile(extracted.personaProfile);
      await refreshAgents();
      setStep('result');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : '分析失败，请重试');
      setStep('input');
    }
  };

  const startChat = async () => {
    if (!agentId) return;
    await openAgent(agentId);
    setView('chats');
  };

  return (
    <section className="flow-page">
      <header className="flow-topbar">
        <button className="ft-back" onClick={() => setView('create-agent')} aria-label="返回">
          <IconBack />
        </button>
        <span className="ft-title">导入聊天记录</span>
      </header>

      <div className="flow-scroll">
        {step === 'result' && profile ? (
          <ResultView profile={profile} name={name} onStartChat={() => void startChat()} />
        ) : (
          <>
            <div className="flow-head">
              <h1>导入聊天记录，克隆说话风格</h1>
              <p>系统会分析语气、口头禅、称呼习惯与常聊话题，生成一个说话像 TA 的拟真人格。</p>
            </div>

            <div className="form-card">
              {error && <div className="form-error">{error}</div>}

              <div className="field">
                <label className="field-label">角色名字</label>
                <input
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  placeholder="例如：老王、小美、张老师"
                  disabled={step === 'analyzing'}
                />
              </div>

              <div className="field">
                <label className="field-label">要模仿谁（可选）</label>
                <input
                  value={speaker}
                  onChange={(event) => setSpeaker(event.target.value)}
                  placeholder="聊天记录里的说话人昵称，留空则用角色名字"
                  disabled={step === 'analyzing'}
                />
              </div>

              <div className="field">
                <label className="field-label">聊天记录文件</label>
                <label className="upload-zone">
                  <IconUpload size={22} />
                  <span className="uz-text">{file ? file.name : '点击选择文件'}</span>
                  <span className="uz-hint">支持 txt / md / csv / json / log，最大 2MB</span>
                  <input
                    type="file"
                    accept={ACCEPT}
                    onChange={(event) => pickFile(event.target.files?.[0] ?? null)}
                    disabled={step === 'analyzing'}
                  />
                </label>
              </div>

              <div className="field">
                <label className="field-label">或直接粘贴人物设定</label>
                <textarea
                  rows={6}
                  value={profileText}
                  onChange={(event) => setProfileText(event.target.value)}
                  placeholder="描述这个人的性格、说话风格、口头禅、常聊的话题…"
                  disabled={step === 'analyzing'}
                />
              </div>

              <button className="btn-primary" onClick={() => void submit()} disabled={step === 'analyzing'}>
                {step === 'analyzing' ? '正在分析说话风格…' : '开始分析'}
              </button>

              <p className="form-tip">
                语料仅用于生成该角色的说话风格，请勿上传他人隐私信息，也不要用于冒充真实人物。
              </p>
            </div>
          </>
        )}
      </div>
    </section>
  );
}

function ResultView({
  profile,
  name,
  onStartChat,
}: {
  profile: PersonaProfile;
  name: string;
  onStartChat: () => void;
}) {
  const rows: { label: string; value?: string }[] = [
    { label: '人物概括', value: profile.summary },
    { label: '语气', value: profile.tone },
    { label: '称呼习惯', value: profile.addressing },
    { label: '句式习惯', value: profile.sentenceStyle },
    { label: '表情习惯', value: profile.emojiHabit },
    { label: '口头禅', value: profile.catchphrases?.join('、') },
    { label: '常聊话题', value: profile.topics?.join('、') },
    { label: '整体态度', value: profile.attitude },
  ].filter((row) => row.value?.trim());

  return (
    <>
      <div className="flow-head">
        <h1>「{name}」已生成</h1>
        <p>下面是系统分析出的说话风格，可以在智能体设置里继续微调。</p>
      </div>

      <div className="form-card">
        <div className="form-ok">分析完成</div>

        <div className="profile-preview">
          {rows.map((row) => (
            <div key={row.label} className="pp-row">
              <span className="pp-label">{row.label}</span>
              <span className="pp-value">{row.value}</span>
            </div>
          ))}
        </div>

        {profile.fewShots && profile.fewShots.length > 0 && (
          <div className="field">
            <label className="field-label">说话范例</label>
            <div className="profile-preview">
              {profile.fewShots.map((shot, index) => (
                <div key={index} className="pp-row">
                  <span className="pp-label">用户：{shot.user}</span>
                  <span className="pp-value">{name}：{shot.reply}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        <button className="btn-primary" onClick={onStartChat}>
          开始聊天
        </button>
      </div>
    </>
  );
}
