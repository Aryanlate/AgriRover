import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { ThemeProvider } from './context/ThemeContext';
import { AppLayout } from './components/layout/AppLayout';

// Pages
import { DashboardPage } from './pages/DashboardPage';
import { ManualPage } from './pages/ManualPage';
import { CameraPage } from './pages/CameraPage';
import { MissionPage } from './pages/MissionPage';
import { FieldMapPage } from './pages/FieldMapPage';
import { ResultsPage } from './pages/ResultsPage';
import { HistoryPage } from './pages/HistoryPage';
import { AlertsPage } from './pages/AlertsPage';
import { SettingsPage } from './pages/SettingsPage';
import { CalibrationPage } from './pages/CalibrationPage';
import { DiagnosticsPage } from './pages/DiagnosticsPage';
import { DesignPage } from './pages/DesignPage';

export function App() {
  return (
    <ThemeProvider>
      <BrowserRouter>
        <Routes>
          {/* Main App Layout */}
          <Route path="/" element={<AppLayout />}>
            <Route index element={<Navigate to="/dashboard" replace />} />
            <Route path="dashboard" element={<DashboardPage />} />
            <Route path="manual" element={<ManualPage />} />
            <Route path="camera" element={<CameraPage />} />
            <Route path="mission" element={<MissionPage />} />
            <Route path="field-map" element={<FieldMapPage />} />
            <Route path="results" element={<ResultsPage />} />
            <Route path="history" element={<HistoryPage />} />
            <Route path="alerts" element={<AlertsPage />} />
            <Route path="settings" element={<SettingsPage />} />
            <Route path="calibration" element={<CalibrationPage />} />
            <Route path="diagnostics" element={<DiagnosticsPage />} />
            <Route path="design" element={<DesignPage />} />
          </Route>

          {/* Fallback */}
          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Routes>
      </BrowserRouter>
    </ThemeProvider>
  );
}

export default App;
