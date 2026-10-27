import React from 'react';
import { Outlet } from 'react-router-dom';
import { TopBar } from './TopBar';
import { Sidebar } from './Sidebar';
import { BottomNav } from './BottomNav';
import { BluetoothBanner } from './BluetoothBanner';

export const AppLayout: React.FC = () => {
  return (
    <div className="min-h-screen bg-app text-text-main flex flex-col font-sans transition-colors">
      <BluetoothBanner />
      <TopBar />

      <div className="flex-1 flex w-full max-w-[1920px] mx-auto overflow-hidden">
        <Sidebar />
        <main className="flex-1 overflow-y-auto p-4 sm:p-6 pb-20 md:pb-8 focus:outline-none">
          <Outlet />
        </main>
      </div>

      <BottomNav />
    </div>
  );
};
