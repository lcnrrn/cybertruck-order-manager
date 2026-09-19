import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import './sms-settings.css';
import './product.css';
import './copy-buttons.css';
import './order-table.css';
import App from './App';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
