# Connexió de Gestió amb Comptabilitat — API v1

Aquest document és el contracte per implementar **el client al software de Gestió**. Descriu l'API que ja existeix a Comptabilitat. Pots passar tota aquesta carpeta al desenvolupador o agent que treballi en Gestió.

Fitxers del paquet:

- `openapi.json`: especificació OpenAPI 3.1, importable a eines de desenvolupament.
- `postman_collection.json`: peticions de prova amb variables i comprovacions de resposta.
- `examples/`: JSON vàlids de factura normal, IVA mixt amb retenció i abonament.
- Aquesta guia: autenticació, regles, respostes i política de reintents.

## 1. Dades que ha de facilitar l'administrador de Comptabilitat

| Dada | Exemple, que cal substituir |
| --- | --- |
| URL base del backend | `https://comptabilitat.example.com` |
| Token secret de Gestió | Lliurat per un canal segur, mai dins aquest paquet. |
| `sourceSystem` autoritzat | `gestio` |
| `companyExternalId` autoritzat | `piensos-arb` |

**Aquest paquet no conté credencials ni una URL de producció real.** El servidor ha de tenir habilitada la credencial i la correspondència d'empresa abans de fer proves. L'àmbit necessari és `invoices:received:write`.

En desenvolupament local, si Gestió s'executa a la mateixa màquina, la URL habitual és `http://127.0.0.1:3000`. Si Gestió s'executa en un altre servidor o contenidor, `127.0.0.1` apunta a aquell entorn, no al servidor de Comptabilitat: cal acordar una adreça accessible. En producció és obligatori HTTPS.

## 2. Endpoint i autenticació

```http
POST {BASE_URL}/api/v1/integrations/invoices/received
Authorization: Bearer {TOKEN_SECRET_DE_GESTIO}
Content-Type: application/json
Accept: application/json
```

La implementació actual utilitza un token Bearer de servei. **No hi ha un endpoint OAuth per obtenir-lo**, ni cal iniciar sessió al frontend. El token es desa només al backend de Gestió, en variables d'entorn o al gestor de secrets. A Comptabilitat es configura la seva empremta SHA-256. Gestió envia el token original, **no la empremta**.

No s'ha d'enviar `clientSecret`, contrasenya de Gmail, cookie ni `X-Company-Id`. L'empresa s'identifica mitjançant `companyExternalId`, que el servidor relaciona amb una empresa interna autoritzada per a aquella credencial. No s'accepta un camp `companyId` al cos.

Mida màxima: **128 KiB per petició**. Una petició conté **una factura**. No hi ha endpoint de lots. El límit actual és de **120 peticions per minut i IP per procés**.

## 3. Petició mínima completa

```json
{
  "sourceSystem": "gestio",
  "externalId": "FAC-987",
  "companyExternalId": "piensos-arb",
  "supplier": {
    "name": "Proveïdor Exemple SL",
    "taxId": "B12345678"
  },
  "invoiceNumber": "2026-125",
  "invoiceDate": "2026-10-26",
  "dueDate": "2026-11-26",
  "currency": "EUR",
  "description": "Compra de mercaderies",
  "taxBreakdown": [
    {
      "taxType": "vat",
      "taxRate": "21.00",
      "taxableBase": "1000.00",
      "taxAmount": "210.00"
    }
  ],
  "total": "1210.00",
  "documentExternalId": "DOC-456"
}
```

El NIF de l'exemple és il·lustratiu. El receptor en valida el format, no la seva existència legal ni la titularitat.

### Camps del cos

| Camp | Obligatori | Tipus i regles |
| --- | --- | --- |
| `sourceSystem` | Sí | Text de fins a 64 caràcters, exactament el valor autoritzat. |
| `externalId` | Sí | ID estable de la factura a Gestió, fins a 128 caràcters. No generar-ne un de nou a cada enviament. |
| `companyExternalId` | Sí | Àlies autoritzat de l'empresa, fins a 128 caràcters. |
| `supplier` | Sí | Objecte descrit a continuació. |
| `invoiceNumber` | Sí | Número del proveïdor, text de fins a 60 caràcters. No confondre amb `externalId`. |
| `invoiceDate` | Sí | Data real en format `AAAA-MM-DD`. |
| `dueDate` | Sí | Venciment en format `AAAA-MM-DD`, igual o posterior a `invoiceDate`. |
| `currency` | Sí | Tres lletres, habitualment `EUR`. No s'aplica conversió de moneda. |
| `description` | Sí | Concepte no buit, fins a 1.000 caràcters. |
| `taxBreakdown` | Sí | Entre 1 i 40 grups fiscals. |
| `withholdings` | No | Array de fins a 10 retencions; per defecte `[]`. |
| `total` | Sí | Total signat de la factura. No pot ser zero. |
| `documentExternalId` | Sí | Referència opaca del document original a Gestió, fins a 200 caràcters. |
| `invoiceType` | No | `standard`, `credit_note` o `rectifying`; per defecte `standard`. |
| `rectification` | En abonaments i rectificatives | Objecte amb `reason` i `originalInvoiceNumber`. |
| `lines` | No | Array de fins a 200 línies. Pot ometre's o ser `[]`. |

`sourceSystem`, `externalId` i `companyExternalId` han de complir `^[A-Za-z0-9][A-Za-z0-9._:-]*$`. Distingeixen majúscules i minúscules. No s'admeten camps addicionals, tampoc dins els objectes: Gestió ha de construir el contracte explícitament, sense enviar directament tota la seva fila de base de dades.

Els textos es retallen pels extrems i no poden contenir caràcters de control. El número fiscal normalitzat també ha de cabre en 60 caràcters després de convertir-lo a majúscules i eliminar-ne els espais.

### Proveïdor

| Camp de `supplier` | Obligatori | Regles |
| --- | --- | --- |
| `name` | Sí | Nom o raó social, fins a 200 caràcters. |
| `taxId` | Sí | NIF/CIF o identificador fiscal, fins a 32 caràcters abans de normalitzar. Se n'eliminen espais, punts i guions i es passa a majúscules; resultat alfanumèric de 3 a 32 caràcters. |
| `address` | No | Adreça, fins a 250 caràcters. |
| `email` | No | Correu amb format vàlid, fins a 254 caràcters, o text buit. |

No cal enviar cap ID intern ni subcompte de Comptabilitat. El receptor identifica el proveïdor pel NIF dins l'empresa. Si no el coneix, rep igualment la factura i retorna `SUPPLIER_REVIEW_REQUIRED`. La creació o assignació del subcompte es revisarà a Comptabilitat.

### Imports i percentatges

**Envia preferentment cadenes decimals**, per exemple `"1000.00"`, `"21.00"` i `"210.00"`. També s'accepten números JSON si es poden representar amb un màxim de dos decimals. No enviïs símbols de moneda, separadors de milers, coma decimal ni cadenes en notació exponencial.

Els imports tenen com a màxim tretze dígits enters i dos decimals. El límit absolut és `9999999999999.99`. Els percentatges són de 0 a 100 amb un màxim de dos decimals: `"21.00"` significa **21 %**, no 0,21.

### Desglossament fiscal

Cada element de `taxBreakdown` conté:

| Camp | Obligatori | Regles |
| --- | --- | --- |
| `taxType` | No | `vat` per defecte, `exempt`, `not_subject` o `reverse_charge`. |
| `taxRate` | Sí | Percentatge. |
| `taxableBase` | Sí | Base signada, diferent de zero. |
| `taxAmount` | Sí | Quota signada. |
| `exemptionReason` | Si `taxType=exempt` | Text justificatiu de fins a 250 caràcters. |

Per a `exempt`, `not_subject` i `reverse_charge`, `taxRate` i `taxAmount` han de ser zero. `reverse_charge` representa la recepció de la informació d'inversió del subjecte passiu; el seu tractament comptable posterior requereix revisió.

Les quotes s'han de correspondre amb base × percentatge. S'admet una diferència màxima d'**un cèntim per grup**, amb arrodoniment a cèntims; en quantitats negatives, l'arrodoniment es fa sobre el valor absolut i s'hi aplica el signe.

### Retencions

```json
"withholdings": [
  {"rate": "15.00", "base": "1000.00", "amount": "150.00"}
]
```

Els tres camps són obligatoris a cada retenció. La base ha de ser diferent de zero, el percentatge ha d'estar entre 0 i 100 i l'import ha de correspondre a la base × percentatge amb un màxim d'un cèntim de diferència. En abonaments s'utilitzen els signes corresponents.

La igualtat següent ha de complir-se **exactament**, sense una tolerància addicional al total:

```text
total = suma(taxBreakdown.taxableBase)
      + suma(taxBreakdown.taxAmount)
      - suma(withholdings.amount)
```

### Línies opcionals

Cada línia té `description` obligatòria, de fins a 200 caràcters, i els mateixos camps fiscals que un grup: `taxType`, `taxRate`, `taxableBase`, `taxAmount` i `exemptionReason`.

Si hi ha línies, les seves bases i quotes, agrupades per `taxType` i `taxRate`, han de sumar exactament les del desglossament fiscal. No s'admeten camps com `quantity`, `unitPrice` o `productId` en aquesta versió: Gestió ha d'enviar els imports de línia ja calculats.

### Abonaments i rectificatives

Per a `credit_note` o `rectifying`, envia també:

```json
"rectification": {
  "reason": "Devolució de mercaderia",
  "originalInvoiceNumber": "2026-125"
}
```

`reason` admet fins a 250 caràcters i `originalInvoiceNumber` fins a 60; tots dos són obligatoris. `credit_note` exigeix total negatiu. `rectifying` admet total positiu o negatiu, mai zero. Una factura `standard` exigeix total positiu i no ha de portar un objecte de rectificació.

La recepció d'aquests documents no anul·la automàticament la factura anterior ni genera contrassentaments. Poden quedar amb estat `issues` perquè el tractament comptable requereix revisió.

## 4. Respostes: què ha de guardar Gestió

### 201 — Recepció creada

```json
{
  "data": {
    "id": 123,
    "companyId": 85,
    "sourceSystem": "gestio",
    "externalId": "FAC-987",
    "status": "pending",
    "possibleDuplicate": false,
    "issues": ["SUPPLIER_REVIEW_REQUIRED"],
    "replayed": false
  },
  "requestId": "7cb4a4f5-3e74-4916-8908-16b1900730ea"
}
```

Els IDs numèrics són exemples. **`data.id` és l'ID de la recepció a Comptabilitat**, no un ID d'assentament ni necessàriament el de la factura comptabilitzada.

Gestió ha de desar: empresa, `sourceSystem`, `externalId`, el JSON enviat, `data.id`, `status`, `possibleDuplicate`, `issues`, `requestId` i el resultat HTTP. `X-Request-Id` conté el mateix identificador de seguiment que `requestId`.

**201 significa rebut, no comptabilitzat.** També confirma la recepció si `status` és `issues`. No enviïs una altra factura amb un ID diferent per intentar eliminar una incidència.

### 200 — Repetició equivalent

Es retorna el mateix esquema i el mateix `data.id`, amb `replayed:true`. No s'ha creat una segona recepció. L'estat retornat pot haver canviat si l'usuari ja ha actuat a Comptabilitat.

### Estats

| `status` | Significat |
| --- | --- |
| `pending` | Rebuda i pendent de comptabilitzar; pot tenir observacions de proveïdor o exercici. |
| `issues` | Rebuda amb incidències o un cas que requereix revisió comptable. |
| `posted` | Comptabilitzada posteriorment per l'usuari. |
| `cancelled` | Recepció anul·lada o factura comptabilitzada anul·lada. |
| `rectified` | Estat reservat per al tractament posterior de rectificacions. |

No hi ha, en aquesta versió, endpoint extern GET d'estat, webhook de retorn, PUT d'actualització ni DELETE. Els endpoints interns del frontend no formen part del contracte entre serveis i no s'han d'utilitzar des de Gestió. Una repetició equivalent retorna l'estat que consti, però no s'ha dissenyat com un servei de consulta periòdica.

### Incidències retornades

`issues` és un array de codis; pot ser buit. Gestió ha de conservar codis desconeguts per compatibilitat futura.

| Codi | Tractament |
| --- | --- |
| `SUPPLIER_REVIEW_REQUIRED` | Falta identificar o crear el subcompte del proveïdor. |
| `SUPPLIER_AMBIGUOUS` | El NIF té diversos subcomptes candidates. |
| `EXERCISE_REVIEW_REQUIRED` | No hi ha exercici per a la data indicada. |
| `EXERCISE_CLOSED` | L'exercici està tancat. |
| `POSSIBLE_FISCAL_DUPLICATE` | Existeix una recepció o factura del mateix proveïdor i número fiscal. |
| `CURRENCY_REQUIRES_REVIEW` | Moneda diferent d'EUR. |
| `RECTIFICATION_REQUIRES_REVIEW` | Rectificativa, abonament o imports que requereixen tractament específic. |
| `REVERSE_CHARGE_REQUIRES_REVIEW` | Inversió del subjecte passiu. |
| `WITHHOLDING_REQUIRES_REVIEW` | Retencions que el formulari actual no pot representar fidelment. |
| `ROUNDING_REQUIRES_REVIEW` | Arrodoniment acceptat en recepció però diferent del càlcul comptable actual. |
| `ACCOUNTING_REQUIRES_REVIEW` | Un altre cas que requereix adaptació o revisió comptable. |

## 5. Idempotència i reintents

La identitat és **empresa interna autoritzada + `sourceSystem` + `externalId`**. És responsabilitat de Gestió conservar `externalId` entre reintents.

1. Abans d'enviar, desa una operació de sortida amb el JSON definitiu i l'ID estable de la factura.
2. Envia aquell JSON. No generis un nou ID en cas de timeout, reinici o error de xarxa.
3. Si reps 201 o 200, marca l'operació com a rebuda per Comptabilitat i desa la resposta.
4. Si la resposta es perd, reenvia **el mateix JSON**, amb el mateix ordre de desglossament i línies.
5. Per errors temporals de xarxa o 503, aplica espera creixent amb variació aleatòria, per exemple 2, 5, 15 i 60 segons, i després deixa-la pendent de reintent supervisat. Aquest calendari és una recomanació del client, no una tasca del receptor.
6. En 429 respecta `Retry-After`. Evita diverses cues enviant la mateixa factura alhora, encara que el receptor protegeixi la concurrència.

Objectes amb les mateixes propietats en un altre ordre i imports equivalents com `1000` i `"1000.00"` es normalitzen. Els arrays mantenen el seu ordre. No recalculis dates, descripcions, línies ni referències en cada reintent.

**409 `INTEGRATION_IDEMPOTENCY_CONFLICT`** indica que aquella identitat ja existeix amb altres dades. Atura els reintents i demana revisió: no se sobreescriu ni s'actualitza la recepció anterior. Si una petició s'ha rebutjat amb 422, pots corregir-la i tornar-la a enviar amb el mateix ID, perquè no s'ha creat la recepció.

Un ID extern diferent amb el mateix NIF i número de factura es pot rebre amb 201 però quedar marcat com a possible duplicat. Gestió no ha de considerar aquesta resposta una segona factura verificada.

## 6. Errors HTTP

```json
{
  "error": {
    "code": "INTEGRATION_TOTAL_MISMATCH",
    "field": "total"
  },
  "requestId": "e6a45065-e835-4fd0-85ed-a69f17a52ed3"
}
```

`field` és opcional. No depenguis del text d'un missatge ni de l'ordre de propietats: utilitza `error.code`, HTTP i `requestId`.

| HTTP | Codis principals | Acció a Gestió |
| --- | --- | --- |
| 400 | `INTEGRATION_INVALID_JSON` | Corregir el JSON. |
| 401 | `INTEGRATION_UNAUTHORIZED` | Revisar el token; no reintentar repetidament. |
| 403 | `INTEGRATION_SCOPE_REQUIRED`, `INTEGRATION_SOURCE_FORBIDDEN`, `INTEGRATION_COMPANY_FORBIDDEN` | Demanar autorització o corregir origen/àlies. |
| 404 | `INTEGRATION_ENDPOINT_NOT_FOUND` | Revisar URL i versió. |
| 409 | `INTEGRATION_IDEMPOTENCY_CONFLICT` | Revisió manual; no canviar l'ID per esquivar el conflicte. |
| 413 | `INTEGRATION_PAYLOAD_TOO_LARGE` | Reduir les dades; no enviar el PDF. |
| 415 | `INTEGRATION_JSON_REQUIRED` | Utilitzar `Content-Type: application/json`. |
| 422 | Errors de validació | Corregir el camp abans de reintentar. |
| 426 | `INTEGRATION_HTTPS_REQUIRED` | Utilitzar la URL HTTPS correcta. |
| 429 | `INTEGRATION_RATE_LIMIT` | Respectar `Retry-After`. |
| 503 | `INTEGRATION_NOT_CONFIGURED`, `INTEGRATION_DATABASE_UNAVAILABLE` | En el primer cas, configurar el servidor; en el segon, reintentar amb espera i la mateixa identitat. |

Codis de validació actuals: `INTEGRATION_INVALID_FIELDS`, `INTEGRATION_INVALID_FIELD`, `INTEGRATION_INVALID_AMOUNT`, `INTEGRATION_INVALID_DATE`, `INTEGRATION_INVALID_TAX_ID`, `INTEGRATION_INVALID_RATE`, `INTEGRATION_INVALID_TAXES`, `INTEGRATION_INVALID_TAX_TYPE`, `INTEGRATION_TAX_MISMATCH`, `INTEGRATION_WITHHOLDING_MISMATCH`, `INTEGRATION_TOTAL_MISMATCH` i `INTEGRATION_LINES_MISMATCH`.

Els exemples assumeixen peticions HTTP correctes; el servidor web o el proxy també poden rebutjar una petició abans que arribi a l'API. Si no reps JSON, conserva l'HTTP i la incidència de transport, sense registrar el token.

## 7. Documents originals

Gestió conserva el PDF. Comptabilitat només desa `documentExternalId` i l'origen. No enviïs `pdf`, `contentBase64`, rutes locals ni un camp de URL: es rebutgen com a camps desconeguts.

Encara no hi ha una connexió documental entre serveis. La descàrrega futura haurà d'utilitzar una API autenticada de Gestió, amb comprovació d'empresa a tots dos costats. La referència no és un enllaç públic i no s'intenta obrir com una URL.

## 8. Provar amb curl o Postman

Amb PowerShell, configura al terminal de proves `COMPTABILITAT_BASE_URL` i `COMPTABILITAT_API_TOKEN` mitjançant el teu mecanisme segur habitual. Després:

```powershell
curl.exe --request POST "$env:COMPTABILITAT_BASE_URL/api/v1/integrations/invoices/received" --header "Authorization: Bearer $env:COMPTABILITAT_API_TOKEN" --header "Content-Type: application/json" --data-binary "@examples/factura-normal.json"
```

Executa'l des d'aquesta carpeta i substitueix l'àlies i l'origen de l'exemple pels valors autoritzats. Les proves creen recepcions reals al servidor indicat: utilitza una empresa i credencials de proves.

En Postman importa `postman_collection.json`, configura `baseUrl`, `sourceSystem` i `companyExternalId`, i proporciona `apiToken` com a valor local privat. No exportis el token amb la col·lecció ni el sincronitzis amb un espai compartit.

Seqüència de comprovació:

1. Enviar la factura normal: 201, o 200 si ja s'havia provat.
2. Repetir-la: 200 i el mateix ID intern.
3. Enviar-la amb el mateix ID i una altra descripció: 409.
4. Provar IVA mixt i retenció, i després l'abonament: 201/200; l'abonament pot quedar amb incidències.
5. Provar total incorrecte: 422, sense crear recepció.
6. Provar sense token: 401, amb el servidor configurat.
7. Provar un àlies no autoritzat: 403.
8. Comprovar a **Factures → Recibidas de Gestió** que no s'ha generat cap assentament per la simple recepció.

## 9. Exemple de crida des del backend Node.js de Gestió

```javascript
export async function enviarFacturaAComptabilitat(payload) {
  const baseUrl = process.env.COMPTABILITAT_BASE_URL;
  const token = process.env.COMPTABILITAT_API_TOKEN;
  if (!baseUrl || !token) throw new Error('Falta configurar la connexió');

  const response = await fetch(
    new URL('/api/v1/integrations/invoices/received', baseUrl),
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        Accept: 'application/json'
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(30000)
    }
  );
  const result = await response.json();
  if (response.status === 200 || response.status === 201) return result;

  const error = new Error(result.error?.code || 'COMPTABILITAT_HTTP_ERROR');
  error.status = response.status;
  error.field = result.error?.field;
  error.requestId = result.requestId;
  error.retryAfter = response.headers.get('retry-after');
  throw error;
}
```

La funció només fa una petició. La cua persistent de Gestió ha de gestionar els reintents segons l'apartat 5, inclosos els timeouts i les respostes de transport no JSON. No enviïs aquestes credencials des del navegador.

## 10. Informació per a l'agent o desenvolupador de Gestió

Implementa un adaptador al backend de Gestió que construeixi aquest JSON a partir d'una factura ja revisada i validada. Desa el missatge de sortida i l'ID extern abans d'enviar-lo; utilitza una cua persistent o un patró outbox, i conserva les respostes i `requestId`. Envia els PDF només al sistema documental de Gestió. No accedeixis a la base de dades de Comptabilitat ni utilitzis endpoints interns del seu frontend. No donis per comptabilitzada una factura només perquè la recepció retorni 201.

La guia d'administració de Comptabilitat, inclosa l'activació de credencials i empreses, és a [`../integracio-gestio.md`](../integracio-gestio.md). No cal passar al desenvolupador de Gestió cap `.env`, clau de xifrat, contrasenya de MySQL ni informació interna del servidor.
