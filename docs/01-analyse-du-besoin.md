# Phase 1 — Analyse du besoin

## Objectif
Plateforme RH reliant employés, postes, compétences et formations. Elle calcule l'écart
entre le niveau requis par le poste et le niveau évalué de l'employé, puis recommande des
formations pour le combler.

## Décisions validées
- Écart = niveau requis − niveau actuel (>0 : à développer, 0 : maîtrisée, <0 : supérieur au besoin).
- Niveau actuel = dernière `SkillEvaluation` ; `EmployeeSkill` = niveau courant ; l'historique n'est jamais écrasé.
- Priorité : haute (écart ≥ 3), moyenne (écart = 2), basse (écart = 1).
- Recommandation : formations ciblant la compétence, niveau > niveau actuel, la plus proche du niveau requis d'abord ; exclusion des formations déjà suivies ou complètes.
- Monorepo `backend/` + `frontend/`, PostgreSQL via Docker Compose, migrations TypeORM (pas de `synchronize`).
- Argon2 pour le hash ; access token court + refresh token haché en base.
- `POST /auth/register` réservé à l'ADMIN.
- Angular standalone ; Chart.js (ng2-charts) ; UML en Mermaid dans `docs/`.
- Suppression logique des employés.
- Git : `main`, `develop`, `feature/*`, commits conventionnels, sans mention d'outil.
