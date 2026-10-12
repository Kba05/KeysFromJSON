import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { Toaster } from 'sonner';

import '@xyflow/react/dist/style.css';
import '@/styles/app.css';
import App from '@/App';

const root = document.getElementById('root');
if (!root) throw new Error('The application root is missing.');

createRoot(root).render(
  <StrictMode>
    <App />
    <Toaster richColors position="bottom-right" closeButton />
  </StrictMode>,
);
