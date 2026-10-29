export const editablePermissions = [
 {key:'accounting_write',label:'Registrar y modificar datos contables',help:'Cuentas, asientos, facturas, cobros y pagos, documentos, configuración de empresas y gestión de copias automáticas.'},
 {key:'exercise_create',label:'Crear ejercicios',help:'Dar de alta nuevos períodos contables.'},
 {key:'exercise_operations',label:'Aperturas y cierres',help:'Generar o anular los asientos de apertura y cierre.'},
 {key:'data_import',label:'Importar datos y copias',help:'Importar libros diarios, cuentas, extractos y copias en ejercicios vacíos.'},
];
export const masterPermissions = ['exercise_clear','invoice_delete','entries_delete','companies_manage','users_manage'];
export function permissionsFor(user){
 const stored=typeof user.permissions==='string'?JSON.parse(user.permissions):user.permissions||{};
 return Object.fromEntries([...editablePermissions.map(item=>item.key),...masterPermissions].map(key=>[key,user.role==='master'||!masterPermissions.includes(key)&&stored[key]===true]));
}
