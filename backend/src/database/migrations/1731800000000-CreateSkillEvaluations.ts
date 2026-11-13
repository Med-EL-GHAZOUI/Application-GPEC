import type { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateSkillEvaluations1731800000000 implements MigrationInterface {
  name = 'CreateSkillEvaluations1731800000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "skill_evaluations" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "employee_id" uuid NOT NULL,
        "skill_id" uuid NOT NULL,
        "evaluator_id" uuid,
        "level" smallint NOT NULL,
        "evaluated_at" date NOT NULL,
        "comment" text,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_skill_evaluations_id" PRIMARY KEY ("id"),
        CONSTRAINT "CHK_skill_evaluations_level" CHECK ("level" >= 1),
        CONSTRAINT "FK_skill_evaluations_employee" FOREIGN KEY ("employee_id")
          REFERENCES "employees" ("id") ON DELETE CASCADE,
        CONSTRAINT "FK_skill_evaluations_skill" FOREIGN KEY ("skill_id")
          REFERENCES "skills" ("id") ON DELETE RESTRICT,
        CONSTRAINT "FK_skill_evaluations_evaluator" FOREIGN KEY ("evaluator_id")
          REFERENCES "employees" ("id") ON DELETE SET NULL
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "IDX_skill_evaluations_history" ON "skill_evaluations" ("employee_id", "skill_id", "evaluated_at" DESC)`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_skill_evaluations_skill" ON "skill_evaluations" ("skill_id")`,
    );

    // Backfill: levels set through the Phase 10 endpoint have no history yet.
    await queryRunner.query(`
      INSERT INTO "skill_evaluations"
        ("employee_id", "skill_id", "evaluator_id", "level", "evaluated_at", "comment")
      SELECT "employee_id", "skill_id", "evaluator_id", "level", "evaluated_at", "comment"
      FROM "employee_skills"
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "skill_evaluations"`);
  }
}
