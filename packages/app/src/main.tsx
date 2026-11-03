import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import { App } from './App';
import { installRealBridge } from './game/realBridge';
import { installErrorLog } from './app/errorLog';

/** Cloudflare Web Analytics (cookieless), only when the build has a token. */
function installBeacon(): void {
  const token = import.meta.env.VITE_CF_BEACON_TOKEN;
  if (typeof token !== 'string' || token.trim() === '') return;
  const s = document.createElement('script');
  s.defer = true;
  s.src = 'https://static.cloudflareinsights.com/beacon.min.js';
  s.setAttribute('data-cf-beacon', JSON.stringify({ token: token.trim() }));
  document.head.appendChild(s);
}

installErrorLog();
installRealBridge();
installBeacon();

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
