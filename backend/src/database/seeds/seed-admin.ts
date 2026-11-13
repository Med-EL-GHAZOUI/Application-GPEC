import 'dotenv/config';
import * as argon2 from 'argon2';
import dataSource from '../data-source.js';
import { Role } from '../../common/enums/role.enum.js';
import { User } from '../../users/entities/user.entity.js';

const MIN_PASSWORD_LENGTH = 10;

/**
 * Creates the initial ADMIN account from ADMIN_EMAIL / ADMIN_PASSWORD.
 * Idempotent: does nothing when the account already exists.
 * Run after the migrations: npm run seed:admin
 */
const seedAdmin = async (): Promise<void> => {
  const email = process.env.ADMIN_EMAIL?.trim().toLowerCase();
  const password = process.env.ADMIN_PASSWORD;

  if (!email || !password) {
    throw new Error('ADMIN_EMAIL and ADMIN_PASSWORD must be set in .env');
  }
  if (password.length < MIN_PASSWORD_LENGTH) {
    throw new Error(
      `ADMIN_PASSWORD must have at least ${MIN_PASSWORD_LENGTH} characters`,
    );
  }

  await dataSource.initialize();
  try {
    const users = dataSource.getRepository(User);
    if (await users.findOne({ where: { email } })) {
      console.log(`Admin ${email} already exists, nothing to do.`);
      return;
    }

    await users.save(
      users.create({
        email,
        passwordHash: await argon2.hash(password),
        role: Role.Admin,
        isActive: true,
        refreshTokenHash: null,
      }),
    );
    console.log(`Admin ${email} created.`);
  } finally {
    await dataSource.destroy();
  }
};

await seedAdmin();
