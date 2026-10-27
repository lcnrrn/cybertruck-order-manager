import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import './sms-settings.css';
import './product.css';
import './copy-buttons.css';
import './money.css';
import './theme.css';
import App from './App';
import { registerSW } from 'virtual:pwa-register';
import { initSettingSnapshots } from './settingsMeta';

initSettingSnapshots();
// 새 버전이 배포되면 바로 받아서 새로고침 (옛 버전이 계속 떠 있지 않게)
const updateSW = registerSW({
  immediate: true,
  onNeedRefresh() {
    void updateSW(true);
  },
  onRegisteredSW(_url, reg) {
    if (!reg) return;
    const check = () => void reg.update().catch(() => undefined);
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') check();
    });
    window.setInterval(check, 30 * 60 * 1000);
  },
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
