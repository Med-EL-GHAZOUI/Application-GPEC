import type { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateEmployeeSkills1731700000000 implements MigrationInterface {
  name = 'CreateEmployeeSkills1731700000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "employee_skills" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "employee_id" uuid NOT NULL,
        "skill_id" uuid NOT NULL,
        "level" smallint NOT NULL,
        "evaluated_at" date NOT NULL,
        "evaluator_id" uuid,
        "comment" text,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_employee_skills_id" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_employee_skills_employee_skill" UNIQUE ("employee_id", "skill_id"),
        CONSTRAINT "CHK_employee_skills_level" CHECK ("level" >= 1),
        CONSTRAINT "FK_employee_skills_employee" FOREIGN KEY ("employee_id")
          REFERENCES "employees" ("id") ON DELETE CASCADE,
        CONSTRAINT "FK_employee_skills_skill" FOREIGN KEY ("skill_id")
          REFERENCES "skills" ("id") ON DELETE RESTRICT,
        CONSTRAINT "FK_employee_skills_evaluator" FOREIGN KEY ("evaluator_id")
          REFERENCES "employees" ("id") ON DELETE SET NULL
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "IDX_employee_skills_skill" ON "employee_skills" ("skill_id")`,
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "employee_skills"`);
  }
}
