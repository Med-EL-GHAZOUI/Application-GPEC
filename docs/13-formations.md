# Phase 13 — Formations et recommandations

## Résultat
Module `trainings` : catalogue de formations, inscriptions des employés avec capacité garantie, et recommandation de formations à partir des
écarts de compétences (Phase 12). La colonne « Formation recommandée » du cahier des charges (§12) est maintenant remplie.

## Endpoints
| Méthode | Route | Accès | Réponse |
|---|---|---|---|
| GET | `/api/trainings` | tout rôle authentifié | 200 catalogue paginé |
| GET | `/api/trainings/:id` | tout rôle authentifié | 200 ; 404 |
| POST / PATCH / DELETE | `/api/trainings[/:id]` | ADMIN, HR | 201 / 200 / 204 ; 400 ; 404 ; 409 |
| GET | `/api/trainings/:id/enrollments` | ADMIN, HR | 200 participants paginés |
| POST | `/api/trainings/:id/enrollments` | ADMIN, HR | 201 inscription ; 404 ; 409 |
| PATCH | `/api/trainings/:id/enrollments/:employeeId` | ADMIN, HR | 200 ; 404 ; 409 |
| GET | `/api/employees/:employeeId/trainings` | tout rôle, **dans son périmètre** | 200 |
| GET | `/api/employees/:employeeId/gaps` (Phase 12) | tout rôle, dans son périmètre | chaque écart `TO_DEVELOP` porte `recommendedTraining` |
| GET | `/api/employees/:employeeId/training-recommendations` | ADMIN, HR, MANAGER (son équipe) | 200 alternatives classées par compétence à développer |

Catalogue : `?search=` (titre, nom de la compétence, organisme), `?skillId=`, `?status=`, `?level=` (niveau cible exact), `?page=&limit=`.
Tri : date de début la plus proche d'abord, formations sans date en dernier. Chaque formation renvoie `capacity`, `enrolledCount` et `availableSeats`.

## Règles du catalogue
| Règle | Comportement |
|---|---|
| Niveau cible ≤ niveau maximum de la compétence (revérifié si la compétence ou le niveau change) | 400 |
| Durée ≥ 1 h, capacité ≥ 1, date `YYYY-MM-DD` valide, statut parmi `PLANNED OPEN IN_PROGRESS COMPLETED CANCELLED` (défaut `PLANNED`) | 400 |
| Compétence inconnue | 404 |
| La capacité ne peut pas descendre sous le nombre d'inscriptions actives | 409 |
| Une formation qui a des inscriptions ne se supprime pas : on la passe à `CANCELLED` | 409 |
| Le niveau maximum d'une compétence ne peut pas passer sous le niveau cible d'une formation (en plus des postes et des employés) | 409 |
| Une compétence qui a des formations ne se supprime pas | 409 |
| `null` efface l'organisme ou la date de début (PATCH) | — |

## Règles des inscriptions
| Règle | Comportement |
|---|---|
| Seule une formation **`OPEN`** accepte des inscriptions | 409 |
| Capacité jamais dépassée : la ligne de la formation est verrouillée (`FOR UPDATE`) le temps de la transaction | 409 |
| Un place est occupée par toute inscription non annulée (inscrit, en cours, terminée) ; **annuler libère la place** | — |
| Pas de double inscription ; une inscription annulée est **réactivée** (une seule ligne par employé et formation) | 409 / 201 |
| Un employé `INACTIVE` ne peut pas être inscrit | 409 |
| Transitions : `ENROLLED → IN_PROGRESS \| COMPLETED \| CANCELLED`, `IN_PROGRESS → COMPLETED \| CANCELLED` ; `COMPLETED` et `CANCELLED` sont **définitifs** | 409 |
| `completedAt` est renseigné à la fin de la formation, et seulement alors | — |
| Inscrire et suivre : ADMIN et HR (matrice de la Phase 3, UC15) ; un MANAGER ne peut pas inscrire | 403 |

Terminer une formation **ne modifie pas** le niveau de la compétence : c'est un manager ou HR qui réévalue ensuite l'employé (Phase 11).

## Recommandation (cœur de la phase)
Pour chaque compétence à développer (`TO_DEVELOP`) :

1. **Candidates** : formations de cette compétence au statut `PLANNED` ou `OPEN`, **non complètes**, que l'employé ne suit pas et n'a pas suivies
   (une inscription annulée ne l'exclut pas). Une seule requête pour toutes les compétences, capacité et historique filtrés en SQL.
2. **Utiles** : niveau cible **strictement supérieur** au niveau actuel de l'employé.
3. **Classement** : la plus proche du niveau requis d'abord ; à égalité de distance, celle qui **atteint** le besoin avant celle qui reste en dessous ;
   puis la date de début la plus proche (sans date en dernier) ; puis le titre (ordre stable).

Exemple du cahier : Angular requis 4, actuel 2 → « Angular Advanced » (niveau cible 4). Sont écartées : « Angular Intro » (niveau 2, n'améliore rien),
les formations annulées, terminées, en cours, pleines, et celles déjà suivies. Si l'employé s'inscrit à « Advanced », la suivante devient la recommandation ;
s'il annule, « Advanced » revient en tête. Quand il progresse (nouvelle évaluation), les formations qui ne l'aident plus disparaissent ; quand l'écart est comblé,
il n'y a plus de recommandation.

- `GET /employees/:id/gaps` : la meilleure formation par écart (`recommendedTraining`, ou `null`).
- `GET /employees/:id/training-recommendations` : jusqu'à 5 alternatives classées par compétence à développer, du plus grand écart au plus petit
  (un MANAGER « recommande » ainsi une formation à son équipe ; une compétence maîtrisée n'y figure pas).
- Un EMPLOYEE voit la formation recommandée dans ses propres écarts, mais pas la liste d'alternatives (403).

Le classement est une fonction pure (`recommendation-ranker.ts`), testée seule.

## Modèle
Migration `1731900000000-CreateTrainings` : types `training_status` et `enrollment_status`, tables `trainings` (`CHECK` niveau ≥ 1, durée > 0, capacité > 0 ;
`skill_id` en `RESTRICT`) et `employee_trainings` (unicité `(employee_id, training_id)`, `employee` en `CASCADE`, `training` en `RESTRICT`), index sur la compétence,
le statut et la formation.

## Écarts et points d'attention
- **Statuts recommandables : `PLANNED` et `OPEN`**, mais l'inscription n'est possible qu'en `OPEN` : une formation planifiée est proposée à titre d'information
  et devient inscriptible à son ouverture. Le champ `status` est renvoyé pour que l'interface le montre.
- **« Recommander » = consulter** : aucune recommandation n'est enregistrée en base ; elle est recalculée à chaque appel pour rester cohérente avec les évaluations
  et le catalogue. Un suivi des recommandations transmises serait un ajout séparé.
- `employee_trainings` n'a pas de colonnes `created_at`/`updated_at` : `enrolled_at` et `completed_at` suffisent à l'historique.
- Le contrat de `GET /employees/:id/gaps` (Phase 12) gagne le champ `recommendedTraining` sur chaque écart ; les autres champs sont inchangés.

## Tests
- **Unitaires (150 au total, 55 nouveaux)** : classement (9 : exemple du cahier, niveau non amélioré, distance, atteint vs insuffisant, dates, titre, vide, niveau 0, sans mutation) ;
  inscriptions (verrou de la ligne, statuts non ouverts, plein, doublons, réactivation, employé inactif, 404, toutes les transitions autorisées et refusées, date de fin) ;
  catalogue (niveau, 404, capacité, suppression) ; recommandations (une requête, plafond par compétence, places libres) ; écarts avec formation.
- **e2e (150 au total, 29 nouveaux)** sur la vraie base : droits par rôle, validations, tri et filtres, capacité **sous 4 inscriptions simultanées pour 2 places** (exactement 2 réussites),
  libération et réactivation, transitions, périmètre, et le scénario de recommandation complet (classement, exclusions, suivi d'une formation, progression de l'employé,
  droits sur la liste d'alternatives). Exécutés deux fois de suite sans échec. La base est vide après exécution.
