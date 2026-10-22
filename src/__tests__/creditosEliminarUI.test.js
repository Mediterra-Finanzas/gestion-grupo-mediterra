import React from 'react';
import {render,screen,fireEvent,waitFor,cleanup} from '@testing-library/react';
import {Creditos} from '../FinanzasModule.jsx';
const credito={uid:'a',n:1,empresa:'Osiris',acreedor:'Banco Prueba',moneda:'USD',monto:100000,cuota:105000,
  f_venc:'2027-12-31',control_desde:'2026-01-01',desglose:{capital:100000,interes:5000,cargos:0}};
const props={empresas:{Osiris:{}},creditosData:[credito],empresasPermitidas:['Osiris'],canEdit:true,usuario:'Admin',tcData:{}};
afterEach(()=>{cleanup();jest.restoreAllMocks();});
test('un editor no administrador no tiene Eliminar',()=>{
  render(<Creditos {...props}/>);
  expect(screen.queryByRole('button',{name:'Eliminar',exact:true})).toBeNull();
});
test('administrador confirma motivo; guarda eliminación conservando datos',async()=>{
  jest.spyOn(window,'prompt').mockReturnValue('Registro duplicado');
  jest.spyOn(window,'confirm').mockReturnValue(true);
  const guardar=jest.fn().mockResolvedValue({ok:true});
  render(<Creditos {...props} esAdmin onSaveCreditos={guardar}/>);
  fireEvent.click(screen.getByRole('button',{name:'Eliminar',exact:true}));
  await waitFor(()=>expect(guardar).toHaveBeenCalledTimes(1));
  expect(guardar.mock.calls[0][0][0]).toMatchObject({uid:'a',eliminado:true,motivoEliminacion:'Registro duplicado'});
});
test('cancelar no guarda; un eliminado no aparece ni en Anulados',()=>{
  jest.spyOn(window,'prompt').mockReturnValue('Registro duplicado');
  jest.spyOn(window,'confirm').mockReturnValue(false);
  const guardar=jest.fn();
  const vista=render(<Creditos {...props} esAdmin onSaveCreditos={guardar}/>);
  fireEvent.click(screen.getByRole('button',{name:'Eliminar',exact:true}));
  expect(guardar).not.toHaveBeenCalled();
  vista.rerender(<Creditos {...props} creditosData={[{...credito,eliminado:true,anulado:true}]} esAdmin/>);
  expect(screen.queryByText('Banco Prueba')).toBeNull();
});
