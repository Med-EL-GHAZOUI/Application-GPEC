import type { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateCoreTables1731600000000 implements MigrationInterface {
  name = 'CreateCoreTables1731600000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TYPE "employee_status" AS ENUM ('ACTIVE', 'ON_LEAVE', 'INACTIVE')`,
    );
    await queryRunner.query(
      `CREATE TYPE "position_level" AS ENUM ('JUNIOR', 'INTERMEDIATE', 'SENIOR', 'LEAD', 'MANAGER')`,
    );
    await queryRunner.query(
      `CREATE TYPE "skill_category" AS ENUM ('TECHNICAL', 'SOFT')`,
    );

    await queryRunner.query(`
      CREATE TABLE "departments" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "name" character varying(100) NOT NULL,
        "description" text,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_departments_id" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_departments_name" UNIQUE ("name")
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "skills" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "name" character varying(100) NOT NULL,
        "description" text,
        "category" "skill_category" NOT NULL,
        "max_level" smallint NOT NULL DEFAULT 5,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_skills_id" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_skills_name" UNIQUE ("name"),
        CONSTRAINT "CHK_skills_max_level" CHECK ("max_level" BETWEEN 1 AND 10)
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "IDX_skills_category" ON "skills" ("category")`,
    );

    await queryRunner.query(`
      CREATE TABLE "positions" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "title" character varying(150) NOT NULL,
        "description" text,
        "level" "position_level" NOT NULL,
        "department_id" uuid NOT NULL,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_positions_id" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_positions_title_department" UNIQUE ("title", "department_id"),
        CONSTRAINT "FK_positions_department" FOREIGN KEY ("department_id")
          REFERENCES "departments" ("id") ON DELETE RESTRICT
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "IDX_positions_department" ON "positions" ("department_id")`,
    );

    await queryRunner.query(`
      CREATE TABLE "position_skills" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "position_id" uuid NOT NULL,
        "skill_id" uuid NOT NULL,
        "required_level" smallint NOT NULL,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_position_skills_id" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_position_skills_position_skill" UNIQUE ("position_id", "skill_id"),
        CONSTRAINT "CHK_position_skills_required_level" CHECK ("required_level" >= 1),
        CONSTRAINT "FK_position_skills_position" FOREIGN KEY ("position_id")
          REFERENCES "positions" ("id") ON DELETE CASCADE,
        CONSTRAINT "FK_position_skills_skill" FOREIGN KEY ("skill_id")
          REFERENCES "skills" ("id") ON DELETE RESTRICT
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "IDX_position_skills_skill" ON "position_skills" ("skill_id")`,
    );

    await queryRunner.query(`
      CREATE TABLE "employees" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "matricule" character varying(30) NOT NULL,
        "first_name" character varying(100) NOT NULL,
        "last_name" character varying(100) NOT NULL,
        "email" character varying(255) NOT NULL,
        "phone" character varying(30),
        "hire_date" date NOT NULL,
        "status" "employee_status" NOT NULL DEFAULT 'ACTIVE',
        "user_id" uuid,
        "department_id" uuid NOT NULL,
        "position_id" uuid,
        "manager_id" uuid,
        "deleted_at" TIMESTAMP WITH TIME ZONE,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_employees_id" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_employees_user_id" UNIQUE ("user_id"),
        CONSTRAINT "CHK_employees_manager_not_self" CHECK ("manager_id" <> "id"),
        CONSTRAINT "FK_employees_user" FOREIGN KEY ("user_id")
          REFERENCES "users" ("id") ON DELETE SET NULL,
        CONSTRAINT "FK_employees_department" FOREIGN KEY ("department_id")
          REFERENCES "departments" ("id") ON DELETE RESTRICT,
        CONSTRAINT "FK_employees_position" FOREIGN KEY ("position_id")
          REFERENCES "positions" ("id") ON DELETE RESTRICT,
        CONSTRAINT "FK_employees_manager" FOREIGN KEY ("manager_id")
          REFERENCES "employees" ("id") ON DELETE SET NULL
      )
    `);
    await queryRunner.query(
      `CREATE UNIQUE INDEX "UQ_employees_matricule_active" ON "employees" ("matricule") WHERE "deleted_at" IS NULL`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "UQ_employees_email_active" ON "employees" ("email") WHERE "deleted_at" IS NULL`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_employees_department" ON "employees" ("department_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_employees_position" ON "employees" ("position_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_employees_manager" ON "employees" ("manager_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_employees_name" ON "employees" ("last_name", "first_name")`,
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "employees"`);
    await queryRunner.query(`DROP TABLE "position_skills"`);
    await queryRunner.query(`DROP TABLE "positions"`);
    await queryRunner.query(`DROP TABLE "skills"`);
    await queryRunner.query(`DROP TABLE "departments"`);
    await queryRunner.query(`DROP TYPE "skill_category"`);
    await queryRunner.query(`DROP TYPE "position_level"`);
    await queryRunner.query(`DROP TYPE "employee_status"`);
  }
}
