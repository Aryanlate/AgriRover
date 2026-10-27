import React from 'react';
import { NavLink } from 'react-router-dom';
import { LayoutDashboard, Gamepad2, Camera, Target, Bell, Settings } from 'lucide-react';
import { useRoverStore } from '../../store/roverStore';

export const BottomNav: React.FC = () => {
  const { alerts } = useRoverStore();
  const unackAlertsCount = alerts.filter((a) => !a.acknowledged).length;

  const tabs = [
    { to: '/dashboard', label: 'Dash', icon: LayoutDashboard },
    { to: '/manual', label: 'Manual', icon: Gamepad2 },
    { to: '/camera', label: 'Camera', icon: Camera },
    { to: '/mission', label: 'Mission', icon: Target },
    { to: '/alerts', label: 'Alerts', icon: Bell, badge: unackAlertsCount },
    { to: '/settings', label: 'Settings', icon: Settings },
  ];

  return (
    <nav
      className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-surface border-t-2 border-border text-text-main flex items-center justify-around px-2 py-1 select-none shadow-lg transition-colors"
      aria-label="Mobile Navigation"
    >
      {tabs.map((tab) => {
        const IconComponent = tab.icon;
        return (
          <NavLink
            key={tab.to}
            to={tab.to}
            className={({ isActive }) =>
              `flex flex-col items-center justify-center min-h-[48px] min-w-[48px] px-2 py-1 rounded-xl text-xs font-bold transition-colors relative ${
                isActive ? 'text-primary' : 'text-text-muted hover:text-text-main'
              }`
            }
          >
            <IconComponent className="w-5 h-5 mb-0.5" />
            <span className="text-[10px] tracking-tight">{tab.label}</span>

            {tab.badge !== undefined && tab.badge > 0 && (
              <span className="absolute top-1 right-2 w-4 h-4 rounded-full bg-danger text-surface text-[10px] font-black flex items-center justify-center">
                {tab.badge}
              </span>
            )}
          </NavLink>
        );
      })}
    </nav>
  );
};
