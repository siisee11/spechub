import React from 'react';
import ReactDOM from 'react-dom/client';
import { specCatalog } from 'virtual:spec-catalog';
import App from './App';
import './index.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App specs={specCatalog} />
  </React.StrictMode>,
);
