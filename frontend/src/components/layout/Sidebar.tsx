import React from 'react';
import { NavLink } from 'react-router-dom';
import {
  LayoutDashboard,
  Gamepad2,
  Camera,
  Target,
  Map,
  CheckSquare,
  History,
  Bell,
  Settings,
  Gauge,
  Terminal,
  Palette,
} from 'lucide-react';
import { useRoverStore } from '../../store/roverStore';

interface NavItem {
  to: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  badge?: number;
}

export const Sidebar: React.FC = () => {
  const { alerts } = useRoverStore();
  const unackAlertsCount = alerts.filter((a) => !a.acknowledged).length;

  const navItems: NavItem[] = [
    { to: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { to: '/manual', label: 'Manual Drive', icon: Gamepad2 },
    { to: '/camera', label: 'Camera & Vision', icon: Camera },
    { to: '/mission', label: 'Mission Planner', icon: Target },
    { to: '/field-map', label: 'Greenhouse Map', icon: Map },
    { to: '/results', label: 'Scan Results', icon: CheckSquare },
    { to: '/history', label: 'History & Runs', icon: History },
    { to: '/alerts', label: 'Alerts', icon: Bell, badge: unackAlertsCount },
    { to: '/settings', label: 'Settings', icon: Settings },
    { to: '/calibration', label: 'Calibration', icon: Gauge },
    { to: '/diagnostics', label: 'Diagnostics', icon: Terminal },
    { to: '/design', label: 'Design System', icon: Palette },
  ];

  return (
    <aside className="hidden md:flex flex-col w-64 lg:w-72 border-r-2 border-border bg-surface text-text-main flex-shrink-0 min-h-[calc(100vh-5rem)] p-4 select-none transition-colors">
      <div className="text-xs font-black uppercase tracking-wider text-text-muted px-3 mb-2">
        Rover Navigation
      </div>

      <nav className="flex flex-col gap-1.5 flex-1" aria-label="Main Navigation">
        {navItems.map((item) => {
          const IconComponent = item.icon;
          return (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                `flex items-center justify-between px-3.5 py-3 rounded-xl font-bold text-sm min-h-[48px] border-2 transition-all ${
                  isActive
                    ? 'bg-primary border-primary text-surface shadow-xs'
                    : 'border-transparent text-text-muted hover:text-text-main hover:bg-app hover:border-border'
                }`
              }
            >
              <div className="flex items-center gap-3">
                <IconComponent className="w-5 h-5 flex-shrink-0" />
                <span>{item.label}</span>
              </div>

              {item.badge !== undefined && item.badge > 0 && (
                <span className="px-2 py-0.5 rounded-full text-xs font-black bg-danger text-surface">
                  {item.badge}
                </span>
              )}
            </NavLink>
          );
        })}
      </nav>

      {/* Footer Info */}
      <div className="pt-4 border-t-2 border-border mt-4 text-[11px] font-semibold text-text-muted px-2">
        <div>Agri-Rover OS v1.0.0</div>
        <div>Vite + React + Tailwind</div>
      </div>
    </aside>
  );
};
