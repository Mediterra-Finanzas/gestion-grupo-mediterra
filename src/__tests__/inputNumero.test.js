/* eslint-disable */
// ═══════════════════════════════════════════════════════════════════
// CAMPO NUMÉRICO ESCRIBIBLE
//
// El `<input type="number">` del navegador rechaza el separador de miles
// y, con `parseFloat(...)||0` en cada tecla, no deja borrar el campo.
// Acá se comprueba que se puede escribir como se escribe en Chile y que
// un número a medias nunca se guarda.
// ═══════════════════════════════════════════════════════════════════
import React from 'react';
import '@testing-library/jest-dom';
import { render, screen, fireEvent } from '@testing-library/react';
import InputNumero, { parseNumero, formatNumero, textoDeEdicion } from '../InputNumero.jsx';

describe('parseNumero · formato monto (el punto son miles)', () => {
  test.each([
    ['250.000', 250000],
    ['250000', 250000],
    ['250.000,5', 250000.5],
    ['250.000,50', 250000.5],
    ['1.234.567', 1234567],
    ['250,5', 250.5],
    ['-1.500', -1500],
    ['$ 250.000', 250000],
    ['250 000', 250000],
    ['0', 0],
  ])('«%s» → %s', (txt, esperado) => {
    expect(parseNumero(txt, 'monto')).toBe(esperado);
  });

  test('vacío devuelve null, no 0', () => {
    expect(parseNumero('', 'monto')).toBeNull();
    expect(parseNumero('   ', 'monto')).toBeNull();
  });

  test('ilegible devuelve NaN', () => {
    expect(Number.isNaN(parseNumero('abc', 'monto'))).toBe(true);
    expect(Number.isNaN(parseNumero('1,2,3', 'monto'))).toBe(true);
    expect(Number.isNaN(parseNumero(',', 'monto'))).toBe(true);
  });
});

describe('parseNumero · formato tasa (el punto es decimal)', () => {
  test.each([
    ['0.125', 0.125],
    ['0,125', 0.125],
    ['4,5', 4.5],
    ['4.5', 4.5],
    ['100', 100],
    ['0.12', 0.12],
  ])('«%s» → %s', (txt, esperado) => {
    expect(parseNumero(txt, 'tasa')).toBe(esperado);
  });

  test('un US$/kg de 0,125 NO se interpreta como 125', () => {
    expect(parseNumero('0.125', 'tasa')).toBe(0.125);
  });
});

describe('formatNumero', () => {
  test('monto lleva separador de miles chileno', () => {
    expect(formatNumero(250000, 'monto')).toBe('250.000');
    expect(formatNumero(1234567.5, 'monto')).toBe('1.234.567,5');
  });
  test('tasa NO lleva separador de miles', () => {
    expect(formatNumero(0.125, 'tasa')).toBe('0,125');
    expect(formatNumero(4.5, 'tasa')).toBe('4,5');
  });
  test('entero redondea y no muestra decimales', () => {
    expect(formatNumero(2026, 'entero')).toBe('2.026');
  });
  test('vacío o no numérico se muestra en blanco', () => {
    expect(formatNumero('', 'monto')).toBe('');
    expect(formatNumero(null, 'monto')).toBe('');
    expect(formatNumero(undefined, 'monto')).toBe('');
  });
  test('al entrar a editar se ve el valor crudo, sin miles', () => {
    expect(textoDeEdicion(250000, 'monto')).toBe('250000');
    expect(textoDeEdicion(0.125, 'tasa')).toBe('0,125');
  });
});

describe('InputNumero en pantalla', () => {
  function Campo({ inicial = 0, formato = 'monto', onChange }) {
    const [v, setV] = React.useState(inicial);
    return <InputNumero value={v} formato={formato}
                        onChange={n => { setV(n); if (onChange) onChange(n); }} />;
  }
  const campo = () => screen.getByRole('textbox');

  test('se puede escribir un monto con puntos de miles', () => {
    const vistos = [];
    render(<Campo onChange={n => vistos.push(n)} />);
    fireEvent.focus(campo());
    fireEvent.change(campo(), { target: { value: '250.000' } });
    fireEvent.blur(campo());
    expect(vistos).toEqual([250000]);
    expect(campo()).toHaveValue('250.000');          // formateado al salir
  });

  test('se puede borrar el campo y reescribir (el bug del 0 pegado)', () => {
    const vistos = [];
    render(<Campo inicial={1} onChange={n => vistos.push(n)} />);
    fireEvent.focus(campo());
    fireEvent.change(campo(), { target: { value: '' } });   // borrado completo
    expect(campo()).toHaveValue('');                        // queda vacío mientras escribe
    fireEvent.change(campo(), { target: { value: '60000' } });
    fireEvent.blur(campo());
    expect(vistos).toEqual([60000]);
  });

  test('no avisa en cada tecla: el valor se entrega al salir', () => {
    const vistos = [];
    render(<Campo onChange={n => vistos.push(n)} />);
    fireEvent.focus(campo());
    fireEvent.change(campo(), { target: { value: '6' } });
    fireEvent.change(campo(), { target: { value: '60' } });
    fireEvent.change(campo(), { target: { value: '600' } });
    expect(vistos).toEqual([]);
    fireEvent.blur(campo());
    expect(vistos).toEqual([600]);
  });

  test('Enter confirma', () => {
    const vistos = [];
    render(<Campo onChange={n => vistos.push(n)} />);
    fireEvent.focus(campo());
    fireEvent.change(campo(), { target: { value: '1.500' } });
    fireEvent.keyDown(campo(), { key: 'Enter' });
    expect(vistos).toEqual([1500]);
  });

  test('Escape descarta y deja el valor anterior', () => {
    const vistos = [];
    render(<Campo inicial={999} onChange={n => vistos.push(n)} />);
    fireEvent.focus(campo());
    fireEvent.change(campo(), { target: { value: '123' } });
    fireEvent.keyDown(campo(), { key: 'Escape' });
    expect(vistos).toEqual([]);
    expect(campo()).toHaveValue('999');
  });

  test('un número a medias no se guarda', () => {
    const vistos = [];
    render(<Campo inicial={50} onChange={n => vistos.push(n)} />);
    fireEvent.focus(campo());
    fireEvent.change(campo(), { target: { value: '12ab' } });
    fireEvent.blur(campo());
    expect(vistos).toEqual([]);                 // ilegible: se descarta
    expect(campo()).toHaveValue('50');          // vuelve al valor anterior
  });

  test('dejar el campo en blanco entrega 0', () => {
    const vistos = [];
    render(<Campo inicial={777} onChange={n => vistos.push(n)} />);
    fireEvent.focus(campo());
    fireEvent.change(campo(), { target: { value: '' } });
    fireEvent.blur(campo());
    expect(vistos).toEqual([0]);
  });

  test('formato tasa: 0.125 no se vuelve 125', () => {
    const vistos = [];
    render(<Campo formato="tasa" onChange={n => vistos.push(n)} />);
    fireEvent.focus(campo());
    fireEvent.change(campo(), { target: { value: '0.125' } });
    fireEvent.blur(campo());
    expect(vistos).toEqual([0.125]);
  });
});
