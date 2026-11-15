import { createRoot } from 'react-dom/client';
import vkBridge from '@vkontakte/vk-bridge';
import { AppConfig } from './AppConfig.tsx';

vkBridge.send('VKWebAppInit');

createRoot(document.getElementById('root')!).render(<AppConfig />);

// Dev console only on request (?eruda): its floating button covers the UI and looks like a layout bug.
if (import.meta.env.MODE === 'development' && new URLSearchParams(window.location.search).has('eruda')) {
  import('./eruda.ts');
}
