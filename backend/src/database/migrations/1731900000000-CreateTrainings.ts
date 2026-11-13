import type { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateTrainings1731900000000 implements MigrationInterface {
  name = 'CreateTrainings1731900000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TYPE "training_status" AS ENUM ('PLANNED', 'OPEN', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED')`,
    );
    await queryRunner.query(
      `CREATE TYPE "enrollment_status" AS ENUM ('ENROLLED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED')`,
    );

    await queryRunner.query(`
      CREATE TABLE "trainings" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "title" character varying(200) NOT NULL,
        "description" text,
        "skill_id" uuid NOT NULL,
        "target_level" smallint NOT NULL,
        "duration_hours" integer NOT NULL,
        "provider" character varying(150),
        "start_date" date,
        "capacity" integer NOT NULL,
        "status" "training_status" NOT NULL DEFAULT 'PLANNED',
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_trainings_id" PRIMARY KEY ("id"),
        CONSTRAINT "CHK_trainings_target_level" CHECK ("target_level" >= 1),
        CONSTRAINT "CHK_trainings_duration" CHECK ("duration_hours" > 0),
        CONSTRAINT "CHK_trainings_capacity" CHECK ("capacity" > 0),
        CONSTRAINT "FK_trainings_skill" FOREIGN KEY ("skill_id")
          REFERENCES "skills" ("id") ON DELETE RESTRICT
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "IDX_trainings_skill" ON "trainings" ("skill_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_trainings_status" ON "trainings" ("status")`,
    );

    await queryRunner.query(`
      CREATE TABLE "employee_trainings" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "employee_id" uuid NOT NULL,
        "training_id" uuid NOT NULL,
        "status" "enrollment_status" NOT NULL DEFAULT 'ENROLLED',
        "enrolled_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "completed_at" TIMESTAMP WITH TIME ZONE,
        CONSTRAINT "PK_employee_trainings_id" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_employee_trainings_employee_training" UNIQUE ("employee_id", "training_id"),
        CONSTRAINT "FK_employee_trainings_employee" FOREIGN KEY ("employee_id")
          REFERENCES "employees" ("id") ON DELETE CASCADE,
        CONSTRAINT "FK_employee_trainings_training" FOREIGN KEY ("training_id")
          REFERENCES "trainings" ("id") ON DELETE RESTRICT
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "IDX_employee_trainings_training" ON "employee_trainings" ("training_id")`,
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "employee_trainings"`);
    await queryRunner.query(`DROP TABLE "trainings"`);
    await queryRunner.query(`DROP TYPE "enrollment_status"`);
    await queryRunner.query(`DROP TYPE "training_status"`);
  }
}
