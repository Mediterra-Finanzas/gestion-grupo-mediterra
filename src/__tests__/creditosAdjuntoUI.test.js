import React, { useState } from 'react';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
jest.mock('../friskuHelpers', () => ({
  ...jest.requireActual('../friskuHelpers'),
  uploadDocNomina: jest.fn(),
  urlFirmadaNomina: jest.fn(),
}));
jest.mock('../expedienteHelpers', () => ({
  ...jest.requireActual('../expedienteHelpers'),
  hashArchivo: jest.fn(),
}));
import { uploadDocNomina, urlFirmadaNomina } from '../friskuHelpers';
import { hashArchivo } from '../expedienteHelpers';
import { CamposComunesCredito, abrirDocCredito } from '../FinanzasModule.jsx';

let ultimo;
function Envoltorio({ inicial }) {
  const [form, setForm] = useState(inicial);
  ultimo = form;
  return <CamposComunesCredito form={form} setForm={setForm} />;
}
const base = { uid: 'cr_1', empresa: 'Allegria Service', documentos: [] };
const archivo = (n = 'Tabla BCI.pdf', size = 2048) => { const f = new File(['x'], n, { type: 'application/pdf' }); Object.defineProperty(f, 'size', { value: size }); return f; };
const input = (c) => c.querySelector('[data-adjuntar-doc-credito] input[type=file]');
beforeEach(() => { hashArchivo.mockResolvedValue('h123'); });
afterEach(() => { cleanup(); jest.clearAllMocks(); jest.restoreAllMocks(); });

test('subir un archivo guarda solo el path privado (creditos/…), nunca una URL', async () => {
  uploadDocNomina.mockImplementation(async (f, path) => ({ ok: true, path, error: null }));
  const { container } = render(<Envoltorio inicial={base} />);
  fireEvent.change(input(container), { target: { files: [archivo()] } });
  await waitFor(() => expect(ultimo.documentos).toHaveLength(1));
  const [file, path] = uploadDocNomina.mock.calls[0];
  expect(file.name).toBe('Tabla BCI.pdf');
  expect(path).toMatch(/^creditos\/Allegria_Service\/cr_1\/\d+_Tabla_BCI\.pdf$/);
  const d = ultimo.documentos[0];
  expect(d).toMatchObject({ nombre: 'Tabla BCI.pdf', path, mime: 'application/pdf', sizeKB: 2, hash: 'h123' });
  expect(d.url).toBeUndefined();
  expect(screen.getByRole('button', { name: /Archivo adjunto · 2 KB — ver/ })).toBeTruthy();
});

test('si la subida falla no se agrega nada y se avisa', async () => {
  uploadDocNomina.mockResolvedValue({ ok: false, path: null, error: 'HTTP 500' });
  const alerta = jest.spyOn(window, 'alert').mockImplementation(() => {});
  const { container } = render(<Envoltorio inicial={base} />);
  fireEvent.change(input(container), { target: { files: [archivo()] } });
  await waitFor(() => expect(alerta).toHaveBeenCalled());
  expect(alerta.mock.calls[0][0]).toMatch(/No se pudo subir.*HTTP 500.*No se agregó nada/);
  expect(ultimo.documentos).toHaveLength(0);
});

test('archivo sobre 20 MB se rechaza sin subir', () => {
  const alerta = jest.spyOn(window, 'alert').mockImplementation(() => {});
  const { container } = render(<Envoltorio inicial={base} />);
  fireEvent.change(input(container), { target: { files: [archivo('grande.pdf', 21 * 1024 * 1024)] } });
  expect(alerta).toHaveBeenCalledWith('El archivo supera 20 MB.');
  expect(uploadDocNomina).not.toHaveBeenCalled();
});

test('quitar un archivo adjunto pide confirmación; cancelar lo conserva', () => {
  const conf = jest.spyOn(window, 'confirm').mockReturnValue(false);
  render(<Envoltorio inicial={{ ...base, documentos: [{ nombre: 'Contrato', path: 'creditos/x/y/1_c.pdf' }] }} />);
  fireEvent.click(screen.getByRole('button', { name: '×' }));
  expect(conf).toHaveBeenCalled();
  expect(ultimo.documentos).toHaveLength(1);
  conf.mockReturnValue(true);
  fireEvent.click(screen.getByRole('button', { name: '×' }));
  expect(ultimo.documentos).toHaveLength(0);
});

test('los enlaces existentes siguen funcionando como antes', () => {
  render(<Envoltorio inicial={{ ...base, documentos: [{ nombre: 'Pagaré', url: 'https://sp/x' }] }} />);
  expect(screen.getByDisplayValue('https://sp/x')).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: '+ enlace' }));
  expect(ultimo.documentos).toEqual([{ nombre: 'Pagaré', url: 'https://sp/x' }, { nombre: '', url: '' }]);
});

test('abrir un archivo usa URL firmada; si falla, avisa', async () => {
  const abrir = jest.spyOn(window, 'open').mockImplementation(() => null);
  const alerta = jest.spyOn(window, 'alert').mockImplementation(() => {});
  urlFirmadaNomina.mockResolvedValueOnce('https://firmada/1');
  await abrirDocCredito({ path: 'creditos/a/b/1_c.pdf' });
  expect(urlFirmadaNomina).toHaveBeenCalledWith('creditos/a/b/1_c.pdf');
  expect(abrir).toHaveBeenCalledWith('https://firmada/1', '_blank', 'noopener');
  urlFirmadaNomina.mockResolvedValueOnce(null);
  await abrirDocCredito({ path: 'creditos/a/b/1_c.pdf' });
  expect(alerta).toHaveBeenCalled();
});
