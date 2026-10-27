import { ThemeProvider } from './context/ThemeContext';
import { DesignPage } from './pages/DesignPage';

export function App() {
  return (
    <ThemeProvider>
      {/* 
        Route handling:
        Both '/' and '/design' render the Design System Review page as requested.
      */}
      <DesignPage />
    </ThemeProvider>
  );
}

export default App;
