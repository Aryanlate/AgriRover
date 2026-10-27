import React, { useState } from 'react';
import { Terminal, Send, Trash2 } from 'lucide-react';
import { useRoverStore } from '../store/roverStore';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { EmptyState } from '../components/ui/EmptyState';

export const DiagnosticsPage: React.FC = () => {
  const { log, clearLog, send } = useRoverStore();
  const [customCmd, setCustomCmd] = useState('');
  const [cmdStatus, setCmdStatus] = useState<string | null>(null);

  const handleSendCustom = () => {
    if (!customCmd.trim()) return;
    try {
      const parsed = JSON.parse(customCmd);
      send(parsed);
      setCmdStatus('Command dispatched.');
      setTimeout(() => setCmdStatus(null), 2000);
      setCustomCmd('');
    } catch {
      setCmdStatus('Error: Invalid JSON format.');
    }
  };

  const handleSelfTest = () => {
    send({ c: 'selftest' });
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b-2 border-border">
        <div>
          <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-text-main">
            Hardware Diagnostics & Protocol Inspector
          </h1>
          <p className="text-sm font-medium text-text-muted mt-1">
            Real-time newline-delimited JSON message traffic between website and ESP32 over BLE.
          </p>
        </div>

        <div className="flex gap-3">
          <Button variant="secondary" onClick={handleSelfTest}>
            Run Rover Self-Test
          </Button>
          {log.length > 0 && (
            <Button variant="secondary" onClick={clearLog} icon={<Trash2 className="w-4 h-4" />}>
              Clear Log
            </Button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Packet Log Feed */}
        <Card title="BLE Message Traffic" variant="default" className="p-6 lg:col-span-2">
          {log.length > 0 ? (
            <div className="overflow-y-auto max-h-[550px] space-y-2 font-mono text-xs pr-2">
              {log.map((entry) => (
                <div
                  key={entry.id}
                  className={`p-2.5 rounded-lg border flex items-start gap-3 ${
                    entry.direction === 'in'
                      ? 'bg-app border-border text-text-main'
                      : 'bg-primary/10 border-primary/30 text-primary'
                  }`}
                >
                  <span
                    className={`px-1.5 py-0.5 rounded text-[10px] font-bold uppercase flex-shrink-0 ${
                      entry.direction === 'in' ? 'bg-surface text-text-muted' : 'bg-primary text-surface'
                    }`}
                  >
                    {entry.direction === 'in' ? 'RX' : 'TX'}
                  </span>
                  <span className="text-[10px] text-text-muted flex-shrink-0 mt-0.5">
                    {entry.timestamp.toLocaleTimeString()}
                  </span>
                  <span className="break-all flex-1">{JSON.stringify(entry.message)}</span>
                </div>
              ))}
            </div>
          ) : (
            <EmptyState
              icon={<Terminal className="w-10 h-10" />}
              title="No Packet Traffic"
              message="BLE protocol message traffic will stream here in real time."
            />
          )}
        </Card>

        {/* Command Sandbox */}
        <Card title="Raw Command Sandbox" variant="default" className="p-6 space-y-4">
          <p className="text-xs text-text-muted">
            Send raw JSON command payloads directly to the ESP32 rover protocol handler.
          </p>

          <div>
            <label className="text-xs font-bold uppercase text-text-muted block mb-1">
              JSON Command Payload
            </label>
            <textarea
              rows={4}
              value={customCmd}
              placeholder='{"c": "move", "mm": 100}'
              onChange={(e) => setCustomCmd(e.target.value)}
              className="w-full p-3 rounded-xl border-2 border-border bg-app text-text-main font-mono text-xs focus:outline-none focus:border-primary"
            />
          </div>

          {cmdStatus && (
            <p
              className={`text-xs font-bold ${
                cmdStatus.startsWith('Error') ? 'text-danger' : 'text-primary'
              }`}
            >
              {cmdStatus}
            </p>
          )}

          <Button
            variant="primary"
            fullWidth
            onClick={handleSendCustom}
            icon={<Send className="w-4 h-4" />}
          >
            Send Command
          </Button>
        </Card>
      </div>
    </div>
  );
};
