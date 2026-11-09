# Organització de granges i despeses

**Gestió de granges** (`/granjas`) permet crear granges i grups propis de cada granja. Els grups tenen noms lliures i es poden canviar de nom. Es reutilitzen les granges ja existents; no cal que l’empresa tingui format de producció porcina.

Des d’una factura de proveïdor, una recepció de Gestió o una factura rebuda ja comptabilitzada, el bloc **Organització de la despesa** permet seleccionar una granja i un grup i prémer **Guardar classificació**. Es pot deixar la granja sense grup o tornar a deixar la despesa sense granja.

La classificació té un desament propi: no valida, comptabilitza ni modifica comptes, impostos, imports, assentaments o rebuts. Es pot canviar després de comptabilitzar i en exercicis tancats. El vincle es manté quan un document passa de revisió a recepció i comptabilització, sense crear una segona despesa organitzativa.

La pantalla de granges mostra les despeses classificades i permet filtrar per granja i grup. Els imports són els de la factura original; la classificació no en crea una còpia. En esborranys incomplets es poden mostrar imports pendents. Els documents reclassificats com a no factura no apareixen a la llista de despeses.

De moment, l’assignació és manual i cada factura es classifica en una sola granja i, opcionalment, un grup. No s’han activat regles automàtiques per proveïdor ni repartiments d’una factura entre diverses granges.

Les dades anteriors de lots i producció es conserven a `/granjas/produccio`, accessible des del mòdul per a les empreses que ja tenien aquesta funcionalitat. Els grups nous no són lots de producció ni comptes comptables.

La migració additiva `039_farm_organization.sql` crea `farm_expense_groups` i `farm_expense_assignments` i conserva les dades prèvies. Les còpies de seguretat inclouen grups i classificacions i en restauren els enllaços. Les modificacions utilitzen el permís existent `accounting_write` i queden registrades amb usuari i empresa; totes les consultes i assignacions es limiten a l’empresa activa.

Verificat amb 49 proves de MySQL i regressió (organització, producció existent, còpies de seguretat, buidatge d’exercicis i eliminació de factures), compilació del frontend i proves de navegador de creació de granges/grups i classificació des d’una factura. Les proves comproven explícitament que classificar no modifica el nombre de factures, assentaments o rebuts i que el vincle es conserva després de comptabilitzar i restaurar una còpia.
