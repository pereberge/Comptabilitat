const messages={
 PERMISSION_DENIED:'Tu usuario no tiene permiso para esta acción. Cambia al máster o revisa los permisos.',
 ACCESS_BAD_PASSWORD:'La contraseña del máster no es correcta.',
 ACCESS_SETUP_REQUIRED:'Primero define la contraseña del máster.',
 ACCESS_ALREADY_CONFIGURED:'El máster ya tiene contraseña. Cierra este diálogo y vuelve a seleccionarlo.',
 ACCESS_PASSWORD_LENGTH:'La contraseña debe tener entre 8 y 128 caracteres.',
 ACCESS_PASSWORD_CHANGED:'La contraseña ha cambiado. Vuelve a entrar como máster.',
 ACCESS_TOO_MANY_ATTEMPTS:'Demasiados intentos. Espera 15 minutos antes de volver a probar.',
 ACCESS_INVALID_USER:'El usuario no es válido.',ACCESS_INVALID_NAME:'Escribe un nombre de hasta 60 caracteres.',
 ACCESS_INVALID_PERMISSIONS:'Los permisos no son válidos.',
};
export const accessError=error=>messages[error?.code]||'';
