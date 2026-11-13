# Phase 9 — CRUD principaux

## Résultat
Modules `departments`, `skills`, `positions` (avec compétences requises par poste) et `employees`, la migration
`CreateCoreTables`, la politique d'accès `AccessPolicy`, la pagination serveur et la suppression logique.

## Endpoints
Lecture : tout utilisateur authentifié (sauf mention). Écriture : ADMIN et HR.

| Ressource | Routes |
|---|---|
| Départements | `GET /departments`, `GET /departments/:id`, `POST`, `PATCH /:id`, `DELETE /:id` |
| Compétences | `GET /skills` (filtre `category`), `GET /skills/:id`, `POST`, `PATCH /:id`, `DELETE /:id` |
| Postes | `GET /positions` (filtres `departmentId`, `level`), `GET /positions/:id`, `POST`, `PATCH /:id`, `DELETE /:id` |
| Compétences d'un poste | `GET /positions/:id/skills`, `POST /positions/:id/skills`, `PATCH /positions/:id/skills/:skillId`, `DELETE /positions/:id/skills/:skillId` |
| Employés | `GET /employees` (ADMIN, HR, MANAGER), `GET /employees/me`, `GET /employees/:id`, `POST`, `PATCH /:id`, `DELETE /:id` (ADMIN, HR) |

Toutes les listes acceptent `?page=1&limit=10&search=…` et renvoient `{ data, total, page, limit }`
(`limit` ≤ 100). Les employés se filtrent aussi par `departmentId`, `positionId`, `managerId` et `status` ;
la recherche porte sur nom, prénom, email, matricule, département et poste.

## Contrôle de périmètre (`AccessPolicy`)
| Rôle | Liste `/employees` | Lecture `/employees/:id` |
|---|---|---|
| ADMIN, HR | tous | tous |
| MANAGER | ses **subordonnés directs** | lui-même et ses subordonnés directs |
| EMPLOYEE | refusé (403) | lui-même uniquement (403 sinon) |

- Un compte est relié à un employé par `employees.user_id` ; un compte sans fiche employé n'accède à rien de personnel.
- Un manager ne peut pas élargir son périmètre avec un filtre (`managerId` est combiné par ET avec son propre périmètre).
- L'employé qui consulte son profil voit son manager réduit à `{ id, firstName, lastName }` : jamais son email ni son téléphone.
- `AccessPolicy` est exportée par `EmployeesModule` pour les modules évaluations et écarts (phases 11 et 12).

## Règles métier appliquées
| Règle | Comportement |
|---|---|
| Unicité (départements, compétences, poste par département) | 409 |
| Matricule et email d'employé uniques **parmi les employés actifs** | 409 ; réutilisables après suppression |
| R6 : un employé ne peut pas être son propre manager | 400 |
| Pas de cycle hiérarchique (A → B → A, chaînes plus longues) | 400 |
| Un compte de connexion = au plus un employé | 409 |
| Référence inconnue (département, poste, manager, compétence, compte) | 404 |
| Niveau requis d'un poste ≤ niveau maximum de la compétence | 400 |
| Le niveau maximum d'une compétence ne peut pas passer sous un niveau déjà exigé par un poste | 409 |
| Suppression d'un département / compétence / poste encore utilisé | 409 |
| Suppression d'un employé qui a encore des subordonnés | 409 |
| R7 : suppression d'un employé = logique (`deleted_at`) ; son compte est **désactivé et délié** | 204 |
| Dates d'embauche au format `YYYY-MM-DD` valide | 400 |

Pour `PATCH /employees/:id`, la valeur `null` efface un lien optionnel (poste, manager, compte).

## Modèle et migration
`1731600000000-CreateCoreTables` crée `departments`, `skills`, `positions`, `position_skills`, `employees`,
les trois énumérations, les contraintes `CHECK`, les clés étrangères (`RESTRICT` sauf `position_skills → positions`
en `CASCADE`, et `SET NULL` pour manager et compte) et les index du modèle de données (Phase 6),
dont les index uniques partiels sur `employees`.

## Écarts et points d'attention
- **Rôle du manager (modèle de données §5)** : je n'impose pas que le manager soit « de rôle MANAGER ou HR », car le rôle
  appartient au compte et non à la fiche employé. Un manager doit exister et ne pas créer de cycle ; c'est son compte
  MANAGER qui lui donne l'accès à son équipe.
- **Périmètre manager** : sous-ordonnés **directs** seulement, pas la hiérarchie complète. Étendre aux sous-niveaux est un
  changement localisé dans `AccessPolicy` si besoin.
- **404 pour une référence dans le corps** (par exemple un `departmentId` inconnu à la création d'un poste), en cohérence
  avec le tableau des codes HTTP du cahier des charges.
- **Noms de contraintes** : la migration porte des noms explicites ; les entités n'ont pas les mêmes noms automatiques.
  `migration:generate --check` signale donc une différence de **nommage uniquement** (mêmes règles, mêmes `ON DELETE`).
  Les migrations restent écrites à la main et listées dans `src/database/migrations/index.ts`.
- `backend/tsconfig.build.tsbuildinfo` (artefact de build) avait été commité par erreur en Phase 7 : il n'est plus suivi
  et `*.tsbuildinfo` est dans `.gitignore`.
- L'affectation d'une compétence à un **employé** et son historique d'évaluations arrivent aux Phases 10 et 11 ; la vérification
  « niveau maximum ≥ niveaux déjà évalués » sera ajoutée à ce moment.

## Tests
- **Unitaires (47 au total)** : `AccessPolicy` (7 cas), `EmployeesService` (manager lui-même, cycle, manager inconnu, département
  inconnu, suppression avec subordonnés, désactivation du compte, périmètre manager), `PositionsService` (niveau requis).
- **e2e (66 au total, 47 nouveaux)** sur la vraie base : droits par rôle, doublons (violation d'unicité réelle), validations,
  pagination et recherche (dont `%` littéral), filtres, périmètre EMPLOYEE et MANAGER, mise à jour avec `null`, cycle,
  suppression logique avec réutilisation du matricule, désactivation du compte supprimé. La base est vide après exécution.
