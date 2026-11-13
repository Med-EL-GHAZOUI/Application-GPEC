# Phase 11 — Évaluations et historique

## Résultat
Module `evaluations` : chaque évaluation est **ajoutée** à un historique immuable et met à jour le niveau courant
(`employee_skills`) dans une seule transaction. On peut ainsi suivre l'évolution d'un employé
(2026 : Angular 3, 2027 : Angular 4).

## Endpoints
| Méthode | Route | Accès | Réponse |
|---|---|---|---|
| POST | `/api/evaluations` | HR ; MANAGER pour ses subordonnés directs | 201 évaluation enregistrée ; 400 ; 403 ; 404 |
| GET | `/api/employees/:employeeId/evaluations` | tout rôle, **dans son périmètre** | 200 historique paginé, du plus récent au plus ancien |
| GET | `/api/employees/:employeeId/skills/:skillId/evolution` | tout rôle, dans son périmètre | 200 progression, de la plus ancienne à la plus récente |
| PUT | `/api/employees/:employeeId/skills/:skillId` (Phase 10) | HR ; MANAGER (équipe) | 200 — **passe désormais par le service d'évaluation** |

Corps du `POST` : `{ employeeId, skillId, level, evaluatedAt?, comment? }`.
Filtres de l'historique : `?skillId=…&search=…&page=1&limit=10` (`search` porte sur le nom de la compétence et le commentaire).
Il n'existe **aucune** route pour modifier ou supprimer une évaluation (`PATCH`/`PUT`/`DELETE /evaluations/:id` → 404).

## Règles
| Règle | Comportement |
|---|---|
| R4 : l'historique n'est jamais écrasé ; chaque évaluation ajoute une ligne | — |
| Historique + niveau courant écrits dans **une transaction** : jamais l'un sans l'autre | — |
| Niveau entre 1 et le niveau maximum de la compétence | 400 |
| Date `YYYY-MM-DD` valide, par défaut aujourd'hui, jamais dans le futur | 400 |
| Seuls HR et MANAGER évaluent ; ADMIN et EMPLOYEE refusés | 403 |
| MANAGER : uniquement ses subordonnés directs ; personne ne s'évalue soi-même | 403 |
| Le périmètre est contrôlé **avant** l'existence de l'employé (pas de fuite d'existence) | 403 / 404 |
| Une évaluation **antidatée** est conservée dans l'historique mais ne remplace pas un niveau courant plus récent | — |
| Même jour : la dernière évaluation enregistrée devient le niveau courant | — |
| Une compétence qui a un historique ne peut plus être supprimée, même si le lien employé est retiré | 409 |
| Un employé supprimé logiquement garde son historique, mais n'est plus consultable | 404 |

Le niveau courant est mis à jour par un seul `INSERT … ON CONFLICT DO UPDATE … WHERE evaluated_at <= nouvelle date` : pas de lecture puis
écriture, donc pas de course entre évaluations simultanées (testé avec 5 évaluations en parallèle).

## Modèle
Migration `1731800000000-CreateSkillEvaluations` : table `skill_evaluations`
(`employee_id`, `skill_id`, `evaluator_id`, `level`, `evaluated_at`, `comment`, `created_at`), `CHECK level >= 1`,
index `(employee_id, skill_id, evaluated_at DESC)` pour l'historique, clés étrangères `employee` en `CASCADE`, `skill` en `RESTRICT`,
`evaluator` en `SET NULL`. La migration **recopie** les niveaux déjà saisis en Phase 10 dans l'historique.

## Écarts avec les phases précédentes
- **`evaluator_id` est nullable** dans `skill_evaluations` (le modèle de la Phase 6 le disait obligatoire) : en Phase 10 un compte HR sans fiche
  employé peut évaluer, avec un évaluateur `null`. Imposer l'évaluateur reviendrait à retirer cette possibilité déjà livrée et testée.
  L'immuabilité repose sur l'absence de routes d'écriture, pas sur un déclencheur SQL (qui bloquerait aussi la suppression en cascade).
- **Le test de la Phase 10 « le dernier `PUT` gagne » a été corrigé** : un `PUT` antidaté ne remplace plus un niveau plus récent. C'est la règle voulue
  pour qu'un rattrapage de saisie ne fasse pas régresser le niveau courant.
- Le niveau maximum d'une compétence est contrôlé contre les niveaux **courants** des employés et les exigences des postes, pas contre l'historique
  (l'historique est une trace de l'échelle de l'époque).

## Tests
- **Unitaires (62 au total, 15 nouveaux)** : transaction unique (historique + niveau courant), requête qui ne laisse un niveau plus récent intact,
  aucune écriture hors périmètre ou si niveau/date invalides, auto-évaluation, 404, ordre de la progression ; `EmployeeSkillsService` délègue bien au service d'évaluation.
- **e2e (104 au total, 21 nouveaux)** sur la vraie base : évaluation par un manager, niveau courant 3 → 4, évaluation antidatée, même jour, évaluations
  concurrentes, passage par le `PUT` de la Phase 10, droits (manager hors équipe, soi-même, EMPLOYEE, ADMIN, 401), entrées invalides sans écriture,
  absence de routes de modification, historique paginé et filtré (dont `%` littéral), progression ordonnée, périmètre, conservation après retrait du lien
  et après suppression logique. La base est vide après exécution.
