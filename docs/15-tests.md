# Phase 15 — Tests

## État
Les tests ont été écrits phase par phase (chaque phase est livrée avec ses tests). La Phase 15 est donc un **audit** : mesure de la couverture, tests des zones
restées sans test, vérification systématique des permissions, et un garde-fou de couverture.

| Suite | Fichiers | Tests | Base de données |
|---|---|---|---|
| Unitaires (`npm test`) | 23 | 199 | non |
| e2e / API (`npm run test:e2e`) | 10 | 204 | oui (PostgreSQL réel) |
| **Total (`npm run test:cov:all`)** | **33** | **403** | |

## Commandes
```bash
cd backend
npm run db:up          # PostgreSQL (Docker), nécessaire pour l'e2e
npm test               # unitaires, sans base
npm run test:e2e       # API de bout en bout sur la vraie base, fichier par fichier
npm run test:cov       # couverture des unitaires seuls
npm run test:cov:all   # couverture unitaires + e2e, avec seuils (échoue en dessous)
```
`test:cov:all` écrit un rapport HTML dans `backend/coverage/` (ignoré par Git).

## Couverture (unitaires + e2e)
| Mesure | Résultat | Seuil imposé |
|---|---|---|
| Instructions | 100 % (848/848) | 98 % |
| Lignes | 100 % (832/832) | 98 % |
| Fonctions | 100 % (259/259) | 98 % |
| Branches | 93,4 % (367/393) | 90 % |

Les seuils, dans `vitest.config.cov.ts`, sont réglés un peu **sous** les valeurs mesurées : une baisse de couverture fait échouer la commande (vérifié avec un seuil impossible).
Les branches restantes sont des gardes défensives (`?.`, valeurs par défaut) qui n'ont pas de scénario métier propre.

**Ce que la couverture ne couvre pas, par choix** : les DTO et entités (classes déclaratives : décorateurs et métadonnées, sans logique), les fichiers `*.module.ts`,
`main.ts` (amorçage), les migrations, le seed et `data-source.ts`. Ils sont exercés indirectement (l'application démarre et les migrations s'appliquent dans chaque test e2e),
mais ne sont pas mesurés. Une couverture de 100 % ne prouve pas l'absence de défaut : elle prouve que chaque ligne mesurée est exécutée par au moins un test.

## Priorités du cahier (§22) et où elles sont testées
| Priorité | Tests |
|---|---|
| Authentification | `auth.service.spec` (connexion, rotation et rejeu du refresh token, déconnexion, compte désactivé), `auth.service.robustness.spec` (hachage corrompu : 401 et non 500), `users.service.spec`, `auth.e2e-spec` (cycle complet, 429 sur trop d'essais), `edge-cases.e2e-spec` (inscriptions simultanées, email inconnu sans fuite) |
| Permissions | `permissions.e2e-spec` (voir ci-dessous), `roles.guard.spec`, `access-policy.service.spec`, et le périmètre manager/employé testé dans chaque suite e2e |
| CRUD employés | `employees.service.spec` et `.errors.spec`, `core-crud.e2e-spec`, `edge-cases.e2e-spec` (doublons simultanés, renommage en doublon, filtres) |
| CRUD compétences | `skills.service.spec`, `core-crud.e2e-spec`, `edge-cases.e2e-spec` |
| Calcul des écarts | `gap-calculator.spec` (fonctions pures, bornes), `competency-gaps.service.spec`, `competency-gaps.e2e-spec` (exemple du cahier 4 − 2 = 2) |
| Recommandations de formations | `recommendation-ranker.spec`, `training-recommendations.service.spec`, `trainings.e2e-spec` (scénario complet) |

## Matrice des permissions (`test/permissions.e2e-spec.ts`)
Ce fichier **découvre automatiquement toutes les routes** depuis les contrôleurs (50 routes) et vérifie les règles d'accès route par route :
- les **seules routes publiques** sont `POST /auth/login`, `POST /auth/refresh` et `GET /health` ;
- toute autre route répond **401** sans jeton et avec un jeton invalide ;
- les 29 routes réservées à des rôles ont **exactement** les rôles documentés (tableau de la Phase 3, reproduit dans le test) : une nouvelle route restreinte, ou un rôle élargi par erreur, fait échouer le test ;
- chaque rôle **non listé** reçoit **403** sur chacune de ces routes, et ADMIN / HR ne reçoivent jamais 401 ou 403 sur une route qui les liste ;
- le document OpenAPI contient chaque route, avec la sécurité par jeton **si et seulement si** la route n'est pas publique.

## Ce que l'audit a ajouté
- **37 tests unitaires** : `users.service` (unicité en concurrence, hachage), `departments.service` et `skills.service` (qui n'avaient que des tests e2e : conflits, garde du niveau maximum
  face aux postes, employés et formations), erreurs de base de données de `employees` et `positions`, authentification robuste, classement des formations sans date.
- **15 tests e2e** de cas limites, dont deux **courses** réelles : deux créations d'employé de même matricule et deux inscriptions du même email lancées en parallèle (exactement une réussit à chaque fois, la base ne contient jamais de doublon).
- **11 tests e2e** de la matrice des permissions.
- Les tests e2e s'exécutent **un fichier à la fois** (`fileParallelism: false`), car ils partagent une base et le dashboard mesure des totaux globaux.

## Ce qui n'est pas couvert
- **Frontend : aucun test, car il n'existe pas encore.** Le cahier prévoit des tests Angular (services, composants, guards) ; ils viendront avec l'application Angular.
- **Pas de test de charge ni de performance**, et pas de test de sécurité automatisé (injection, fuzzing) au-delà de la validation des entrées et du contrôle d'accès ci-dessus.
- Les tests e2e dépendent d'une base PostgreSQL réelle ; il n'y a pas encore d'intégration continue qui la fournit (Phase 17).
