import { IconBack, IconBrain, IconUpload } from '../../components/Icons';
import { useUiStore } from '../../shared/store';

/** 创建智能体入口页：选择创建方式 */
export default function CreateAgentPage() {
  const setView = useUiStore((state) => state.setView);

  return (
    <section className="flow-page">
      <header className="flow-topbar">
        <button className="ft-back" onClick={() => setView('chats')} aria-label="返回">
          <IconBack />
        </button>
        <span className="ft-title">创建智能体</span>
      </header>

      <div className="flow-scroll">
        <div className="flow-head">
          <h1>你想创建哪种智能体？</h1>
          <p>可以克隆某个人的说话风格，也可以配置一个专注解决问题的助手。</p>
        </div>

        <div className="choice-grid">
          <button className="choice-card" onClick={() => setView('import-chat')}>
            <span className="cc-icon persona">
              <IconUpload size={26} />
            </span>
            <span className="cc-title">导入聊天记录</span>
            <span className="cc-desc">
              上传聊天记录或人物设定，自动分析说话风格，生成一个「像那个人」的拟真人格。
            </span>
            <span className="cc-tag">拟真人格</span>
          </button>

          <button className="choice-card" onClick={() => setView('configure-agent')}>
            <span className="cc-icon functional">
              <IconBrain size={26} />
            </span>
            <span className="cc-title">配置功能助手</span>
            <span className="cc-desc">
              自定义人设提示词，挑选工具与专业技能，并可挂载知识库，打造专属的工作助手。
            </span>
            <span className="cc-tag">功能助手</span>
          </button>
        </div>
      </div>
    </section>
  );
}
