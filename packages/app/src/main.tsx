import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import { App } from './App';
import { installRealBridge } from './game/realBridge';
import { installErrorLog } from './app/errorLog';

installErrorLog();
installRealBridge();

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
