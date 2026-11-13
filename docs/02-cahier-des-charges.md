# Phase 2 — Cahier des charges

## 1. Présentation
Application web GPEC (Gestion Prévisionnelle des Emplois et des Compétences) : Angular (frontend),
NestJS + TypeORM (API REST), PostgreSQL, authentification JWT, RBAC.

## 2. Rôles
| Rôle | Droits |
|---|---|
| ADMIN | Tout, dont utilisateurs et paramètres |
| HR | CRUD employés, départements, postes, compétences, formations ; évaluations ; écarts |
| MANAGER | Lecture de son équipe ; évaluation ; écarts ; recommandation de formations |
| EMPLOYEE | Lecture de son profil, compétences, évaluations, formations |

Le périmètre (équipe / soi-même) est vérifié côté service, en plus du rôle.

## 3. Exigences fonctionnelles
| ID | Exigence | Rôles |
|---|---|---|
| F-AUTH-1 | Connexion, déconnexion, rafraîchissement du token | Tous |
| F-AUTH-2 | Création de comptes (`/auth/register`) | ADMIN |
| F-AUTH-3 | Consultation du compte courant (`/auth/me`) | Tous |
| F-EMP-1 | CRUD employés (matricule, nom, prénom, email, téléphone, embauche, poste, département, statut, manager) | HR, ADMIN |
| F-EMP-2 | Recherche, filtre, pagination des employés | HR, ADMIN, MANAGER (équipe) |
| F-EMP-3 | Profil : compétences, évaluations, formations | Selon périmètre |
| F-DEP-1 | CRUD départements (1 département — N employés) | HR, ADMIN |
| F-POS-1 | CRUD postes (titre, description, département, niveau) | HR, ADMIN |
| F-POS-2 | Compétences requises par poste avec niveau minimum (`PositionSkill`) | HR, ADMIN |
| F-SKL-1 | Référentiel de compétences (nom, description, catégorie, niveau max) | HR, ADMIN |
| F-EVA-1 | Évaluer une compétence d'un employé (niveau, date, évaluateur, commentaire) | MANAGER, HR |
| F-EVA-2 | Historique des évaluations conservé et consultable | Selon périmètre |
| F-GAP-1 | Calcul des écarts d'un employé (compétence, actuel, requis, écart, priorité, formation recommandée) | HR, MANAGER, EMPLOYEE (soi) |
| F-TRN-1 | Catalogue de formations (titre, description, compétence, niveau, durée, organisme, date, capacité, statut) | HR, ADMIN |
| F-TRN-2 | Inscription / suivi d'un employé à une formation (`EmployeeTraining`) | HR, MANAGER (reco) |
| F-TRN-3 | Recommandation de formations à partir des écarts | HR, MANAGER |
| F-DSH-1 | Tableau de bord : totaux, compétences critiques, employés à gaps importants, formations en cours | HR, ADMIN, MANAGER |
| F-DSH-2 | Graphiques : employés par département, compétences demandées / déficitaires, évolution, formations par statut | HR, ADMIN, MANAGER |
| F-SRCH-1 | Recherche globale (employés, compétences, formations) avec pagination backend | HR, ADMIN |

## 4. Règles métier
- R1 : écart = requis − actuel ; classification : >0 développement, 0 maîtrisée, <0 supérieur au besoin.
- R2 : priorité : écart ≥ 3 haute, = 2 moyenne, = 1 basse.
- R3 : niveau d'une évaluation compris entre 1 et le niveau max de la compétence.
- R4 : une évaluation ne modifie jamais l'historique ; elle met à jour `EmployeeSkill`.
- R5 : une formation complète ou déjà suivie n'est pas recommandée.
- R6 : un employé ne peut pas être son propre manager ; matricule et email uniques (409 si conflit).
- R7 : suppression d'un employé = logique (`deletedAt`).
- R8 : une paire (poste, compétence) est unique dans `PositionSkill`.

## 5. Exigences non fonctionnelles
- Sécurité : Argon2, JWT, RBAC, validation DTO (whitelist), CORS restreint, secrets dans `.env`, filtre d'exceptions global.
- API : REST, codes HTTP 200/201/204/400/401/403/404/409/500, pagination `?page&limit&search`, Swagger sur `/api/docs`.
- Qualité : SOLID, DRY, logique métier dans les services, tests unitaires + intégration + API.
- Maintenabilité : modules NestJS isolés, composants Angular réutilisables, migrations versionnées.
- Performance : pagination côté serveur, index sur clés étrangères et champs de recherche, pas de requêtes N+1.

## 6. Hors périmètre (v1)
Notifications e-mail, import/export massif, authentification SSO, multi-entreprise.

## 7. Critères d'acceptation globaux
- Les 4 rôles accèdent uniquement à leur périmètre (tests de permissions verts).
- Le calcul des écarts et les recommandations suivent R1–R5 (tests unitaires verts).
- Aucun secret dans Git ; `README` permet une installation de zéro.
