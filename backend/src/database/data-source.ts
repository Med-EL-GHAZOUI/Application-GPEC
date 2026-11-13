import 'dotenv/config';
import { DataSource } from 'typeorm';
import { configuration } from '../config/configuration.js';
import { buildTypeOrmOptions } from './typeorm.options.js';

/** Entry point used by the TypeORM CLI (migration:generate / run / revert). */
export default new DataSource(buildTypeOrmOptions(configuration().database));
