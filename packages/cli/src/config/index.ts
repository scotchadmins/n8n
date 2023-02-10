import convict from 'convict';
import dotenv from 'dotenv';
import { tmpdir } from 'os';
import { mkdtempSync, readFileSync } from 'fs';
import { join } from 'path';
import { schema } from './schema';
import { inTest, inE2ETests } from '@/constants';
// import { execSync } from 'child_process';

if (inE2ETests) {
	// const NPM_PATH = execSync('which npm')
	// 	.toString()
	// 	.trim()
	// 	.replace(/\/bin\/npm$/, '/bin');

	// This will successfully install the community node (watch with `pnpm run test:e2e:ui`)
	process.env.E2E_TESTS = 'true';
	process.env.N8N_USER_FOLDER = mkdtempSync(join(tmpdir(), 'n8n-e2e-'));
	process.env.EXECUTIONS_PROCESS = 'main';
	process.env.N8N_DIAGNOSTICS_ENABLED = 'false';
	process.env.N8N_PUBLIC_API_DISABLED = 'true';
	process.env.EXTERNAL_FRONTEND_HOOKS_URLS = '';
	process.env.N8N_PERSONALIZATION_ENABLED = 'false';

	// This still works
	process.env = process.env;

	// This will break it
	process.env = { ...process.env };

	// Original version:

	// Skip loading config from env variables in end-to-end tests
	// process.env = {
	// 	E2E_TESTS: 'true',
	// 	N8N_USER_FOLDER: mkdtempSync(join(tmpdir(), 'n8n-e2e-')),
	// 	EXECUTIONS_PROCESS: 'main',
	// 	N8N_DIAGNOSTICS_ENABLED: 'false',
	// 	N8N_PUBLIC_API_DISABLED: 'true',
	// 	EXTERNAL_FRONTEND_HOOKS_URLS: '',
	// 	N8N_PERSONALIZATION_ENABLED: 'false',
	// };

	console.log(process.env);
} else if (inTest) {
	process.env.N8N_PUBLIC_API_DISABLED = 'true';
	process.env.N8N_PUBLIC_API_SWAGGERUI_DISABLED = 'true';
} else {
	dotenv.config();
}

const config = convict(schema);

if (inE2ETests) {
	config.set('enterprise.features.sharing', true);
}

// eslint-disable-next-line @typescript-eslint/unbound-method
config.getEnv = config.get;

// Load overwrites when not in tests
if (!inE2ETests && !inTest) {
	// Overwrite default configuration with settings which got defined in
	// optional configuration files
	const { N8N_CONFIG_FILES } = process.env;
	if (N8N_CONFIG_FILES !== undefined) {
		const configFiles = N8N_CONFIG_FILES.split(',');
		console.debug('Loading config overwrites', configFiles);
		config.loadFile(configFiles);
	}

	// Overwrite config from files defined in "_FILE" environment variables
	Object.entries(process.env).forEach(([envName, fileName]) => {
		if (envName.endsWith('_FILE') && fileName) {
			const configEnvName = envName.replace(/_FILE$/, '');
			// @ts-ignore
			// eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
			const key = config._env[configEnvName]?.[0] as string;
			if (key) {
				let value: string;
				try {
					value = readFileSync(fileName, 'utf8');
				} catch (error) {
					// eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
					if (error.code === 'ENOENT') {
						throw new Error(`The file "${fileName}" could not be found.`);
					}
					throw error;
				}
				config.set(key, value);
			}
		}
	});
}

config.validate({
	allowed: 'strict',
});

// eslint-disable-next-line import/no-default-export
export default config;
export type Config = typeof config;
