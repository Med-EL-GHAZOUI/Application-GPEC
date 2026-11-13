# Phase 8 — Authentification JWT et RBAC

## Résultat
Modules `users` et `auth`, guards globaux (limitation de débit, JWT, rôles), première migration (`users`),
script de création de l'ADMIN initial.

## Endpoints
| Méthode | Route | Accès | Réponse |
|---|---|---|---|
| POST | `/api/auth/login` | public, 5 requêtes/min | 200 `{ accessToken, refreshToken }` ; 401 ; 403 compte désactivé |
| POST | `/api/auth/register` | ADMIN | 201 utilisateur ; 400 ; 401 ; 403 ; 409 email déjà utilisé |
| POST | `/api/auth/refresh` | public, 10 requêtes/min | 200 nouveaux tokens ; 401 |
| POST | `/api/auth/logout` | authentifié | 204 |
| GET | `/api/auth/me` | authentifié | 200 `{ id, email, role, isActive }` |

Toutes les autres routes futures sont protégées par défaut ; seules celles marquées `@Public()` sont ouvertes
(`login`, `refresh`, `health`).

## Mécanismes
- **Mots de passe** : hachés avec Argon2 (`argon2id`), jamais renvoyés ni journalisés. Longueur imposée à
  l'inscription : 10 à 128 caractères.
- **Access token** : JWT signé avec `JWT_ACCESS_SECRET`, durée `JWT_ACCESS_TTL` (15 min). Contient `sub`, `email`, `role`.
- **Refresh token** : JWT signé avec un **autre** secret (`JWT_REFRESH_SECRET`), durée 7 jours, identifiant unique
  (`jti`). Seul son **hachage** est stocké en base ; un refresh token ne peut donc pas servir d'access token, ni l'inverse.
- **Rotation** : chaque `refresh` émet une nouvelle paire et remplace le hachage stocké.
- **Détection de rejeu** : un refresh token correctement signé mais déjà remplacé révoque toute la session
  (hachage effacé), car il a probablement été volé.
- **Logout** : efface le hachage, donc le refresh token devient inutilisable immédiatement.
- **Compte désactivé** : `JwtStrategy` relit l'utilisateur à chaque requête ; un compte désactivé perd l'accès sans attendre
  l'expiration du token.
- **Énumération de comptes** : un email inconnu et un mauvais mot de passe donnent la même réponse 401, et un hachage factice
  est vérifié pour que le temps de réponse ne distingue pas les deux cas.
- **Limitation de débit** : `ThrottlerGuard` global (100 requêtes/min) et limites plus strictes sur `login` et `refresh`.
- **RBAC** : `@Roles(...)` + `RolesGuard` global. Sans `@Roles`, tout utilisateur authentifié passe ; avec `@Roles`, le rôle
  doit figurer dans la liste (403 sinon).
- **Emails** : normalisés (minuscules, espaces retirés) pour une unicité insensible à la casse.

## Ordre des guards (global)
1. `ThrottlerGuard` 2. `JwtAuthGuard` (saute les routes `@Public()`) 3. `RolesGuard`.

## Migration et seed
```bash
cd backend
npm run db:up
npm run migration:run     # crée le type user_role et la table users
npm run seed:admin        # crée l'ADMIN depuis ADMIN_EMAIL / ADMIN_PASSWORD (idempotent)
```
`ADMIN_EMAIL` et `ADMIN_PASSWORD` se définissent dans `backend/.env` (jamais commité). Changez le mot de passe
de départ avant tout déploiement.

## Décisions et écarts
- **Migrations listées explicitement** (`src/database/migrations/index.ts`) plutôt que par glob : un glob de fichiers `.ts`
  échoue sous le lanceur de tests. Chaque nouvelle migration doit être ajoutée à cette liste.
- **Entités** : chargées par `autoLoadEntities` dans l'application ; la CLI (migrations, seed) utilise un glob sur le code compilé.
- **Scripts `migration:*` et `seed:admin`** compilent d'abord (`nest build`) puis s'exécutent sur `dist/`.
- **Limitation de débit désactivable uniquement en test** (`NODE_ENV=test` et `THROTTLE_DISABLED=true`), pour que les suites e2e
  puissent se connecter librement. Aucun effet dans un autre environnement.
- Le lien `User` ↔ `Employee` (colonne `employees.user_id`) sera ajouté avec l'entité `Employee` en Phase 9.
- Le contrôle de périmètre (manager : son équipe, employé : lui-même) arrive avec `AccessPolicy` en Phase 9.

## Tests
- **Unitaires (26 au total)** : `AuthService` (connexion, comptes inconnus/désactivés, rotation, rejeu, déconnexion,
  access token refusé comme refresh token), `RolesGuard`, configuration, filtre d'exceptions, santé.
- **e2e (19)** sur la vraie base : login, validation, `/me` sans fuite de champs secrets, `register` réservé à l'ADMIN
  (401/403/201/409/400), rotation et rejeu du refresh token, logout, limitation à 429 au sixième essai.
- Vérifié sur le serveur réel : login de l'ADMIN seedé, `/auth/me`, 401 sans token, 429 après abus.
