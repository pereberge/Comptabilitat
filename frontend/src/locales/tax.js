export const tax = {
 title:'Hacienda', model:'Modelo 303 · IVA', subtitle:'Régimen general · Liquidación mensual o trimestral',
 months:['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'],
 errors:{INVALID_VAT_PERIOD:'Selecciona un año y un período válidos.',INVALID_VAT_INPUT:'Revisa la clasificación, la base, el tipo y el porcentaje deducible. Las cuotas deben corresponder al desglose indicado.',VAT_SOURCE_CHANGED:'Han cambiado los datos de origen. Actualiza el modelo y revisa las operaciones afectadas.',VAT_DRAFT_CONFLICT:'Otro usuario ha guardado este período. Actualiza antes de volver a guardar.',VAT_TOO_MANY_ROWS:'Este período supera el límite de operaciones que puede revisar el modelo.'},
};
Object.assign(tax.errors,{
 INVALID_VAT_SETTLEMENT_ACCOUNT:'Selecciona una subcuenta de IVA válida de esta empresa. Las subcuentas identificadas como retenciones no se proponen para liquidar el IVA.',
 INVALID_VAT_FILING:'Revisa los datos del archivo de presentación y vuelve a generar el modelo.',
 VAT_FILING_YEAR:'El archivo de presentación está disponible para los ejercicios 2025 y 2026.',
 VAT_FILING_REVIEW_REQUIRED:'Completa la clasificación de las operaciones, confirma los criterios y recalcula el modelo.',
 VAT_FILING_NIF:'Completa o corrige el NIF de la empresa en su ficha.',
 VAT_FILING_NAME:'La razón social normalizada debe tener entre 1 y 80 caracteres.',
 VAT_FILING_CONFIRM_REQUIRED:'Confirma los datos de esta declaración antes de generar el archivo.',
 VAT_FILING_RESULT_TYPE:'El tipo de declaración debe corresponder al resultado del modelo.',
 VAT_FILING_REDEME_PERIOD:'La inscripción en REDEME requiere liquidación mensual.',
 VAT_FILING_REFUND_PERIOD:'La devolución se solicita en el último período del año o, si procede, mediante REDEME con liquidación mensual.',
 VAT_FILING_ANNUAL_INFORMATION:'El último período de un sujeto exonerado del modelo 390 requiere información anual adicional. Este archivo admite el último período para sujetos que presentan el 390; los exonerados deben completar su declaración en la AEAT.',
 VAT_FILING_ACTIVITY:'No puedes marcar sin actividad si existen cuotas de IVA devengadas o soportadas en el período.',
 VAT_FILING_IBAN:'Introduce un IBAN español válido para la domiciliación o la devolución.',
 VAT_FILING_AMOUNT_OVERFLOW:'Un importe supera la longitud admitida por el diseño oficial del modelo 303.',
 VAT_FILING_SOFTWARE_NIF:'Corrige el NIF de la entidad desarrolladora configurado para el archivo de presentación.',
});
