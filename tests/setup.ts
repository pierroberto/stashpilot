import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// Isolate tests from the developer's global and system Git configuration.
const configDir = mkdtempSync(join(tmpdir(), 'spilot-gitconfig-'));
const globalConfig = join(configDir, 'gitconfig');
writeFileSync(globalConfig, '');
process.env.GIT_CONFIG_GLOBAL = globalConfig;
process.env.GIT_CONFIG_NOSYSTEM = '1';
process.env.GIT_CEILING_DIRECTORIES = tmpdir();
