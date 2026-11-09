import {accessError} from '../services/access-errors.js';
export const t={
 title:'Extractes arxivats',help:'Els extractes es guarden automàticament amb el banc i la data. Els anteriors continuen disponibles quan en puges un de nou.',
 dateHelp:'Si el document no indica una data d’emissió o una data final, es fa servir la data del darrer moviment.',
 search:'Cercar per banc, data, compte o fitxer',bank:'Banc',date:'Data de l’extracte',period:'Moviments inclosos',file:'Fitxer arxivat',actions:'Accions',
 current:'Actual',consult:'Consultar',download:'Descarregar',remove:'Esborrar',empty:'Encara no hi ha extractes arxivats en aquest exercici.',noMatches:'No hi ha extractes que coincideixin amb la cerca.',
 loading:'Llegint l’extracte…',original:'Nom original',documentDate:'Data identificada al document',periodDate:'Data final del període o dels moviments',
 removeTitle:'Esborrar extracte',removeHelp:'S’esborraran el fitxer original i el seu llistat de conciliació. Els assentaments ja registrats al diari i els conceptes recordats es conserven.',
 cancel:'Cancel·lar',confirmRemove:'Esborrar aquest extracte',removed:'Extracte esborrat de l’arxiu.',
 previous:'Anterior',next:'Següent',page:'Pàgina',pagination:'Pàgines de l’arxiu d’extractes',
};
export const bankStatementArchiveError=error=>accessError(error)||({
 RECONCILIATION_NOT_FOUND:'L’extracte ja no està disponible en aquesta empresa. Actualitza l’arxiu.',
 RECONCILIATION_CHANGED:'L’extracte ha canviat. Actualitza l’arxiu abans d’esborrar-lo.',
})[error?.code]||'No s’ha pogut completar l’operació amb l’extracte. Torna-ho a provar.';
