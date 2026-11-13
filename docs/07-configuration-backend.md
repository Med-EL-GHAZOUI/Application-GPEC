# Phase 7 — Configuration backend

## Résultat
Projet NestJS 12 dans `backend/`, connecté à PostgreSQL 17 (Docker), avec configuration validée,
Swagger, validation globale des DTO, filtre d'exceptions et un endpoint de santé.

## Démarrage local
```bash
cd backend
cp .env.example .env        # puis renseigner mots de passe et secrets JWT
npm install
npm run db:up               # PostgreSQL via Docker Compose
npm run start:dev           # API sur http://localhost:3000/api
```
- Swagger : `http://localhost:3000/api/docs`
- Santé : `GET /api/health` → `{ "status": "ok", "database": "up" }`

## Ce qui a été mis en place
| Élément | Fichier |
|---|---|
| Validation des variables d'environnement (refus de démarrer si invalide) | `src/config/env.validation.ts` |
| Configuration typée | `src/config/configuration.ts` |
| Options TypeORM communes (application + CLI), `synchronize: false` | `src/database/typeorm.options.ts` |
| DataSource pour les migrations | `src/database/data-source.ts` |
| Filtre d'exceptions global (format unique, 500 sans fuite) | `src/common/filters/all-exceptions.filter.ts` |
| Endpoint de santé avec test de la base | `src/health/` |
| Bootstrap : préfixe `/api`, CORS restreint, `ValidationPipe` strict, Swagger | `src/main.ts` |
| PostgreSQL local | `docker-compose.yml` |
| Modèle de variables | `backend/.env.example` |

## Scripts npm
`db:up`, `db:down`, `migration:generate`, `migration:run`, `migration:revert`, `test`, `test:e2e`, `lint`, `build`.

## Écarts avec les phases précédentes
- **Outil de test : Vitest** et non Jest. NestJS 12 génère un projet ESM avec Vitest ; je suis ce standard
  plutôt que de le contourner. Les tests unitaires, d'intégration et e2e restent ceux prévus en Phase 4.
- **Projet ESM** : les imports relatifs se terminent par `.js`.
- **Port PostgreSQL : 5433** et non 5432, car un PostgreSQL natif occupe déjà le 5432 sur ce poste.
  La valeur se change dans `backend/.env` (`DATABASE_PORT`).
- Dépendance `@nestjs/mau` du modèle de départ retirée : outil de développement inutile qui apportait
  5 vulnérabilités signalées par `npm audit` (0 vulnérabilité après retrait).

## Vérifications effectuées
- `npm run build`, `npm run lint` : sans erreur.
- `npm test` : 9 tests unitaires (validation d'environnement, filtre d'exceptions, contrôleur de santé).
- `npm run test:e2e` : `/api/health` répond 200 avec la base réelle.
- Démarrage réel : santé 200, Swagger 200, route inconnue 404 au format d'erreur commun,
  CORS accepté pour `http://localhost:4200` et refusé pour une autre origine.
- `.env` est ignoré par Git (vérifié avec `git check-ignore`).

## Tests proposés pour la suite
Les entités et migrations arrivent en Phase 9 ; les tests d'authentification en Phase 8.
