# Phase 12 — Analyse des écarts de compétences

## Résultat
Module `competency-gaps` : pour un employé, compare le niveau **requis** par son poste au niveau **actuel** de chaque compétence requise.
C'est la fonctionnalité centrale de la GPEC. L'analyse est **calculée à la demande**, jamais stockée : elle reflète toujours la dernière évaluation
et les exigences actuelles du poste.

## Endpoint
| Méthode | Route | Accès | Réponse |
|---|---|---|---|
| GET | `/api/employees/:employeeId/gaps` | tout rôle, **dans son périmètre** (`AccessPolicy`) | 200 ; 400 ; 401 ; 403 ; 404 ; 409 |

Exemple de réponse :
```json
{
  "employee": { "id": "…", "firstName": "Mohamed", "lastName": "…" },
  "position": { "id": "…", "title": "Software Engineer" },
  "summary": { "requiredSkills": 4, "toDevelop": 2, "mastered": 1, "aboveRequirement": 1, "totalGap": 5 },
  "gaps": [
    { "skill": { "id": "…", "name": "Docker", "category": "TECHNICAL", "maxLevel": 5 },
      "currentLevel": 0, "requiredLevel": 3, "gap": 3, "status": "TO_DEVELOP", "priority": "HIGH", "evaluatedAt": null },
    { "skill": { "name": "Angular", "…": "…" },
      "currentLevel": 2, "requiredLevel": 4, "gap": 2, "status": "TO_DEVELOP", "priority": "MEDIUM", "evaluatedAt": "2026-01-10" }
  ]
}
```

## Règles de calcul (`gap-calculator.ts`, fonctions pures)
| Règle | Valeur |
|---|---|
| Écart | `niveau requis − niveau actuel` (exemple du cahier : 4 − 2 = 2) |
| `MASTERED` | écart = 0 |
| `TO_DEVELOP` | écart > 0 |
| `ABOVE_REQUIREMENT` | écart < 0 |
| Priorité | `HIGH` si écart ≥ 3, `MEDIUM` si = 2, `LOW` si = 1, `NONE` si écart ≤ 0 |
| Compétence requise jamais évaluée | niveau actuel **0**, `evaluatedAt: null` (le client peut distinguer « jamais évalué » d'un niveau réel) |
| Compétence détenue mais non requise par le poste | ignorée |
| Tri | plus grand écart d'abord, puis ordre alphabétique (ordre stable) |
| `summary.totalGap` | somme des écarts positifs uniquement (un dépassement n'en compense pas un autre) |

Le niveau actuel est celui de `employee_skills`, donc celui de la dernière évaluation (règle de la Phase 11, y compris le cas des évaluations antidatées).

## Erreurs et droits
| Cas | Code |
|---|---|
| Employé sans poste : pas de référence pour comparer | 409 |
| Employé inconnu ou supprimé logiquement | 404 |
| Hors périmètre (EMPLOYEE hors soi-même, MANAGER hors équipe) | 403, **avant** toute lecture : aucune fuite d'existence |
| Poste sans compétence requise | 200, `gaps: []`, résumé à zéro |
| Identifiant mal formé | 400 |
| Sans jeton | 401 |

ADMIN et HR consultent tous les employés ; un MANAGER ses subordonnés directs ; un EMPLOYEE lui-même (matrice de la Phase 3, UC5 et UC8).

## Performance
Trois requêtes quel que soit le nombre de compétences : l'employé avec son poste, les compétences requises avec leur définition, puis **tous** les
niveaux actuels d'un coup (`IN`). Aucune requête par compétence (pas de N+1), et aucune lecture de l'historique.

## Hors périmètre de cette phase
- **Formation recommandée** : la colonne du tableau du cahier (§12) arrive avec le module formations (Phase 13), qui enrichira chaque écart `TO_DEVELOP`.
- **Vues agrégées** (équipe, département, compétences les plus déficitaires) : Phase 14, qui réutilisera `CompetencyGapsService` et les fonctions pures exportées.
- L'écran Angular « Analyse des écarts de compétences » sera construit avec le frontend ; l'API fournit déjà tout son contenu.

## Tests
- **Unitaires (95 au total, 33 nouveaux)** : calcul pur (24 : écart, statut, priorité aux bornes −2 à 9, niveau 0 pour non évalué, tri stable sans mutation, résumé) ;
  service (9 : exemple du cahier des charges, jamais évalué, compétences hors poste ignorées, tri et résumé, une seule requête de niveaux, poste vide, 409, 404, périmètre vérifié avant lecture).
- **e2e (121 au total, 17 nouveaux)** sur la vraie base : poste exigeant Angular 4, Docker 3, SQL 2, Communication 3 face à un employé à Angular 2 / SQL 2 / Communication 4 :
  ordre, exemple 4 vs 2 = 2, Docker jamais évalué = écart 3 HIGH, maîtrisé, dépassement, résumé (`totalGap` 5), mise à jour immédiate après une nouvelle évaluation
  et après un changement de niveau requis, compétences hors poste ignorées, poste vide, 409/404/400/401, employé supprimé, périmètre EMPLOYEE / MANAGER / HR / ADMIN et absence de fuite d'existence.
  La base est vide après exécution.
