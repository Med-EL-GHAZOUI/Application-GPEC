import { CreateUsers1731500000000 } from './1731500000000-CreateUsers.js';
import { CreateCoreTables1731600000000 } from './1731600000000-CreateCoreTables.js';
import { CreateEmployeeSkills1731700000000 } from './1731700000000-CreateEmployeeSkills.js';

/**
 * Explicit, ordered list of migrations (no file glob, so it works the same
 * under Node, Nest and the test runner). Append each new migration here.
 */
export const migrations = [
  CreateUsers1731500000000,
  CreateCoreTables1731600000000,
  CreateEmployeeSkills1731700000000,
];
