import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import App from './App';
import { ErrorBoundaryModulo } from './ErrorBoundaryModulo.jsx';
const root = ReactDOM.createRoot(document.getElementById('root'));
// Última red: un error fuera del hub y de los módulos (login, Tareas) ya no deja la página en blanco.
root.render(<ErrorBoundaryModulo ambito="la aplicación"><App /></ErrorBoundaryModulo>);
