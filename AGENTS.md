# Instruccions permanents per a Codex

## Objectiu

Desenvolupar i mantenir un programa de gestió multiempresa amb Node.js i MySQL, reduint el consum innecessari de quota de Codex.

## Normes generals

1. Treballa sempre amb els fitxers estrictament necessaris.
2. No analitzis tot el projecte si no és imprescindible.
3. Reutilitza les funcions, components i estructures existents.
4. No facis refactoritzacions generals sense autorització.
5. Evita explicacions llargues i repetitives.
6. No executis instal·lacions o proves innecessàries.
7. No modifiquis mòduls que no estiguin relacionats amb la tasca.
8. Conserva la compatibilitat amb les funcionalitats existents.

## Tasques grans

- Divideix cada tasca gran en fases petites.
- Presenta un pla breu abans de començar.
- Executa només la primera fase.
- Espera la confirmació de l'usuari abans de continuar.
- En acabar, resumeix els canvis i les proves efectuades.

## Base de dades MySQL

- No eliminis taules ni dades sense autorització.
- Comprova les dependències abans de modificar l'estructura.
- Utilitza migracions controlades.
- Mantén separades les dades de cada empresa.
- No exposis contrasenyes ni credencials.

## Mòduls del programa

- Factures, albarans i comandes.
- Reconeixement OCR de documents.
- Conciliació bancària.
- Quadre de comandament.
- Costos de fabricació.
- Tresoreria.

Prioritza la integració amb els mòduls existents i evita duplicar funcionalitats.

## Proves i verificacions

- Executa primer les proves específiques del canvi.
- No executis proves generals innecessàries.
- No ometis comprovacions importants de seguretat o integritat de dades.

## Resposta final

En acabar cada fase, indica:

1. Què s'ha modificat.
2. Quins fitxers s'han modificat.
3. Quines proves s'han realitzat.
4. Quina és la fase següent.

Prioritza l'eficiència, la seguretat i la qualitat del codi.
