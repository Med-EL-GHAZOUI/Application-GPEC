# Phase 10 — Compétences des employés

## Résultat
Module `employee-skills` : le niveau courant de chaque employé pour chaque compétence (relation
Employee N-N Skill), avec date d'évaluation, évaluateur et commentaire.

## Endpoints
| Méthode | Route | Accès | Réponse |
|---|---|---|---|
| GET | `/api/employees/:employeeId/skills` | tout rôle, **dans son périmètre** (`AccessPolicy`) | 200 liste triée par nom de compétence ; 403 ; 404 |
| PUT | `/api/employees/:employeeId/skills/:skillId` | HR ; MANAGER pour ses subordonnés directs | 200 niveau enregistré ; 400 ; 403 ; 404 |
| DELETE | `/api/employees/:employeeId/skills/:skillId` | ADMIN, HR | 204 ; 404 |

Corps du `PUT` : `{ "level": 4, "evaluatedAt": "2026-03-01", "comment": "…" }` (`evaluatedAt` et `comment` facultatifs).
Réponse : `{ skill: { id, name, category, maxLevel }, level, evaluatedAt, evaluator: { id, firstName, lastName } | null, comment }`.

`PUT` est idempotent : il crée le lien ou remplace le niveau (une seule ligne par couple employé/compétence, garantie par une
contrainte d'unicité et par un `INSERT … ON CONFLICT` atomique).

## Règles
| Règle | Comportement |
|---|---|
| Niveau entre 1 et le niveau maximum de la compétence (et ≤ 10) | 400 |
| Date d'évaluation au format `YYYY-MM-DD` valide, par défaut aujourd'hui, jamais dans le futur | 400 |
| L'évaluateur est l'employé lié au compte de l'appelant ; `null` si le compte n'a pas de fiche (HR « technique ») | — |
| Interdiction de s'évaluer soi-même | 403 |
| ADMIN et EMPLOYEE ne peuvent pas évaluer (cohérent avec la Phase 3) | 403 |
| MANAGER : uniquement ses subordonnés directs | 403 |
| Le périmètre est vérifié **avant** l'existence de l'employé : un appelant hors périmètre reçoit 403, sans savoir si l'employé existe | 403 / 404 |
| Le niveau maximum d'une compétence ne peut plus passer sous un niveau détenu par un employé (en plus de ceux exigés par un poste) | 409 |
| Une compétence détenue par un employé ne peut pas être supprimée | 409 |
| Un employé supprimé logiquement garde ses lignes (historique) mais n'est plus consultable | 404 |

## Modèle
Migration `1731700000000-CreateEmployeeSkills` : table `employee_skills`
(`employee_id`, `skill_id`, `level`, `evaluated_at`, `evaluator_id`, `comment`), unicité `(employee_id, skill_id)`,
`CHECK level >= 1`, clés étrangères `employee` en `CASCADE`, `skill` en `RESTRICT`, `evaluator` en `SET NULL`,
index sur `skill_id`.

## Écarts avec le modèle de données (Phase 6)
- `employee_skills` reçoit **`evaluator_id` et `comment`** (le modèle initial ne listait que `level` et `evaluated_at`) : le
  cahier des charges (§10) demande l'évaluateur et le commentaire sur la relation elle-même.
- Le `PUT` écrit aujourd'hui **seulement le niveau courant**. À la Phase 11, il passera par le service d'évaluation afin
  que **chaque** changement de niveau crée aussi une ligne d'historique `SkillEvaluation` (règle R4) ; les routes ne changent pas.

## Tests
- **Unitaires (58 au total, 11 nouveaux)** : évaluateur et date par défaut, périmètre vérifié en premier, niveau au-dessus du
  maximum et égal au maximum, date future et passée, auto-évaluation, compétence ou employé inconnu, suppression, lecture.
- **e2e (83 au total, 17 nouveaux)** sur la vraie base : évaluation par un manager (évaluateur enregistré), remplacement sans
  doublon, HR sans fiche (évaluateur `null`), refus hors équipe / soi-même / EMPLOYEE / ADMIN, niveaux et dates invalides,
  champs inconnus, 404, lecture selon le périmètre sans fuite d'existence, 401, garde du niveau maximum (409), suppression
  (manager refusé, HR et ADMIN autorisés), conservation des lignes après suppression logique. La base est vide après exécution.
