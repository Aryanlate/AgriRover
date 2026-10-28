import React, { useEffect } from 'react';
import { Outlet } from 'react-router-dom';
import { AlertTriangle, ShieldAlert } from 'lucide-react';
import { TopBar } from './TopBar';
import { Sidebar } from './Sidebar';
import { BottomNav } from './BottomNav';
import { BluetoothBanner } from './BluetoothBanner';
import { useRoverStore } from '../../store/roverStore';

export const AppLayout: React.FC = () => {
  const { send, connectionStatus, transportType, mqttDetails } = useRoverStore();

  const showRoverOffline =
    transportType === 'mqtt' &&
    connectionStatus === 'connected' &&
    Boolean(mqttDetails) &&
    !mqttDetails?.roverOnline;

  const showOtherController =
    transportType === 'mqtt' &&
    Boolean(mqttDetails) &&
    mqttDetails?.ownerCid !== null &&
    !mqttDetails?.isOwner;

  // Global Safety: Immediate motor/pump cutoff on tab hide, close, or navigation
  useEffect(() => {
    const handleSafeHalt = () => {
      if (connectionStatus === 'connected') {
        send({ c: 'stop' });
      }
    };

    const handleVisibility = () => {
      if (document.hidden && connectionStatus === 'connected') {
        send({ c: 'stop' });
      }
    };

    window.addEventListener('beforeunload', handleSafeHalt);
    window.addEventListener('pagehide', handleSafeHalt);
    document.addEventListener('visibilitychange', handleVisibility);

    return () => {
      window.removeEventListener('beforeunload', handleSafeHalt);
      window.removeEventListener('pagehide', handleSafeHalt);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [send, connectionStatus]);

  return (
    <div className="min-h-screen bg-app text-text-main flex flex-col font-sans transition-colors">
      <BluetoothBanner />

      {/* MQTT: rover offline warning */}
      {showRoverOffline && (
        <div
          role="alert"
          className="bg-danger/15 border-b-2 border-danger text-text-main px-4 py-3 flex items-center gap-3 text-sm font-medium"
        >
          <span className="p-1.5 rounded-lg bg-danger/25 text-danger flex-shrink-0">
            <AlertTriangle className="w-5 h-5" aria-hidden="true" />
          </span>
          <div>
            <span className="font-bold">Rover offline:</span> the main ESP32 is not publishing
            status on MQTT. Commands will not reach the hardware until it reconnects.
          </div>
        </div>
      )}

      {/* MQTT: another controller owns control */}
      {showOtherController && (
        <div
          role="alert"
          className="bg-warning/15 border-b-2 border-warning text-text-main px-4 py-3 flex items-center gap-3 text-sm font-medium"
        >
          <span className="p-1.5 rounded-lg bg-warning/25 text-warning flex-shrink-0">
            <ShieldAlert className="w-5 h-5" aria-hidden="true" />
          </span>
          <div>
            <span className="font-bold">Another controller has control.</span> Movement, pumps and
            probe are owned by another session. Only STOP is accepted here. Control is released
            after 3&nbsp;s without that session's heartbeat.
          </div>
        </div>
      )}

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
