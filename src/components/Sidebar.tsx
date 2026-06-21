// 侧边栏导航(全局功能切换)

import { cn } from "../lib/utils";
import { useAppStore } from "../stores/app";

interface NavItem {
  id: string;
  label: string;
  icon: string;
  requiresProject: boolean;
}

const items: NavItem[] = [
  { id: "home", label: "我的作品", icon: "📚", requiresProject: false },
  { id: "writing", label: "写作", icon: "✍", requiresProject: true },
  { id: "outline", label: "大纲", icon: "📋", requiresProject: true },
  { id: "character", label: "人物", icon: "👤", requiresProject: true },
  { id: "setting", label: "设定", icon: "🌍", requiresProject: true },
  { id: "material", label: "素材", icon: "💎", requiresProject: true },
  { id: "tool", label: "工具", icon: "🔧", requiresProject: false },
  { id: "setting-app", label: "设置", icon: "⚙", requiresProject: false },
];

interface SidebarProps {
  activeView: string;
  onChangeView: (id: string) => void;
  onGoHome?: () => void;
}

export function Sidebar({ activeView, onChangeView, onGoHome }: SidebarProps) {
  const { currentProjectId, setCurrentProject } = useAppStore();
  return (
    <aside
      className="w-16 flex flex-col items-center py-3 gap-0.5 border-r"
      style={{ borderColor: "var(--color-border)" }}
    >
      {items.map((item) => {
        const disabled = item.requiresProject && !currentProjectId;
        const active = activeView === item.id;
        return (
          <button
            key={item.id}
            onClick={() => {
              if (item.id === "home") {
                if (onGoHome) onGoHome();
                else setCurrentProject(null);
              }
              if (!disabled && item.id !== "home") onChangeView(item.id);
            }}
            disabled={disabled}
            className={cn(
              "w-12 h-12 flex flex-col items-center justify-center rounded-lg text-base",
              "transition-all duration-150",
              active && "shadow-sm",
              !active && !disabled && "hover:bg-white/5",
              disabled && "opacity-30 cursor-not-allowed"
            )}
            style={{
              background: active ? "var(--color-elevated)" : undefined,
              color: active ? "var(--color-accent)" : undefined,
            }}
            title={item.label}
          >
            <span className="text-lg leading-none">{item.icon}</span>
            <span className="text-[10px] mt-0.5 leading-none">{item.label}</span>
          </button>
        );
      })}
    </aside>
  );
}
