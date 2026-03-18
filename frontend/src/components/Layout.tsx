import { NavLink } from "react-router-dom";
import { BarChart2, TrendingUp, Users, Trophy, Star, Cpu } from "lucide-react";

const NAV = [
  { to: "/",          label: "Dashboard",   icon: BarChart2  },
  { to: "/tips",      label: "Predictions", icon: TrendingUp },
  { to: "/value",     label: "Value Bets",  icon: Star       },
  { to: "/form",      label: "Form Guide",  icon: Users      },
  { to: "/standings", label: "Standings",   icon: Trophy     },
  { to: "/models",    label: "Models",      icon: Cpu        },
];

export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col">
      {/* Top nav */}
      <header className="bg-slate-900 border-b border-slate-800 sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 flex items-center gap-6 h-14">
          <span className="font-bold text-amber-400 text-lg tracking-tight">🏉 AFL Predictor</span>
          <nav className="flex gap-1 overflow-x-auto">
            {NAV.map(({ to, label, icon: Icon }) => (
              <NavLink
                key={to}
                to={to}
                end={to === "/"}
                className={({ isActive }) =>
                  `flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium whitespace-nowrap transition-colors ${
                    isActive
                      ? "bg-amber-500 text-slate-900"
                      : "text-slate-400 hover:text-slate-100 hover:bg-slate-800"
                  }`
                }
              >
                <Icon size={14} />
                {label}
              </NavLink>
            ))}
          </nav>
        </div>
      </header>

      {/* Page content */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 py-6">
        {children}
      </main>

      <footer className="text-center text-slate-600 text-xs py-4 border-t border-slate-800">
        Data via <a href="https://squiggle.com.au" className="underline hover:text-slate-400">Squiggle</a> — gamble responsibly
      </footer>
    </div>
  );
}
