import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import App from './App';
import CorreosPendientes from './CorreosPendientes';
const root = ReactDOM.createRoot(document.getElementById('root'));
// Correos sin enviar: fuera de App para verse en cualquier pantalla (cada módulo tiene su propio return).
root.render(<><App /><CorreosPendientes /></>);
