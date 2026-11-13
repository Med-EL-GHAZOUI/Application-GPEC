# Phase 5 — UML

Les diagrammes de cas d'utilisation sont dans `03-cas-d-utilisation.md` et le diagramme d'architecture dans
`04-architecture.md`. Les noms de classes correspondent aux entités TypeORM et aux services NestJS prévus ;
ils seront revérifiés à la fin du développement (Phase 16).

## 1. Diagramme de classes (entités)

```mermaid
classDiagram
  class User {
    +uuid id
    +string email
    +string passwordHash
    +Role role
    +boolean isActive
    +string refreshTokenHash
  }
  class Employee {
    +uuid id
    +string matricule
    +string firstName
    +string lastName
    +string email
    +string phone
    +date hireDate
    +EmployeeStatus status
    +date deletedAt
  }
  class Department {
    +uuid id
    +string name
    +string description
  }
  class Position {
    +uuid id
    +string title
    +string description
    +string level
  }
  class Skill {
    +uuid id
    +string name
    +string description
    +SkillCategory category
    +int maxLevel
  }
  class PositionSkill {
    +uuid id
    +int requiredLevel
  }
  class EmployeeSkill {
    +uuid id
    +int level
    +date evaluatedAt
  }
  class SkillEvaluation {
    +uuid id
    +int level
    +date evaluatedAt
    +string comment
  }
  class Training {
    +uuid id
    +string title
    +string description
    +int targetLevel
    +int durationHours
    +string provider
    +date startDate
    +int capacity
    +TrainingStatus status
  }
  class EmployeeTraining {
    +uuid id
    +EnrollmentStatus status
    +date enrolledAt
    +date completedAt
  }

  User "1" -- "0..1" Employee : compte
  Department "1" -- "0..*" Employee
  Department "1" -- "0..*" Position
  Position "1" -- "0..*" Employee
  Employee "0..1" <-- "0..*" Employee : manager
  Position "1" -- "0..*" PositionSkill
  Skill "1" -- "0..*" PositionSkill
  Employee "1" -- "0..*" EmployeeSkill
  Skill "1" -- "0..*" EmployeeSkill
  Employee "1" -- "0..*" SkillEvaluation : évalué
  Employee "1" -- "0..*" SkillEvaluation : évaluateur
  Skill "1" -- "0..*" SkillEvaluation
  Skill "1" -- "0..*" Training : cible
  Employee "1" -- "0..*" EmployeeTraining
  Training "1" -- "0..*" EmployeeTraining
```

Contraintes : unicité de (`Employee`, `Skill`) dans `EmployeeSkill`, de (`Position`, `Skill`) dans `PositionSkill`
et de (`Employee`, `Training`) dans `EmployeeTraining`. `Employee.matricule` et `Employee.email` sont uniques.

## 2. Classes de services (couche métier)

```mermaid
classDiagram
  class AuthService {
    +login(dto) Tokens
    +register(dto) User
    +refresh(token) Tokens
    +logout(userId) void
  }
  class EmployeesService {
    +findAll(query) Page
    +findOne(id, user) Employee
    +create(dto) Employee
    +update(id, dto) Employee
    +remove(id) void
  }
  class EvaluationsService {
    +evaluate(dto, evaluator) SkillEvaluation
    +history(employeeId, skillId) SkillEvaluation[]
  }
  class CompetencyGapsService {
    +forEmployee(employeeId, user) Gap[]
    -computeGap(required, current) int
    -priorityOf(gap) Priority
  }
  class TrainingRecommendationService {
    +recommend(gaps, employeeId) Training[]
  }
  class TrainingsService {
    +enroll(employeeId, trainingId) EmployeeTraining
  }
  class DashboardService {
    +summary() Summary
    +charts() Charts
  }
  class AccessPolicy {
    +canAccessEmployee(user, employeeId) boolean
  }

  EvaluationsService ..> EmployeesService
  CompetencyGapsService ..> TrainingRecommendationService
  EmployeesService ..> AccessPolicy
  CompetencyGapsService ..> AccessPolicy
  EvaluationsService ..> AccessPolicy
  DashboardService ..> CompetencyGapsService
```

`AccessPolicy` centralise le contrôle de périmètre (MANAGER : son équipe, EMPLOYEE : lui-même) pour éviter de le
dupliquer dans chaque service.

## 3. Diagrammes de séquence

### 3.1 Connexion
```mermaid
sequenceDiagram
  actor U as Utilisateur
  participant F as Angular
  participant C as AuthController
  participant S as AuthService
  participant R as UserRepository
  U->>F: email + mot de passe
  F->>C: POST /auth/login
  C->>S: login(dto)
  S->>R: findByEmail
  R-->>S: User
  alt identifiants valides
    S->>S: vérifier Argon2, générer tokens
    S->>R: enregistrer hash du refresh token
    S-->>F: 200 accessToken + refreshToken
  else invalides ou compte inactif
    S-->>F: 401 / 403
  end
```

### 3.2 Évaluation d'une compétence
```mermaid
sequenceDiagram
  actor M as Manager/RH
  participant C as EvaluationsController
  participant G as JwtAuthGuard + RolesGuard
  participant S as EvaluationsService
  participant P as AccessPolicy
  participant DB as PostgreSQL
  M->>C: POST /evaluations {employeeId, skillId, level, comment}
  C->>G: vérifier token et rôle
  G-->>C: ok
  C->>S: evaluate(dto, user)
  S->>P: canAccessEmployee(user, employeeId)
  alt hors périmètre
    S-->>M: 403
  else dans le périmètre
    S->>DB: lire Skill (maxLevel)
    alt niveau hors bornes
      S-->>M: 400
    else niveau valide
      S->>DB: transaction : INSERT SkillEvaluation + UPSERT EmployeeSkill
      S-->>M: 201 SkillEvaluation
    end
  end
```

### 3.3 Calcul des écarts et recommandation
```mermaid
sequenceDiagram
  actor U as Utilisateur
  participant C as GapsController
  participant S as CompetencyGapsService
  participant P as AccessPolicy
  participant T as TrainingRecommendationService
  participant DB as PostgreSQL
  U->>C: GET /employees/:id/gaps
  C->>S: forEmployee(id, user)
  S->>P: canAccessEmployee
  S->>DB: Position -> PositionSkill (niveaux requis)
  S->>DB: EmployeeSkill (niveaux actuels)
  S->>S: écart = requis - actuel, priorité
  S->>T: recommend(écarts > 0, employeeId)
  T->>DB: formations ciblant la compétence, niveau > actuel, places dispo, non suivies
  T-->>S: formation recommandée par écart
  S-->>U: 200 liste {skill, current, required, gap, priority, training}
```

## 4. Diagrammes d'activité

### 4.1 Analyse des écarts d'un employé
```mermaid
flowchart TD
  A([Début]) --> B[Charger l'employé et son poste]
  B --> C{Poste défini ?}
  C -- Non --> X([Erreur 409])
  C -- Oui --> D[Charger les compétences requises]
  D --> E[Pour chaque compétence requise]
  E --> F[Niveau actuel = EmployeeSkill, 0 si non évalué]
  F --> G[écart = requis - actuel]
  G --> H{écart > 0 ?}
  H -- Oui --> I[Calculer la priorité]
  I --> J[Chercher une formation adaptée]
  H -- Non --> K[Classer maîtrisée ou supérieur au besoin]
  J --> L{Autre compétence ?}
  K --> L
  L -- Oui --> E
  L -- Non --> M[Trier par priorité]
  M --> N([Retourner les écarts])
```

### 4.2 Recommandation d'une formation
```mermaid
flowchart TD
  A([Écart > 0 pour une compétence]) --> B[Formations ciblant cette compétence]
  B --> C[Garder niveau cible > niveau actuel]
  C --> D[Exclure complètes et déjà suivies]
  D --> E{Reste-t-il des formations ?}
  E -- Non --> F([Aucune recommandation])
  E -- Oui --> G[Trier par proximité avec le niveau requis]
  G --> H([Retourner la première])
```

### 4.3 Cycle de vie d'une évaluation
```mermaid
flowchart TD
  A([Début]) --> B[Choisir employé et compétence]
  B --> C{Droit sur l'employé ?}
  C -- Non --> X([403])
  C -- Oui --> D[Saisir niveau et commentaire]
  D --> E{1 <= niveau <= niveau max ?}
  E -- Non --> Y([400])
  E -- Oui --> F[Enregistrer SkillEvaluation]
  F --> G[Mettre à jour EmployeeSkill]
  G --> H([Fin])
```

## 5. Modèle conceptuel de données
Le MCD/ER détaillé (clés, types, index) est produit en Phase 6.

## 6. Points de conception retenus
- Les écarts sont **calculés à la demande** et non stockés, pour toujours refléter la dernière évaluation.
- `User` est séparé d'`Employee` : un compte peut exister sans fiche employé (ADMIN technique).
- `Position` appartient à un `Department` (cahier des charges, §8).
- Deux relations distinctes entre `Employee` et `SkillEvaluation` : l'employé évalué et l'évaluateur.
