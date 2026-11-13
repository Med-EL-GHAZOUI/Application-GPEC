# Phase 14 — Dashboard RH

## Résultat
Module `dashboard` : toutes les données du tableau de bord (totaux, écarts, graphiques) en un appel, calculées par des **agrégations SQL** exécutées en parallèle.
Aucun chiffre n'exige de boucler sur les employés dans l'application.

## Endpoints
| Méthode | Route | Accès | Réponse |
|---|---|---|---|
| GET | `/api/dashboard` | ADMIN, HR (toute l'entreprise) ; MANAGER (ses subordonnés directs) | 200 ; 400 ; 401 ; 403 ; 404 |
| GET | `/api/dashboard/skills-evolution` | idem | 200 série mensuelle |

EMPLOYEE : 403. Paramètres : `limit` (1–20, défaut 5) pour toutes les listes « top », `months` (1–36, défaut 12), `skillId` (facultatif). Un paramètre inconnu est refusé (400),
une compétence inconnue donne 404.

## Contenu de la réponse (§15 du cahier)
| Bloc | Contenu |
|---|---|
| `scope` | `COMPANY` ou `TEAM` |
| `totals` | `employees`, `activeEmployees`, `departments`, `positions`, `skills`, `trainings`, `trainingsInProgress`, `employeesInTraining` |
| `gaps` | `employeesWithGaps`, `employeesWithHighPriorityGap`, `criticalSkills` (nombre) |
| `employeesByDepartment` | effectif par département (graphique « répartition par département ») |
| `demandedSkills` | compétences les plus demandées : nombre d'employés dont le poste les exige, et nombre de postes |
| `deficientSkills` | compétences les plus déficitaires : employés concernés, à développer, **écart total** |
| `criticalSkills` | compétences où quelqu'un a un écart `HIGH` (≥ 3) : nombre d'employés, plus grand écart |
| `employeesWithGaps` | employés aux plus gros écarts : écart total, nombre d'écarts `HIGH`, compétences à développer |
| `trainingsByStatus` | les 5 statuts, zéros inclus, dans l'ordre du cycle de vie |
| `skillsEvolution` | un point par mois (le plus ancien d'abord) : niveau moyen des évaluations du mois et nombre d'évaluations |

## Périmètre
- **ADMIN et HR** : toute l'entreprise. Départements et postes comptent ceux du référentiel, y compris vides.
- **MANAGER** : ses subordonnés directs (même règle que `AccessPolicy`). Départements et postes = ceux de l'équipe ; les départements vides sont masqués.
  Les compétences et formations du **catalogue** sont les mêmes pour tous (lisibles par tous les rôles).
- Un manager sans fiche employé voit une équipe vide (identifiant qui ne correspond à personne), mais le catalogue.
- Tous les filtres de périmètre sont en SQL, avec un paramètre commun `$1` : aucune liste d'employés n'est chargée puis filtrée en code.

## Définitions
| Notion | Définition |
|---|---|
| Écart | `niveau requis − niveau actuel`, 0 si jamais évalué (identique au calcul de la Phase 12) |
| Effectif pris en compte | employés non supprimés ; les `INACTIVE` comptent comme employés mais sont **exclus des analyses d'écarts** |
| Compétence demandée | exigée par le poste d'un employé de l'effectif |
| Compétence déficitaire | au moins un employé avec un écart > 0 ; classée par somme des écarts positifs |
| Compétence critique | au moins un employé avec un écart ≥ 3 (`HIGH_PRIORITY_GAP`, la constante des Phases 12) |
| Employé avec écarts importants | classé par somme des écarts positifs, puis par nombre d'écarts `HIGH` |
| Formations en cours | formations au statut `IN_PROGRESS` ; `employeesInTraining` = employés du périmètre avec une inscription `IN_PROGRESS` |
| Évolution | moyenne des niveaux des **évaluations enregistrées** dans le mois (pas l'état de l'effectif à la fin du mois) ; mois sans évaluation : `averageLevel: null` |

## Cohérence avec la Phase 12
La règle d'écart est écrite deux fois : en TypeScript (`gap-calculator.ts`) pour un employé, en SQL (`dashboard.queries.ts`) pour l'agrégat. Pour qu'elles ne divergent pas,
le seuil `HIGH_PRIORITY_GAP` est importé, et un test e2e compare, pour chaque employé du jeu d'essai, l'écart total, le nombre de compétences à développer et le nombre d'écarts `HIGH`
du dashboard avec `GET /employees/:id/gaps`.

## Performance
Neuf requêtes d'agrégation lancées en parallèle (une par bloc), plus une seule vérification d'existence quand `skillId` est fourni. Les jointures s'appuient sur les index existants
(`position_skills`, `employee_skills`, `skill_evaluations (employee_id, skill_id, evaluated_at)`). La série mensuelle vient de `generate_series` : les mois vides sont produits par la base.

## Écarts et points d'attention
- **Pas de réutilisation de `CompetencyGapsService`** (le graphe de la Phase 4 le prévoyait) : l'appeler employé par employé aurait demandé une requête par personne.
  Le calcul est donc refait en SQL, avec le test de cohérence ci-dessus.
- Les totaux « départements » et « postes » d'un manager décrivent son équipe, pas l'entreprise ; `skills` et `trainings` restent ceux du catalogue.
- **Tests e2e exécutés fichier par fichier** (`fileParallelism: false`) : tous partagent une même base et le dashboard mesure des chiffres globaux qu'un autre fichier perturberait.
  Les totaux de l'entreprise sont comparés à une base de référence relevée avant les données d'essai ; les chiffres d'équipe sont absolus.
- Le dashboard **ne met rien en cache** : les chiffres sont toujours ceux du moment (testé : une évaluation, un statut inactif ou une suppression sont visibles immédiatement).
  Un cache court pourra être ajouté si le volume l'exige.

## Tests
- **Unitaires (162 au total, 12 nouveaux)** : correspondance requête → contrat, périmètre ADMIN/HR (`NULL`) et MANAGER (identifiant de l'équipe, identifiant sans correspondance), départements vides masqués pour une équipe,
  statuts de formation complétés, `limit` transmis et liste critique tronquée (mais comptée en entier), seuil partagé avec la Phase 12, entreprise vide, évolution filtrée et 404.
- **e2e (178 au total, 28 nouveaux)** sur la vraie base, avec des chiffres connus (3 employés suivis, 2 postes, 5 compétences) : accès par rôle, validation, vue équipe absolue
  (effectifs, demande, déficits `Angular 3/2/4`, `Docker 2/1/3`, `SQL 2/1/1`, critique, classement des employés, statuts, évolution sur 12 mois avec moyennes 1, 2,5 et 2,5),
  vue entreprise par différence (un employé `INACTIVE` exclu des analyses mais compté comme employé), cohérence avec `/employees/:id/gaps`, évolution par compétence, absence de fuite entre équipes,
  manager sans fiche, et fraîcheur (nouvelle évaluation, employé rendu inactif, employé supprimé). La base est vide après exécution.
