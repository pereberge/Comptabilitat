import {partyPaymentText} from './party-payments.js';
export const partyText={
 title:'Datos fiscales',customer:'Cliente',supplier:'Proveedor',edit:'Editar subcuenta',
 help:'Estos datos se cargarán al seleccionar la subcuenta en una factura. Cada factura conserva los datos con los que se registró.',
 empty:'Completa la ficha fiscal para utilizar estos datos en las facturas.',
 search:'Buscar por código, descripción, nombre fiscal o NIF',
 invoiceHelp:'Los datos fiscales proceden de la ficha de la subcuenta. Puedes ajustarlos para esta factura.',
 labels:{name:'Nombre o razón social',tax_id:'CIF / NIF',address:'Domicilio fiscal',postal_code:'Código postal',city:'Población',province:'Provincia',country:'País',contact_person:'Persona de contacto',phone:'Teléfono',email:'Correo electrónico'},
 errors:{...partyPaymentText.errors,INVALID_PARTY_PROFILE:'Revisa los datos fiscales y la longitud de los campos.',INVALID_PARTY_NAME:'Introduce el nombre o razón social.',INVALID_PARTY_EMAIL:'Revisa el correo electrónico.',INVALID_PARTY_ACCOUNT:'La ficha fiscal corresponde a subcuentas de clientes, deudores, proveedores o acreedores (430, 440, 400 y 410).',AMBIGUOUS_PARTY_ACCOUNT:'Hay varias subcuentas con este NIF. Selecciona la subcuenta que corresponde a la factura.'},
};
