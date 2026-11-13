import 'dotenv/config';
import { DataSource } from 'typeorm';
import { configuration } from '../config/configuration.js';
import { buildTypeOrmOptions } from './typeorm.options.js';

/**
 * Entry point used by the TypeORM CLI and the seed scripts.
 * Runs on the compiled output (dist/), hence the .js entity glob.
 */
export default new DataSource({
  ...buildTypeOrmOptions(configuration().database),
  entities: [`${import.meta.dirname}/../**/*.entity.js`],
});
