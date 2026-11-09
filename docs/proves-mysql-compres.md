# Proves MySQL de compres en una instància aïllada

Executar des de l’arrel del projecte:

```powershell
node scripts/verify-purchase-mysql.mjs
```

Requereix MySQL Server 8.0 instal·lat. Si l’executable és en una altra ubicació, es pot indicar amb `TEST_MYSQLD_PATH`.

El procés inicialitza un directori buit sota `.local-backups/purchase-mysql-*`, escull un port local lliure i crea credencials aleatòries només per a aquesta execució. No copia fitxers de cap instància existent ni llegeix dades d’empreses reals.

Abans de crear l’esquema comprova el port i `@@datadir` del servidor nou. També comprova la configuració efectiva dels processos fills abans d’executar migracions o proves; els paràmetres de connexió del projecte queden substituïts pels de la prova. Les credencials no s’escriuen a l’informe.

Aplica les migracions a l’esquema nou `purchase_validation` i executa, seqüencialment:

- `backend/test/purchases-db.test.js`
- `backend/test/purchase-ocr-db.test.js`

Les proves creen empreses sintètiques i comproven vincles parcials, factures amb diversos albarans, control de quantitats, assentaments, cartera, aïllament, permisos, còpies i extracció de documents sense comptabilització automàtica.

En acabar, el procés atura únicament el servidor MySQL que ha iniciat. Es conserven el directori sintètic i els registres d’inicialització, migracions i proves, juntament amb `report.json`, per poder revisar el resultat. No s’aturen ni s’alteren altres servidors MySQL.

Executar aquest procés no aplica les migracions a la base de dades real del projecte ni equival a activar-hi el mòdul de compres.
